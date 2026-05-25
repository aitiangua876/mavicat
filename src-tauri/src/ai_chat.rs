use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AiChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiDatabaseContext {
    pub connection_name: Option<String>,
    pub database_name: Option<String>,
    pub schema: Option<String>,
    pub driver: Option<String>,
    pub tables: Vec<String>,
    pub current_sql: Option<String>,
    pub last_result: Option<AiResultContext>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResultContext {
    pub query: Option<String>,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: Option<usize>,
    pub total_rows: Option<i64>,
    pub affected_rows: Option<i64>,
    pub truncated: Option<bool>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatRequest {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<AiChatMessage>,
    pub context: AiDatabaseContext,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSqlBlock {
    pub sql: String,
    pub kind: String,
    pub requires_confirmation: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatResponse {
    pub content: String,
    pub sql_blocks: Vec<AiSqlBlock>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessageContent,
}

#[derive(Debug, Deserialize)]
struct ChatMessageContent {
    content: Option<String>,
}

#[tauri::command]
pub async fn ai_chat_completion(request: AiChatRequest) -> Result<AiChatResponse, String> {
    if request.base_url.trim().is_empty() {
        return Err("AI Base URL 不能为空".into());
    }
    if request.api_key.trim().is_empty() {
        return Err("AI Key 不能为空".into());
    }
    if request.model.trim().is_empty() {
        return Err("AI 模型不能为空".into());
    }

    let endpoint = normalize_chat_completion_endpoint(&request.base_url);
    let mut messages = vec![AiChatMessage {
        role: "system".to_string(),
        content: build_system_prompt(&request.context),
    }];
    messages.extend(
        request.messages.into_iter().filter(|message| {
            !message.role.trim().is_empty() && !message.content.trim().is_empty()
        }),
    );

    let client = reqwest::Client::new();
    let response = client
        .post(endpoint)
        .bearer_auth(request.api_key.trim())
        .json(&json!({
            "model": request.model.trim(),
            "messages": messages,
            "temperature": 0.2,
            "stream": false,
        }))
        .send()
        .await
        .map_err(|error| format!("AI 请求失败：{error}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("读取 AI 响应失败：{error}"))?;

    if !status.is_success() {
        return Err(format!("AI 服务返回错误 {status}：{body}"));
    }

    let parsed: ChatCompletionResponse =
        serde_json::from_str(&body).map_err(|error| format!("AI 响应解析失败：{error}"))?;
    let content = parsed
        .choices
        .first()
        .and_then(|choice| choice.message.content.clone())
        .unwrap_or_default();

    Ok(AiChatResponse {
        sql_blocks: extract_sql_blocks(&content),
        content,
    })
}

fn normalize_chat_completion_endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/chat/completions")
    }
}

fn build_system_prompt(context: &AiDatabaseContext) -> String {
    let table_preview = if context.tables.is_empty() {
        "暂无已加载表".to_string()
    } else {
        context
            .tables
            .iter()
            .take(120)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ")
    };
    let current_sql = context.current_sql.as_deref().unwrap_or("").trim();
    let result_summary = build_result_summary(context.last_result.as_ref());

    format!(
        r#"你是 Mavicat 的数据库助手，必须使用中文简洁回答。
当前连接：{connection}
当前数据库/Schema：{database}
驱动：{driver}
已加载表：{tables}
当前编辑器 SQL：
{current_sql}
最近执行结果：
{result_summary}

你可以帮助生成、解释、优化 SQL。需要提供 SQL 时，必须使用 ```sql fenced code block。
不要虚构不存在的表或字段；不确定时先说明需要用户补充。
如果最近执行结果已经证明表、字段或数据存在，不要重复生成同一条验证 SQL，应该直接承认结果并继续下一步。
如果用户说“就是这张表”“结果在这里”“已经查到了”等纠正信息，优先相信用户和最近执行结果，不要机械反问。
当用户已经给出明确表名但字段未知时，下一步应直接生成查看字段/注释/样例数据的查询，而不是再次确认表名。
SELECT、WITH、SHOW、DESCRIBE、EXPLAIN 类型查询可以建议一键执行。
INSERT、UPDATE、DELETE、REPLACE、MERGE、CREATE、ALTER、DROP、TRUNCATE 等写入或结构变更必须提示用户二次确认后才能执行。"#,
        connection = context.connection_name.as_deref().unwrap_or("-"),
        database = context
            .schema
            .as_deref()
            .or(context.database_name.as_deref())
            .unwrap_or("-"),
        driver = context.driver.as_deref().unwrap_or("-"),
        tables = table_preview,
        current_sql = if current_sql.is_empty() {
            "-"
        } else {
            current_sql
        },
        result_summary = result_summary,
    )
}

fn build_result_summary(result: Option<&AiResultContext>) -> String {
    let Some(result) = result else {
        return "暂无".to_string();
    };

    if let Some(error) = result
        .error
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        return format!("上一条 SQL 执行失败：{error}");
    }

    let columns = if result.columns.is_empty() {
        "-".to_string()
    } else {
        result.columns.join(", ")
    };
    let rows = if result.rows.is_empty() {
        "无返回行".to_string()
    } else {
        result
            .rows
            .iter()
            .take(8)
            .map(|row| {
                row.iter()
                    .map(format_json_cell)
                    .collect::<Vec<_>>()
                    .join(" | ")
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    let query = result.query.as_deref().unwrap_or("-").trim();
    let query = if query.is_empty() { "-" } else { query };
    let total = result
        .total_rows
        .map(|value| value.to_string())
        .unwrap_or_else(|| "-".to_string());
    let affected = result
        .affected_rows
        .map(|value| value.to_string())
        .unwrap_or_else(|| "-".to_string());
    let truncated = if result.truncated.unwrap_or(false) {
        "是"
    } else {
        "否"
    };

    format!(
        "SQL：{query}\n列：{columns}\n本次返回行数：{row_count}\n总行数：{total}\n影响行数：{affected}\n是否截断：{truncated}\n前几行：\n{rows}",
        row_count = result.row_count.unwrap_or(result.rows.len()),
    )
}

fn format_json_cell(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::String(value) => value.clone(),
        serde_json::Value::Bool(value) => value.to_string(),
        serde_json::Value::Number(value) => value.to_string(),
        other => other.to_string(),
    }
}

fn extract_sql_blocks(content: &str) -> Vec<AiSqlBlock> {
    let mut blocks = Vec::new();
    let mut remaining = content;

    while let Some(start) = remaining.find("```") {
        remaining = &remaining[start + 3..];
        let line_end = remaining.find('\n').unwrap_or(remaining.len());
        let fence_info = remaining[..line_end].trim().to_ascii_lowercase();
        if line_end >= remaining.len() {
            break;
        }
        remaining = &remaining[line_end + 1..];

        let Some(end) = remaining.find("```") else {
            break;
        };
        let block = remaining[..end].trim();
        if (fence_info.is_empty() || fence_info.starts_with("sql")) && !block.is_empty() {
            blocks.push(classify_sql_block(block));
        }
        remaining = &remaining[end + 3..];
    }

    blocks
}

fn classify_sql_block(sql: &str) -> AiSqlBlock {
    let normalized = first_sql_keyword(sql);
    let kind = match normalized.as_deref() {
        Some("select" | "with" | "show" | "describe" | "desc" | "explain") => "query",
        Some("insert" | "update" | "delete" | "replace" | "merge") => "mutation",
        Some("create" | "alter" | "drop" | "truncate" | "rename") => "ddl",
        _ => "unknown",
    };

    AiSqlBlock {
        sql: sql.trim().to_string(),
        kind: kind.to_string(),
        requires_confirmation: kind != "query",
    }
}

fn first_sql_keyword(sql: &str) -> Option<String> {
    let mut text = sql.trim_start();
    loop {
        if text.starts_with("--") {
            if let Some(pos) = text.find('\n') {
                text = text[pos + 1..].trim_start();
                continue;
            }
            return None;
        }
        if text.starts_with("/*") {
            if let Some(pos) = text.find("*/") {
                text = text[pos + 2..].trim_start();
                continue;
            }
            return None;
        }
        break;
    }

    text.split(|c: char| !c.is_ascii_alphabetic())
        .find(|part| !part.is_empty())
        .map(|part| part.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_chat_endpoint() {
        assert_eq!(
            normalize_chat_completion_endpoint("https://api.example.com/v1"),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            normalize_chat_completion_endpoint("https://api.example.com/v1/chat/completions"),
            "https://api.example.com/v1/chat/completions"
        );
    }

    #[test]
    fn extracts_and_classifies_sql_fences() {
        let blocks = extract_sql_blocks(
            r#"先查询：
```sql
select * from users;
```
再修改：
```sql
update users set name = 'a' where id = 1;
```"#,
        );

        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].kind, "query");
        assert!(!blocks[0].requires_confirmation);
        assert_eq!(blocks[1].kind, "mutation");
        assert!(blocks[1].requires_confirmation);
    }

    #[test]
    fn skips_leading_sql_comments_when_classifying() {
        let block = classify_sql_block("-- explain\n/* test */\nDELETE FROM users WHERE id = 1");
        assert_eq!(block.kind, "mutation");
        assert!(block.requires_confirmation);
    }

    #[test]
    fn system_prompt_includes_recent_result_context() {
        let prompt = build_system_prompt(&AiDatabaseContext {
            connection_name: Some("测试RDS".to_string()),
            database_name: Some("vat_zhongche".to_string()),
            schema: None,
            driver: Some("mysql".to_string()),
            tables: vec![],
            current_sql: Some("SELECT TABLE_NAME FROM information_schema.tables".to_string()),
            last_result: Some(AiResultContext {
                query: Some("SELECT TABLE_NAME FROM information_schema.tables".to_string()),
                columns: vec!["TABLE_NAME".to_string()],
                rows: vec![vec![serde_json::Value::String(
                    "input_invoice_receivable".to_string(),
                )]],
                row_count: Some(1),
                total_rows: Some(1),
                affected_rows: Some(0),
                truncated: Some(false),
                error: None,
            }),
        });

        assert!(prompt.contains("最近执行结果"));
        assert!(prompt.contains("input_invoice_receivable"));
        assert!(prompt.contains("不要重复生成同一条验证 SQL"));
    }
}

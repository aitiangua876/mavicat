use std::collections::HashMap;

use async_trait::async_trait;
use redis::{aio::MultiplexedConnection, AsyncCommands, Value as RedisValue};
use serde_json::Value;

use crate::drivers::driver_trait::{DatabaseDriver, DriverCapabilities, PluginManifest};
use crate::models::{
    ColumnDefinition, ConnectionParams, DataTypeInfo, ForeignKey, Index, Pagination, QueryResult,
    RoutineInfo, RoutineParameter, TableColumn, TableInfo, TableSchema, ViewInfo,
};

pub struct RedisDriver {
    manifest: PluginManifest,
}

impl RedisDriver {
    pub fn new() -> Self {
        Self {
            manifest: PluginManifest {
                id: "redis".to_string(),
                name: "Redis".to_string(),
                version: "1.0.0".to_string(),
                description: "Redis key-value databases".to_string(),
                default_port: Some(6379),
                capabilities: DriverCapabilities {
                    schemas: false,
                    views: false,
                    routines: false,
                    file_based: false,
                    folder_based: false,
                    connection_string: true,
                    connection_string_example: "redis://:password@localhost:6379/0".into(),
                    identifier_quote: String::new(),
                    alter_primary_key: false,
                    auto_increment_keyword: String::new(),
                    serial_type: String::new(),
                    inline_pk: false,
                    alter_column: false,
                    create_foreign_keys: false,
                    no_connection_required: false,
                    manage_tables: false,
                    triggers: false,
                    readonly: false,
                },
                is_builtin: true,
                default_username: String::new(),
                color: "#f87171".to_string(),
                icon: "redis".to_string(),
                settings: vec![],
                ui_extensions: None,
            },
        }
    }
}

fn selected_db(params: &ConnectionParams) -> u8 {
    params.database.primary().parse::<u8>().unwrap_or(0).min(15)
}

fn redis_url(params: &ConnectionParams) -> String {
    use urlencoding::encode;

    let host = params.host.as_deref().unwrap_or("localhost");
    let port = params.port.unwrap_or(6379);
    let db = selected_db(params);
    let password = params.password.as_deref().unwrap_or_default();
    let username = params.username.as_deref().unwrap_or_default();

    let credentials = match (username.is_empty(), password.is_empty()) {
        (true, true) => String::new(),
        (true, false) => format!(":{}@", encode(password)),
        (false, true) => format!("{}@", encode(username)),
        (false, false) => format!("{}:{}@", encode(username), encode(password)),
    };

    format!("redis://{}{}:{}/{}", credentials, host, port, db)
}

async fn connect(params: &ConnectionParams) -> Result<MultiplexedConnection, String> {
    let client = redis::Client::open(redis_url(params)).map_err(|error| error.to_string())?;
    client
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| error.to_string())
}

fn unsupported(feature: &str) -> String {
    format!("Redis does not support {}", feature)
}

fn parse_command(input: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;

    for ch in input.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if let Some(active_quote) = quote {
            if ch == active_quote {
                quote = None;
            } else {
                current.push(ch);
            }
            continue;
        }
        if ch == '\'' || ch == '"' {
            quote = Some(ch);
            continue;
        }
        if ch.is_whitespace() {
            if !current.is_empty() {
                parts.push(std::mem::take(&mut current));
            }
            continue;
        }
        current.push(ch);
    }

    if !current.is_empty() {
        parts.push(current);
    }
    parts
}

fn strip_pseudo_select(query: &str) -> Option<String> {
    let trimmed = query.trim().trim_end_matches(';').trim();
    let lower = trimmed.to_ascii_lowercase();
    if !lower.starts_with("select * from ") {
        return None;
    }
    Some(
        trimmed["select * from ".len()..]
            .trim()
            .trim_matches('`')
            .trim_matches('"')
            .trim_matches('[')
            .trim_matches(']')
            .to_string(),
    )
}

fn redis_value_to_json(value: RedisValue) -> Value {
    match value {
        RedisValue::Nil => Value::Null,
        RedisValue::Int(item) => Value::from(item),
        RedisValue::BulkString(bytes) => Value::String(String::from_utf8_lossy(&bytes).to_string()),
        RedisValue::Array(items) => {
            Value::Array(items.into_iter().map(redis_value_to_json).collect())
        }
        RedisValue::SimpleString(item) => Value::String(item),
        RedisValue::Okay => Value::String("OK".to_string()),
        RedisValue::Map(items) => Value::Array(
            items
                .into_iter()
                .map(|(key, value)| {
                    Value::Array(vec![redis_value_to_json(key), redis_value_to_json(value)])
                })
                .collect(),
        ),
        RedisValue::Attribute { data, .. } => redis_value_to_json(*data),
        RedisValue::Set(items) => {
            Value::Array(items.into_iter().map(redis_value_to_json).collect())
        }
        RedisValue::Double(item) => Value::from(item),
        RedisValue::Boolean(item) => Value::from(item),
        RedisValue::VerbatimString { text, .. } => Value::String(text),
        RedisValue::BigNumber(item) => Value::String(item.to_string()),
        RedisValue::Push { data, .. } => {
            Value::Array(data.into_iter().map(redis_value_to_json).collect())
        }
        RedisValue::ServerError(error) => Value::String(format!("{error:?}")),
    }
}

fn redis_value_to_result(value: RedisValue) -> QueryResult {
    match value {
        RedisValue::Array(items) => QueryResult {
            columns: vec!["index".to_string(), "value".to_string()],
            rows: items
                .into_iter()
                .enumerate()
                .map(|(index, item)| vec![Value::from(index as u64), redis_value_to_json(item)])
                .collect(),
            affected_rows: 0,
            truncated: false,
            pagination: None,
        },
        other => QueryResult {
            columns: vec!["value".to_string()],
            rows: vec![vec![redis_value_to_json(other)]],
            affected_rows: 0,
            truncated: false,
            pagination: None,
        },
    }
}

async fn inspect_key(params: &ConnectionParams, key: &str) -> Result<QueryResult, String> {
    let mut connection = connect(params).await?;
    let key_type: String = redis::cmd("TYPE")
        .arg(key)
        .query_async(&mut connection)
        .await
        .map_err(|error| error.to_string())?;

    match key_type.as_str() {
        "hash" => {
            let values: Vec<(String, String)> = redis::cmd("HGETALL")
                .arg(key)
                .query_async(&mut connection)
                .await
                .map_err(|error| error.to_string())?;
            Ok(QueryResult {
                columns: vec!["field".to_string(), "value".to_string()],
                rows: values
                    .into_iter()
                    .map(|(field, value)| vec![Value::String(field), Value::String(value)])
                    .collect(),
                affected_rows: 0,
                truncated: false,
                pagination: None,
            })
        }
        "list" => {
            let values: Vec<String> = redis::cmd("LRANGE")
                .arg(key)
                .arg(0)
                .arg(199)
                .query_async(&mut connection)
                .await
                .map_err(|error| error.to_string())?;
            Ok(QueryResult {
                columns: vec!["index".to_string(), "value".to_string()],
                rows: values
                    .into_iter()
                    .enumerate()
                    .map(|(index, value)| vec![Value::from(index as u64), Value::String(value)])
                    .collect(),
                affected_rows: 0,
                truncated: false,
                pagination: None,
            })
        }
        "set" => {
            let values: Vec<String> = redis::cmd("SMEMBERS")
                .arg(key)
                .query_async(&mut connection)
                .await
                .map_err(|error| error.to_string())?;
            Ok(QueryResult {
                columns: vec!["member".to_string()],
                rows: values
                    .into_iter()
                    .map(|value| vec![Value::String(value)])
                    .collect(),
                affected_rows: 0,
                truncated: false,
                pagination: None,
            })
        }
        "zset" => {
            let values: Vec<(String, f64)> = redis::cmd("ZRANGE")
                .arg(key)
                .arg(0)
                .arg(199)
                .arg("WITHSCORES")
                .query_async(&mut connection)
                .await
                .map_err(|error| error.to_string())?;
            Ok(QueryResult {
                columns: vec!["member".to_string(), "score".to_string()],
                rows: values
                    .into_iter()
                    .map(|(member, score)| vec![Value::String(member), Value::from(score)])
                    .collect(),
                affected_rows: 0,
                truncated: false,
                pagination: None,
            })
        }
        _ => {
            let value: Option<String> = connection
                .get(key)
                .await
                .map_err(|error| error.to_string())?;
            Ok(QueryResult {
                columns: vec!["key".to_string(), "type".to_string(), "value".to_string()],
                rows: vec![vec![
                    Value::String(key.to_string()),
                    Value::String(key_type),
                    value.map(Value::String).unwrap_or(Value::Null),
                ]],
                affected_rows: 0,
                truncated: false,
                pagination: None,
            })
        }
    }
}

fn redis_columns() -> Vec<TableColumn> {
    vec![
        TableColumn {
            name: "key".to_string(),
            data_type: "string".to_string(),
            is_pk: true,
            is_nullable: false,
            is_auto_increment: false,
            default_value: None,
            character_maximum_length: None,
            comment: Some("Redis key".to_string()),
        },
        TableColumn {
            name: "value".to_string(),
            data_type: "string".to_string(),
            is_pk: false,
            is_nullable: true,
            is_auto_increment: false,
            default_value: None,
            character_maximum_length: None,
            comment: Some("Redis value or field value".to_string()),
        },
    ]
}

#[async_trait]
impl DatabaseDriver for RedisDriver {
    fn manifest(&self) -> &PluginManifest {
        &self.manifest
    }

    fn get_data_types(&self) -> Vec<DataTypeInfo> {
        vec![
            DataTypeInfo {
                name: "string".to_string(),
                category: "Redis".to_string(),
                requires_length: false,
                requires_precision: false,
                default_length: None,
                supports_auto_increment: false,
                requires_extension: None,
            },
            DataTypeInfo {
                name: "hash".to_string(),
                category: "Redis".to_string(),
                requires_length: false,
                requires_precision: false,
                default_length: None,
                supports_auto_increment: false,
                requires_extension: None,
            },
        ]
    }

    fn build_connection_url(&self, params: &ConnectionParams) -> Result<String, String> {
        Ok(redis_url(params))
    }

    async fn test_connection(&self, params: &ConnectionParams) -> Result<(), String> {
        let mut connection = connect(params).await?;
        redis::cmd("PING")
            .query_async::<String>(&mut connection)
            .await
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    async fn ping(&self, params: &ConnectionParams) -> Result<(), String> {
        self.test_connection(params).await
    }

    async fn get_databases(&self, _params: &ConnectionParams) -> Result<Vec<String>, String> {
        Ok((0..=15).map(|index| index.to_string()).collect())
    }

    async fn get_schemas(&self, _params: &ConnectionParams) -> Result<Vec<String>, String> {
        Ok(vec![])
    }

    async fn get_tables(
        &self,
        params: &ConnectionParams,
        _schema: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        let mut connection = connect(params).await?;
        let mut cursor = 0_u64;
        let mut tables = Vec::new();

        loop {
            let (next_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg("*")
                .arg("COUNT")
                .arg(500)
                .query_async(&mut connection)
                .await
                .map_err(|error| error.to_string())?;

            for key in keys {
                let key_type: String = redis::cmd("TYPE")
                    .arg(&key)
                    .query_async(&mut connection)
                    .await
                    .unwrap_or_else(|_| "unknown".to_string());
                tables.push(TableInfo {
                    name: key,
                    comment: Some(format!("Redis {}", key_type)),
                });
                if tables.len() >= 2_000 {
                    tables.sort_by(|a, b| a.name.cmp(&b.name));
                    return Ok(tables);
                }
            }

            cursor = next_cursor;
            if cursor == 0 {
                break;
            }
        }

        tables.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(tables)
    }

    async fn get_columns(
        &self,
        _params: &ConnectionParams,
        _table: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<TableColumn>, String> {
        Ok(redis_columns())
    }

    async fn get_foreign_keys(
        &self,
        _params: &ConnectionParams,
        _table: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<ForeignKey>, String> {
        Ok(vec![])
    }

    async fn get_indexes(
        &self,
        _params: &ConnectionParams,
        _table: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<Index>, String> {
        Ok(vec![])
    }

    async fn get_views(
        &self,
        _params: &ConnectionParams,
        _schema: Option<&str>,
    ) -> Result<Vec<ViewInfo>, String> {
        Ok(vec![])
    }

    async fn get_view_definition(
        &self,
        _params: &ConnectionParams,
        _view_name: &str,
        _schema: Option<&str>,
    ) -> Result<String, String> {
        Err(unsupported("views"))
    }

    async fn get_view_columns(
        &self,
        _params: &ConnectionParams,
        _view_name: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<TableColumn>, String> {
        Ok(vec![])
    }

    async fn create_view(
        &self,
        _params: &ConnectionParams,
        _view_name: &str,
        _definition: &str,
        _schema: Option<&str>,
    ) -> Result<(), String> {
        Err(unsupported("views"))
    }

    async fn alter_view(
        &self,
        _params: &ConnectionParams,
        _view_name: &str,
        _definition: &str,
        _schema: Option<&str>,
    ) -> Result<(), String> {
        Err(unsupported("views"))
    }

    async fn drop_view(
        &self,
        _params: &ConnectionParams,
        _view_name: &str,
        _schema: Option<&str>,
    ) -> Result<(), String> {
        Err(unsupported("views"))
    }

    async fn get_routines(
        &self,
        _params: &ConnectionParams,
        _schema: Option<&str>,
    ) -> Result<Vec<RoutineInfo>, String> {
        Ok(vec![])
    }

    async fn get_routine_parameters(
        &self,
        _params: &ConnectionParams,
        _routine_name: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<RoutineParameter>, String> {
        Ok(vec![])
    }

    async fn get_routine_definition(
        &self,
        _params: &ConnectionParams,
        _routine_name: &str,
        _routine_type: &str,
        _schema: Option<&str>,
    ) -> Result<String, String> {
        Err(unsupported("routines"))
    }

    async fn execute_query(
        &self,
        params: &ConnectionParams,
        query: &str,
        limit: Option<u32>,
        page: u32,
        _schema: Option<&str>,
    ) -> Result<QueryResult, String> {
        if let Some(key) = strip_pseudo_select(query) {
            return inspect_key(params, &key).await;
        }

        let parts = parse_command(query.trim().trim_end_matches(';'));
        if parts.is_empty() {
            return Ok(QueryResult {
                columns: vec!["value".to_string()],
                rows: vec![],
                affected_rows: 0,
                truncated: false,
                pagination: None,
            });
        }

        let mut connection = connect(params).await?;
        let mut command = redis::cmd(&parts[0]);
        for part in parts.iter().skip(1) {
            command.arg(part);
        }
        let value = command
            .query_async::<RedisValue>(&mut connection)
            .await
            .map_err(|error| error.to_string())?;
        let mut result = redis_value_to_result(value);
        if let Some(page_size) = limit {
            let total_rows = result.rows.len() as u64;
            let start = page.saturating_sub(1) as usize * page_size as usize;
            result.rows = result
                .rows
                .into_iter()
                .skip(start)
                .take(page_size as usize)
                .collect();
            result.pagination = Some(Pagination {
                page,
                page_size,
                total_rows: Some(total_rows),
                has_more: start + result.rows.len() < total_rows as usize,
            });
        }
        Ok(result)
    }

    async fn insert_record(
        &self,
        _params: &ConnectionParams,
        _table: &str,
        _data: HashMap<String, Value>,
        _schema: Option<&str>,
        _max_blob_size: u64,
    ) -> Result<u64, String> {
        Err(unsupported("row editing"))
    }

    async fn update_record(
        &self,
        _params: &ConnectionParams,
        _table: &str,
        _pk_col: &str,
        _pk_val: Value,
        _col_name: &str,
        _new_val: Value,
        _schema: Option<&str>,
        _max_blob_size: u64,
    ) -> Result<u64, String> {
        Err(unsupported("row editing"))
    }

    async fn delete_record(
        &self,
        _params: &ConnectionParams,
        _table: &str,
        _pk_col: &str,
        _pk_val: Value,
        _schema: Option<&str>,
    ) -> Result<u64, String> {
        Err(unsupported("row editing"))
    }

    async fn get_create_table_sql(
        &self,
        _table_name: &str,
        _columns: Vec<ColumnDefinition>,
        _schema: Option<&str>,
    ) -> Result<Vec<String>, String> {
        Err(unsupported("table DDL"))
    }

    async fn get_schema_snapshot(
        &self,
        params: &ConnectionParams,
        schema: Option<&str>,
    ) -> Result<Vec<TableSchema>, String> {
        let tables = self.get_tables(params, schema).await?;
        Ok(tables
            .into_iter()
            .map(|table| TableSchema {
                name: table.name,
                columns: vec![],
                foreign_keys: vec![],
            })
            .collect())
    }

    async fn get_all_columns_batch(
        &self,
        params: &ConnectionParams,
        schema: Option<&str>,
    ) -> Result<HashMap<String, Vec<TableColumn>>, String> {
        let tables = self.get_tables(params, schema).await?;
        Ok(tables
            .into_iter()
            .map(|table| (table.name, redis_columns()))
            .collect())
    }

    async fn get_all_foreign_keys_batch(
        &self,
        params: &ConnectionParams,
        schema: Option<&str>,
    ) -> Result<HashMap<String, Vec<ForeignKey>>, String> {
        let tables = self.get_tables(params, schema).await?;
        Ok(tables
            .into_iter()
            .map(|table| (table.name, vec![]))
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_command_handles_quoted_values() {
        assert_eq!(
            parse_command("SET user:1 \"hello world\""),
            vec!["SET", "user:1", "hello world"],
        );
    }

    #[test]
    fn strip_pseudo_select_extracts_key() {
        assert_eq!(
            strip_pseudo_select("SELECT * FROM `user:1`;"),
            Some("user:1".to_string()),
        );
    }
}

use std::collections::{BTreeSet, HashMap};

use async_trait::async_trait;
use serde_json::Value;
use tokio_dameng::{Client, ResultSet, Row};

use crate::drivers::driver_trait::{DatabaseDriver, DriverCapabilities, PluginManifest};
use crate::models::{
    ColumnDefinition, ConnectionParams, DataTypeInfo, ForeignKey, Index, Pagination, QueryResult,
    RoutineInfo, RoutineParameter, TableColumn, TableInfo, TableSchema, ViewInfo,
};

pub struct DamengDriver {
    manifest: PluginManifest,
}

impl DamengDriver {
    pub fn new() -> Self {
        Self {
            manifest: PluginManifest {
                id: "dameng".to_string(),
                name: "Dameng".to_string(),
                version: "1.0.0".to_string(),
                description: "Dameng DM database".to_string(),
                default_port: Some(5236),
                capabilities: DriverCapabilities {
                    schemas: false,
                    views: true,
                    routines: true,
                    file_based: false,
                    folder_based: false,
                    connection_string: true,
                    connection_string_example: "dm://SYSDBA:SYSDBA@localhost:5236/SYSDBA".into(),
                    identifier_quote: "\"".into(),
                    alter_primary_key: false,
                    auto_increment_keyword: "IDENTITY".into(),
                    serial_type: String::new(),
                    inline_pk: false,
                    alter_column: true,
                    create_foreign_keys: true,
                    no_connection_required: false,
                    manage_tables: true,
                    triggers: false,
                    readonly: false,
                },
                is_builtin: true,
                default_username: "SYSDBA".to_string(),
                color: "#2563eb".to_string(),
                icon: "database".to_string(),
                settings: vec![],
                ui_extensions: None,
            },
        }
    }

    fn resolve_schema<'a>(&self, params: &'a ConnectionParams, schema: Option<&'a str>) -> String {
        let explicit = schema
            .filter(|value| !value.trim().is_empty())
            .or_else(|| {
                let primary = params.database.primary();
                (!primary.trim().is_empty()).then_some(primary)
            })
            .or(params.username.as_deref())
            .unwrap_or("SYSDBA");
        explicit.trim().to_string()
    }
}

#[derive(Debug, Clone)]
struct DdlColumn {
    name: String,
    data_type: String,
    nullable: bool,
    default_value: Option<String>,
    data_length: Option<u64>,
    precision: Option<i32>,
    scale: Option<i32>,
    comment: Option<String>,
    is_pk: bool,
}

fn unsupported(feature: &str) -> String {
    format!("Dameng V1 does not support {}", feature)
}

async fn connect(params: &ConnectionParams) -> Result<Client, String> {
    let host = params
        .host
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("localhost");
    let port = params.port.unwrap_or(5236);
    let username = params
        .username
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("SYSDBA");
    let password = params.password.as_deref().unwrap_or_default();
    let mut client = Client::new(host, port);
    client.connect(username, password).await.map_err(|error| {
        format_dameng_connection_error(host, port, username, &error.to_string())
    })?;
    Ok(client)
}

fn format_dameng_connection_error(host: &str, port: u16, username: &str, error: &str) -> String {
    let target = format!("{host}:{port}");
    if error.contains("os error 65") || error.contains("No route to host") {
        return format!(
            "达梦连接失败：Mavicat 当前进程无法访问 {target}。如果终端 nc 能连通，通常是 macOS 未授予 Mavicat 局域网访问权限，或当前连接仍启用了 SSH 隧道/错误的主机参数。请安装带局域网权限声明的新版本，首次测试时允许“本地网络”访问；同时确认 SSH 未启用、主机地址没有空格或协议前缀。原始错误：{error}"
        );
    }

    if error.contains("expected LOGIN_RESPONSE got msg_type=187") {
        return format!(
            "达梦登录失败：服务器已响应 {target}，但返回了登录错误 ACK。请确认用户名 {username} 和密码是否正确；如果账号无误，可能是当前达梦版本的登录协议需要进一步兼容。原始错误：{error}"
        );
    }

    format!("达梦连接失败：{target} / {username}，原始错误：{error}")
}

fn sql_string(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn quote_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn qualified_table(schema: Option<&str>, table: &str) -> String {
    if schema.is_none() {
        if let Some((owner, table_name)) = split_qualified_table_name(table) {
            return format!("{}.{}", quote_identifier(&owner), quote_identifier(&table_name));
        }
    }

    match schema.filter(|value| !value.trim().is_empty()) {
        Some(schema_name) => format!(
            "{}.{}",
            quote_identifier(schema_name),
            quote_identifier(table)
        ),
        None => quote_identifier(table),
    }
}

fn split_qualified_table_name(table: &str) -> Option<(String, String)> {
    let (owner, table_name) = table.split_once('.')?;
    let owner = owner.trim().trim_matches('"');
    let table_name = table_name.trim().trim_matches('"');
    if owner.is_empty() || table_name.is_empty() {
        return None;
    }
    Some((owner.to_string(), table_name.to_string()))
}

fn json_to_sql(value: &Value) -> String {
    match value {
        Value::Null => "NULL".to_string(),
        Value::Bool(value) => {
            if *value {
                "1".to_string()
            } else {
                "0".to_string()
            }
        }
        Value::Number(value) => value.to_string(),
        Value::String(value) => sql_string(value),
        other => sql_string(&other.to_string()),
    }
}

fn type_supports_length(data_type: &str) -> bool {
    matches!(
        data_type.to_ascii_uppercase().as_str(),
        "CHAR"
            | "CHARACTER"
            | "NCHAR"
            | "VARCHAR"
            | "VARCHAR2"
            | "NVARCHAR"
            | "NVARCHAR2"
            | "BINARY"
            | "VARBINARY"
    )
}

fn column_type_sql(
    data_type: &str,
    data_length: Option<u64>,
    precision: Option<i32>,
    scale: Option<i32>,
) -> String {
    let normalized = data_type.trim().to_ascii_uppercase();
    if matches!(normalized.as_str(), "NUMBER" | "NUMERIC" | "DECIMAL") {
        if let Some(precision) = precision.filter(|value| *value > 0) {
            if let Some(scale) = scale.filter(|value| *value > 0) {
                return format!("{}({}, {})", normalized, precision, scale);
            }
            return format!("{}({})", normalized, precision);
        }
    }

    if type_supports_length(&normalized) {
        if let Some(length) = data_length.filter(|value| *value > 0) {
            return format!("{}({})", normalized, length);
        }
    }

    normalized
}

fn column_definition_sql(column: &ColumnDefinition) -> String {
    let mut def = format!(
        "{} {}",
        quote_identifier(&column.name),
        column.data_type.trim()
    );
    if !column.is_nullable {
        def.push_str(" NOT NULL");
    }
    if column.is_auto_increment {
        def.push_str(" IDENTITY");
    }
    if let Some(default) = &column.default_value {
        if !default.trim().is_empty() {
            def.push_str(&format!(" DEFAULT {}", default.trim()));
        }
    }
    def
}

fn ddl_column_definition_sql(column: &DdlColumn) -> String {
    let mut def = format!(
        "{} {}",
        quote_identifier(&column.name),
        column_type_sql(
            &column.data_type,
            column.data_length,
            column.precision,
            column.scale,
        )
    );
    if !column.nullable {
        def.push_str(" NOT NULL");
    }
    if let Some(default) = &column.default_value {
        let trimmed = default.trim();
        if !trimmed.is_empty() {
            def.push_str(&format!(" DEFAULT {}", trimmed));
        }
    }
    def
}

fn row_string(row: &Row, index: usize) -> String {
    row.get_string(index).unwrap_or_default()
}

fn row_string_opt(row: &Row, index: usize) -> Option<String> {
    row.values
        .get(index)
        .and_then(|value| value.as_ref())
        .map(|_| row_string(row, index))
}

fn row_i32(row: &Row, index: usize) -> i32 {
    row.get_i32(index).unwrap_or(0)
}

fn row_bool(row: &Row, index: usize) -> bool {
    row_i32(row, index) != 0 || row_string(row, index).eq_ignore_ascii_case("YES")
}

fn is_system_database_name(name: &str) -> bool {
    matches!(
        name.trim().to_ascii_uppercase().as_str(),
        "SYS" | "SYSAUDITOR" | "SYSSSO" | "SYSMAN" | "CTISYS"
    )
}

fn push_visible_database_name(names: &mut BTreeSet<String>, name: String) {
    let trimmed = name.trim();
    if trimmed.is_empty() || is_system_database_name(trimmed) {
        return;
    }
    names.insert(trimmed.to_string());
}

fn collect_first_column_strings(result: ResultSet) -> Vec<String> {
    result.rows.iter().map(|row| row_string(row, 0)).collect()
}

async fn query_first_column_strings(
    params: &ConnectionParams,
    query: &str,
) -> Result<Vec<String>, String> {
    query_result_set(params, query)
        .await
        .map(collect_first_column_strings)
}

async fn resolve_table_owner(
    params: &ConnectionParams,
    schema: Option<&str>,
    table: &str,
) -> Result<(String, String), String> {
    if let Some((owner, table_name)) = split_qualified_table_name(table) {
        return Ok((owner, table_name));
    }

    let driver = DamengDriver::new();
    let requested = driver.resolve_schema(params, schema);
    let table_name = table.trim().trim_matches('"').to_string();

    let owner_sql = format!(
        "SELECT OWNER FROM DBA_TABLES WHERE OWNER = {} AND TABLE_NAME = {}",
        sql_string(&requested),
        sql_string(&table_name),
    );
    if let Ok(owners) = query_first_column_strings(params, &owner_sql).await {
        if owners.iter().any(|owner| owner.eq_ignore_ascii_case(&requested)) {
            return Ok((requested, table_name));
        }
    }

    let all_owner_sql = format!(
        "SELECT OWNER FROM ALL_TABLES WHERE OWNER = {} AND TABLE_NAME = {}",
        sql_string(&requested),
        sql_string(&table_name),
    );
    if let Ok(owners) = query_first_column_strings(params, &all_owner_sql).await {
        if owners.iter().any(|owner| owner.eq_ignore_ascii_case(&requested)) {
            return Ok((requested, table_name));
        }
    }

    let tablespace_sql = format!(
        "SELECT OWNER FROM DBA_TABLES WHERE TABLESPACE_NAME = {} AND TABLE_NAME = {} ORDER BY OWNER",
        sql_string(&requested),
        sql_string(&table_name),
    );
    if let Ok(owners) = query_first_column_strings(params, &tablespace_sql).await {
        if let Some(owner) = owners
            .into_iter()
            .find(|owner| !owner.trim().is_empty())
            .map(|owner| owner.trim().to_string())
        {
            return Ok((owner, table_name));
        }
    }

    Ok((requested, table_name))
}

fn row_u64_opt(row: &Row, index: usize) -> Option<u64> {
    row.get_opt_i64(index)
        .ok()
        .flatten()
        .and_then(|value| u64::try_from(value).ok())
        .or_else(|| {
            row.get_opt_i32(index)
                .ok()
                .flatten()
                .and_then(|value| u64::try_from(value).ok())
        })
}

fn cell_to_json(row: &Row, columns: &[tokio_dameng::Column], index: usize) -> Value {
    if row
        .values
        .get(index)
        .and_then(|value| value.as_ref())
        .is_none()
    {
        return Value::Null;
    }

    let type_name = columns
        .get(index)
        .map(|column| column.type_name.to_ascii_uppercase())
        .unwrap_or_default();

    if type_name.contains("BIGINT") {
        if let Ok(value) = row.get_i64(index) {
            return Value::from(value);
        }
    }

    if type_name.contains("INT") || type_name == "NUMBER" {
        if let Ok(value) = row.get_i32(index) {
            return Value::from(value);
        }
    }

    if type_name.contains("DOUBLE") || type_name.contains("FLOAT") || type_name.contains("REAL") {
        if let Ok(value) = row.get_f64(index) {
            return Value::from(value);
        }
        if let Ok(value) = row.get_f32(index) {
            return Value::from(value as f64);
        }
    }

    if type_name == "BIT" || type_name == "BOOLEAN" {
        return Value::Bool(row_bool(row, index));
    }

    Value::String(row_string(row, index))
}

async fn query_result_set(params: &ConnectionParams, query: &str) -> Result<ResultSet, String> {
    let mut client = connect(params).await?;
    client.query(query).await.map_err(|error| error.to_string())
}

async fn describe_table_columns(
    params: &ConnectionParams,
    table: &str,
    schema: &str,
) -> Result<Vec<DdlColumn>, String> {
    let sql = format!(
        r#"
        SELECT
            c.COLUMN_NAME,
            c.DATA_TYPE,
            CASE WHEN c.NULLABLE = 'Y' THEN 1 ELSE 0 END AS IS_NULLABLE,
            c.DATA_DEFAULT,
            c.DATA_LENGTH,
            c.DATA_PRECISION,
            c.DATA_SCALE,
            cc.COMMENTS,
            CASE WHEN pk.COLUMN_NAME IS NULL THEN 0 ELSE 1 END AS IS_PK
        FROM ALL_TAB_COLUMNS c
        LEFT JOIN ALL_COL_COMMENTS cc
            ON cc.OWNER = c.OWNER
           AND cc.TABLE_NAME = c.TABLE_NAME
           AND cc.COLUMN_NAME = c.COLUMN_NAME
        LEFT JOIN (
            SELECT cols.OWNER, cols.TABLE_NAME, cols.COLUMN_NAME
            FROM ALL_CONSTRAINTS cons
            JOIN ALL_CONS_COLUMNS cols
                ON cols.OWNER = cons.OWNER
               AND cols.CONSTRAINT_NAME = cons.CONSTRAINT_NAME
            WHERE cons.CONSTRAINT_TYPE = 'P'
        ) pk
            ON pk.OWNER = c.OWNER
           AND pk.TABLE_NAME = c.TABLE_NAME
           AND pk.COLUMN_NAME = c.COLUMN_NAME
        WHERE c.OWNER = {} AND c.TABLE_NAME = {}
        ORDER BY c.COLUMN_ID
        "#,
        sql_string(schema),
        sql_string(table),
    );

    let result = query_result_set(params, &sql).await?;
    Ok(result
        .rows
        .iter()
        .map(|row| DdlColumn {
            name: row_string(row, 0),
            data_type: row_string(row, 1),
            nullable: row_bool(row, 2),
            default_value: row_string_opt(row, 3),
            data_length: row_u64_opt(row, 4),
            precision: row.get_opt_i32(5).ok().flatten(),
            scale: row.get_opt_i32(6).ok().flatten(),
            comment: row_string_opt(row, 7).filter(|value| !value.trim().is_empty()),
            is_pk: row_bool(row, 8),
        })
        .collect())
}

fn build_table_ddl(
    schema: &str,
    table: &str,
    table_comment: Option<&str>,
    columns: &[DdlColumn],
    indexes: &[Index],
    foreign_keys: &[ForeignKey],
) -> String {
    let table_ref = qualified_table(Some(schema), table);
    let mut lines = vec![format!("CREATE TABLE {} (", table_ref)];
    let mut definitions = columns
        .iter()
        .map(|column| format!("  {}", ddl_column_definition_sql(column)))
        .collect::<Vec<_>>();
    let pk_columns = columns
        .iter()
        .filter(|column| column.is_pk)
        .map(|column| quote_identifier(&column.name))
        .collect::<Vec<_>>();
    if !pk_columns.is_empty() {
        definitions.push(format!("  PRIMARY KEY ({})", pk_columns.join(", ")));
    }
    lines.push(definitions.join(",\n"));
    lines.push(");".to_string());

    if let Some(comment) = table_comment.filter(|value| !value.trim().is_empty()) {
        lines.push(format!(
            "COMMENT ON TABLE {} IS {};",
            table_ref,
            sql_string(comment.trim())
        ));
    }

    for column in columns {
        if let Some(comment) = column
            .comment
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            lines.push(format!(
                "COMMENT ON COLUMN {}.{} IS {};",
                table_ref,
                quote_identifier(&column.name),
                sql_string(comment.trim())
            ));
        }
    }

    let mut grouped_indexes: HashMap<String, Vec<&Index>> = HashMap::new();
    for index in indexes.iter().filter(|index| !index.is_primary) {
        grouped_indexes
            .entry(index.name.clone())
            .or_default()
            .push(index);
    }
    for (name, mut parts) in grouped_indexes {
        parts.sort_by_key(|index| index.seq_in_index);
        let unique = if parts.first().map(|index| index.is_unique).unwrap_or(false) {
            "UNIQUE "
        } else {
            ""
        };
        let columns = parts
            .iter()
            .map(|index| quote_identifier(&index.column_name))
            .collect::<Vec<_>>()
            .join(", ");
        lines.push(format!(
            "CREATE {}INDEX {} ON {} ({});",
            unique,
            quote_identifier(&name),
            table_ref,
            columns
        ));
    }

    let mut grouped_fks: HashMap<String, Vec<&ForeignKey>> = HashMap::new();
    for fk in foreign_keys {
        grouped_fks.entry(fk.name.clone()).or_default().push(fk);
    }
    for (name, mut parts) in grouped_fks {
        parts.sort_by(|left, right| left.column_name.cmp(&right.column_name));
        let columns = parts
            .iter()
            .map(|fk| quote_identifier(&fk.column_name))
            .collect::<Vec<_>>()
            .join(", ");
        let ref_columns = parts
            .iter()
            .map(|fk| quote_identifier(&fk.ref_column))
            .collect::<Vec<_>>()
            .join(", ");
        let ref_table = parts
            .first()
            .map(|fk| fk.ref_table.as_str())
            .unwrap_or_default();
        let mut statement = format!(
            "ALTER TABLE {} ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({});",
            table_ref,
            quote_identifier(&name),
            columns,
            qualified_table(Some(schema), ref_table),
            ref_columns
        );
        if let Some(on_delete) = parts
            .first()
            .and_then(|fk| fk.on_delete.as_deref())
            .filter(|value| !value.eq_ignore_ascii_case("NO ACTION"))
        {
            statement = statement.trim_end_matches(';').to_string();
            statement.push_str(&format!(" ON DELETE {};", on_delete));
        }
        lines.push(statement);
    }

    lines.join("\n")
}

pub async fn get_tables(
    params: &ConnectionParams,
    schema: Option<&str>,
) -> Result<Vec<TableInfo>, String> {
    DamengDriver::new().get_tables(params, schema).await
}

pub async fn get_table_ddl(
    params: &ConnectionParams,
    table_name: &str,
    schema: Option<&str>,
) -> Result<String, String> {
    let driver = DamengDriver::new();
    let (owner, actual_table_name) = resolve_table_owner(params, schema, table_name).await?;
    let tables = driver.get_tables(params, Some(&owner)).await?;
    let table_comment = tables
        .iter()
        .find(|table| table.name.eq_ignore_ascii_case(&actual_table_name))
        .and_then(|table| table.comment.as_deref());
    let columns = describe_table_columns(params, &actual_table_name, &owner).await?;
    let indexes = driver
        .get_indexes(params, &actual_table_name, Some(&owner))
        .await?;
    let foreign_keys = driver
        .get_foreign_keys(params, &actual_table_name, Some(&owner))
        .await?;
    Ok(build_table_ddl(
        &owner,
        &actual_table_name,
        table_comment,
        &columns,
        &indexes,
        &foreign_keys,
    ))
}

pub async fn dump_table_data_sql<W: std::io::Write + Send>(
    writer: &mut W,
    params: &ConnectionParams,
    table: &str,
    schema: &str,
) -> Result<(), String> {
    let (owner, table_name) = resolve_table_owner(params, Some(schema), table).await?;
    let query = format!("SELECT * FROM {}", qualified_table(Some(&owner), &table_name));
    let result = query_result_set(params, &query).await?;
    let mut batch = Vec::new();
    for row in &result.rows {
        let values = (0..result.columns.len())
            .map(|index| cell_to_json(row, &result.columns, index))
            .map(|value| json_to_sql(&value))
            .collect::<Vec<_>>();
        batch.push(format!("({})", values.join(", ")));

        if batch.len() >= 100 {
            writeln!(
                writer,
                "INSERT INTO {} VALUES {};",
                qualified_table(Some(&owner), &table_name),
                batch.join(", ")
            )
            .map_err(|error| error.to_string())?;
            batch.clear();
        }
    }

    if !batch.is_empty() {
        writeln!(
            writer,
            "INSERT INTO {} VALUES {};",
            qualified_table(Some(&owner), &table_name),
            batch.join(", ")
        )
        .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn is_select_like(query: &str) -> bool {
    let trimmed = query
        .trim_start_matches('\u{feff}')
        .trim_start()
        .trim_start_matches('(')
        .trim_start()
        .to_ascii_uppercase();
    trimmed.starts_with("SELECT")
        || trimmed.starts_with("WITH")
        || trimmed.starts_with("EXPLAIN")
        || trimmed.starts_with("DESC")
        || trimmed.starts_with("DESCRIBE")
}

#[async_trait]
impl DatabaseDriver for DamengDriver {
    fn manifest(&self) -> &PluginManifest {
        &self.manifest
    }

    fn get_data_types(&self) -> Vec<DataTypeInfo> {
        [
            ("BIGINT", false, false, None, true),
            ("INT", false, false, None, true),
            ("NUMBER", false, true, None, false),
            ("DECIMAL", false, true, None, false),
            ("VARCHAR", true, false, Some("255"), false),
            ("VARCHAR2", true, false, Some("255"), false),
            ("CHAR", true, false, Some("1"), false),
            ("CLOB", false, false, None, false),
            ("DATE", false, false, None, false),
            ("TIMESTAMP", false, false, None, false),
            ("BLOB", false, false, None, false),
        ]
        .into_iter()
        .map(
            |(
                name,
                requires_length,
                requires_precision,
                default_length,
                supports_auto_increment,
            )| {
                DataTypeInfo {
                    name: name.to_string(),
                    category: "Dameng".to_string(),
                    requires_length,
                    requires_precision,
                    default_length: default_length.map(ToString::to_string),
                    supports_auto_increment,
                    requires_extension: None,
                }
            },
        )
        .collect()
    }

    fn map_inferred_type(&self, kind: &str) -> String {
        match kind {
            "INTEGER" => "BIGINT".to_string(),
            "REAL" => "DOUBLE".to_string(),
            "BOOLEAN" => "BIT".to_string(),
            "DATETIME" => "TIMESTAMP".to_string(),
            "TEXT" | "JSON" => "CLOB".to_string(),
            other => other.to_string(),
        }
    }

    fn build_connection_url(&self, params: &ConnectionParams) -> Result<String, String> {
        use urlencoding::encode;
        Ok(format!(
            "dm://{}:{}@{}:{}",
            encode(params.username.as_deref().unwrap_or("SYSDBA")),
            encode(params.password.as_deref().unwrap_or_default()),
            params.host.as_deref().unwrap_or("localhost"),
            params.port.unwrap_or(5236),
        ))
    }

    async fn test_connection(&self, params: &ConnectionParams) -> Result<(), String> {
        let mut client = connect(params).await?;
        client
            .query("SELECT 1 FROM DUAL")
            .await
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    async fn ping(&self, params: &ConnectionParams) -> Result<(), String> {
        self.test_connection(params).await
    }

    async fn get_databases(&self, params: &ConnectionParams) -> Result<Vec<String>, String> {
        let mut names = BTreeSet::new();
        push_visible_database_name(&mut names, params.database.primary().to_string());

        let discovery_queries = [
            // Object owners are the most useful "database" level in Mavicat's tree.
            "SELECT OWNER FROM DBA_TABLES ORDER BY OWNER",
            "SELECT OWNER FROM DBA_VIEWS ORDER BY OWNER",
            "SELECT OWNER FROM ALL_TABLES ORDER BY OWNER",
            "SELECT OWNER FROM ALL_VIEWS ORDER BY OWNER",
            // Keep user/schema names visible even when they do not own tables yet.
            "SELECT USERNAME FROM ALL_USERS ORDER BY USERNAME",
            // Some Dameng installations are organized by tablespace; expose them
            // in the picker so users can select the operational namespace they know.
            "SELECT TABLESPACE_NAME FROM DBA_TABLESPACES ORDER BY TABLESPACE_NAME",
            "SELECT TABLESPACE_NAME FROM USER_TABLESPACES ORDER BY TABLESPACE_NAME",
            "SELECT NAME FROM V$TABLESPACE ORDER BY NAME",
        ];

        let mut last_error = None;
        for query in discovery_queries {
            match query_first_column_strings(params, query).await {
                Ok(values) => {
                    for value in values {
                        push_visible_database_name(&mut names, value);
                    }
                }
                Err(error) => last_error = Some(error),
            }
        }

        if names.is_empty() {
            if let Some(username) = &params.username {
                push_visible_database_name(&mut names, username.clone());
            }
        }

        if names.is_empty() {
            return Err(last_error.unwrap_or_else(|| "No Dameng schemas found".to_string()));
        }

        Ok(names.into_iter().collect())
    }

    async fn get_schemas(&self, params: &ConnectionParams) -> Result<Vec<String>, String> {
        self.get_databases(params).await
    }

    async fn get_tables(
        &self,
        params: &ConnectionParams,
        schema: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        let owner = self.resolve_schema(params, schema);
        let owner_sql = format!(
            r#"
            SELECT TABLE_NAME, COMMENTS
            FROM ALL_TAB_COMMENTS
            WHERE OWNER = {} AND TABLE_TYPE = 'TABLE'
            ORDER BY TABLE_NAME
            "#,
            sql_string(&owner),
        );
        let result = query_result_set(params, &owner_sql).await?;
        let owner_tables = result
            .rows
            .iter()
            .map(|row| TableInfo {
                name: row_string(row, 0),
                comment: row_string_opt(row, 1).filter(|value| !value.trim().is_empty()),
            })
            .collect::<Vec<_>>();
        if !owner_tables.is_empty() {
            return Ok(owner_tables);
        }

        let tablespace_sql = format!(
            r#"
            SELECT t.TABLE_NAME, c.COMMENTS
            FROM DBA_TABLES t
            LEFT JOIN DBA_TAB_COMMENTS c
                ON c.OWNER = t.OWNER
               AND c.TABLE_NAME = t.TABLE_NAME
            WHERE t.TABLESPACE_NAME = {}
            ORDER BY t.OWNER, t.TABLE_NAME
            "#,
            sql_string(&owner),
        );
        let result = query_result_set(params, &tablespace_sql).await?;
        Ok(result
            .rows
            .iter()
            .map(|row| TableInfo {
                name: row_string(row, 0),
                comment: row_string_opt(row, 1).filter(|value| !value.trim().is_empty()),
            })
            .collect())
    }

    async fn get_columns(
        &self,
        params: &ConnectionParams,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<TableColumn>, String> {
        let (owner, table_name) = resolve_table_owner(params, schema, table).await?;
        let sql = format!(
            r#"
            SELECT
                c.COLUMN_NAME,
                c.DATA_TYPE,
                CASE WHEN c.NULLABLE = 'Y' THEN 1 ELSE 0 END AS IS_NULLABLE,
                c.DATA_DEFAULT,
                c.DATA_LENGTH,
                CASE WHEN pk.COLUMN_NAME IS NULL THEN 0 ELSE 1 END AS IS_PK,
                cc.COMMENTS
            FROM ALL_TAB_COLUMNS c
            LEFT JOIN ALL_COL_COMMENTS cc
                ON cc.OWNER = c.OWNER
               AND cc.TABLE_NAME = c.TABLE_NAME
               AND cc.COLUMN_NAME = c.COLUMN_NAME
            LEFT JOIN (
                SELECT cols.OWNER, cols.TABLE_NAME, cols.COLUMN_NAME
                FROM ALL_CONSTRAINTS cons
                JOIN ALL_CONS_COLUMNS cols
                    ON cols.OWNER = cons.OWNER
                   AND cols.CONSTRAINT_NAME = cons.CONSTRAINT_NAME
                WHERE cons.CONSTRAINT_TYPE = 'P'
            ) pk
                ON pk.OWNER = c.OWNER
               AND pk.TABLE_NAME = c.TABLE_NAME
               AND pk.COLUMN_NAME = c.COLUMN_NAME
            WHERE c.OWNER = {} AND c.TABLE_NAME = {}
            ORDER BY c.COLUMN_ID
            "#,
            sql_string(&owner),
            sql_string(&table_name),
        );

        let result = query_result_set(params, &sql).await?;
        Ok(result
            .rows
            .iter()
            .map(|row| TableColumn {
                name: row_string(row, 0),
                data_type: row_string(row, 1),
                is_pk: row_bool(row, 5),
                is_nullable: row_bool(row, 2),
                is_auto_increment: false,
                default_value: row_string_opt(row, 3),
                character_maximum_length: row_u64_opt(row, 4),
                comment: row_string_opt(row, 6).filter(|value| !value.trim().is_empty()),
            })
            .collect())
    }

    async fn get_foreign_keys(
        &self,
        params: &ConnectionParams,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ForeignKey>, String> {
        let (owner, table_name) = resolve_table_owner(params, schema, table).await?;
        let sql = format!(
            r#"
            SELECT
                cons.CONSTRAINT_NAME,
                cols.COLUMN_NAME,
                rcols.TABLE_NAME AS REF_TABLE,
                rcols.COLUMN_NAME AS REF_COLUMN,
                cons.DELETE_RULE
            FROM ALL_CONSTRAINTS cons
            JOIN ALL_CONS_COLUMNS cols
                ON cols.OWNER = cons.OWNER
               AND cols.CONSTRAINT_NAME = cons.CONSTRAINT_NAME
            JOIN ALL_CONSTRAINTS rcons
                ON rcons.OWNER = cons.R_OWNER
               AND rcons.CONSTRAINT_NAME = cons.R_CONSTRAINT_NAME
            JOIN ALL_CONS_COLUMNS rcols
                ON rcols.OWNER = rcons.OWNER
               AND rcols.CONSTRAINT_NAME = rcons.CONSTRAINT_NAME
               AND rcols.POSITION = cols.POSITION
            WHERE cons.CONSTRAINT_TYPE = 'R'
              AND cons.OWNER = {}
              AND cons.TABLE_NAME = {}
            ORDER BY cons.CONSTRAINT_NAME, cols.POSITION
            "#,
            sql_string(&owner),
            sql_string(&table_name),
        );
        let result = query_result_set(params, &sql).await?;
        Ok(result
            .rows
            .iter()
            .map(|row| ForeignKey {
                name: row_string(row, 0),
                column_name: row_string(row, 1),
                ref_table: row_string(row, 2),
                ref_column: row_string(row, 3),
                on_delete: row_string_opt(row, 4),
                on_update: None,
            })
            .collect())
    }

    async fn get_indexes(
        &self,
        params: &ConnectionParams,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<Index>, String> {
        let (owner, table_name) = resolve_table_owner(params, schema, table).await?;
        let sql = format!(
            r#"
            SELECT
                idx.INDEX_NAME,
                col.COLUMN_NAME,
                CASE WHEN idx.UNIQUENESS = 'UNIQUE' THEN 1 ELSE 0 END AS IS_UNIQUE,
                CASE WHEN pk.CONSTRAINT_NAME IS NULL THEN 0 ELSE 1 END AS IS_PRIMARY,
                col.COLUMN_POSITION
            FROM ALL_INDEXES idx
            JOIN ALL_IND_COLUMNS col
                ON col.INDEX_OWNER = idx.OWNER
               AND col.INDEX_NAME = idx.INDEX_NAME
            LEFT JOIN ALL_CONSTRAINTS pk
                ON pk.OWNER = idx.OWNER
               AND pk.INDEX_NAME = idx.INDEX_NAME
               AND pk.CONSTRAINT_TYPE = 'P'
            WHERE idx.TABLE_OWNER = {}
              AND idx.TABLE_NAME = {}
            ORDER BY idx.INDEX_NAME, col.COLUMN_POSITION
            "#,
            sql_string(&owner),
            sql_string(&table_name),
        );
        let result = query_result_set(params, &sql).await?;
        Ok(result
            .rows
            .iter()
            .map(|row| Index {
                name: row_string(row, 0),
                column_name: row_string(row, 1),
                is_unique: row_bool(row, 2),
                is_primary: row_bool(row, 3),
                seq_in_index: row_i32(row, 4),
            })
            .collect())
    }

    async fn get_views(
        &self,
        params: &ConnectionParams,
        schema: Option<&str>,
    ) -> Result<Vec<ViewInfo>, String> {
        let owner = self.resolve_schema(params, schema);
        let sql = format!(
            "SELECT VIEW_NAME FROM ALL_VIEWS WHERE OWNER = {} ORDER BY VIEW_NAME",
            sql_string(&owner),
        );
        let result = query_result_set(params, &sql).await?;
        Ok(result
            .rows
            .iter()
            .map(|row| ViewInfo {
                name: row_string(row, 0),
                definition: None,
            })
            .collect())
    }

    async fn get_view_definition(
        &self,
        params: &ConnectionParams,
        view_name: &str,
        schema: Option<&str>,
    ) -> Result<String, String> {
        let owner = self.resolve_schema(params, schema);
        let sql = format!(
            "SELECT TEXT FROM ALL_VIEWS WHERE OWNER = {} AND VIEW_NAME = {}",
            sql_string(&owner),
            sql_string(view_name),
        );
        let result = query_result_set(params, &sql).await?;
        Ok(result
            .rows
            .first()
            .map(|row| row_string(row, 0))
            .unwrap_or_default())
    }

    async fn get_view_columns(
        &self,
        params: &ConnectionParams,
        view_name: &str,
        schema: Option<&str>,
    ) -> Result<Vec<TableColumn>, String> {
        self.get_columns(params, view_name, schema).await
    }

    async fn create_view(
        &self,
        _params: &ConnectionParams,
        _view_name: &str,
        _definition: &str,
        _schema: Option<&str>,
    ) -> Result<(), String> {
        Err(unsupported("view editing"))
    }

    async fn alter_view(
        &self,
        _params: &ConnectionParams,
        _view_name: &str,
        _definition: &str,
        _schema: Option<&str>,
    ) -> Result<(), String> {
        Err(unsupported("view editing"))
    }

    async fn drop_view(
        &self,
        _params: &ConnectionParams,
        _view_name: &str,
        _schema: Option<&str>,
    ) -> Result<(), String> {
        Err(unsupported("view editing"))
    }

    async fn get_routines(
        &self,
        params: &ConnectionParams,
        schema: Option<&str>,
    ) -> Result<Vec<RoutineInfo>, String> {
        let owner = self.resolve_schema(params, schema);
        let sql = format!(
            r#"
            SELECT OBJECT_NAME, OBJECT_TYPE
            FROM ALL_OBJECTS
            WHERE OWNER = {}
              AND OBJECT_TYPE IN ('PROCEDURE', 'FUNCTION')
            ORDER BY OBJECT_TYPE, OBJECT_NAME
            "#,
            sql_string(&owner),
        );
        let result = query_result_set(params, &sql).await?;
        Ok(result
            .rows
            .iter()
            .map(|row| RoutineInfo {
                name: row_string(row, 0),
                routine_type: row_string(row, 1),
                definition: None,
            })
            .collect())
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
        Err(unsupported("routine definition"))
    }

    async fn execute_query(
        &self,
        params: &ConnectionParams,
        query: &str,
        limit: Option<u32>,
        page: u32,
        _schema: Option<&str>,
    ) -> Result<QueryResult, String> {
        let mut client = connect(params).await?;
        if !is_select_like(query) {
            let affected_rows = client
                .execute(query)
                .await
                .map_err(|error| error.to_string())?;
            return Ok(QueryResult {
                columns: vec![],
                rows: vec![],
                affected_rows,
                truncated: false,
                pagination: None,
            });
        }

        let result = client
            .query(query)
            .await
            .map_err(|error| error.to_string())?;
        let columns = result
            .columns
            .iter()
            .map(|column| column.name.clone())
            .collect::<Vec<_>>();
        let total_rows = result.rows.len() as u64;
        let page_size = limit.unwrap_or(total_rows.max(1) as u32);
        let start = page.saturating_sub(1) as usize * page_size as usize;
        let data_rows = result
            .rows
            .iter()
            .skip(start)
            .take(page_size as usize)
            .map(|row| {
                (0..result.columns.len())
                    .map(|index| cell_to_json(row, &result.columns, index))
                    .collect()
            })
            .collect::<Vec<Vec<Value>>>();
        let returned_rows = data_rows.len();

        Ok(QueryResult {
            columns,
            rows: data_rows,
            affected_rows: 0,
            truncated: false,
            pagination: Some(Pagination {
                page,
                page_size,
                total_rows: Some(total_rows),
                has_more: start + returned_rows < total_rows as usize,
            }),
        })
    }

    async fn insert_record(
        &self,
        params: &ConnectionParams,
        table: &str,
        data: HashMap<String, Value>,
        schema: Option<&str>,
        _max_blob_size: u64,
    ) -> Result<u64, String> {
        if data.is_empty() {
            return Err("No data provided for insert".to_string());
        }
        let (owner, table_name) = resolve_table_owner(params, schema, table).await?;
        let mut pairs = data.into_iter().collect::<Vec<_>>();
        pairs.sort_by(|left, right| left.0.cmp(&right.0));
        let columns = pairs
            .iter()
            .map(|(column, _)| quote_identifier(column))
            .collect::<Vec<_>>()
            .join(", ");
        let values = pairs
            .iter()
            .map(|(_, value)| json_to_sql(value))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "INSERT INTO {} ({}) VALUES ({})",
            qualified_table(Some(&owner), &table_name),
            columns,
            values
        );
        let mut client = connect(params).await?;
        client
            .execute(&sql)
            .await
            .map_err(|error| error.to_string())
    }

    async fn update_record(
        &self,
        params: &ConnectionParams,
        table: &str,
        pk_col: &str,
        pk_val: Value,
        col_name: &str,
        new_val: Value,
        schema: Option<&str>,
        _max_blob_size: u64,
    ) -> Result<u64, String> {
        let (owner, table_name) = resolve_table_owner(params, schema, table).await?;
        let sql = format!(
            "UPDATE {} SET {} = {} WHERE {} = {}",
            qualified_table(Some(&owner), &table_name),
            quote_identifier(col_name),
            json_to_sql(&new_val),
            quote_identifier(pk_col),
            json_to_sql(&pk_val)
        );
        let mut client = connect(params).await?;
        client
            .execute(&sql)
            .await
            .map_err(|error| error.to_string())
    }

    async fn delete_record(
        &self,
        params: &ConnectionParams,
        table: &str,
        pk_col: &str,
        pk_val: Value,
        schema: Option<&str>,
    ) -> Result<u64, String> {
        let (owner, table_name) = resolve_table_owner(params, schema, table).await?;
        let sql = format!(
            "DELETE FROM {} WHERE {} = {}",
            qualified_table(Some(&owner), &table_name),
            quote_identifier(pk_col),
            json_to_sql(&pk_val)
        );
        let mut client = connect(params).await?;
        client
            .execute(&sql)
            .await
            .map_err(|error| error.to_string())
    }

    async fn get_create_table_sql(
        &self,
        table_name: &str,
        columns: Vec<ColumnDefinition>,
        schema: Option<&str>,
    ) -> Result<Vec<String>, String> {
        if columns.is_empty() {
            return Err("At least one column is required".to_string());
        }
        let mut defs = columns
            .iter()
            .map(|column| format!("  {}", column_definition_sql(column)))
            .collect::<Vec<_>>();
        let pk_columns = columns
            .iter()
            .filter(|column| column.is_pk)
            .map(|column| quote_identifier(&column.name))
            .collect::<Vec<_>>();
        if !pk_columns.is_empty() {
            defs.push(format!("  PRIMARY KEY ({})", pk_columns.join(", ")));
        }
        Ok(vec![format!(
            "CREATE TABLE {} (\n{}\n)",
            qualified_table(schema, table_name),
            defs.join(",\n")
        )])
    }

    async fn get_add_column_sql(
        &self,
        table: &str,
        column: ColumnDefinition,
        schema: Option<&str>,
    ) -> Result<Vec<String>, String> {
        Ok(vec![format!(
            "ALTER TABLE {} ADD {}",
            qualified_table(schema, table),
            column_definition_sql(&column)
        )])
    }

    async fn get_alter_column_sql(
        &self,
        table: &str,
        old_column: ColumnDefinition,
        new_column: ColumnDefinition,
        schema: Option<&str>,
    ) -> Result<Vec<String>, String> {
        let table_ref = qualified_table(schema, table);
        let mut statements = Vec::new();
        if old_column.name != new_column.name {
            statements.push(format!(
                "ALTER TABLE {} RENAME COLUMN {} TO {}",
                table_ref,
                quote_identifier(&old_column.name),
                quote_identifier(&new_column.name)
            ));
        }
        statements.push(format!(
            "ALTER TABLE {} MODIFY {}",
            table_ref,
            column_definition_sql(&new_column)
        ));
        Ok(statements)
    }

    async fn get_create_index_sql(
        &self,
        table: &str,
        index_name: &str,
        columns: Vec<String>,
        is_unique: bool,
        schema: Option<&str>,
    ) -> Result<Vec<String>, String> {
        if columns.is_empty() {
            return Err("At least one index column is required".to_string());
        }
        let unique = if is_unique { "UNIQUE " } else { "" };
        let columns = columns
            .iter()
            .map(|column| quote_identifier(column))
            .collect::<Vec<_>>()
            .join(", ");
        Ok(vec![format!(
            "CREATE {}INDEX {} ON {} ({})",
            unique,
            quote_identifier(index_name),
            qualified_table(schema, table),
            columns
        )])
    }

    async fn get_create_foreign_key_sql(
        &self,
        table: &str,
        fk_name: &str,
        column: &str,
        ref_table: &str,
        ref_column: &str,
        on_delete: Option<&str>,
        _on_update: Option<&str>,
        schema: Option<&str>,
    ) -> Result<Vec<String>, String> {
        let mut sql = format!(
            "ALTER TABLE {} ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({})",
            qualified_table(schema, table),
            quote_identifier(fk_name),
            quote_identifier(column),
            qualified_table(schema, ref_table),
            quote_identifier(ref_column)
        );
        if let Some(action) = on_delete.filter(|value| !value.trim().is_empty()) {
            sql.push_str(&format!(" ON DELETE {}", action));
        }
        Ok(vec![sql])
    }

    async fn drop_index(
        &self,
        params: &ConnectionParams,
        _table: &str,
        index_name: &str,
        schema: Option<&str>,
    ) -> Result<(), String> {
        let owner = self.resolve_schema(params, schema);
        let sql = format!("DROP INDEX {}", qualified_table(Some(&owner), index_name));
        let mut client = connect(params).await?;
        client
            .execute(&sql)
            .await
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    async fn drop_foreign_key(
        &self,
        params: &ConnectionParams,
        table: &str,
        fk_name: &str,
        schema: Option<&str>,
    ) -> Result<(), String> {
        let (owner, table_name) = resolve_table_owner(params, schema, table).await?;
        let sql = format!(
            "ALTER TABLE {} DROP CONSTRAINT {}",
            qualified_table(Some(&owner), &table_name),
            quote_identifier(fk_name)
        );
        let mut client = connect(params).await?;
        client
            .execute(&sql)
            .await
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    async fn get_schema_snapshot(
        &self,
        params: &ConnectionParams,
        schema: Option<&str>,
    ) -> Result<Vec<TableSchema>, String> {
        let tables = self.get_tables(params, schema).await?;
        let mut snapshots = Vec::with_capacity(tables.len());
        for table in tables {
            snapshots.push(TableSchema {
                columns: self.get_columns(params, &table.name, schema).await?,
                foreign_keys: self.get_foreign_keys(params, &table.name, schema).await?,
                name: table.name,
            });
        }
        Ok(snapshots)
    }

    async fn get_all_columns_batch(
        &self,
        params: &ConnectionParams,
        schema: Option<&str>,
    ) -> Result<HashMap<String, Vec<TableColumn>>, String> {
        let tables = self.get_tables(params, schema).await?;
        let mut result = HashMap::new();
        for table in tables {
            result.insert(
                table.name.clone(),
                self.get_columns(params, &table.name, schema).await?,
            );
        }
        Ok(result)
    }

    async fn get_all_foreign_keys_batch(
        &self,
        params: &ConnectionParams,
        schema: Option<&str>,
    ) -> Result<HashMap<String, Vec<ForeignKey>>, String> {
        let tables = self.get_tables(params, schema).await?;
        let mut result = HashMap::new();
        for table in tables {
            result.insert(
                table.name.clone(),
                self.get_foreign_keys(params, &table.name, schema).await?,
            );
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sql_string_escapes_quotes() {
        assert_eq!(sql_string("O'Hara"), "'O''Hara'");
    }

    #[test]
    fn system_database_names_are_hidden_from_picker() {
        assert!(is_system_database_name("SYS"));
        assert!(is_system_database_name("ctisys"));
        assert!(!is_system_database_name("BUSINESS_SCHEMA"));
    }

    #[test]
    fn visible_database_names_are_trimmed_and_unique() {
        let mut names = BTreeSet::new();
        push_visible_database_name(&mut names, "  DMHR  ".to_string());
        push_visible_database_name(&mut names, "DMHR".to_string());
        push_visible_database_name(&mut names, "SYS".to_string());
        assert_eq!(names.into_iter().collect::<Vec<_>>(), vec!["DMHR"]);
    }

    #[test]
    fn qualified_table_name_splits_owner_and_table() {
        assert_eq!(
            split_qualified_table_name("\"DMHR\".\"EMPLOYEE\""),
            Some(("DMHR".to_string(), "EMPLOYEE".to_string()))
        );
        assert_eq!(split_qualified_table_name("EMPLOYEE"), None);
    }

    #[test]
    fn select_like_detection_handles_common_read_queries() {
        assert!(is_select_like("select 1 from dual"));
        assert!(is_select_like(
            " WITH x AS (SELECT 1 FROM DUAL) SELECT * FROM x"
        ));
        assert!(is_select_like("DESC SYSDBA.TEST_TABLE"));
        assert!(!is_select_like("UPDATE t SET name = 'x'"));
    }

    #[test]
    fn resolve_schema_prefers_explicit_schema() {
        let driver = DamengDriver::new();
        let params = ConnectionParams {
            driver: "dameng".to_string(),
            host: Some("localhost".to_string()),
            port: Some(5236),
            username: Some("APP".to_string()),
            password: None,
            database: crate::models::DatabaseSelection::Single("SYSDBA".to_string()),
            ssl_mode: None,
            ssl_ca: None,
            ssl_cert: None,
            ssl_key: None,
            ssh_enabled: None,
            ssh_connection_id: None,
            ssh_host: None,
            ssh_port: None,
            ssh_user: None,
            ssh_password: None,
            ssh_key_file: None,
            ssh_key_passphrase: None,
            save_in_keychain: None,
            connection_id: None,
        };
        assert_eq!(driver.resolve_schema(&params, Some("HR")), "HR");
    }
}

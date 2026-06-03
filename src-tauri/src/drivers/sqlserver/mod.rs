use std::collections::HashMap;

use async_trait::async_trait;
use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use rust_decimal::Decimal;
use serde_json::Value;
use tiberius::{AuthMethod, Client, Config, Row};
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

use crate::drivers::driver_trait::{DatabaseDriver, DriverCapabilities, PluginManifest};
use crate::models::{
    ColumnDefinition, ConnectionParams, DataTypeInfo, DatabaseSelection, ForeignKey, Index,
    Pagination, QueryResult, RoutineInfo, RoutineParameter, TableColumn, TableInfo, TableSchema,
    ViewInfo,
};

type SqlServerClient = Client<Compat<TcpStream>>;

pub struct SqlServerDriver {
    manifest: PluginManifest,
}

impl SqlServerDriver {
    pub fn new() -> Self {
        Self {
            manifest: PluginManifest {
                id: "sqlserver".to_string(),
                name: "SQL Server".to_string(),
                version: "1.0.0".to_string(),
                description: "Microsoft SQL Server databases".to_string(),
                default_port: Some(1433),
                capabilities: DriverCapabilities {
                    schemas: false,
                    views: true,
                    routines: true,
                    file_based: false,
                    folder_based: false,
                    connection_string: true,
                    connection_string_example: "sqlserver://user:pass@localhost:1433/db".into(),
                    identifier_quote: "[".into(),
                    alter_primary_key: false,
                    auto_increment_keyword: "IDENTITY".into(),
                    serial_type: String::new(),
                    inline_pk: false,
                    alter_column: false,
                    create_foreign_keys: false,
                    no_connection_required: false,
                    manage_tables: false,
                    triggers: false,
                    readonly: true,
                },
                is_builtin: true,
                default_username: "sa".to_string(),
                color: "#f59e0b".to_string(),
                icon: "sqlserver".to_string(),
                settings: vec![],
                ui_extensions: None,
            },
        }
    }

    fn resolve_database_and_schema(
        &self,
        params: &ConnectionParams,
        database: Option<&str>,
    ) -> (String, String) {
        let database_name = database
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .or_else(|| {
                let primary = params.database.primary().trim();
                (!primary.is_empty()).then_some(primary)
            })
            .unwrap_or("master")
            .to_string();

        (database_name, "dbo".to_string())
    }
}

fn unsupported(feature: &str) -> String {
    format!("SQL Server V1 does not support {}", feature)
}

fn build_config(params: &ConnectionParams) -> Config {
    let mut config = Config::new();
    config.host(params.host.as_deref().unwrap_or("localhost"));
    config.port(params.port.unwrap_or(1433));
    let database = params.database.primary();
    if !database.is_empty() {
        config.database(database);
    }
    config.authentication(AuthMethod::sql_server(
        params.username.as_deref().unwrap_or("sa"),
        params.password.as_deref().unwrap_or_default(),
    ));
    config.trust_cert();
    config
}

async fn connect(params: &ConnectionParams) -> Result<SqlServerClient, String> {
    let config = build_config(params);
    let tcp = TcpStream::connect(config.get_addr())
        .await
        .map_err(|error| error.to_string())?;
    tcp.set_nodelay(true).map_err(|error| error.to_string())?;
    Client::connect(config, tcp.compat_write())
        .await
        .map_err(|error| error.to_string())
}

fn params_for_database(params: &ConnectionParams, database: &str) -> ConnectionParams {
    let mut scoped = params.clone();
    scoped.database = DatabaseSelection::Single(database.to_string());
    scoped
}

fn sql_string(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn row_string(row: &Row, index: usize) -> String {
    row.try_get::<&str, _>(index)
        .ok()
        .flatten()
        .unwrap_or_default()
        .to_string()
}

fn row_string_opt(row: &Row, index: usize) -> Option<String> {
    row.try_get::<&str, _>(index)
        .ok()
        .flatten()
        .map(ToString::to_string)
}

fn row_i32(row: &Row, index: usize) -> i32 {
    row.try_get::<i32, _>(index).ok().flatten().unwrap_or(0)
}

fn row_bool(row: &Row, index: usize) -> bool {
    row.try_get::<bool, _>(index)
        .ok()
        .flatten()
        .or_else(|| {
            row.try_get::<i32, _>(index)
                .ok()
                .flatten()
                .map(|value| value != 0)
        })
        .unwrap_or(false)
}

fn row_u64_opt(row: &Row, index: usize) -> Option<u64> {
    row.try_get::<i32, _>(index)
        .ok()
        .flatten()
        .and_then(|value| u64::try_from(value).ok())
}

fn cell_to_json(row: &Row, index: usize) -> Value {
    if let Ok(Some(value)) = row.try_get::<bool, _>(index) {
        return Value::Bool(value);
    }
    if let Ok(Some(value)) = row.try_get::<i64, _>(index) {
        return Value::from(value);
    }
    if let Ok(Some(value)) = row.try_get::<i32, _>(index) {
        return Value::from(value);
    }
    if let Ok(Some(value)) = row.try_get::<i16, _>(index) {
        return Value::from(value);
    }
    if let Ok(Some(value)) = row.try_get::<u8, _>(index) {
        return Value::from(value);
    }
    if let Ok(Some(value)) = row.try_get::<f64, _>(index) {
        return Value::from(value);
    }
    if let Ok(Some(value)) = row.try_get::<f32, _>(index) {
        return Value::from(value as f64);
    }
    if let Ok(Some(value)) = row.try_get::<Decimal, _>(index) {
        return Value::String(value.to_string());
    }
    if let Ok(Some(value)) = row.try_get::<NaiveDateTime, _>(index) {
        return Value::String(value.to_string());
    }
    if let Ok(Some(value)) = row.try_get::<NaiveDate, _>(index) {
        return Value::String(value.to_string());
    }
    if let Ok(Some(value)) = row.try_get::<NaiveTime, _>(index) {
        return Value::String(value.to_string());
    }
    if let Ok(Some(value)) = row.try_get::<&str, _>(index) {
        return Value::String(value.to_string());
    }
    if let Ok(Some(value)) = row.try_get::<&[u8], _>(index) {
        return Value::String(base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            value,
        ));
    }
    Value::Null
}

async fn query_rows(params: &ConnectionParams, query: &str) -> Result<Vec<Row>, String> {
    let mut client = connect(params).await?;
    let rows = client
        .simple_query(query)
        .await
        .map_err(|error| error.to_string())?
        .into_first_result()
        .await
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

async fn query_rows_in_database(
    params: &ConnectionParams,
    database: &str,
    query: &str,
) -> Result<Vec<Row>, String> {
    let scoped = params_for_database(params, database);
    query_rows(&scoped, query).await
}

#[async_trait]
impl DatabaseDriver for SqlServerDriver {
    fn manifest(&self) -> &PluginManifest {
        &self.manifest
    }

    fn get_data_types(&self) -> Vec<DataTypeInfo> {
        [
            "bigint",
            "int",
            "bit",
            "decimal",
            "float",
            "nvarchar",
            "varchar",
            "datetime2",
            "date",
            "varbinary",
        ]
        .into_iter()
        .map(|name| DataTypeInfo {
            name: name.to_string(),
            category: "SQL Server".to_string(),
            requires_length: matches!(name, "nvarchar" | "varchar" | "varbinary"),
            requires_precision: name == "decimal",
            default_length: if matches!(name, "nvarchar" | "varchar") {
                Some("255".to_string())
            } else {
                None
            },
            supports_auto_increment: name == "bigint" || name == "int",
            requires_extension: None,
        })
        .collect()
    }

    fn map_inferred_type(&self, kind: &str) -> String {
        match kind {
            "INTEGER" => "BIGINT".to_string(),
            "REAL" => "FLOAT".to_string(),
            "BOOLEAN" => "BIT".to_string(),
            "DATETIME" => "DATETIME2".to_string(),
            "TEXT" | "JSON" => "NVARCHAR(MAX)".to_string(),
            other => other.to_string(),
        }
    }

    fn build_connection_url(&self, params: &ConnectionParams) -> Result<String, String> {
        use urlencoding::encode;
        Ok(format!(
            "sqlserver://{}:{}@{}:{}/{}",
            encode(params.username.as_deref().unwrap_or("sa")),
            encode(params.password.as_deref().unwrap_or_default()),
            params.host.as_deref().unwrap_or("localhost"),
            params.port.unwrap_or(1433),
            encode(params.database.primary()),
        ))
    }

    async fn test_connection(&self, params: &ConnectionParams) -> Result<(), String> {
        let mut client = connect(params).await?;
        let result = client
            .simple_query("SELECT 1")
            .await
            .map_err(|error| error.to_string())?
            .into_first_result()
            .await
            .map(|_| ())
            .map_err(|error| error.to_string());
        result
    }

    async fn ping(&self, params: &ConnectionParams) -> Result<(), String> {
        self.test_connection(params).await
    }

    async fn get_databases(&self, params: &ConnectionParams) -> Result<Vec<String>, String> {
        let sql = "
            SELECT name
            FROM sys.databases
            WHERE state = 0
              AND HAS_DBACCESS(name) = 1
              AND name <> 'tempdb'
            ORDER BY CASE WHEN database_id <= 4 THEN 1 ELSE 0 END, name
        ";
        let master_params = params_for_database(params, "master");
        let rows = match query_rows(&master_params, sql).await {
            Ok(rows) => rows,
            Err(_) => query_rows(params, sql).await?,
        };
        Ok(rows.iter().map(|row| row_string(row, 0)).collect())
    }

    async fn get_schemas(&self, params: &ConnectionParams) -> Result<Vec<String>, String> {
        Ok(query_rows(
            params,
            "SELECT name FROM sys.schemas WHERE name NOT IN ('sys', 'INFORMATION_SCHEMA') ORDER BY name",
        )
        .await?
        .iter()
        .map(|row| row_string(row, 0))
        .collect())
    }

    async fn get_tables(
        &self,
        params: &ConnectionParams,
        database: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        let (database_name, schema_name) = self.resolve_database_and_schema(params, database);
        let sql = format!(
            "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = {} AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
            sql_string(&schema_name),
        );
        Ok(query_rows_in_database(params, &database_name, &sql)
            .await?
            .iter()
            .map(|row| TableInfo {
                name: row_string(row, 0),
                comment: None,
            })
            .collect())
    }

    async fn get_columns(
        &self,
        params: &ConnectionParams,
        table: &str,
        database: Option<&str>,
    ) -> Result<Vec<TableColumn>, String> {
        let (database_name, schema_name) = self.resolve_database_and_schema(params, database);
        let sql = format!(
            r#"
            SELECT
                c.COLUMN_NAME,
                c.DATA_TYPE,
                c.IS_NULLABLE,
                c.COLUMN_DEFAULT,
                c.CHARACTER_MAXIMUM_LENGTH,
                CASE WHEN pk.COLUMN_NAME IS NULL THEN 0 ELSE 1 END AS is_pk,
                COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS is_identity
            FROM INFORMATION_SCHEMA.COLUMNS c
            LEFT JOIN (
                SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                    ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                   AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            ) pk
                ON pk.TABLE_SCHEMA = c.TABLE_SCHEMA
               AND pk.TABLE_NAME = c.TABLE_NAME
               AND pk.COLUMN_NAME = c.COLUMN_NAME
            WHERE c.TABLE_SCHEMA = {} AND c.TABLE_NAME = {}
            ORDER BY c.ORDINAL_POSITION
            "#,
            sql_string(&schema_name),
            sql_string(table),
        );

        Ok(query_rows_in_database(params, &database_name, &sql)
            .await?
            .iter()
            .map(|row| TableColumn {
                name: row_string(row, 0),
                data_type: row_string(row, 1),
                is_pk: row_bool(row, 5),
                is_nullable: row_string(row, 2) == "YES",
                is_auto_increment: row_bool(row, 6),
                default_value: row_string_opt(row, 3),
                character_maximum_length: row_u64_opt(row, 4),
                comment: None,
            })
            .collect())
    }

    async fn get_foreign_keys(
        &self,
        params: &ConnectionParams,
        table: &str,
        database: Option<&str>,
    ) -> Result<Vec<ForeignKey>, String> {
        let (database_name, schema_name) = self.resolve_database_and_schema(params, database);
        let sql = format!(
            r#"
            SELECT fk.name, pc.name, rt.name, rc.name
            FROM sys.foreign_keys fk
            JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
            JOIN sys.tables pt ON fkc.parent_object_id = pt.object_id
            JOIN sys.schemas ps ON pt.schema_id = ps.schema_id
            JOIN sys.columns pc ON fkc.parent_object_id = pc.object_id AND fkc.parent_column_id = pc.column_id
            JOIN sys.tables rt ON fkc.referenced_object_id = rt.object_id
            JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
            WHERE ps.name = {} AND pt.name = {}
            ORDER BY fk.name, fkc.constraint_column_id
            "#,
            sql_string(&schema_name),
            sql_string(table),
        );
        Ok(query_rows_in_database(params, &database_name, &sql)
            .await?
            .iter()
            .map(|row| ForeignKey {
                name: row_string(row, 0),
                column_name: row_string(row, 1),
                ref_table: row_string(row, 2),
                ref_column: row_string(row, 3),
                on_delete: None,
                on_update: None,
            })
            .collect())
    }

    async fn get_indexes(
        &self,
        params: &ConnectionParams,
        table: &str,
        database: Option<&str>,
    ) -> Result<Vec<Index>, String> {
        let (database_name, schema_name) = self.resolve_database_and_schema(params, database);
        let sql = format!(
            r#"
            SELECT i.name, c.name, i.is_unique, i.is_primary_key, ic.key_ordinal
            FROM sys.indexes i
            JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            JOIN sys.tables t ON i.object_id = t.object_id
            JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE s.name = {} AND t.name = {} AND i.name IS NOT NULL
            ORDER BY i.name, ic.key_ordinal
            "#,
            sql_string(&schema_name),
            sql_string(table),
        );
        Ok(query_rows_in_database(params, &database_name, &sql)
            .await?
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
        database: Option<&str>,
    ) -> Result<Vec<ViewInfo>, String> {
        let (database_name, schema_name) = self.resolve_database_and_schema(params, database);
        let sql = format!(
            "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = {} ORDER BY TABLE_NAME",
            sql_string(&schema_name),
        );
        Ok(query_rows_in_database(params, &database_name, &sql)
            .await?
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
        database: Option<&str>,
    ) -> Result<String, String> {
        let (database_name, schema_name) = self.resolve_database_and_schema(params, database);
        let sql = format!(
            r#"
            SELECT m.definition
            FROM sys.views v
            JOIN sys.schemas s ON v.schema_id = s.schema_id
            JOIN sys.sql_modules m ON v.object_id = m.object_id
            WHERE s.name = {} AND v.name = {}
            "#,
            sql_string(&schema_name),
            sql_string(view_name),
        );
        Ok(query_rows_in_database(params, &database_name, &sql)
            .await?
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
        Err(unsupported("routine definition"))
    }

    async fn execute_query(
        &self,
        params: &ConnectionParams,
        query: &str,
        limit: Option<u32>,
        page: u32,
        database: Option<&str>,
    ) -> Result<QueryResult, String> {
        let (database_name, _) = self.resolve_database_and_schema(params, database);
        let rows = query_rows_in_database(params, &database_name, query).await?;
        let columns = rows
            .first()
            .map(|row| {
                row.columns()
                    .iter()
                    .map(|column| column.name().to_string())
                    .collect()
            })
            .unwrap_or_default();
        let total_rows = rows.len() as u64;
        let page_size = limit.unwrap_or(total_rows.max(1) as u32);
        let start = page.saturating_sub(1) as usize * page_size as usize;
        let data_rows = rows
            .iter()
            .skip(start)
            .take(page_size as usize)
            .map(|row| {
                (0..row.len())
                    .map(|index| cell_to_json(row, index))
                    .collect()
            })
            .collect::<Vec<Vec<Value>>>();

        Ok(QueryResult {
            columns,
            rows: data_rows,
            affected_rows: 0,
            truncated: false,
            pagination: Some(Pagination {
                page,
                page_size,
                total_rows: Some(total_rows),
                has_more: start + rows.len() < total_rows as usize,
            }),
        })
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
        Err(unsupported("DDL generation"))
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
    fn resolves_database_context_as_database_not_schema() {
        let driver = SqlServerDriver::new();
        let params = ConnectionParams {
            driver: "sqlserver".to_string(),
            database: DatabaseSelection::Single("master".to_string()),
            ..Default::default()
        };

        assert_eq!(
            driver.resolve_database_and_schema(&params, Some("sales")),
            ("sales".to_string(), "dbo".to_string())
        );
    }

    #[test]
    fn defaults_to_master_and_dbo_without_database_context() {
        let driver = SqlServerDriver::new();
        let params = ConnectionParams {
            driver: "sqlserver".to_string(),
            database: DatabaseSelection::Single(String::new()),
            ..Default::default()
        };

        assert_eq!(
            driver.resolve_database_and_schema(&params, None),
            ("master".to_string(), "dbo".to_string())
        );
    }

    #[test]
    fn params_for_database_replaces_primary_database() {
        let params = ConnectionParams {
            driver: "sqlserver".to_string(),
            database: DatabaseSelection::Single("master".to_string()),
            ..Default::default()
        };

        let scoped = params_for_database(&params, "sales");

        assert_eq!(scoped.database.primary(), "sales");
        assert_eq!(params.database.primary(), "master");
    }
}

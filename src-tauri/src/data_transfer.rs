use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Runtime};

use crate::commands::{
    expand_ssh_connection_params, find_connection_by_id, resolve_connection_params_with_id,
};
use crate::export::{value_to_sql_literal, SqlDialect};
use crate::models::{ColumnDefinition, TableColumn};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTransferRequest {
    pub source_connection_id: String,
    pub target_connection_id: String,
    pub source_schema: Option<String>,
    pub target_schema: Option<String>,
    pub source_table: String,
    pub target_table: Option<String>,
    pub write_mode: TransferWriteMode,
    pub batch_size: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTransferBatchRequest {
    pub source_connection_id: String,
    pub target_connection_id: String,
    pub source_schema: Option<String>,
    pub target_schema: Option<String>,
    pub source_tables: Vec<String>,
    pub write_mode: TransferWriteMode,
    pub batch_size: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransferWriteMode {
    Append,
    DeleteThenInsert,
    CreateThenInsert,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTransferProgress {
    pub table_name: String,
    pub rows_transferred: u64,
    pub tables_completed: Option<usize>,
    pub tables_total: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTransferReport {
    pub source_table: String,
    pub target_table: String,
    pub rows_read: u64,
    pub rows_inserted: u64,
    pub failed_statements: u64,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTransferBatchReport {
    pub tables_total: usize,
    pub tables_succeeded: usize,
    pub failed_tables: usize,
    pub rows_read: u64,
    pub rows_inserted: u64,
    pub reports: Vec<DataTransferReport>,
    pub errors: Vec<String>,
}

const DATA_TRANSFER_PROGRESS_EVENT: &str = "data_transfer_progress";

#[tauri::command]
pub async fn start_data_transfer<R: Runtime>(
    app: AppHandle<R>,
    request: DataTransferRequest,
) -> Result<DataTransferReport, String> {
    run_single_data_transfer(app, request, None, None).await
}

#[tauri::command]
pub async fn start_data_transfer_batch<R: Runtime>(
    app: AppHandle<R>,
    request: DataTransferBatchRequest,
) -> Result<DataTransferBatchReport, String> {
    let source_tables = request
        .source_tables
        .iter()
        .map(|table| table.trim().to_string())
        .filter(|table| !table.is_empty())
        .collect::<Vec<_>>();
    if source_tables.is_empty() {
        return Err("At least one source table is required".into());
    }

    let tables_total = source_tables.len();
    let mut reports = Vec::new();
    let mut errors = Vec::new();
    let mut rows_read = 0;
    let mut rows_inserted = 0;

    for (index, table) in source_tables.into_iter().enumerate() {
        let single = DataTransferRequest {
            source_connection_id: request.source_connection_id.clone(),
            target_connection_id: request.target_connection_id.clone(),
            source_schema: request.source_schema.clone(),
            target_schema: request.target_schema.clone(),
            source_table: table.clone(),
            target_table: None,
            write_mode: request.write_mode.clone(),
            batch_size: request.batch_size,
        };

        match run_single_data_transfer(app.clone(), single, Some(index), Some(tables_total)).await {
            Ok(report) => {
                rows_read += report.rows_read;
                rows_inserted += report.rows_inserted;
                if report.failed_statements > 0 && errors.len() < 20 {
                    errors.push(format!(
                        "{}: {}",
                        report.source_table,
                        report
                            .errors
                            .first()
                            .cloned()
                            .unwrap_or_else(|| "部分语句失败".into())
                    ));
                }
                reports.push(report);
            }
            Err(error) => {
                if errors.len() < 20 {
                    errors.push(format!("{}: {}", table, error));
                }
            }
        }
    }

    let tables_succeeded = reports
        .iter()
        .filter(|report| report.failed_statements == 0)
        .count();

    Ok(DataTransferBatchReport {
        tables_total,
        tables_succeeded,
        failed_tables: tables_total.saturating_sub(tables_succeeded),
        rows_read,
        rows_inserted,
        reports,
        errors,
    })
}

async fn run_single_data_transfer<R: Runtime>(
    app: AppHandle<R>,
    request: DataTransferRequest,
    table_index: Option<usize>,
    tables_total: Option<usize>,
) -> Result<DataTransferReport, String> {
    let source_table = request.source_table.trim().to_string();
    if source_table.is_empty() {
        return Err("Source table is required".into());
    }
    let target_table = request
        .target_table
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&source_table)
        .to_string();
    let batch_size = request.batch_size.unwrap_or(500).clamp(1, 5_000);

    let source_saved = find_connection_by_id(&app, &request.source_connection_id)?;
    let target_saved = find_connection_by_id(&app, &request.target_connection_id)?;
    let source_expanded = expand_ssh_connection_params(&app, &source_saved.params).await?;
    let target_expanded = expand_ssh_connection_params(&app, &target_saved.params).await?;
    let source_params =
        resolve_connection_params_with_id(&source_expanded, &request.source_connection_id)?;
    let target_params =
        resolve_connection_params_with_id(&target_expanded, &request.target_connection_id)?;

    let source_driver = crate::drivers::registry::get_driver(&source_saved.params.driver)
        .await
        .ok_or_else(|| format!("Unsupported driver: {}", source_saved.params.driver))?;
    let target_driver = crate::drivers::registry::get_driver(&target_saved.params.driver)
        .await
        .ok_or_else(|| format!("Unsupported driver: {}", target_saved.params.driver))?;

    let source_dialect = SqlDialect::from_driver(&source_saved.params.driver);
    let target_dialect = SqlDialect::from_driver(&target_saved.params.driver);
    let source_ref = source_dialect.qualified_name(request.source_schema.as_deref(), &source_table);
    let target_ref = target_dialect.qualified_name(request.target_schema.as_deref(), &target_table);

    if matches!(request.write_mode, TransferWriteMode::CreateThenInsert) {
        let source_columns = source_driver
            .get_columns(
                &source_params,
                &source_table,
                request.source_schema.as_deref(),
            )
            .await?;
        let target_columns = source_columns
            .iter()
            .map(|column| transfer_column_definition(column, &target_saved.params.driver))
            .collect::<Vec<_>>();
        let create_statements = target_driver
            .get_create_table_sql(
                &target_table,
                target_columns,
                request.target_schema.as_deref(),
            )
            .await?;
        let outcomes = target_driver
            .execute_batch(
                &target_params,
                &create_statements,
                None,
                1,
                request.target_schema.as_deref(),
            )
            .await?;
        if let Some(error) = outcomes.into_iter().find_map(|outcome| outcome.error) {
            return Err(error);
        }
    }

    if matches!(request.write_mode, TransferWriteMode::DeleteThenInsert) {
        target_driver
            .execute_query(
                &target_params,
                &format!("DELETE FROM {}", target_ref),
                None,
                1,
                request.target_schema.as_deref(),
            )
            .await?;
    }

    let mut page = 1;
    let mut rows_read = 0_u64;
    let mut rows_inserted = 0_u64;
    let mut failed_statements = 0_u64;
    let mut errors = Vec::new();

    loop {
        let result = source_driver
            .execute_query(
                &source_params,
                &format!("SELECT * FROM {}", source_ref),
                Some(batch_size),
                page,
                request.source_schema.as_deref(),
            )
            .await?;

        if result.rows.is_empty() {
            break;
        }

        rows_read += result.rows.len() as u64;
        let statements = result
            .rows
            .iter()
            .map(|row| build_insert_statement(&target_dialect, &target_ref, &result.columns, row))
            .collect::<Vec<_>>();

        let outcomes = target_driver
            .execute_batch(
                &target_params,
                &statements,
                None,
                1,
                request.target_schema.as_deref(),
            )
            .await?;

        for outcome in outcomes {
            if let Some(error) = outcome.error {
                failed_statements += 1;
                if errors.len() < 20 {
                    errors.push(error);
                }
            } else {
                rows_inserted += 1;
            }
        }

        let _ = app.emit(
            DATA_TRANSFER_PROGRESS_EVENT,
            DataTransferProgress {
                table_name: source_table.clone(),
                rows_transferred: rows_inserted,
                tables_completed: table_index.map(|index| index + 1),
                tables_total,
            },
        );

        if !result
            .pagination
            .as_ref()
            .map(|pagination| pagination.has_more)
            .unwrap_or(false)
        {
            break;
        }
        page += 1;
    }

    Ok(DataTransferReport {
        source_table,
        target_table,
        rows_read,
        rows_inserted,
        failed_statements,
        errors,
    })
}

fn transfer_column_definition(column: &TableColumn, target_driver: &str) -> ColumnDefinition {
    ColumnDefinition {
        name: column.name.clone(),
        data_type: map_transfer_type(&column.data_type, target_driver),
        is_nullable: column.is_nullable,
        is_pk: column.is_pk,
        is_auto_increment: false,
        default_value: None,
    }
}

fn map_transfer_type(source_type: &str, target_driver: &str) -> String {
    let normalized = source_type.to_ascii_lowercase();
    let is_integer = normalized.contains("int") || normalized.contains("serial");
    let is_float = normalized.contains("real")
        || normalized.contains("float")
        || normalized.contains("double")
        || normalized.contains("decimal")
        || normalized.contains("numeric")
        || normalized.contains("money");
    let is_boolean = normalized.contains("bool") || normalized == "bit";
    let is_date_time = normalized.contains("timestamp")
        || normalized.contains("datetime")
        || normalized.contains("date")
        || normalized.contains("time");
    let is_binary = normalized.contains("blob")
        || normalized.contains("binary")
        || normalized.contains("bytea")
        || normalized.contains("image");
    let is_json = normalized.contains("json");

    match target_driver {
        "mysql" | "mariadb" => {
            if is_integer {
                "BIGINT".to_string()
            } else if is_float {
                "DOUBLE".to_string()
            } else if is_boolean {
                "BOOLEAN".to_string()
            } else if is_date_time {
                "DATETIME".to_string()
            } else if is_binary {
                "LONGBLOB".to_string()
            } else if is_json {
                "JSON".to_string()
            } else {
                "TEXT".to_string()
            }
        }
        "postgres" => {
            if is_integer {
                "BIGINT".to_string()
            } else if is_float {
                "DOUBLE PRECISION".to_string()
            } else if is_boolean {
                "BOOLEAN".to_string()
            } else if is_date_time {
                "TIMESTAMP".to_string()
            } else if is_binary {
                "BYTEA".to_string()
            } else if is_json {
                "JSONB".to_string()
            } else {
                "TEXT".to_string()
            }
        }
        "sqlite" => {
            if is_integer {
                "INTEGER".to_string()
            } else if is_float {
                "REAL".to_string()
            } else if is_binary {
                "BLOB".to_string()
            } else {
                "TEXT".to_string()
            }
        }
        _ => source_type.to_string(),
    }
}

fn build_insert_statement(
    dialect: &SqlDialect,
    target_ref: &str,
    columns: &[String],
    row: &[Value],
) -> String {
    let column_sql = columns
        .iter()
        .map(|column| dialect.quote_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
    let value_sql = columns
        .iter()
        .enumerate()
        .map(|(index, _)| value_to_sql_literal(row.get(index).unwrap_or(&Value::Null)))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "INSERT INTO {} ({}) VALUES ({});",
        target_ref, column_sql, value_sql
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_insert_statement_quotes_identifier_and_value() {
        let sql = build_insert_statement(
            &SqlDialect::Postgres,
            "\"public\".\"users\"",
            &["id".to_string(), "display name".to_string()],
            &[Value::from(1), Value::from("O'Hara")],
        );

        assert_eq!(
            sql,
            "INSERT INTO \"public\".\"users\" (\"id\", \"display name\") VALUES (1, 'O''Hara');"
        );
    }

    #[test]
    fn map_transfer_type_uses_conservative_target_types() {
        assert_eq!(map_transfer_type("varchar(255)", "postgres"), "TEXT");
        assert_eq!(map_transfer_type("bigint", "sqlite"), "INTEGER");
        assert_eq!(map_transfer_type("jsonb", "mysql"), "JSON");
        assert_eq!(map_transfer_type("bytea", "mysql"), "LONGBLOB");
    }
}

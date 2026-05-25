use crate::commands::{
    expand_ssh_connection_params, find_connection_by_id, register_abort_handle,
    resolve_connection_params_with_id, unregister_abort_handle, AbortHandleMap,
};
use crate::drivers::{mysql, postgres, sqlite};
use crate::dump_utils::{drop_table_if_exists, format_table_ref, insert_into_statement};
use crate::models::ConnectionParams;
use crate::pool_manager::{get_mysql_pool, get_postgres_pool, get_sqlite_pool};
use futures::TryStreamExt;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Runtime, State};
use zip::ZipArchive;

#[derive(Debug, Serialize, Deserialize)]
pub struct DumpOptions {
    pub structure: bool,
    pub data: bool,
    pub tables: Option<Vec<String>>, // None = All
}

#[derive(Debug, Serialize, Clone)]
pub struct DumpProgress {
    pub connection_id: String,
    pub tables_processed: usize,
    pub total_tables: usize,
    pub percentage: f32,
    pub current_table: Option<String>,
    pub current_operation: String,
}

#[derive(Default)]
pub struct DumpCancellationState {
    pub handles: Arc<Mutex<AbortHandleMap>>,
}

const DUMP_PROGRESS_EVENT: &str = "dump_progress";

/// Slot key for the cancellation registry. Imports share the dump state
/// but need a distinct slot so `cancel_dump` and `cancel_import` don't
/// alias each other.
fn import_slot_key(connection_id: &str) -> String {
    format!("{}_import", connection_id)
}

fn normalized_dump_schema(
    driver: &str,
    params: &ConnectionParams,
    schema: Option<String>,
) -> String {
    let requested = schema
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    requested.unwrap_or_else(|| match driver {
        "postgres" => "public".to_string(),
        "mysql" => params.database.primary().to_string(),
        _ => String::new(),
    })
}

fn emit_dump_progress<R: Runtime>(
    app: &AppHandle<R>,
    connection_id: &str,
    tables_processed: usize,
    total_tables: usize,
    current_table: Option<&str>,
    current_operation: impl Into<String>,
) {
    let percentage = if total_tables == 0 {
        100.0
    } else {
        ((tables_processed as f32 / total_tables as f32) * 100.0).clamp(0.0, 100.0)
    };

    let _ = app.emit(
        DUMP_PROGRESS_EVENT,
        DumpProgress {
            connection_id: connection_id.to_string(),
            tables_processed,
            total_tables,
            percentage,
            current_table: current_table.map(ToOwned::to_owned),
            current_operation: current_operation.into(),
        },
    );
}

fn mysql_qualified_ref(schema: &str, table: &str) -> String {
    let table = table.replace('`', "``");
    if schema.trim().is_empty() {
        format!("`{}`", table)
    } else {
        format!("`{}`.`{}`", schema.replace('`', "``"), table)
    }
}

fn dump_driver_label(driver: &str) -> &str {
    match driver {
        "mysql" => "MySQL",
        "postgres" => "PostgreSQL",
        "sqlite" => "SQLite",
        other => other,
    }
}

#[tauri::command]
pub async fn cancel_dump(
    state: State<'_, DumpCancellationState>,
    connection_id: String,
) -> Result<(), String> {
    let entries = {
        let mut handles = state.handles.lock().unwrap();
        handles.remove(&connection_id).unwrap_or_default()
    };
    if entries.is_empty() {
        return Err("No active dump process found".into());
    }
    for handle in entries {
        handle.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn dump_database<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, DumpCancellationState>,
    connection_id: String,
    file_path: String,
    options: DumpOptions,
    schema: Option<String>,
) -> Result<(), String> {
    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;
    let driver = saved_conn.params.driver.clone();
    let schema = normalized_dump_schema(&driver, &params, schema);
    let connection_name = saved_conn.name.clone();
    let source_host = match (&params.host, params.port) {
        (Some(host), Some(port)) => format!("{}:{}", host, port),
        (Some(host), None) => host.clone(),
        _ => params.database.primary().to_string(),
    };
    let task_connection_id = connection_id.clone();
    let app_for_task = app.clone();

    // Spawn the dump process
    let task = tokio::spawn(async move {
        let file = File::create(&file_path).map_err(|e| e.to_string())?;
        let mut writer = BufWriter::new(file);

        // Write header
        writeln!(writer, "/*").map_err(|e| e.to_string())?;
        writeln!(writer, " Mavicat Dump SQL\n").map_err(|e| e.to_string())?;
        writeln!(writer, " Source Server         : {}", connection_name)
            .map_err(|e| e.to_string())?;
        writeln!(
            writer,
            " Source Server Type    : {}",
            dump_driver_label(&driver)
        )
        .map_err(|e| e.to_string())?;
        writeln!(writer, " Source Host           : {}", source_host).map_err(|e| e.to_string())?;
        writeln!(writer, " Source Schema         : {}", schema).map_err(|e| e.to_string())?;
        writeln!(
            writer,
            "\n Target Server Type    : {}",
            dump_driver_label(&driver)
        )
        .map_err(|e| e.to_string())?;
        writeln!(writer, " File Encoding         : 65001\n").map_err(|e| e.to_string())?;
        writeln!(
            writer,
            " Date: {}",
            chrono::Local::now().format("%d/%m/%Y %H:%M:%S")
        )
        .map_err(|e| e.to_string())?;
        writeln!(writer, "*/\n").map_err(|e| e.to_string())?;

        if driver == "mysql" {
            writeln!(writer, "SET NAMES utf8mb4;").map_err(|e| e.to_string())?;
            writeln!(writer, "SET FOREIGN_KEY_CHECKS = 0;\n").map_err(|e| e.to_string())?;
        }

        emit_dump_progress(
            &app_for_task,
            &task_connection_id,
            0,
            0,
            None,
            "正在读取表清单",
        );

        // Get tables
        let all_tables = match driver.as_str() {
            "mysql" => mysql::get_tables(&params, Some(&schema)).await?,
            "postgres" => postgres::get_tables(&params, &schema).await?,
            "sqlite" => sqlite::get_tables(&params).await?,
            _ => return Err("Unsupported driver".into()),
        };

        let tables_to_process: Vec<String> = if let Some(selection) = &options.tables {
            selection.clone()
        } else {
            all_tables.into_iter().map(|t| t.name).collect()
        };
        let total_tables = tables_to_process.len();

        emit_dump_progress(
            &app_for_task,
            &task_connection_id,
            0,
            total_tables,
            None,
            "准备导出",
        );

        for (index, table) in tables_to_process.iter().enumerate() {
            emit_dump_progress(
                &app_for_task,
                &task_connection_id,
                index,
                total_tables,
                Some(table),
                "正在导出表",
            );

            if options.structure {
                writeln!(writer, "-- ----------------------------").map_err(|e| e.to_string())?;
                writeln!(writer, "-- Table structure for {}", table).map_err(|e| e.to_string())?;
                writeln!(writer, "-- ----------------------------").map_err(|e| e.to_string())?;
                writeln!(writer, "{}", drop_table_if_exists(&driver, &schema, table))
                    .map_err(|e| e.to_string())?;

                let ddl = match driver.as_str() {
                    "mysql" => mysql::get_table_ddl(&params, table, Some(&schema)).await?,
                    "postgres" => postgres::get_table_ddl(&params, table, &schema).await?,
                    "sqlite" => sqlite::get_table_ddl(&params, table).await?,
                    _ => return Err("Unsupported driver".into()),
                };

                writeln!(writer, "{}\n", ddl).map_err(|e| e.to_string())?;
            }

            if options.data {
                writeln!(writer, "-- ----------------------------").map_err(|e| e.to_string())?;
                writeln!(writer, "-- Records of {}", table).map_err(|e| e.to_string())?;
                writeln!(writer, "-- ----------------------------").map_err(|e| e.to_string())?;
                export_table_data(&mut writer, &params, &driver, table, &schema).await?;
                writeln!(writer).map_err(|e| e.to_string())?;
            }

            emit_dump_progress(
                &app_for_task,
                &task_connection_id,
                index + 1,
                total_tables,
                Some(table),
                "表导出完成",
            );
        }

        if driver == "mysql" {
            writeln!(writer, "SET FOREIGN_KEY_CHECKS = 1;").map_err(|e| e.to_string())?;
        }

        writer.flush().map_err(|e| e.to_string())?;
        emit_dump_progress(
            &app_for_task,
            &task_connection_id,
            total_tables,
            total_tables,
            None,
            "导出完成",
        );
        Ok::<(), String>(())
    });

    let abort_handle = Arc::new(task.abort_handle());
    register_abort_handle(&state.handles, connection_id.clone(), abort_handle.clone());

    let result = task.await;

    unregister_abort_handle(&state.handles, &connection_id, &abort_handle);

    match result {
        Ok(res) => res,
        Err(_) => Err("Dump cancelled".into()),
    }
}

async fn export_table_data(
    writer: &mut BufWriter<File>,
    params: &ConnectionParams,
    driver: &str,
    table: &str,
    schema: &str,
) -> Result<(), String> {
    // We need to implement streaming fetch manually here because we need raw values, not JSON strings if possible,
    // or we parse JSON strings back to SQL literals.
    // The current drivers return JSON-like values via `extract_value`.
    // Let's reuse `extract_value` logic but format for SQL.

    // Ideally we should use specific batch size
    let query = match driver {
        "mysql" => format!("SELECT * FROM {}", mysql_qualified_ref(schema, table)),
        _ => format!("SELECT * FROM {}", format_table_ref(driver, schema, table)),
    };

    match driver {
        "mysql" => {
            use crate::drivers::mysql::extract::extract_value;
            use crate::pool_manager::get_mysql_pool; // Returns String (JSON value or "NULL")

            let pool = get_mysql_pool(params).await?;
            let mut rows = sqlx::query(&query).fetch(&pool);

            let mut batch = Vec::new();
            while let Some(row) = rows.try_next().await.map_err(|e| e.to_string())? {
                let mut values = Vec::new();
                for i in 0..row.columns().len() {
                    let val = extract_value(&row, i, None);
                    values.push(escape_sql_value(val));
                }
                batch.push(format!("({})", values.join(", ")));

                if batch.len() >= 100 {
                    writeln!(
                        writer,
                        "{}",
                        insert_into_statement(driver, schema, table, &batch.join(", "))
                    )
                    .map_err(|e| e.to_string())?;
                    batch.clear();
                }
            }
            if !batch.is_empty() {
                writeln!(
                    writer,
                    "{}",
                    insert_into_statement(driver, schema, table, &batch.join(", "))
                )
                .map_err(|e| e.to_string())?;
            }
        }
        "postgres" => {
            use crate::drivers::postgres::extract::extract_value;
            use crate::pool_manager::get_postgres_pool;

            let pool = get_postgres_pool(params).await?;
            let client = pool.get().await.map_err(|e| e.to_string())?;
            let params: Vec<i32> = vec![];
            let mut rows = std::pin::pin!(client
                .query_raw(&query, &params)
                .await
                .map_err(|e| e.to_string())?);

            let mut batch = Vec::new();

            while let Some(row) = rows.try_next().await.map_err(|e| e.to_string())? {
                let mut values = Vec::new();
                for i in 0..row.columns().len() {
                    let val = extract_value(&row, i, None);
                    values.push(escape_sql_value(val));
                }
                batch.push(format!("({})", values.join(", ")));

                if batch.len() >= 100 {
                    writeln!(
                        writer,
                        "{}",
                        insert_into_statement(driver, schema, table, &batch.join(", "))
                    )
                    .map_err(|e| e.to_string())?;
                    batch.clear();
                }
            }
            if !batch.is_empty() {
                writeln!(
                    writer,
                    "{}",
                    insert_into_statement(driver, schema, table, &batch.join(", "))
                )
                .map_err(|e| e.to_string())?;
            }
        }
        "sqlite" => {
            use crate::drivers::sqlite::extract::extract_value;
            use crate::pool_manager::get_sqlite_pool;

            let pool = get_sqlite_pool(params).await?;
            let mut rows = sqlx::query(&query).fetch(&pool);

            let mut batch = Vec::new();
            while let Some(row) = rows.try_next().await.map_err(|e| e.to_string())? {
                let mut values = Vec::new();
                for i in 0..row.columns().len() {
                    let val = extract_value(&row, i, None);
                    values.push(escape_sql_value(val));
                }
                batch.push(format!("({})", values.join(", ")));

                if batch.len() >= 100 {
                    writeln!(
                        writer,
                        "{}",
                        insert_into_statement(driver, schema, table, &batch.join(", "))
                    )
                    .map_err(|e| e.to_string())?;
                    batch.clear();
                }
            }
            if !batch.is_empty() {
                writeln!(
                    writer,
                    "{}",
                    insert_into_statement(driver, schema, table, &batch.join(", "))
                )
                .map_err(|e| e.to_string())?;
            }
        }
        _ => return Err("Unsupported driver".into()),
    }

    Ok(())
}

fn escape_sql_value(val: serde_json::Value) -> String {
    match val {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => {
            if b {
                "1".to_string()
            } else {
                "0".to_string()
            }
        } // Most SQL dialects
        serde_json::Value::String(s) => format!("'{}'", s.replace("'", "''").replace("\\", "\\\\")), // Basic escaping
        _ => format!("'{}'", val.to_string().replace("'", "''")), // Fallback
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct ImportProgress {
    pub statements_executed: usize,
    pub total_statements: usize,
    pub percentage: f32,
    pub current_operation: String,
}

// Stream-based statement parser that yields statements as they are read
struct SqlStatementStream<R: BufRead> {
    reader: R,
    current_statement: String,
    line_buffer: String,
}

impl<R: BufRead> SqlStatementStream<R> {
    fn new(reader: R) -> Self {
        Self {
            reader,
            current_statement: String::new(),
            line_buffer: String::new(),
        }
    }

    fn next_statement(&mut self) -> Result<Option<String>, String> {
        loop {
            self.line_buffer.clear();
            let bytes_read = self
                .reader
                .read_line(&mut self.line_buffer)
                .map_err(|e| e.to_string())?;

            if bytes_read == 0 {
                // EOF - return last statement if any
                if self.current_statement.trim().is_empty() {
                    return Ok(None);
                } else {
                    let stmt = self.current_statement.trim().to_string();
                    self.current_statement.clear();
                    return Ok(Some(stmt));
                }
            }

            let trimmed = self.line_buffer.trim();

            // Skip comments and empty lines
            if trimmed.starts_with("--") || trimmed.is_empty() {
                continue;
            }

            self.current_statement.push_str(&self.line_buffer);

            // Check if statement is complete
            if trimmed.ends_with(';') {
                let stmt = self.current_statement.trim().to_string();
                self.current_statement.clear();
                if !stmt.is_empty() {
                    return Ok(Some(stmt));
                }
            }
        }
    }
}

// Helper macro for streaming execution with progress
macro_rules! execute_statements_streaming {
    ($executor_macro:ident, $stream:expr, $app:expr) => {{
        // Larger batch for better performance - execute and emit progress every 500 statements
        const PROGRESS_EMIT_INTERVAL: usize = 500;
        let mut executed = 0;
        let mut since_last_progress = 0;

        while let Some(stmt) = $stream.next_statement()? {
            // Execute statement immediately without batching in memory
            $executor_macro!(&stmt).await.map_err(|e| {
                format!(
                    "Error at statement {}: {}\nQuery: {}",
                    executed + 1,
                    e,
                    stmt
                )
            })?;

            executed += 1;
            since_last_progress += 1;

            // Emit progress only every PROGRESS_EMIT_INTERVAL statements to reduce overhead
            if since_last_progress >= PROGRESS_EMIT_INTERVAL {
                let _ = $app.emit(
                    "import_progress",
                    ImportProgress {
                        statements_executed: executed,
                        total_statements: 0, // 0 indicates unknown total
                        percentage: 0.0,
                        current_operation: format!("Imported {} statements", executed),
                    },
                );
                since_last_progress = 0;
            }
        }

        // Final progress update
        let _ = $app.emit(
            "import_progress",
            ImportProgress {
                statements_executed: executed,
                total_statements: executed,
                percentage: 100.0,
                current_operation: "Import completed".to_string(),
            },
        );

        Ok::<usize, String>(executed)
    }};
}

#[tauri::command]
pub async fn cancel_import(
    state: State<'_, DumpCancellationState>,
    connection_id: String,
) -> Result<(), String> {
    let key = import_slot_key(&connection_id);
    let entries = {
        let mut handles = state.handles.lock().unwrap();
        handles.remove(&key).unwrap_or_default()
    };
    if entries.is_empty() {
        return Err("No active import process found".into());
    }
    for handle in entries {
        handle.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn import_database<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, DumpCancellationState>,
    connection_id: String,
    file_path: String,
    schema: Option<String>,
) -> Result<(), String> {
    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;
    let driver = saved_conn.params.driver.clone();
    let pg_schema = schema.unwrap_or_else(|| "public".to_string());
    let app_handle = app.clone();
    let conn_id = connection_id.clone();

    // Spawn the import process
    let task = tokio::spawn(async move {
        // Open file and create streaming reader
        let file = File::open(&file_path).map_err(|e| e.to_string())?;
        let reader = create_sql_reader(file, &file_path)?;
        let mut stream = SqlStatementStream::new(reader);

        // Emit initial progress
        let _ = app_handle.emit(
            "import_progress",
            ImportProgress {
                statements_executed: 0,
                total_statements: 0,
                percentage: 0.0,
                current_operation: "Starting import...".to_string(),
            },
        );

        // Execute with transaction and optimizations for speed
        match driver.as_str() {
            "mysql" => {
                let pool = get_mysql_pool(&params).await?;
                let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

                // Performance optimizations for MySQL
                sqlx::query("SET FOREIGN_KEY_CHECKS=0")
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                sqlx::query("SET UNIQUE_CHECKS=0")
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                sqlx::query("SET AUTOCOMMIT=0")
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;

                macro_rules! execute_statement {
                    ($stmt:expr) => {
                        sqlx::query($stmt).execute(&mut *tx)
                    };
                }

                execute_statements_streaming!(execute_statement, stream, app_handle)?;

                // Restore settings
                sqlx::query("SET FOREIGN_KEY_CHECKS=1")
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                sqlx::query("SET UNIQUE_CHECKS=1")
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                sqlx::query("SET AUTOCOMMIT=1")
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;

                tx.commit().await.map_err(|e| e.to_string())?;
            }
            "postgres" => {
                let pool = get_postgres_pool(&params).await?;
                let mut client = pool.get().await.map_err(|e| e.to_string())?;
                let tx = client.transaction().await.map_err(|e| e.to_string())?;

                // Set schema search path so unqualified table names resolve correctly
                tx.execute(&format!("SET search_path TO \"{}\"", pg_schema), &[])
                    .await
                    .map_err(|e| e.to_string())?;

                // Performance optimizations for PostgreSQL
                tx.execute("SET CONSTRAINTS ALL DEFERRED", &[])
                    .await
                    .map_err(|e| e.to_string())?;
                // Temporarily disable synchronous commit for speed (data at risk until commit)
                tx.execute("SET LOCAL synchronous_commit=OFF", &[])
                    .await
                    .map_err(|e| e.to_string())?;

                macro_rules! execute_statement {
                    ($stmt:expr) => {
                        tx.execute($stmt, &[])
                    };
                }

                execute_statements_streaming!(execute_statement, stream, app_handle)?;

                tx.commit().await.map_err(|e| e.to_string())?;
            }
            "sqlite" => {
                let pool = get_sqlite_pool(&params).await?;
                let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

                // Performance optimizations for SQLite
                sqlx::query("PRAGMA foreign_keys=OFF")
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                sqlx::query("PRAGMA synchronous=OFF")
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                sqlx::query("PRAGMA journal_mode=MEMORY")
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;

                macro_rules! execute_statement {
                    ($stmt:expr) => {
                        sqlx::query($stmt).execute(&mut *tx)
                    };
                }

                execute_statements_streaming!(execute_statement, stream, app_handle)?;

                // Restore settings
                sqlx::query("PRAGMA foreign_keys=ON")
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                sqlx::query("PRAGMA synchronous=FULL")
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;

                tx.commit().await.map_err(|e| e.to_string())?;
            }
            _ => return Err("Unsupported driver".into()),
        }

        Ok::<(), String>(())
    });

    let abort_handle = Arc::new(task.abort_handle());
    let import_key = import_slot_key(&conn_id);
    register_abort_handle(&state.handles, import_key.clone(), abort_handle.clone());

    let result = task.await;

    unregister_abort_handle(&state.handles, &import_key, &abort_handle);

    match result {
        Ok(res) => res,
        Err(_) => Err("Import cancelled".into()),
    }
}

// Creates a BufReader from the file without loading entire content into memory
// For ZIP files, extracts to a string in memory (limitation of zip crate)
// For regular SQL files, uses streaming with a large buffer
fn create_sql_reader(file: File, file_path: &str) -> Result<Box<dyn BufRead + Send>, String> {
    if file_path.ends_with(".zip") {
        // For ZIP files, we need to extract the SQL content to memory
        // The zip crate doesn't support true streaming because by_index requires ownership
        let mut archive =
            ZipArchive::new(file).map_err(|e| format!("Failed to open zip: {}", e))?;

        // Find first .sql file and extract content
        for i in 0..archive.len() {
            let mut zipped_file = archive.by_index(i).map_err(|e| e.to_string())?;
            if zipped_file.name().ends_with(".sql") {
                let mut content = String::new();
                zipped_file
                    .read_to_string(&mut content)
                    .map_err(|e| e.to_string())?;

                // Create a BufReader from the extracted string
                let cursor = std::io::Cursor::new(content.into_bytes());
                return Ok(Box::new(BufReader::new(cursor)));
            }
        }
        Err("No .sql file found in zip archive".into())
    } else {
        // For regular files, use a buffered reader with larger buffer for efficient streaming
        let reader = BufReader::with_capacity(8192 * 16, file); // 128KB buffer
        Ok(Box::new(reader))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_escape_sql_value() {
        assert_eq!(escape_sql_value(json!(null)), "NULL");
        assert_eq!(escape_sql_value(json!(123)), "123");
        assert_eq!(escape_sql_value(json!(12.34)), "12.34");
        assert_eq!(escape_sql_value(json!(true)), "1");
        assert_eq!(escape_sql_value(json!(false)), "0");
        assert_eq!(escape_sql_value(json!("hello")), "'hello'");
        assert_eq!(escape_sql_value(json!("O'Reilly")), "'O''Reilly'");
        assert_eq!(escape_sql_value(json!("Back\\slash")), "'Back\\\\slash'");
        assert_eq!(escape_sql_value(json!("Multi\nLine")), "'Multi\nLine'");
    }
}

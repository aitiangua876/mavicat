use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};

use crate::commands::{
    expand_ssh_connection_params, find_connection_by_id, resolve_connection_params_with_id,
};
use crate::drivers::driver_trait::DatabaseDriver;
use crate::models::{ColumnDefinition, ConnectionParams, ForeignKey, Index, TableColumn};

const SCHEMA_SYNC_PROGRESS_EVENT: &str = "schema_sync_progress";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaEndpoint {
    pub connection_id: String,
    pub schema: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SchemaDiffKind {
    MissingTable,
    ExtraTable,
    MissingColumn,
    ChangedColumn,
    MissingIndex,
    ChangedIndex,
    MissingForeignKey,
    ChangedForeignKey,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaDiffItem {
    pub id: String,
    pub kind: SchemaDiffKind,
    pub table_name: String,
    pub object_name: Option<String>,
    pub summary: String,
    #[serde(default)]
    pub statements: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaDiffReport {
    pub source: SchemaEndpoint,
    pub target: SchemaEndpoint,
    pub source_driver: String,
    pub target_driver: String,
    pub total_changes: usize,
    pub executable_changes: usize,
    pub items: Vec<SchemaDiffItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaSyncExecutionReport {
    pub statements_total: usize,
    pub statements_executed: usize,
    pub failed_statements: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaSyncProgress {
    pub statements_executed: usize,
    pub statements_total: usize,
}

#[derive(Debug, Clone)]
pub struct SchemaSnapshot {
    pub tables: HashMap<String, TableSnapshot>,
}

#[derive(Debug, Clone)]
pub struct TableSnapshot {
    pub name: String,
    pub columns: Vec<ColumnSnapshot>,
    pub indexes: Vec<IndexSnapshot>,
    pub foreign_keys: Vec<ForeignKeySnapshot>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ColumnSnapshot {
    pub name: String,
    pub data_type: String,
    pub is_pk: bool,
    pub is_nullable: bool,
    pub is_auto_increment: bool,
    pub default_value: Option<String>,
    pub character_maximum_length: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexSnapshot {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub is_primary: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForeignKeySnapshot {
    pub name: String,
    pub column_name: String,
    pub ref_table: String,
    pub ref_column: String,
    pub on_delete: Option<String>,
    pub on_update: Option<String>,
}

#[tauri::command]
pub async fn compare_schema<R: Runtime>(
    app: AppHandle<R>,
    source: SchemaEndpoint,
    target: SchemaEndpoint,
) -> Result<SchemaDiffReport, String> {
    let source_saved = find_connection_by_id(&app, &source.connection_id)?;
    let target_saved = find_connection_by_id(&app, &target.connection_id)?;
    let source_expanded = expand_ssh_connection_params(&app, &source_saved.params).await?;
    let target_expanded = expand_ssh_connection_params(&app, &target_saved.params).await?;
    let source_params = resolve_connection_params_with_id(&source_expanded, &source.connection_id)?;
    let target_params = resolve_connection_params_with_id(&target_expanded, &target.connection_id)?;

    let source_driver = crate::drivers::registry::get_driver(&source_saved.params.driver)
        .await
        .ok_or_else(|| format!("Unsupported driver: {}", source_saved.params.driver))?;
    let target_driver = crate::drivers::registry::get_driver(&target_saved.params.driver)
        .await
        .ok_or_else(|| format!("Unsupported driver: {}", target_saved.params.driver))?;

    let source_snapshot = collect_schema_snapshot(
        source_driver.as_ref(),
        &source_params,
        source.schema.as_deref(),
    )
    .await?;
    let target_snapshot = collect_schema_snapshot(
        target_driver.as_ref(),
        &target_params,
        target.schema.as_deref(),
    )
    .await?;

    let items = diff_snapshots(
        &source_snapshot,
        &target_snapshot,
        target_driver.as_ref(),
        target.schema.as_deref(),
    )
    .await;
    let executable_changes = items
        .iter()
        .filter(|item| {
            item.statements
                .iter()
                .any(|statement| is_executable_statement(statement))
        })
        .count();

    Ok(SchemaDiffReport {
        source,
        target,
        source_driver: source_saved.params.driver,
        target_driver: target_saved.params.driver,
        total_changes: items.len(),
        executable_changes,
        items,
    })
}

#[tauri::command]
pub async fn generate_schema_sync_sql(
    report: SchemaDiffReport,
    selected_change_ids: Vec<String>,
    direction: Option<String>,
) -> Result<Vec<String>, String> {
    if direction.as_deref().unwrap_or("source_to_target") != "source_to_target" {
        return Err("V1 只支持从源同步到目标；如需反向同步，请交换源和目标。".into());
    }

    let selected = selected_change_ids
        .into_iter()
        .collect::<std::collections::HashSet<_>>();
    let include_all = selected.is_empty();
    let statements = report
        .items
        .into_iter()
        .filter(|item| include_all || selected.contains(&item.id))
        .flat_map(|item| item.statements)
        .collect::<Vec<_>>();

    Ok(statements)
}

#[tauri::command]
pub async fn execute_schema_sync<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    statements: Vec<String>,
    schema: Option<String>,
) -> Result<SchemaSyncExecutionReport, String> {
    let saved = find_connection_by_id(&app, &connection_id)?;
    let expanded = expand_ssh_connection_params(&app, &saved.params).await?;
    let params = resolve_connection_params_with_id(&expanded, &connection_id)?;
    let driver = crate::drivers::registry::get_driver(&saved.params.driver)
        .await
        .ok_or_else(|| format!("Unsupported driver: {}", saved.params.driver))?;

    let executable = statements
        .into_iter()
        .map(|statement| statement.trim().trim_end_matches(';').trim().to_string())
        .filter(|statement| is_executable_statement(statement))
        .collect::<Vec<_>>();
    let statements_total = executable.len();
    if statements_total == 0 {
        return Ok(SchemaSyncExecutionReport {
            statements_total: 0,
            statements_executed: 0,
            failed_statements: 0,
            errors: vec![],
        });
    }

    let outcomes = driver
        .execute_batch(&params, &executable, None, 1, schema.as_deref())
        .await?;
    let mut statements_executed = 0;
    let mut failed_statements = 0;
    let mut errors = Vec::new();

    for outcome in outcomes {
        if let Some(error) = outcome.error {
            failed_statements += 1;
            if errors.len() < 20 {
                errors.push(error);
            }
        } else {
            statements_executed += 1;
        }
        let _ = app.emit(
            SCHEMA_SYNC_PROGRESS_EVENT,
            SchemaSyncProgress {
                statements_executed: statements_executed + failed_statements,
                statements_total,
            },
        );
    }

    Ok(SchemaSyncExecutionReport {
        statements_total,
        statements_executed,
        failed_statements,
        errors,
    })
}

async fn collect_schema_snapshot(
    driver: &dyn DatabaseDriver,
    params: &ConnectionParams,
    schema: Option<&str>,
) -> Result<SchemaSnapshot, String> {
    let tables = driver.get_tables(params, schema).await?;
    let mut result = HashMap::new();

    for table in tables {
        let columns = driver
            .get_columns(params, &table.name, schema)
            .await?
            .iter()
            .map(ColumnSnapshot::from)
            .collect::<Vec<_>>();
        let indexes = group_indexes(driver.get_indexes(params, &table.name, schema).await?);
        let foreign_keys = driver
            .get_foreign_keys(params, &table.name, schema)
            .await?
            .iter()
            .map(ForeignKeySnapshot::from)
            .collect::<Vec<_>>();

        result.insert(
            table.name.clone(),
            TableSnapshot {
                name: table.name,
                columns,
                indexes,
                foreign_keys,
            },
        );
    }

    Ok(SchemaSnapshot { tables: result })
}

pub async fn diff_snapshots(
    source: &SchemaSnapshot,
    target: &SchemaSnapshot,
    target_driver: &dyn DatabaseDriver,
    target_schema: Option<&str>,
) -> Vec<SchemaDiffItem> {
    let mut items = Vec::new();
    let mut source_names = source.tables.keys().cloned().collect::<Vec<_>>();
    source_names.sort();

    for table_name in source_names {
        let source_table = match source.tables.get(&table_name) {
            Some(table) => table,
            None => continue,
        };
        let target_table = target.tables.get(&table_name);

        if target_table.is_none() {
            let statements =
                create_missing_table_sql(source_table, target_driver, target_schema).await;
            items.push(SchemaDiffItem {
                id: format!("missing_table:{}", table_name),
                kind: SchemaDiffKind::MissingTable,
                table_name: table_name.clone(),
                object_name: None,
                summary: format!("目标缺少表 {}", table_name),
                statements,
            });
            continue;
        }

        let target_table = target_table.expect("checked above");
        diff_columns(
            source_table,
            target_table,
            target_driver,
            target_schema,
            &mut items,
        )
        .await;
        diff_indexes(
            source_table,
            target_table,
            target_driver,
            target_schema,
            &mut items,
        )
        .await;
        diff_foreign_keys(
            source_table,
            target_table,
            target_driver,
            target_schema,
            &mut items,
        )
        .await;
    }

    let mut target_names = target.tables.keys().cloned().collect::<Vec<_>>();
    target_names.sort();
    for table_name in target_names {
        if source.tables.contains_key(&table_name) {
            continue;
        }
        items.push(SchemaDiffItem {
            id: format!("extra_table:{}", table_name),
            kind: SchemaDiffKind::ExtraTable,
            table_name: table_name.clone(),
            object_name: None,
            summary: format!("目标多出表 {}（不会自动删除）", table_name),
            statements: vec![format!(
                "-- 目标多出表 {}。为避免误删，Mavicat V1 不自动生成 DROP TABLE。",
                table_name
            )],
        });
    }

    items
}

async fn diff_columns(
    source: &TableSnapshot,
    target: &TableSnapshot,
    target_driver: &dyn DatabaseDriver,
    target_schema: Option<&str>,
    items: &mut Vec<SchemaDiffItem>,
) {
    let target_columns = target
        .columns
        .iter()
        .map(|column| (column.name.as_str(), column))
        .collect::<HashMap<_, _>>();

    for source_column in &source.columns {
        match target_columns.get(source_column.name.as_str()) {
            None => {
                let statement = target_driver
                    .get_add_column_sql(
                        &source.name,
                        column_definition_from_snapshot(source_column),
                        target_schema,
                    )
                    .await
                    .unwrap_or_else(|error| vec![format!("-- {}", error)]);
                items.push(SchemaDiffItem {
                    id: format!("missing_column:{}:{}", source.name, source_column.name),
                    kind: SchemaDiffKind::MissingColumn,
                    table_name: source.name.clone(),
                    object_name: Some(source_column.name.clone()),
                    summary: format!("表 {} 缺少字段 {}", source.name, source_column.name),
                    statements: statement,
                });
            }
            Some(target_column)
                if column_signature(source_column) != column_signature(target_column) =>
            {
                let statement = target_driver
                    .get_alter_column_sql(
                        &source.name,
                        column_definition_from_snapshot(target_column),
                        column_definition_from_snapshot(source_column),
                        target_schema,
                    )
                    .await
                    .unwrap_or_else(|error| vec![format!("-- {}", error)]);
                items.push(SchemaDiffItem {
                    id: format!("changed_column:{}:{}", source.name, source_column.name),
                    kind: SchemaDiffKind::ChangedColumn,
                    table_name: source.name.clone(),
                    object_name: Some(source_column.name.clone()),
                    summary: format!("表 {} 字段 {} 定义不同", source.name, source_column.name),
                    statements: statement,
                });
            }
            _ => {}
        }
    }
}

async fn diff_indexes(
    source: &TableSnapshot,
    target: &TableSnapshot,
    target_driver: &dyn DatabaseDriver,
    target_schema: Option<&str>,
    items: &mut Vec<SchemaDiffItem>,
) {
    let target_indexes = target
        .indexes
        .iter()
        .map(|index| (index.name.as_str(), index))
        .collect::<HashMap<_, _>>();

    for source_index in source.indexes.iter().filter(|index| !index.is_primary) {
        match target_indexes.get(source_index.name.as_str()) {
            None => {
                push_index_diff(
                    items,
                    SchemaDiffKind::MissingIndex,
                    source,
                    source_index,
                    target_driver,
                    target_schema,
                    "缺少索引",
                )
                .await
            }
            Some(target_index) if *target_index != source_index => {
                let mut statements = vec![format!(
                    "-- 索引 {} 已存在但定义不同，请确认是否需要先删除再创建。",
                    source_index.name
                )];
                statements.extend(
                    target_driver
                        .get_create_index_sql(
                            &source.name,
                            &source_index.name,
                            source_index.columns.clone(),
                            source_index.is_unique,
                            target_schema,
                        )
                        .await
                        .unwrap_or_else(|error| vec![format!("-- {}", error)]),
                );
                items.push(SchemaDiffItem {
                    id: format!("changed_index:{}:{}", source.name, source_index.name),
                    kind: SchemaDiffKind::ChangedIndex,
                    table_name: source.name.clone(),
                    object_name: Some(source_index.name.clone()),
                    summary: format!("表 {} 索引 {} 定义不同", source.name, source_index.name),
                    statements,
                });
            }
            _ => {}
        }
    }
}

async fn push_index_diff(
    items: &mut Vec<SchemaDiffItem>,
    kind: SchemaDiffKind,
    source: &TableSnapshot,
    index: &IndexSnapshot,
    target_driver: &dyn DatabaseDriver,
    target_schema: Option<&str>,
    label: &str,
) {
    let statements = target_driver
        .get_create_index_sql(
            &source.name,
            &index.name,
            index.columns.clone(),
            index.is_unique,
            target_schema,
        )
        .await
        .unwrap_or_else(|error| vec![format!("-- {}", error)]);
    items.push(SchemaDiffItem {
        id: format!("missing_index:{}:{}", source.name, index.name),
        kind,
        table_name: source.name.clone(),
        object_name: Some(index.name.clone()),
        summary: format!("表 {} {} {}", source.name, label, index.name),
        statements,
    });
}

async fn diff_foreign_keys(
    source: &TableSnapshot,
    target: &TableSnapshot,
    target_driver: &dyn DatabaseDriver,
    target_schema: Option<&str>,
    items: &mut Vec<SchemaDiffItem>,
) {
    let target_fks = target
        .foreign_keys
        .iter()
        .map(|fk| (fk.name.as_str(), fk))
        .collect::<HashMap<_, _>>();

    for source_fk in &source.foreign_keys {
        match target_fks.get(source_fk.name.as_str()) {
            None => {
                push_foreign_key_diff(
                    items,
                    SchemaDiffKind::MissingForeignKey,
                    source,
                    source_fk,
                    target_driver,
                    target_schema,
                    "缺少外键",
                )
                .await
            }
            Some(target_fk) if *target_fk != source_fk => {
                let mut statements = vec![format!(
                    "-- 外键 {} 已存在但定义不同，请确认是否需要先删除再创建。",
                    source_fk.name
                )];
                statements.extend(
                    create_foreign_key_sql(source, source_fk, target_driver, target_schema).await,
                );
                items.push(SchemaDiffItem {
                    id: format!("changed_fk:{}:{}", source.name, source_fk.name),
                    kind: SchemaDiffKind::ChangedForeignKey,
                    table_name: source.name.clone(),
                    object_name: Some(source_fk.name.clone()),
                    summary: format!("表 {} 外键 {} 定义不同", source.name, source_fk.name),
                    statements,
                });
            }
            _ => {}
        }
    }
}

async fn push_foreign_key_diff(
    items: &mut Vec<SchemaDiffItem>,
    kind: SchemaDiffKind,
    source: &TableSnapshot,
    fk: &ForeignKeySnapshot,
    target_driver: &dyn DatabaseDriver,
    target_schema: Option<&str>,
    label: &str,
) {
    items.push(SchemaDiffItem {
        id: format!("missing_fk:{}:{}", source.name, fk.name),
        kind,
        table_name: source.name.clone(),
        object_name: Some(fk.name.clone()),
        summary: format!("表 {} {} {}", source.name, label, fk.name),
        statements: create_foreign_key_sql(source, fk, target_driver, target_schema).await,
    });
}

async fn create_missing_table_sql(
    table: &TableSnapshot,
    target_driver: &dyn DatabaseDriver,
    target_schema: Option<&str>,
) -> Vec<String> {
    let mut statements = target_driver
        .get_create_table_sql(
            &table.name,
            table
                .columns
                .iter()
                .map(column_definition_from_snapshot)
                .collect(),
            target_schema,
        )
        .await
        .unwrap_or_else(|error| vec![format!("-- {}", error)]);

    for index in table.indexes.iter().filter(|index| !index.is_primary) {
        statements.extend(
            target_driver
                .get_create_index_sql(
                    &table.name,
                    &index.name,
                    index.columns.clone(),
                    index.is_unique,
                    target_schema,
                )
                .await
                .unwrap_or_else(|error| vec![format!("-- {}", error)]),
        );
    }

    for fk in &table.foreign_keys {
        statements.extend(create_foreign_key_sql(table, fk, target_driver, target_schema).await);
    }

    statements
}

async fn create_foreign_key_sql(
    table: &TableSnapshot,
    fk: &ForeignKeySnapshot,
    target_driver: &dyn DatabaseDriver,
    target_schema: Option<&str>,
) -> Vec<String> {
    target_driver
        .get_create_foreign_key_sql(
            &table.name,
            &fk.name,
            &fk.column_name,
            &fk.ref_table,
            &fk.ref_column,
            fk.on_delete.as_deref(),
            fk.on_update.as_deref(),
            target_schema,
        )
        .await
        .unwrap_or_else(|error| vec![format!("-- {}", error)])
}

fn group_indexes(indexes: Vec<Index>) -> Vec<IndexSnapshot> {
    let mut groups: HashMap<String, Vec<Index>> = HashMap::new();
    for index in indexes {
        groups.entry(index.name.clone()).or_default().push(index);
    }

    let mut result = groups
        .into_iter()
        .map(|(name, mut parts)| {
            parts.sort_by_key(|part| part.seq_in_index);
            let is_unique = parts.first().map(|part| part.is_unique).unwrap_or(false);
            let is_primary = parts.first().map(|part| part.is_primary).unwrap_or(false);
            IndexSnapshot {
                name,
                columns: parts.into_iter().map(|part| part.column_name).collect(),
                is_unique,
                is_primary,
            }
        })
        .collect::<Vec<_>>();
    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

fn column_definition_from_snapshot(column: &ColumnSnapshot) -> ColumnDefinition {
    ColumnDefinition {
        name: column.name.clone(),
        data_type: column_type_with_length(column),
        is_nullable: column.is_nullable,
        is_pk: column.is_pk,
        is_auto_increment: column.is_auto_increment,
        default_value: column.default_value.clone(),
    }
}

fn column_signature(column: &ColumnSnapshot) -> (String, bool, bool, bool, Option<String>) {
    (
        column_type_with_length(column).to_ascii_lowercase(),
        column.is_nullable,
        column.is_pk,
        column.is_auto_increment,
        column.default_value.clone(),
    )
}

fn column_type_with_length(column: &ColumnSnapshot) -> String {
    if column.data_type.contains('(') {
        return column.data_type.clone();
    }

    let normalized = column.data_type.to_ascii_lowercase();
    let supports_length = [
        "char",
        "varchar",
        "binary",
        "varbinary",
        "nvarchar",
        "nchar",
        "character varying",
    ]
    .iter()
    .any(|token| normalized == *token || normalized.starts_with(&format!("{} ", token)));

    match (supports_length, column.character_maximum_length) {
        (true, Some(length)) if length > 0 => format!("{}({})", column.data_type, length),
        _ => column.data_type.clone(),
    }
}

fn is_executable_statement(statement: &str) -> bool {
    let trimmed = statement.trim();
    !trimmed.is_empty() && !trimmed.starts_with("--")
}

impl From<&TableColumn> for ColumnSnapshot {
    fn from(column: &TableColumn) -> Self {
        Self {
            name: column.name.clone(),
            data_type: column.data_type.clone(),
            is_pk: column.is_pk,
            is_nullable: column.is_nullable,
            is_auto_increment: column.is_auto_increment,
            default_value: column.default_value.clone(),
            character_maximum_length: column.character_maximum_length,
        }
    }
}

impl From<&ForeignKey> for ForeignKeySnapshot {
    fn from(fk: &ForeignKey) -> Self {
        Self {
            name: fk.name.clone(),
            column_name: fk.column_name.clone(),
            ref_table: fk.ref_table.clone(),
            ref_column: fk.ref_column.clone(),
            on_delete: fk.on_delete.clone(),
            on_update: fk.on_update.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::drivers::sqlite::SqliteDriver;

    fn column(name: &str, data_type: &str) -> ColumnSnapshot {
        ColumnSnapshot {
            name: name.to_string(),
            data_type: data_type.to_string(),
            is_pk: false,
            is_nullable: true,
            is_auto_increment: false,
            default_value: None,
            character_maximum_length: None,
        }
    }

    #[tokio::test]
    async fn diff_detects_missing_table_and_columns() {
        let driver = SqliteDriver::new();
        let source_table = TableSnapshot {
            name: "users".to_string(),
            columns: vec![column("id", "integer"), column("name", "varchar")],
            indexes: vec![],
            foreign_keys: vec![],
        };
        let source = SchemaSnapshot {
            tables: HashMap::from([("users".to_string(), source_table)]),
        };
        let target = SchemaSnapshot {
            tables: HashMap::new(),
        };

        let diff = diff_snapshots(&source, &target, &driver, None).await;

        assert_eq!(diff.len(), 1);
        assert_eq!(diff[0].kind, SchemaDiffKind::MissingTable);
        assert!(diff[0].statements[0].contains("CREATE TABLE"));
    }

    #[tokio::test]
    async fn diff_detects_changed_column_length() {
        let driver = SqliteDriver::new();
        let mut source_column = column("name", "varchar");
        source_column.character_maximum_length = Some(64);
        let mut target_column = column("name", "varchar");
        target_column.character_maximum_length = Some(32);
        let source = SchemaSnapshot {
            tables: HashMap::from([(
                "users".to_string(),
                TableSnapshot {
                    name: "users".to_string(),
                    columns: vec![source_column],
                    indexes: vec![],
                    foreign_keys: vec![],
                },
            )]),
        };
        let target = SchemaSnapshot {
            tables: HashMap::from([(
                "users".to_string(),
                TableSnapshot {
                    name: "users".to_string(),
                    columns: vec![target_column],
                    indexes: vec![],
                    foreign_keys: vec![],
                },
            )]),
        };

        let diff = diff_snapshots(&source, &target, &driver, None).await;

        assert_eq!(diff.len(), 1);
        assert_eq!(diff[0].kind, SchemaDiffKind::ChangedColumn);
    }
}

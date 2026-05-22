import { quoteIdentifier, quoteTableRef } from "./identifiers";

export type SqlCopyMode = "insert" | "update" | "delete" | "upsert";

export interface SqlCopyOptions {
  mode: SqlCopyMode;
  tableName: string;
  columns: string[];
  rows: unknown[][];
  driver?: string | null;
  schema?: string | null;
  primaryKeyColumns?: string[];
}

export function canCopySqlMode(
  mode: SqlCopyMode,
  tableName: string | null | undefined,
  primaryKeyColumns: string[] = [],
): boolean {
  if (!tableName?.trim()) return false;
  if (mode === "insert") return true;
  return primaryKeyColumns.length > 0;
}

function sqlValue(value: unknown, driver?: string | null): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") {
    return driver === "sqlite" ? (value ? "1" : "0") : value ? "TRUE" : "FALSE";
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) return String(value);
    return "NULL";
  }
  if (value instanceof Date) {
    return `'${value.toISOString().replace(/'/g, "''")}'`;
  }

  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `'${text.replace(/'/g, "''")}'`;
}

function rowObject(row: unknown[], columns: string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  columns.forEach((column, index) => {
    output[column] = row[index] ?? null;
  });
  return output;
}

function buildWhereClause(
  row: Record<string, unknown>,
  primaryKeyColumns: string[],
  driver?: string | null,
): string {
  return primaryKeyColumns
    .map((column) => `${quoteIdentifier(column, driver)} = ${sqlValue(row[column], driver)}`)
    .join(" AND ");
}

function buildInsertStatement(
  tableRef: string,
  row: Record<string, unknown>,
  columns: string[],
  driver?: string | null,
): string {
  const columnList = columns.map((column) => quoteIdentifier(column, driver)).join(", ");
  const values = columns.map((column) => sqlValue(row[column], driver)).join(", ");
  return `INSERT INTO ${tableRef} (${columnList}) VALUES (${values});`;
}

function buildUpdateStatement(
  tableRef: string,
  row: Record<string, unknown>,
  columns: string[],
  primaryKeyColumns: string[],
  driver?: string | null,
): string {
  const primaryKeySet = new Set(primaryKeyColumns);
  const updateColumns = columns.filter((column) => !primaryKeySet.has(column));
  const assignments = (updateColumns.length > 0 ? updateColumns : columns)
    .map((column) => `${quoteIdentifier(column, driver)} = ${sqlValue(row[column], driver)}`)
    .join(", ");
  const whereClause = buildWhereClause(row, primaryKeyColumns, driver);
  return `UPDATE ${tableRef} SET ${assignments} WHERE ${whereClause};`;
}

function buildDeleteStatement(
  tableRef: string,
  row: Record<string, unknown>,
  primaryKeyColumns: string[],
  driver?: string | null,
): string {
  const whereClause = buildWhereClause(row, primaryKeyColumns, driver);
  return `DELETE FROM ${tableRef} WHERE ${whereClause};`;
}

function buildUpsertStatement(
  tableRef: string,
  row: Record<string, unknown>,
  columns: string[],
  primaryKeyColumns: string[],
  driver?: string | null,
): string {
  const columnList = columns.map((column) => quoteIdentifier(column, driver)).join(", ");
  const values = columns.map((column) => sqlValue(row[column], driver)).join(", ");

  if (driver === "mysql" || driver === "mariadb") {
    return `REPLACE INTO ${tableRef} (${columnList}) VALUES (${values});`;
  }

  const primaryKeySet = new Set(primaryKeyColumns);
  const updateColumns = columns.filter((column) => !primaryKeySet.has(column));
  const conflictColumns = primaryKeyColumns
    .map((column) => quoteIdentifier(column, driver))
    .join(", ");
  const updateClause =
    updateColumns.length > 0
      ? `DO UPDATE SET ${updateColumns
          .map((column) => `${quoteIdentifier(column, driver)} = excluded.${quoteIdentifier(column, driver)}`)
          .join(", ")}`
      : "DO NOTHING";

  return `INSERT INTO ${tableRef} (${columnList}) VALUES (${values}) ON CONFLICT (${conflictColumns}) ${updateClause};`;
}

export function rowsToSqlCopy(options: SqlCopyOptions): string {
  const { mode, tableName, columns, rows, driver, schema, primaryKeyColumns = [] } = options;
  if (!canCopySqlMode(mode, tableName, primaryKeyColumns)) {
    throw new Error("A table name and primary key are required for this SQL copy mode.");
  }

  const tableRef = quoteTableRef(tableName, driver, schema);
  return rows
    .map((row) => {
      const data = rowObject(row, columns);
      if (mode === "insert") return buildInsertStatement(tableRef, data, columns, driver);
      if (mode === "update") {
        return buildUpdateStatement(tableRef, data, columns, primaryKeyColumns, driver);
      }
      if (mode === "delete") {
        return buildDeleteStatement(tableRef, data, primaryKeyColumns, driver);
      }
      return buildUpsertStatement(tableRef, data, columns, primaryKeyColumns, driver);
    })
    .join("\n");
}

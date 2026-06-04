import { quoteIdentifier } from "./identifiers";

export type CreateDatabaseDialect = "mysql" | "mariadb" | "postgres" | "sqlserver" | "mssql";

export interface EncodingOption {
  value: string;
  label: string;
  collations?: string[];
}

export const MYSQL_DATABASE_ENCODINGS: EncodingOption[] = [
  {
    value: "utf8mb4",
    label: "utf8mb4",
    collations: ["utf8mb4_unicode_ci", "utf8mb4_general_ci", "utf8mb4_0900_ai_ci"],
  },
  {
    value: "utf8",
    label: "utf8",
    collations: ["utf8_unicode_ci", "utf8_general_ci"],
  },
  {
    value: "latin1",
    label: "latin1",
    collations: ["latin1_swedish_ci"],
  },
];

export const POSTGRES_DATABASE_ENCODINGS: EncodingOption[] = [
  { value: "UTF8", label: "UTF8" },
  { value: "LATIN1", label: "LATIN1" },
  { value: "SQL_ASCII", label: "SQL_ASCII" },
];

export const SQLSERVER_DATABASE_COLLATIONS: EncodingOption[] = [
  { value: "Chinese_PRC_CI_AS", label: "Chinese_PRC_CI_AS" },
  { value: "SQL_Latin1_General_CP1_CI_AS", label: "SQL_Latin1_General_CP1_CI_AS" },
  { value: "Latin1_General_100_CI_AS", label: "Latin1_General_100_CI_AS" },
];

export function supportsCreateDatabase(driver: string | null | undefined): driver is CreateDatabaseDialect {
  return driver === "mysql" || driver === "mariadb" || driver === "postgres" || driver === "sqlserver" || driver === "mssql";
}

export function supportsDropDatabase(driver: string | null | undefined): driver is CreateDatabaseDialect {
  return supportsCreateDatabase(driver);
}

export function getDefaultDatabaseEncoding(driver: string | null | undefined): string {
  if (driver === "postgres") return POSTGRES_DATABASE_ENCODINGS[0].value;
  if (driver === "sqlserver" || driver === "mssql") return SQLSERVER_DATABASE_COLLATIONS[0].value;
  return MYSQL_DATABASE_ENCODINGS[0].value;
}

export function getDefaultDatabaseCollation(driver: string | null | undefined, encoding: string): string {
  if (driver === "sqlserver" || driver === "mssql") return SQLSERVER_DATABASE_COLLATIONS[0].value;
  const match = MYSQL_DATABASE_ENCODINGS.find((item) => item.value === encoding);
  return match?.collations?.[0] ?? "";
}

export function getDatabaseEncodingOptions(driver: string | null | undefined): EncodingOption[] {
  if (driver === "postgres") return POSTGRES_DATABASE_ENCODINGS;
  if (driver === "sqlserver" || driver === "mssql") return SQLSERVER_DATABASE_COLLATIONS;
  return MYSQL_DATABASE_ENCODINGS;
}

export function getDatabaseCollationOptions(driver: string | null | undefined, encoding: string): string[] {
  if (driver === "sqlserver" || driver === "mssql") {
    return SQLSERVER_DATABASE_COLLATIONS.map((item) => item.value);
  }
  return MYSQL_DATABASE_ENCODINGS.find((item) => item.value === encoding)?.collations ?? [];
}

function quoteSqlServerIdentifier(identifier: string): string {
  return `[${identifier.replace(/]/g, "]]")}]`;
}

function quoteStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildCreateDatabaseSql(
  driver: string,
  databaseName: string,
  encoding: string,
  collation?: string,
): string {
  const name = databaseName.trim();

  if (!name) {
    throw new Error("数据库名称不能为空");
  }
  if (!supportsCreateDatabase(driver)) {
    throw new Error("当前数据库类型暂不支持新建数据库");
  }

  if (driver === "postgres") {
    return `CREATE DATABASE ${quoteIdentifier(name, "postgres")} ENCODING ${quoteStringLiteral(encoding || "UTF8")}`;
  }

  if (driver === "sqlserver" || driver === "mssql") {
    const suffix = encoding ? ` COLLATE ${encoding}` : "";
    return `CREATE DATABASE ${quoteSqlServerIdentifier(name)}${suffix}`;
  }

  const charset = encoding || "utf8mb4";
  const collate = collation ? ` COLLATE ${collation}` : "";
  return `CREATE DATABASE ${quoteIdentifier(name, driver)} DEFAULT CHARACTER SET ${charset}${collate}`;
}

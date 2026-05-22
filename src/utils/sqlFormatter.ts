import { format, type SqlLanguage } from "sql-formatter";

const DRIVER_LANGUAGE_MAP: Record<string, SqlLanguage> = {
  mysql: "mysql",
  mariadb: "mariadb",
  postgres: "postgresql",
  postgresql: "postgresql",
  sqlite: "sqlite",
  sqlserver: "transactsql",
  mssql: "transactsql",
  oracle: "plsql",
};

export function getSqlFormatterLanguage(driver?: string | null): SqlLanguage {
  if (!driver) return "sql";
  return DRIVER_LANGUAGE_MAP[driver.toLowerCase()] ?? "sql";
}

export function beautifySql(sql: string, driver?: string | null): string {
  const source = sql.trim();
  if (!source) return sql;

  return format(source, {
    language: getSqlFormatterLanguage(driver),
    keywordCase: "upper",
    dataTypeCase: "upper",
    functionCase: "upper",
    tabWidth: 2,
    linesBetweenQueries: 1,
    logicalOperatorNewline: "before",
  });
}

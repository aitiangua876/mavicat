import { describe, expect, it } from "vitest";
import { canCopySqlMode, rowsToSqlCopy } from "../../src/utils/sqlCopy";

describe("sql copy utils", () => {
  const rows = [
    [1, "Alice", true, null, { role: "admin" }],
    [2, "Bob O'Brien", false, "2026-05-22", { role: "user" }],
  ];
  const columns = ["id", "name", "active", "created_at", "meta"];

  it("generates MySQL INSERT statements with escaped strings and JSON", () => {
    expect(
      rowsToSqlCopy({
        mode: "insert",
        tableName: "users",
        columns,
        rows,
        driver: "mysql",
      }),
    ).toBe(
      "INSERT INTO `users` (`id`, `name`, `active`, `created_at`, `meta`) VALUES (1, 'Alice', TRUE, NULL, '{\"role\":\"admin\"}');\n" +
        "INSERT INTO `users` (`id`, `name`, `active`, `created_at`, `meta`) VALUES (2, 'Bob O''Brien', FALSE, '2026-05-22', '{\"role\":\"user\"}');",
    );
  });

  it("generates PostgreSQL UPDATE and DELETE statements using the primary key", () => {
    expect(
      rowsToSqlCopy({
        mode: "update",
        tableName: "users",
        schema: "public",
        columns,
        rows: [rows[0]],
        driver: "postgres",
        primaryKeyColumns: ["id"],
      }),
    ).toBe(
      'UPDATE "public"."users" SET "name" = \'Alice\', "active" = TRUE, "created_at" = NULL, "meta" = \'{"role":"admin"}\' WHERE "id" = 1;',
    );

    expect(
      rowsToSqlCopy({
        mode: "delete",
        tableName: "users",
        schema: "public",
        columns,
        rows: [rows[0]],
        driver: "postgres",
        primaryKeyColumns: ["id"],
      }),
    ).toBe('DELETE FROM "public"."users" WHERE "id" = 1;');
  });

  it("generates SQLite upsert with conservative boolean values", () => {
    expect(
      rowsToSqlCopy({
        mode: "upsert",
        tableName: "users",
        columns,
        rows: [rows[0]],
        driver: "sqlite",
        primaryKeyColumns: ["id"],
      }),
    ).toBe(
      'INSERT INTO "users" ("id", "name", "active", "created_at", "meta") VALUES (1, \'Alice\', 1, NULL, \'{"role":"admin"}\') ON CONFLICT ("id") DO UPDATE SET "name" = excluded."name", "active" = excluded."active", "created_at" = excluded."created_at", "meta" = excluded."meta";',
    );
  });

  it("requires a table name and primary key for destructive SQL copy modes", () => {
    expect(canCopySqlMode("insert", "users", [])).toBe(true);
    expect(canCopySqlMode("update", "users", [])).toBe(false);
    expect(canCopySqlMode("delete", "users", ["id"])).toBe(true);
    expect(canCopySqlMode("upsert", "", ["id"])).toBe(false);
  });
});

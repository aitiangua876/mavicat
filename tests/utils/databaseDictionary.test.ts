import { describe, expect, it } from "vitest";
import {
  buildDatabaseDictionaryExcel,
  buildDatabaseDictionaryHtml,
  buildDatabaseDictionaryMarkdown,
  formatDictionaryColumnType,
  getDatabaseDictionaryFileName,
  type DatabaseDictionaryInput,
} from "../../src/utils/databaseDictionary";

describe("databaseDictionary", () => {
  it("formats file names safely", () => {
    expect(getDatabaseDictionaryFileName("sales/app:prod")).toBe("sales_app_prod_dictionary.html");
    expect(getDatabaseDictionaryFileName("sales/app:prod", "excel")).toBe("sales_app_prod_dictionary.xls");
    expect(getDatabaseDictionaryFileName("sales/app:prod", "markdown")).toBe("sales_app_prod_dictionary.md");
    expect(getDatabaseDictionaryFileName("  ")).toBe("database_dictionary.html");
  });

  it("appends column length when the type has no length", () => {
    expect(
      formatDictionaryColumnType({
        name: "name",
        data_type: "varchar",
        is_pk: false,
        is_nullable: true,
        is_auto_increment: false,
        character_maximum_length: 64,
      }),
    ).toBe("varchar(64)");

    expect(
      formatDictionaryColumnType({
        name: "name",
        data_type: "varchar(64)",
        is_pk: false,
        is_nullable: true,
        is_auto_increment: false,
        character_maximum_length: 64,
      }),
    ).toBe("varchar(64)");
  });

  it("renders an escaped html data dictionary", () => {
    const html = buildDatabaseDictionaryHtml(createInput());

    expect(html).toContain("billing 数据库字典");
    expect(html).toContain("RDS &lt;prod&gt;");
    expect(html).toContain("varchar(128)");
    expect(html).toContain("&lt;昵称&gt;");
    expect(html).toContain("CREATE TABLE user_account");
  });

  it("renders excel-compatible html", () => {
    const excel = buildDatabaseDictionaryExcel(createInput());

    expect(excel).toContain("schemas-microsoft-com:office:excel");
    expect(excel).toContain("<table");
    expect(excel).toContain("user_account");
  });

  it("renders markdown", () => {
    const markdown = buildDatabaseDictionaryMarkdown(createInput());

    expect(markdown).toContain("# billing 数据库字典");
    expect(markdown).toContain("| 1 | user_account | 表 | 2 | 用户账户 |");
    expect(markdown).toContain("```sql");
    expect(markdown).toContain("CREATE TABLE user_account");
  });
});

function createInput(): DatabaseDictionaryInput {
  return {
    connectionName: "RDS <prod>",
    databaseName: "billing",
    driver: "mysql",
    generatedAt: "2026/05/25 10:30:00",
    objects: [
      {
        kind: "table",
        name: "user_account",
        comment: "用户账户",
        columns: [
          {
            name: "id",
            data_type: "bigint",
            is_pk: true,
            is_nullable: false,
            is_auto_increment: true,
            comment: "主键",
          },
          {
            name: "display_name",
            data_type: "varchar",
            is_pk: false,
            is_nullable: true,
            is_auto_increment: false,
            character_maximum_length: 128,
            default_value: "",
            comment: "<昵称>",
          },
        ],
        indexes: [
          {
            name: "PRIMARY",
            column_name: "id",
            is_primary: true,
            is_unique: true,
          },
        ],
        foreignKeys: [],
        ddl: "CREATE TABLE user_account (id bigint);",
      },
    ],
  };
}

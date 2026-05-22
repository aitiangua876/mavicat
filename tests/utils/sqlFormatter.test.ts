import { describe, expect, it } from "vitest";
import { beautifySql, getSqlFormatterLanguage } from "../../src/utils/sqlFormatter";

describe("sqlFormatter", () => {
  it("maps database drivers to formatter languages", () => {
    expect(getSqlFormatterLanguage("mysql")).toBe("mysql");
    expect(getSqlFormatterLanguage("postgresql")).toBe("postgresql");
    expect(getSqlFormatterLanguage("sqlite")).toBe("sqlite");
    expect(getSqlFormatterLanguage("unknown")).toBe("sql");
  });

  it("beautifies compact SQL", () => {
    const formatted = beautifySql(
      "select id,name from users where status='active' order by id desc",
      "mysql",
    );

    expect(formatted).toContain("SELECT");
    expect(formatted).toContain("\nFROM");
    expect(formatted).toContain("\nWHERE");
    expect(formatted).toContain("\nORDER BY");
  });
});

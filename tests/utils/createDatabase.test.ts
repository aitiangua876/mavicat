import { describe, expect, it } from "vitest";
import {
  buildCreateDatabaseSql,
  getDatabaseCollationOptions,
  supportsCreateDatabase,
} from "../../src/utils/createDatabase";

describe("createDatabase utils", () => {
  describe("supportsCreateDatabase", () => {
    it("supports database engines that expose CREATE DATABASE", () => {
      expect(supportsCreateDatabase("mysql")).toBe(true);
      expect(supportsCreateDatabase("mariadb")).toBe(true);
      expect(supportsCreateDatabase("postgres")).toBe(true);
      expect(supportsCreateDatabase("sqlserver")).toBe(true);
    });

    it("does not expose create database for file/key-value drivers", () => {
      expect(supportsCreateDatabase("sqlite")).toBe(false);
      expect(supportsCreateDatabase("redis")).toBe(false);
      expect(supportsCreateDatabase(null)).toBe(false);
    });
  });

  describe("buildCreateDatabaseSql", () => {
    it("generates MySQL charset and collation SQL", () => {
      expect(buildCreateDatabaseSql("mysql", "demo`app", "utf8mb4", "utf8mb4_unicode_ci")).toBe(
        "CREATE DATABASE `demo``app` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      );
    });

    it("generates PostgreSQL encoding SQL", () => {
      expect(buildCreateDatabaseSql("postgres", "demo app", "UTF8")).toBe(
        "CREATE DATABASE \"demo app\" ENCODING 'UTF8'",
      );
    });

    it("generates SQL Server collation SQL", () => {
      expect(buildCreateDatabaseSql("sqlserver", "demo]app", "Chinese_PRC_CI_AS")).toBe(
        "CREATE DATABASE [demo]]app] COLLATE Chinese_PRC_CI_AS",
      );
    });

    it("rejects an empty database name", () => {
      expect(() => buildCreateDatabaseSql("mysql", " ", "utf8mb4")).toThrow("数据库名称不能为空");
    });
  });

  describe("getDatabaseCollationOptions", () => {
    it("returns MySQL collations for the selected charset", () => {
      expect(getDatabaseCollationOptions("mysql", "utf8mb4")).toContain("utf8mb4_unicode_ci");
    });
  });
});

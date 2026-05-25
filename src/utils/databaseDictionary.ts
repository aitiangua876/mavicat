import type { ForeignKey, Index, TableColumn } from "../types/schema";

export interface DictionaryObject {
  kind: "table" | "view";
  name: string;
  comment?: string | null;
  columns: TableColumn[];
  indexes?: Index[];
  foreignKeys?: ForeignKey[];
  ddl?: string;
}

export interface DatabaseDictionaryInput {
  connectionName: string;
  databaseName: string;
  driver?: string | null;
  generatedAt: string;
  objects: DictionaryObject[];
}

export type DatabaseDictionaryFormat = "html" | "excel" | "markdown";

export function getDatabaseDictionaryFileName(
  databaseName: string,
  format: DatabaseDictionaryFormat = "html",
): string {
  const safeName =
    databaseName
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_") || "database";
  const extension = format === "excel" ? "xls" : format === "markdown" ? "md" : "html";
  return `${safeName}_dictionary.${extension}`;
}

export function formatDictionaryColumnType(column: TableColumn): string {
  if (column.character_maximum_length == null) return column.data_type;
  const type = column.data_type.trim();
  if (/\(\s*\d+\s*\)$/.test(type)) return type;
  return `${type}(${column.character_maximum_length})`;
}

export function buildDatabaseDictionaryHtml(input: DatabaseDictionaryInput): string {
  const tables = input.objects.filter((object) => object.kind === "table");
  const views = input.objects.filter((object) => object.kind === "view");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.databaseName)} 数据库字典</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f8fb;
      --paper: #ffffff;
      --text: #172033;
      --muted: #667085;
      --line: #d9e1ec;
      --head: #eef4ff;
      --accent: #2563eb;
      --accent-soft: #dbeafe;
      --code: #0f172a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .page {
      max-width: 1180px;
      margin: 0 auto;
      padding: 32px 28px 56px;
    }
    .cover {
      background: linear-gradient(135deg, #ffffff 0%, #eff6ff 100%);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 28px;
      box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 28px;
      line-height: 1.2;
    }
    h2 {
      margin: 32px 0 12px;
      font-size: 20px;
      border-left: 4px solid var(--accent);
      padding-left: 10px;
    }
    h3 {
      margin: 26px 0 10px;
      font-size: 17px;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 22px;
    }
    .metric {
      background: rgba(255, 255, 255, 0.78);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
    }
    .metric span {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
    .metric strong {
      display: block;
      margin-top: 4px;
      font-size: 18px;
    }
    .section {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 18px;
      margin-top: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 18px;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }
    th {
      background: var(--head);
      color: #1e3a8a;
      font-weight: 700;
    }
    .toc a {
      color: var(--accent);
      text-decoration: none;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 1px 8px;
      background: var(--accent-soft);
      color: #1d4ed8;
      font-size: 12px;
      font-weight: 700;
      margin-left: 6px;
    }
    .muted { color: var(--muted); }
    pre {
      background: #111827;
      color: #e5e7eb;
      border-radius: 8px;
      padding: 12px;
      overflow: auto;
      font-size: 12px;
      line-height: 1.5;
    }
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    }
    @media print {
      body { background: #fff; }
      .page { max-width: none; padding: 0; }
      .cover, .section { box-shadow: none; break-inside: avoid; }
      h2, h3 { break-after: avoid; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="cover">
      <h1>${escapeHtml(input.databaseName)} 数据库字典</h1>
      <div class="muted">由 Mavicat 生成，包含表、视图、字段、索引、外键和创建语句信息。</div>
      <div class="meta">
        <div class="metric"><span>连接</span><strong>${escapeHtml(input.connectionName || "-")}</strong></div>
        <div class="metric"><span>数据源</span><strong>${escapeHtml(input.driver || "-")}</strong></div>
        <div class="metric"><span>对象</span><strong>${input.objects.length}</strong></div>
        <div class="metric"><span>生成时间</span><strong>${escapeHtml(input.generatedAt)}</strong></div>
      </div>
    </section>

    <section class="section">
      <h2>对象清单</h2>
      ${renderObjectSummaryTable(input.objects)}
    </section>

    ${tables.length > 0 ? `<section class="section"><h2>表结构</h2>${tables.map(renderDictionaryObject).join("\n")}</section>` : ""}
    ${views.length > 0 ? `<section class="section"><h2>视图结构</h2>${views.map(renderDictionaryObject).join("\n")}</section>` : ""}
  </main>
</body>
</html>`;
}

export function buildDatabaseDictionaryExcel(input: DatabaseDictionaryInput): string {
  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, "Microsoft YaHei", sans-serif; }
    h1, h2, h3 { color: #1f4e78; }
    table { border-collapse: collapse; mso-displayed-decimal-separator: "."; mso-displayed-thousand-separator: ","; }
    th { background: #d9eaf7; font-weight: bold; }
    th, td { border: .5pt solid #9e9e9e; padding: 6px; mso-number-format: "\\@"; vertical-align: top; }
    .meta th { background: #e2f0d9; }
  </style>
</head>
<body>
  <h1>${escapeHtml(input.databaseName)} 数据库字典</h1>
  <table class="meta">
    <tbody>
      <tr><th>连接</th><td>${escapeHtml(input.connectionName || "-")}</td><th>数据源</th><td>${escapeHtml(input.driver || "-")}</td></tr>
      <tr><th>对象数</th><td>${input.objects.length}</td><th>生成时间</th><td>${escapeHtml(input.generatedAt)}</td></tr>
    </tbody>
  </table>
  <h2>对象清单</h2>
  ${renderObjectSummaryTable(input.objects)}
  ${input.objects.map(renderDictionaryObject).join("\n")}
</body>
</html>`;
}

export function buildDatabaseDictionaryMarkdown(input: DatabaseDictionaryInput): string {
  const lines: string[] = [
    `# ${input.databaseName} 数据库字典`,
    "",
    `- 连接：${input.connectionName || "-"}`,
    `- 数据源：${input.driver || "-"}`,
    `- 对象数：${input.objects.length}`,
    `- 生成时间：${input.generatedAt}`,
    "",
    "## 对象清单",
    "",
    "| 序号 | 对象名 | 类型 | 字段数 | 说明 |",
    "| --- | --- | --- | ---: | --- |",
    ...input.objects.map(
      (object, index) =>
        `| ${index + 1} | ${escapeMarkdownTable(object.name)} | ${object.kind === "table" ? "表" : "视图"} | ${object.columns.length} | ${escapeMarkdownTable(object.comment || "-")} |`,
    ),
    "",
  ];

  for (const object of input.objects) {
    lines.push(
      `## ${object.kind === "table" ? "表" : "视图"}：${object.name}`,
      "",
    );
    if (object.comment) {
      lines.push(`> ${object.comment}`, "");
    }
    lines.push(
      "| 序号 | 字段名 | 类型 | 可空 | 主键 | 自增 | 默认值 | 注释 |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      ...object.columns.map(
        (column, index) =>
          `| ${index + 1} | ${escapeMarkdownTable(column.name)} | ${escapeMarkdownTable(formatDictionaryColumnType(column))} | ${column.is_nullable ? "是" : "否"} | ${column.is_pk ? "是" : "否"} | ${column.is_auto_increment ? "是" : "否"} | ${escapeMarkdownTable(column.default_value ?? "-")} | ${escapeMarkdownTable(column.comment || "-")} |`,
      ),
      "",
    );

    const indexes = groupIndexes(object.indexes ?? []);
    if (indexes.length > 0) {
      lines.push(
        "### 索引",
        "",
        "| 索引名 | 字段 | 主键 | 唯一 |",
        "| --- | --- | --- | --- |",
        ...indexes.map(
          (index) =>
            `| ${escapeMarkdownTable(index.name)} | ${escapeMarkdownTable(index.columns.join(", "))} | ${index.isPrimary ? "是" : "否"} | ${index.isUnique ? "是" : "否"} |`,
        ),
        "",
      );
    }

    if (object.foreignKeys?.length) {
      lines.push(
        "### 外键",
        "",
        "| 外键名 | 字段 | 引用 | 删除规则 | 更新规则 |",
        "| --- | --- | --- | --- | --- |",
        ...object.foreignKeys.map(
          (fk) =>
            `| ${escapeMarkdownTable(fk.name)} | ${escapeMarkdownTable(fk.column_name)} | ${escapeMarkdownTable(`${fk.ref_table}.${fk.ref_column}`)} | ${escapeMarkdownTable(fk.on_delete ?? "-")} | ${escapeMarkdownTable(fk.on_update ?? "-")} |`,
        ),
        "",
      );
    }

    if (object.ddl?.trim()) {
      lines.push("### 创建语句", "", "```sql", object.ddl.trim(), "```", "");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderObjectSummaryTable(objects: DictionaryObject[]): string {
  if (objects.length === 0) {
    return `<p class="muted">没有找到可导出的对象。</p>`;
  }

  const rows = objects
    .map(
      (object, index) => `
        <tr>
          <td>${index + 1}</td>
          <td><a href="#${objectAnchor(object)}">${escapeHtml(object.name)}</a></td>
          <td>${object.kind === "table" ? "表" : "视图"}</td>
          <td>${object.columns.length}</td>
          <td>${escapeHtml(object.comment || "-")}</td>
        </tr>`,
    )
    .join("");

  return `<table class="toc">
    <thead>
      <tr>
        <th style="width: 64px;">序号</th>
        <th>对象名</th>
        <th style="width: 96px;">类型</th>
        <th style="width: 96px;">字段数</th>
        <th>说明</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderDictionaryObject(object: DictionaryObject): string {
  return `<article id="${objectAnchor(object)}">
    <h3>${escapeHtml(object.name)}<span class="badge">${object.kind === "table" ? "表" : "视图"}</span></h3>
    ${object.comment ? `<p class="muted">${escapeHtml(object.comment)}</p>` : ""}
    ${renderColumnsTable(object.columns)}
    ${renderIndexesTable(object.indexes ?? [])}
    ${renderForeignKeysTable(object.foreignKeys ?? [])}
    ${object.ddl?.trim() ? `<h3>创建语句</h3><pre><code>${escapeHtml(object.ddl.trim())}</code></pre>` : ""}
  </article>`;
}

function renderColumnsTable(columns: TableColumn[]): string {
  if (columns.length === 0) return `<p class="muted">没有字段信息。</p>`;

  const rows = columns
    .map(
      (column, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(column.name)}</td>
          <td>${escapeHtml(formatDictionaryColumnType(column))}</td>
          <td>${column.is_nullable ? "是" : "否"}</td>
          <td>${column.is_pk ? "是" : "否"}</td>
          <td>${column.is_auto_increment ? "是" : "否"}</td>
          <td>${escapeHtml(column.default_value ?? "-")}</td>
          <td>${escapeHtml(column.comment || "-")}</td>
        </tr>`,
    )
    .join("");

  return `<table>
    <thead>
      <tr>
        <th style="width: 64px;">序号</th>
        <th>字段名</th>
        <th>类型</th>
        <th style="width: 84px;">可空</th>
        <th style="width: 84px;">主键</th>
        <th style="width: 100px;">自增</th>
        <th>默认值</th>
        <th>注释</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderIndexesTable(indexes: Index[]): string {
  const grouped = groupIndexes(indexes);
  if (grouped.length === 0) return "";

  const rows = grouped
    .map(
      (index) => `
        <tr>
          <td>${escapeHtml(index.name)}</td>
          <td>${escapeHtml(index.columns.join(", "))}</td>
          <td>${index.isPrimary ? "是" : "否"}</td>
          <td>${index.isUnique ? "是" : "否"}</td>
        </tr>`,
    )
    .join("");

  return `<h3>索引</h3>
  <table>
    <thead><tr><th>索引名</th><th>字段</th><th>主键</th><th>唯一</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderForeignKeysTable(foreignKeys: ForeignKey[]): string {
  if (foreignKeys.length === 0) return "";

  const rows = foreignKeys
    .map(
      (fk) => `
        <tr>
          <td>${escapeHtml(fk.name)}</td>
          <td>${escapeHtml(fk.column_name)}</td>
          <td>${escapeHtml(fk.ref_table)}.${escapeHtml(fk.ref_column)}</td>
          <td>${escapeHtml(fk.on_delete ?? "-")}</td>
          <td>${escapeHtml(fk.on_update ?? "-")}</td>
        </tr>`,
    )
    .join("");

  return `<h3>外键</h3>
  <table>
    <thead><tr><th>外键名</th><th>字段</th><th>引用</th><th>删除规则</th><th>更新规则</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function groupIndexes(indexes: Index[]): Array<{
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}> {
  const map = new Map<string, { name: string; columns: string[]; isUnique: boolean; isPrimary: boolean }>();
  for (const index of indexes) {
    const current =
      map.get(index.name) ??
      {
        name: index.name,
        columns: [],
        isUnique: false,
        isPrimary: false,
      };
    current.columns.push(index.column_name);
    current.isUnique = current.isUnique || index.is_unique;
    current.isPrimary = current.isPrimary || index.is_primary;
    map.set(index.name, current);
  }
  return Array.from(map.values());
}

function objectAnchor(object: DictionaryObject): string {
  return `${object.kind}-${encodeURIComponent(object.name)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  Download,
  FileCode,
  FileJson,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { DataGrid } from "./DataGrid";
import { ErrorDisplay } from "./ErrorDisplay";
import { PaginationControls } from "./PaginationControls";
import { formatDuration } from "../../utils/formatTime";
import { getStackedGridHeight } from "../../utils/multiResult";
import type { QueryResultEntry } from "../../types/editor";

export type ResultExportFormat = "csv" | "json" | "excel" | "sql";
export type ResultExportScope = "page" | "queryAll" | "filtered" | "all";

export interface ResultExportScopeOption {
  value: ResultExportScope;
  label: string;
}

export interface ResultExportOptions {
  format: ResultExportFormat;
  scope: ResultExportScope;
}

interface ResultEntryContentProps {
  entry: QueryResultEntry;
  connectionId: string | null;
  copyFormat: "csv" | "json" | "sql-insert";
  csvDelimiter: string;
  onPageChange: (page: number) => void;
  onExport?: (options: ResultExportOptions) => void;
  exportScopes?: ResultExportScopeOption[];
  compact?: boolean;
}

const EXPORT_FORMATS: Array<{
  format: ResultExportFormat;
  label: string;
  extension: string;
  icon: typeof FileText;
}> = [
  { format: "csv", label: "CSV", extension: ".csv", icon: FileText },
  { format: "json", label: "JSON", extension: ".json", icon: FileJson },
  { format: "excel", label: "Excel", extension: ".xls", icon: FileSpreadsheet },
  { format: "sql", label: "SQL", extension: ".sql", icon: FileCode },
];

const QUERY_RESULT_EXPORT_SCOPES: ResultExportScopeOption[] = [
  { value: "page", label: "当前页" },
  { value: "queryAll", label: "此查询全部结果" },
];

export function ResultExportButton({
  disabled,
  scopes = QUERY_RESULT_EXPORT_SCOPES,
  onExport,
}: {
  disabled?: boolean;
  scopes?: ResultExportScopeOption[];
  onExport?: (options: ResultExportOptions) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState<ResultExportScope>(
    scopes[0]?.value ?? "page",
  );

  if (!onExport) return null;

  const selectedScope =
    scopes.find((item) => item.value === scope)?.value ?? scopes[0]?.value ?? "page";

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((value) => !value)}
        className="inline-flex h-7 items-center gap-1.5 rounded border border-default bg-surface-secondary px-2 text-xs font-medium text-secondary transition-colors hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-40"
        title="导出当前结果"
      >
        <Download size={13} />
        导出
        <ChevronDown size={12} className={isOpen ? "rotate-180" : undefined} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border border-strong bg-elevated py-1 shadow-xl">
            <div className="border-b border-default px-3 py-2">
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted">
                导出范围
              </label>
              <select
                value={selectedScope}
                onChange={(event) => setScope(event.target.value as ResultExportScope)}
                className="h-8 w-full rounded border border-strong bg-surface-secondary px-2 text-xs text-primary outline-none"
              >
                {scopes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            {EXPORT_FORMATS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.format}
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onExport({ format: item.format, scope: selectedScope });
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-secondary transition-colors hover:bg-blue-500/15 hover:text-blue-400"
                >
                  <Icon size={14} className="shrink-0 opacity-80" />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-xs text-muted">{item.extension}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function ResultEntryContent({
  entry,
  connectionId,
  copyFormat,
  csvDelimiter,
  onPageChange,
  onExport,
  exportScopes,
  compact,
}: ResultEntryContentProps) {
  const { t } = useTranslation();

  if (entry.isLoading) {
    if (compact) {
      return (
        <div className="flex items-center gap-2 px-3 py-4 text-muted text-xs">
          <div className="w-3 h-3 border-2 border-surface-secondary border-t-blue-500 rounded-full animate-spin" />
          <span>{t("editor.executingQuery")}</span>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted">
        <div className="w-12 h-12 border-4 border-surface-secondary border-t-blue-500 rounded-full animate-spin mb-4" />
        <p className="text-sm">{t("editor.executingQuery")}</p>
      </div>
    );
  }

  if (entry.error) {
    return (
      <div className={compact ? "max-h-[150px] overflow-auto" : undefined}>
        <ErrorDisplay error={entry.error} t={t} />
      </div>
    );
  }

  if (!entry.result) {
    if (compact) return null;
    return (
      <div className="flex items-center justify-center h-full text-surface-tertiary text-sm">
        {t("editor.executePrompt")}
      </div>
    );
  }

  if (entry.result.columns.length === 0) {
    const content = (
      <div className="rounded border border-default bg-elevated px-4 py-3 text-sm text-secondary">
        <div className="flex items-center gap-2 text-primary font-medium mb-1">
          <Check size={15} className="text-green-400" />
          SQL 执行完成
        </div>
        <div>
          影响行数：
          <span className="font-mono text-primary">
            {entry.result.affected_rows}
          </span>
          {entry.executionTime !== null && (
            <span className="text-muted ml-2 font-mono">
              ({formatDuration(entry.executionTime)})
            </span>
          )}
        </div>
      </div>
    );

    if (compact) {
      return <div className="px-3 py-2">{content}</div>;
    }

    return (
      <div className="h-full flex items-center justify-center bg-base">
        {content}
      </div>
    );
  }

  if (compact) {
    const gridHeight = getStackedGridHeight(entry.result.rows.length);
    return (
      <div style={{ height: gridHeight }} className="overflow-hidden">
        <DataGrid
          key={`${entry.id}-${entry.result.rows.length}`}
          columns={entry.result.columns}
          data={entry.result.rows}
          tableName={null}
          pkColumn={null}
          connectionId={connectionId}
          selectedRows={new Set()}
          onSelectionChange={() => {}}
          copyFormat={copyFormat}
          csvDelimiter={csvDelimiter}
          readonly={true}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Status bar */}
      <div className="p-2 bg-elevated text-xs text-secondary border-b border-default flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <ResultExportButton
            disabled={entry.isLoading || entry.result.rows.length === 0}
            scopes={exportScopes}
            onExport={onExport}
          />
          <span>
            {t("editor.rowsRetrieved", {
              count: entry.result.rows.length,
            })}{" "}
            {entry.executionTime !== null && (
              <span className="text-muted ml-2 font-mono">
                ({formatDuration(entry.executionTime)})
              </span>
            )}
          </span>
          {entry.result.pagination?.has_more && (
            <span className="px-2 py-0.5 bg-yellow-900/30 text-yellow-400 rounded text-[10px] font-semibold uppercase tracking-wide border border-yellow-500/30">
              {t("editor.autoPaginated")}
            </span>
          )}
        </div>
        {entry.result.pagination && (
          <PaginationControls
            pagination={entry.result.pagination}
            isLoading={entry.isLoading}
            onPageChange={onPageChange}
          />
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <DataGrid
          key={`${entry.id}-${entry.result.rows.length}`}
          columns={entry.result.columns}
          data={entry.result.rows}
          tableName={null}
          pkColumn={null}
          connectionId={connectionId}
          selectedRows={new Set()}
          onSelectionChange={() => {}}
          copyFormat={copyFormat}
          csvDelimiter={csvDelimiter}
          readonly={true}
        />
      </div>
    </div>
  );
}

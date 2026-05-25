import {
  Archive,
  ArrowRightLeft,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileInput,
  FileSpreadsheet,
  Upload,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type { ElementType } from "react";
import { Modal } from "../ui/Modal";

type ToolWizardKind =
  | "import"
  | "export"
  | "backup"
  | "sql_import"
  | "schema_sync"
  | "data_transfer";

type ExportFormat = "csv" | "json" | "excel" | "sql";
type TransferWriteMode = "append" | "delete_then_insert" | "create_then_insert";

interface ExportSource {
  connectionId: string;
  databaseName?: string;
  tableName: string;
}

interface DataTransferWizardRequest {
  sourceConnectionId: string;
  targetConnectionId: string;
  sourceSchema?: string;
  targetSchema?: string;
  sourceTable: string;
  sourceTables?: string[];
  targetTable?: string;
  writeMode: TransferWriteMode;
  batchSize: number;
}

interface SchemaSyncWizardRequest {
  sourceConnectionId: string;
  targetConnectionId: string;
  sourceSchema?: string;
  targetSchema?: string;
}

interface SchemaDiffItem {
  id: string;
  kind: string;
  tableName: string;
  objectName?: string | null;
  summary: string;
  statements: string[];
}

interface SchemaDiffReport {
  source: { connectionId: string; schema?: string | null };
  target: { connectionId: string; schema?: string | null };
  totalChanges: number;
  executableChanges: number;
  items: SchemaDiffItem[];
}

interface DataTransferProgressPayload {
  tableName: string;
  rowsTransferred: number;
  tablesCompleted?: number | null;
  tablesTotal?: number | null;
}

interface SchemaSyncProgressPayload {
  statementsExecuted: number;
  statementsTotal: number;
}

interface ToolWizardModalProps {
  isOpen: boolean;
  kind: ToolWizardKind | null;
  onClose: () => void;
  connectionOptions: Array<{ id: string; name: string }>;
  databaseOptions: string[];
  selectedConnectionId: string;
  selectedDatabaseName: string;
  onConnectionChange: (connectionId: string) => void;
  onDatabaseChange: (databaseName: string) => void;
  targetDatabaseOptions?: string[];
  selectedTargetConnectionId?: string;
  selectedTargetDatabaseName?: string;
  onTargetConnectionChange?: (connectionId: string) => void;
  onTargetDatabaseChange?: (databaseName: string) => void;
  tableOptions?: string[];
  initialTransferSourceTable?: string;
  initialTransferSourceTables?: string[];
  hasConnection: boolean;
  canExport: boolean;
  onClipboardImport: () => void;
  onFileImport: () => void;
  onExport: (format: ExportFormat, source?: ExportSource) => void;
  onBackup: () => void;
  onSqlImport: () => void;
  onDataTransfer?: (request: DataTransferWizardRequest) => Promise<string>;
  onSchemaCompare?: (request: SchemaSyncWizardRequest) => Promise<SchemaDiffReport>;
  onSchemaExecute?: (report: SchemaDiffReport, selectedChangeIds: string[]) => Promise<string>;
}

const toolContent: Record<
  ToolWizardKind,
  {
    title: string;
    subtitle: string;
    icon: ElementType;
    steps: string[];
    status: string;
    primaryLabel?: string;
    secondaryLabel?: string;
  }
> = {
  import: {
    title: "数据导入",
    subtitle: "CSV/TSV/JSON 文件导入、字段映射和剪贴板导入统一收敛到这里。",
    icon: Upload,
    steps: ["选择来源", "预览字段", "映射目标", "执行导入", "查看结果"],
    status: "已接入文件导入和剪贴板导入，导入后可选择新建表或追加到已有表。",
    primaryLabel: "选择文件导入",
    secondaryLabel: "从剪贴板导入",
  },
  export: {
    title: "数据导出",
    subtitle: "表、视图、查询结果导出为 CSV、JSON、Excel、SQL INSERT。",
    icon: Download,
    steps: ["选择来源", "选择格式", "配置字段", "导出文件", "完成"],
    status: "可从当前活动表或查询标签导出 CSV、JSON、Excel 或 SQL 文件。",
    primaryLabel: "导出 SQL",
  },
  backup: {
    title: "数据库备份",
    subtitle: "结构、数据、结构+数据备份，选择表后输出 SQL 文件。",
    icon: DatabaseBackup,
    steps: ["选择数据库", "选择对象", "配置结构/数据", "写入 SQL", "完成"],
    status: "已接入现有备份能力，可选择结构、数据和表范围后输出 SQL 文件。",
    primaryLabel: "开始备份",
  },
  sql_import: {
    title: "执行 SQL 文件",
    subtitle: "导入 .sql 或 .zip，执行前预览文件信息，执行中展示日志。",
    icon: FileInput,
    steps: ["选择文件", "检查信息", "确认执行", "刷新对象树", "完成"],
    status: "已接入现有 SQL/Zip 导入能力，选择文件后会进入执行确认和进度弹窗。",
    primaryLabel: "选择 SQL 文件",
  },
  schema_sync: {
    title: "结构同步",
    subtitle: "对比源和目标的表、列、主键、索引、外键，并生成同步 SQL。",
    icon: ArrowRightLeft,
    steps: ["选择源/目标", "加载差异", "筛选变更", "预览 SQL", "确认执行"],
    status: "已接入结构对比与 SQL 预览，默认从源同步到目标，执行前可勾选变更。",
    primaryLabel: "加载差异",
  },
  data_transfer: {
    title: "数据迁移",
    subtitle: "跨 MySQL、PostgreSQL、SQLite 的向导式表迁移。",
    icon: Archive,
    steps: ["选择源表", "选择目标", "字段映射", "批量迁移", "查看结果"],
    status: "已接入 V1 迁移能力，可选择源表和目标连接/数据库后批量写入。",
    primaryLabel: "开始迁移",
  },
};

export const ToolWizardModal = ({
  isOpen,
  kind,
  onClose,
  connectionOptions,
  databaseOptions,
  selectedConnectionId,
  selectedDatabaseName,
  onConnectionChange,
  onDatabaseChange,
  targetDatabaseOptions = [],
  selectedTargetConnectionId = "",
  selectedTargetDatabaseName = "",
  onTargetConnectionChange,
  onTargetDatabaseChange,
  tableOptions = [],
  initialTransferSourceTable = "",
  initialTransferSourceTables = [],
  hasConnection,
  canExport,
  onClipboardImport,
  onFileImport,
  onExport,
  onBackup,
  onSqlImport,
  onDataTransfer,
  onSchemaCompare,
  onSchemaExecute,
}: ToolWizardModalProps) => {
  const [sourceTable, setSourceTable] = useState("");
  const [sourceTables, setSourceTables] = useState<string[]>([]);
  const [targetTable, setTargetTable] = useState("");
  const [writeMode, setWriteMode] = useState<TransferWriteMode>("append");
  const [batchSize, setBatchSize] = useState(500);
  const [transferStatus, setTransferStatus] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [exportTable, setExportTable] = useState("");
  const [schemaSyncReport, setSchemaSyncReport] = useState<SchemaDiffReport | null>(null);
  const [selectedSchemaChangeIds, setSelectedSchemaChangeIds] = useState<string[]>([]);
  const [schemaSyncStatus, setSchemaSyncStatus] = useState("");
  const [isSchemaSyncing, setIsSchemaSyncing] = useState(false);

  useEffect(() => {
    if (kind !== "data_transfer") return;
    const initialTables = initialTransferSourceTables.filter((table) =>
      tableOptions.includes(table),
    );
    const nextSourceTable =
      initialTransferSourceTable && tableOptions.includes(initialTransferSourceTable)
        ? initialTransferSourceTable
        : sourceTable && tableOptions.includes(sourceTable)
          ? sourceTable
          : tableOptions[0] ?? "";
    setSourceTable(nextSourceTable);
    setSourceTables(initialTables.length > 0 ? initialTables : nextSourceTable ? [nextSourceTable] : []);
    setTargetTable("");
    setTransferStatus("");
  }, [initialTransferSourceTable, initialTransferSourceTables, kind, sourceTable, tableOptions]);

  useEffect(() => {
    if (kind !== "export") return;
    setExportTable((current) => (current && tableOptions.includes(current) ? current : tableOptions[0] ?? ""));
  }, [kind, tableOptions]);

  useEffect(() => {
    if (kind !== "schema_sync") return;
    setSchemaSyncReport(null);
    setSelectedSchemaChangeIds([]);
    setSchemaSyncStatus("");
  }, [
    kind,
    selectedConnectionId,
    selectedDatabaseName,
    selectedTargetConnectionId,
    selectedTargetDatabaseName,
  ]);

  useEffect(() => {
    if (!isOpen) return;

    const unlistenTransfer = listen<DataTransferProgressPayload>(
      "data_transfer_progress",
      (event) => {
        const { tableName, rowsTransferred, tablesCompleted, tablesTotal } =
          event.payload;
        const tableProgress =
          tablesCompleted && tablesTotal
            ? `（${tablesCompleted}/${tablesTotal} 表）`
            : "";
        setTransferStatus(
          `正在迁移 ${tableName}${tableProgress}，已写入 ${rowsTransferred} 行...`,
        );
      },
    );
    const unlistenSchemaSync = listen<SchemaSyncProgressPayload>(
      "schema_sync_progress",
      (event) => {
        setSchemaSyncStatus(
          `正在执行结构同步 ${event.payload.statementsExecuted}/${event.payload.statementsTotal}...`,
        );
      },
    );

    return () => {
      unlistenTransfer.then((dispose) => dispose());
      unlistenSchemaSync.then((dispose) => dispose());
    };
  }, [isOpen]);

  if (!kind) return null;

  const content = toolContent[kind];
  const Icon = content.icon;
  const exportSource =
    exportTable && !canExport
      ? {
          connectionId: selectedConnectionId,
          databaseName: selectedDatabaseName || undefined,
          tableName: exportTable,
        }
      : undefined;
  const hasExportSource = canExport || !!exportSource;
  const schemaExecutableItems =
    schemaSyncReport?.items.filter((item) =>
      item.statements.some((statement) => statement.trim() && !statement.trim().startsWith("--")),
    ) ?? [];
  const schemaPreviewSql =
    schemaSyncReport?.items
      .filter((item) => selectedSchemaChangeIds.includes(item.id))
      .flatMap((item) => item.statements)
      .join("\n\n") ?? "";
  const allSchemaChangesSelected =
    schemaExecutableItems.length > 0 &&
    selectedSchemaChangeIds.length === schemaExecutableItems.length;
  const primaryLabel =
    kind === "schema_sync" && schemaSyncReport
      ? "执行同步"
      : content.primaryLabel;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-elevated border border-strong rounded-lg shadow-2xl w-[860px] max-w-[92vw] max-h-[84vh] overflow-hidden flex flex-col">
        <div className="h-14 px-5 border-b border-default bg-base flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-500/15 flex items-center justify-center">
              <Icon size={20} className="text-blue-300" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary">{content.title}</h2>
              <p className="text-xs text-muted">{content.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-sm text-secondary hover:text-primary hover:bg-surface-secondary"
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 grid grid-cols-[220px_1fr] min-h-0">
          <aside className="border-r border-default bg-surface-secondary/50 p-4">
            <div className="text-[11px] uppercase text-muted mb-3">步骤</div>
            <div className="space-y-2">
              {content.steps.map((step, index) => (
                <div key={step} className="flex items-center gap-2 text-sm">
                  <div
                    className={
                      index === 0
                        ? "w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs"
                        : "w-5 h-5 rounded-full border border-default text-muted flex items-center justify-center text-xs"
                    }
                  >
                    {index + 1}
                  </div>
                  <span className={index === 0 ? "text-primary" : "text-secondary"}>{step}</span>
                </div>
              ))}
            </div>
          </aside>

          <main className="p-5 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="border border-default rounded-md p-3 bg-base">
                <label className="text-xs text-muted mb-1 block">当前连接</label>
                <select
                  value={selectedConnectionId}
                  onChange={(event) => onConnectionChange(event.target.value)}
                  disabled={connectionOptions.length === 0}
                  className="w-full bg-transparent text-sm text-primary font-medium outline-none disabled:text-muted"
                >
                  {connectionOptions.length === 0 ? (
                    <option value="">未连接</option>
                  ) : (
                    connectionOptions.map((connection) => (
                      <option key={connection.id} value={connection.id}>
                        {connection.name || "未命名连接"}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="border border-default rounded-md p-3 bg-base">
                <label className="text-xs text-muted mb-1 block">当前数据库/Schema</label>
                <select
                  value={selectedDatabaseName}
                  onChange={(event) => onDatabaseChange(event.target.value)}
                  disabled={databaseOptions.length === 0}
                  className="w-full bg-transparent text-sm text-primary font-medium outline-none disabled:text-muted"
                >
                  {databaseOptions.length === 0 ? (
                    <option value="">未选择</option>
                  ) : (
                    databaseOptions.map((database) => (
                      <option key={database} value={database}>
                        {database}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div className="border border-default rounded-md overflow-hidden">
              <div className="px-4 py-3 bg-surface-secondary border-b border-default flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-300" />
                <span className="text-sm font-medium text-primary">向导框架已接入</span>
              </div>
              <div className="p-4 text-sm text-secondary leading-6">
                {content.status}
                {kind === "export" && !hasExportSource && (
                  <div className="mt-3 text-amber-300">
                    当前没有可导出的活动表、查询或可选表，请先打开表数据/查询标签，或选择一个已加载表。
                  </div>
                )}
                {!hasConnection && (
                  <div className="mt-3 text-amber-300">
                    需要先创建或选择连接，才能执行数据库对象相关操作。
                  </div>
                )}
              </div>
            </div>

            {kind === "export" && !canExport && (
              <div className="mt-4 border border-default rounded-md p-4 bg-base space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-primary">导出来源</div>
                    <div className="text-xs text-muted mt-1">
                      从当前数据库选择一个表导出。
                    </div>
                  </div>
                </div>
                <label className="block">
                  <span className="text-xs text-muted mb-1 block">源表</span>
                  <select
                    value={exportTable}
                    onChange={(event) => setExportTable(event.target.value)}
                    disabled={tableOptions.length === 0}
                    className="w-full h-9 bg-surface-secondary border border-default rounded px-2 text-sm text-primary outline-none disabled:text-muted"
                  >
                    {tableOptions.length === 0 ? (
                      <option value="">未加载表</option>
                    ) : (
                      tableOptions.map((table) => (
                        <option key={table} value={table}>
                          {table}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>
            )}

            {kind === "data_transfer" && (
              <div className="mt-4 border border-default rounded-md p-4 bg-base space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">源表</span>
                    <select
                      multiple
                      value={sourceTables}
                      onChange={(event) => {
                        const values = Array.from(event.target.selectedOptions).map(
                          (option) => option.value,
                        );
                        setSourceTables(values);
                        setSourceTable(values[0] ?? "");
                      }}
                      disabled={tableOptions.length === 0 || isTransferring}
                      className="w-full h-28 bg-surface-secondary border border-default rounded px-2 py-1 text-sm text-primary outline-none disabled:text-muted"
                    >
                      {tableOptions.length === 0 ? (
                        <option value="">未加载表</option>
                      ) : (
                        tableOptions.map((table) => (
                          <option key={table} value={table}>
                            {table}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">目标表</span>
                    <input
                      value={targetTable}
                      onChange={(event) => setTargetTable(event.target.value)}
                      placeholder={
                        sourceTables.length > 1 ? "多表迁移默认同名" : sourceTable || "默认同名"
                      }
                      disabled={isTransferring || sourceTables.length > 1}
                      className="w-full h-9 bg-surface-secondary border border-default rounded px-2 text-sm text-primary outline-none placeholder:text-muted"
                    />
                    {sourceTables.length > 1 && (
                      <span className="mt-1 block text-[11px] text-muted">
                        多表迁移会按原表名写入目标库。
                      </span>
                    )}
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">目标连接</span>
                    <select
                      value={selectedTargetConnectionId}
                      onChange={(event) => onTargetConnectionChange?.(event.target.value)}
                      disabled={connectionOptions.length === 0 || isTransferring}
                      className="w-full h-9 bg-surface-secondary border border-default rounded px-2 text-sm text-primary outline-none disabled:text-muted"
                    >
                      {connectionOptions.map((connection) => (
                        <option key={connection.id} value={connection.id}>
                          {connection.name || "未命名连接"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">目标数据库/Schema</span>
                    <select
                      value={selectedTargetDatabaseName}
                      onChange={(event) => onTargetDatabaseChange?.(event.target.value)}
                      disabled={targetDatabaseOptions.length === 0 || isTransferring}
                      className="w-full h-9 bg-surface-secondary border border-default rounded px-2 text-sm text-primary outline-none disabled:text-muted"
                    >
                      {targetDatabaseOptions.length === 0 ? (
                        <option value="">未选择</option>
                      ) : (
                        targetDatabaseOptions.map((database) => (
                          <option key={database} value={database}>
                            {database}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">写入模式</span>
                    <select
                      value={writeMode}
                      onChange={(event) => setWriteMode(event.target.value as TransferWriteMode)}
                      disabled={isTransferring}
                      className="w-full h-9 bg-surface-secondary border border-default rounded px-2 text-sm text-primary outline-none"
                    >
                      <option value="append">追加</option>
                      <option value="delete_then_insert">清空目标表后插入</option>
                      <option value="create_then_insert">创建目标表后插入</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">批量大小</span>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={batchSize}
                      onChange={(event) => setBatchSize(Number(event.target.value) || 500)}
                      disabled={isTransferring}
                      className="w-full h-9 bg-surface-secondary border border-default rounded px-2 text-sm text-primary outline-none"
                    />
                  </label>
                </div>
                {transferStatus && (
                  <div className="text-xs text-secondary bg-surface-secondary border border-default rounded px-3 py-2">
                    {transferStatus}
                  </div>
                )}
              </div>
            )}

            {kind === "schema_sync" && (
              <div className="mt-4 border border-default rounded-md p-4 bg-base space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">目标连接</span>
                    <select
                      value={selectedTargetConnectionId}
                      onChange={(event) => onTargetConnectionChange?.(event.target.value)}
                      disabled={connectionOptions.length === 0 || isSchemaSyncing}
                      className="w-full h-9 bg-surface-secondary border border-default rounded px-2 text-sm text-primary outline-none disabled:text-muted"
                    >
                      {connectionOptions.map((connection) => (
                        <option key={connection.id} value={connection.id}>
                          {connection.name || "未命名连接"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">目标数据库/Schema</span>
                    <select
                      value={selectedTargetDatabaseName}
                      onChange={(event) => onTargetDatabaseChange?.(event.target.value)}
                      disabled={targetDatabaseOptions.length === 0 || isSchemaSyncing}
                      className="w-full h-9 bg-surface-secondary border border-default rounded px-2 text-sm text-primary outline-none disabled:text-muted"
                    >
                      {targetDatabaseOptions.length === 0 ? (
                        <option value="">未选择</option>
                      ) : (
                        targetDatabaseOptions.map((database) => (
                          <option key={database} value={database}>
                            {database}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                </div>

                {schemaSyncStatus && (
                  <div className="text-xs text-secondary bg-surface-secondary border border-default rounded px-3 py-2">
                    {schemaSyncStatus}
                  </div>
                )}

                {schemaSyncReport && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-primary">
                        差异 {schemaSyncReport.totalChanges} 项，可执行 {schemaSyncReport.executableChanges} 项
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSchemaChangeIds(
                            allSchemaChangesSelected
                              ? []
                              : schemaExecutableItems.map((item) => item.id),
                          );
                        }}
                        className="text-xs text-blue-300 hover:text-blue-200"
                      >
                        {allSchemaChangesSelected ? "取消全选" : "全选可执行"}
                      </button>
                    </div>
                    <div className="max-h-48 overflow-auto border border-default rounded bg-surface-secondary/60">
                      {schemaSyncReport.items.length === 0 ? (
                        <div className="px-3 py-6 text-center text-sm text-muted">
                          源和目标结构一致。
                        </div>
                      ) : (
                        schemaSyncReport.items.map((item) => {
                          const executable = item.statements.some(
                            (statement) => statement.trim() && !statement.trim().startsWith("--"),
                          );
                          return (
                            <label
                              key={item.id}
                              className="flex items-start gap-2 px-3 py-2 border-b border-default last:border-b-0 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={selectedSchemaChangeIds.includes(item.id)}
                                disabled={!executable || isSchemaSyncing}
                                onChange={(event) => {
                                  setSelectedSchemaChangeIds((current) =>
                                    event.target.checked
                                      ? [...current, item.id]
                                      : current.filter((id) => id !== item.id),
                                  );
                                }}
                                className="mt-1"
                              />
                              <span className={executable ? "text-primary" : "text-muted"}>
                                {item.summary}
                                {!executable && "（仅提示）"}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-muted mb-1">SQL 预览</div>
                      <pre className="max-h-52 overflow-auto rounded border border-default bg-[#151515] p-3 text-xs leading-5 text-[#d7e6ff] whitespace-pre-wrap">
                        {schemaPreviewSql || "-- 请选择可执行变更预览 SQL"}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        <div className="h-14 px-5 border-t border-default bg-base/70 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-secondary hover:text-primary"
          >
            关闭
          </button>
          {kind === "import" && content.secondaryLabel && (
            <button
              onClick={() => {
                onClipboardImport();
                onClose();
              }}
              disabled={!hasConnection}
              className="px-4 py-2 text-sm rounded-md bg-surface-tertiary hover:bg-surface-secondary disabled:bg-surface-tertiary disabled:text-muted disabled:cursor-not-allowed text-primary"
            >
              {content.secondaryLabel}
            </button>
          )}
          {kind === "export" && (
            <div className="mr-auto flex items-center gap-2">
              {[
                { format: "csv" as const, label: "CSV", icon: Download },
                { format: "json" as const, label: "JSON", icon: FileInput },
                { format: "excel" as const, label: "Excel", icon: FileSpreadsheet },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.format}
                    onClick={() => onExport(item.format, exportSource)}
                    disabled={!hasConnection || !hasExportSource}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-surface-tertiary hover:bg-surface-secondary disabled:bg-surface-tertiary disabled:text-muted disabled:cursor-not-allowed text-primary"
                  >
                    <Icon size={15} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}
          {primaryLabel && (
            <button
              onClick={() => {
                if (kind === "import") onFileImport();
                if (kind === "export") onExport("sql", exportSource);
                if (kind === "backup") onBackup();
                if (kind === "sql_import") onSqlImport();
                if (kind === "data_transfer" && onDataTransfer) {
                  setIsTransferring(true);
                  setTransferStatus("迁移执行中...");
                  onDataTransfer({
                    sourceConnectionId: selectedConnectionId,
                    targetConnectionId: selectedTargetConnectionId || selectedConnectionId,
                    sourceSchema: selectedDatabaseName || undefined,
                    targetSchema: selectedTargetDatabaseName || undefined,
                    sourceTable: sourceTables[0] ?? sourceTable,
                    sourceTables,
                    targetTable:
                      sourceTables.length > 1 ? undefined : targetTable.trim() || undefined,
                    writeMode,
                    batchSize,
                  })
                    .then((message) => setTransferStatus(message))
                    .catch((error) => setTransferStatus(String(error)))
                    .finally(() => setIsTransferring(false));
                  return;
                }
                if (kind === "schema_sync") {
                  if (!schemaSyncReport && onSchemaCompare) {
                    setIsSchemaSyncing(true);
                    setSchemaSyncStatus("正在加载源和目标结构差异...");
                    onSchemaCompare({
                      sourceConnectionId: selectedConnectionId,
                      targetConnectionId: selectedTargetConnectionId || selectedConnectionId,
                      sourceSchema: selectedDatabaseName || undefined,
                      targetSchema: selectedTargetDatabaseName || undefined,
                    })
                      .then((report) => {
                        setSchemaSyncReport(report);
                        const selected = report.items
                          .filter((item) =>
                            item.statements.some(
                              (statement) =>
                                statement.trim() && !statement.trim().startsWith("--"),
                            ),
                          )
                          .map((item) => item.id);
                        setSelectedSchemaChangeIds(selected);
                        setSchemaSyncStatus(
                          report.totalChanges === 0
                            ? "结构一致，无需同步。"
                            : `已加载 ${report.totalChanges} 项差异。`,
                        );
                      })
                      .catch((error) => setSchemaSyncStatus(String(error)))
                      .finally(() => setIsSchemaSyncing(false));
                    return;
                  }

                  if (schemaSyncReport && onSchemaExecute) {
                    setIsSchemaSyncing(true);
                    setSchemaSyncStatus("正在执行结构同步...");
                    onSchemaExecute(schemaSyncReport, selectedSchemaChangeIds)
                      .then((message) => setSchemaSyncStatus(message))
                      .catch((error) => setSchemaSyncStatus(String(error)))
                      .finally(() => setIsSchemaSyncing(false));
                    return;
                  }
                  return;
                }
                if (kind !== "export") onClose();
              }}
              disabled={
                !hasConnection ||
                (kind === "export" && !hasExportSource) ||
                (kind === "schema_sync" &&
                  (isSchemaSyncing ||
                    !onSchemaCompare ||
                    (!schemaSyncReport &&
                      !(selectedTargetConnectionId || selectedConnectionId)) ||
                    (!!schemaSyncReport && selectedSchemaChangeIds.length === 0))) ||
                (kind === "data_transfer" &&
                  (sourceTables.length === 0 ||
                    !(selectedTargetConnectionId || selectedConnectionId) ||
                    isTransferring))
              }
              className="px-4 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-surface-tertiary disabled:text-muted disabled:cursor-not-allowed text-white"
            >
              {isSchemaSyncing && kind === "schema_sync" ? "处理中..." : primaryLabel}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

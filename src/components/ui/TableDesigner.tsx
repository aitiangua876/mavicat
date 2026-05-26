import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Copy,
  Database,
  KeyRound,
  Link2,
  ListTree,
  Loader2,
  Plus,
  RefreshCw,
  Table2,
  Trash2,
  Zap,
} from "lucide-react";
import { ModifyColumnModal } from "../modals/ModifyColumnModal";
import { CreateIndexModal } from "../modals/CreateIndexModal";
import { CreateForeignKeyModal } from "../modals/CreateForeignKeyModal";
import type { ForeignKey, Index, TableColumn } from "../../types/schema";
import type { TriggerInfo } from "../../contexts/DatabaseContext";
import { toErrorMessage } from "../../utils/errors";

type DesignerTab = "fields" | "indexes" | "foreignKeys" | "triggers" | "preview";

interface TableDesignerProps {
  connectionId: string;
  tableName: string;
  driver: string;
  schema?: string;
}

interface GroupedIndex {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

const normalizeIndexes = (indexes: Index[]): GroupedIndex[] => {
  const grouped = new Map<string, GroupedIndex>();

  indexes.forEach((index) => {
    const current = grouped.get(index.name);
    if (current) {
      current.columns.push(index.column_name);
      current.isUnique = current.isUnique || index.is_unique;
      current.isPrimary = current.isPrimary || index.is_primary;
      return;
    }

    grouped.set(index.name, {
      name: index.name,
      columns: [index.column_name],
      isUnique: index.is_unique,
      isPrimary: index.is_primary,
    });
  });

  return Array.from(grouped.values());
};

export const TableDesigner = ({
  connectionId,
  tableName,
  driver,
  schema,
}: TableDesignerProps) => {
  const [activeTab, setActiveTab] = useState<DesignerTab>("fields");
  const [columns, setColumns] = useState<TableColumn[]>([]);
  const [indexes, setIndexes] = useState<Index[]>([]);
  const [foreignKeys, setForeignKeys] = useState<ForeignKey[]>([]);
  const [triggers, setTriggers] = useState<TriggerInfo[]>([]);
  const [ddl, setDdl] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [columnModal, setColumnModal] = useState<{
    isOpen: boolean;
    column: TableColumn | null;
  }>({ isOpen: false, column: null });
  const [indexModalOpen, setIndexModalOpen] = useState(false);
  const [foreignKeyModalOpen, setForeignKeyModalOpen] = useState(false);

  const groupedIndexes = useMemo(() => normalizeIndexes(indexes), [indexes]);

  const loadDesignerData = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const [nextColumns, nextIndexes, nextForeignKeys, nextTriggers, nextDdl] =
        await Promise.all([
          invoke<TableColumn[]>("get_columns", {
            connectionId,
            tableName,
            ...(schema ? { schema } : {}),
          }),
          invoke<Index[]>("get_indexes", {
            connectionId,
            tableName,
            ...(schema ? { schema } : {}),
          }),
          invoke<ForeignKey[]>("get_foreign_keys", {
            connectionId,
            tableName,
            ...(schema ? { schema } : {}),
          }),
          invoke<TriggerInfo[]>("get_triggers", {
            connectionId,
            ...(schema ? { schema } : {}),
          }).catch(() => [] as TriggerInfo[]),
          invoke<string>("get_table_ddl", {
            connectionId,
            tableName,
            ...(schema ? { schema } : {}),
          }),
        ]);

      setColumns(nextColumns);
      setIndexes(nextIndexes);
      setForeignKeys(nextForeignKeys);
      setTriggers(nextTriggers.filter((trigger) => trigger.table_name === tableName));
      setDdl(nextDdl);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [connectionId, schema, tableName]);

  useEffect(() => {
    void loadDesignerData();
  }, [loadDesignerData]);

  const handleDropIndex = useCallback(
    async (indexName: string) => {
      const confirmed = await ask(`确认删除索引 "${indexName}"？`, {
        title: "删除索引",
        kind: "warning",
      });
      if (!confirmed) return;

      try {
        await invoke("drop_index_action", {
          connectionId,
          table: tableName,
          indexName,
          ...(schema ? { schema } : {}),
        });
        await loadDesignerData();
      } catch (err) {
        setError(toErrorMessage(err));
      }
    },
    [connectionId, loadDesignerData, schema, tableName],
  );

  const handleDropForeignKey = useCallback(
    async (foreignKeyName: string) => {
      const confirmed = await ask(`确认删除外键 "${foreignKeyName}"？`, {
        title: "删除外键",
        kind: "warning",
      });
      if (!confirmed) return;

      try {
        await invoke("drop_foreign_key_action", {
          connectionId,
          table: tableName,
          fkName: foreignKeyName,
          ...(schema ? { schema } : {}),
        });
        await loadDesignerData();
      } catch (err) {
        setError(toErrorMessage(err));
      }
    },
    [connectionId, loadDesignerData, schema, tableName],
  );

  const handleDropTrigger = useCallback(
    async (triggerName: string) => {
      const confirmed = await ask(`确认删除触发器 "${triggerName}"？`, {
        title: "删除触发器",
        kind: "warning",
      });
      if (!confirmed) return;

      try {
        await invoke("drop_trigger", {
          connectionId,
          triggerName,
          tableName,
          ...(schema ? { schema } : {}),
        });
        await loadDesignerData();
      } catch (err) {
        setError(toErrorMessage(err));
      }
    },
    [connectionId, loadDesignerData, schema, tableName],
  );

  const handleCopyDdl = useCallback(async () => {
    if (!ddl.trim()) {
      setCopyStatus("没有可复制的 SQL");
      return;
    }

    try {
      await navigator.clipboard.writeText(ddl);
      setCopyStatus("已复制 SQL");
    } catch {
      setCopyStatus("复制失败，请手动选择 SQL");
    }
  }, [ddl]);

  const tabs: Array<{ id: DesignerTab; label: string }> = [
    { id: "fields", label: "字段" },
    { id: "indexes", label: "索引" },
    { id: "foreignKeys", label: "外键" },
    { id: "triggers", label: "触发器" },
    { id: "preview", label: "SQL 预览" },
  ];

  return (
    <div className="flex flex-col h-full bg-base text-primary">
      <div className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-default bg-surface-primary">
        <button
          onClick={() => setColumnModal({ isOpen: true, column: null })}
          className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-secondary rounded hover:bg-surface-hover hover:text-primary"
          title="添加字段"
        >
          <Plus size={16} className="text-green-400" />
          添加字段
        </button>
        <button
          onClick={() => setIndexModalOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-secondary rounded hover:bg-surface-hover hover:text-primary"
          title="添加索引"
        >
          <ListTree size={16} className="text-sky-400" />
          添加索引
        </button>
        <button
          onClick={() => setForeignKeyModalOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-secondary rounded hover:bg-surface-hover hover:text-primary"
          title="添加外键"
        >
          <Link2 size={16} className="text-violet-300" />
          添加外键
        </button>
        <button
          onClick={() => void loadDesignerData()}
          className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-secondary rounded hover:bg-surface-hover hover:text-primary"
          title="刷新"
        >
          <RefreshCw size={16} />
          刷新
        </button>
        <div className="ml-auto flex items-center gap-2 min-w-0 text-sm text-secondary">
          <Table2 size={17} className="text-sky-300 shrink-0" />
          <span className="truncate">
            {schema ? `${schema}.` : ""}
            {tableName}
          </span>
        </div>
      </div>

      <div className="h-8 shrink-0 flex items-center border-b border-default bg-surface-secondary">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`h-full px-4 text-sm border-r border-default ${
              activeTab === tab.id
                ? "bg-base text-primary"
                : "text-muted hover:text-primary hover:bg-surface-tertiary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-3 py-2 text-sm text-red-300 bg-red-950/30 border-b border-red-900/40">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <div className="h-full flex items-center justify-center gap-2 text-muted">
            <Loader2 size={18} className="animate-spin" />
            加载表结构...
          </div>
        ) : activeTab === "fields" ? (
          <div className="min-w-[1120px]">
            <div className="grid grid-cols-[240px_160px_90px_90px_90px_110px_180px_1fr_88px] h-9 items-center text-sm font-medium text-secondary bg-surface-secondary border-b border-default">
              <div className="px-3 border-r border-default">名称</div>
              <div className="px-3 border-r border-default">类型</div>
              <div className="px-3 border-r border-default">长度</div>
              <div className="px-3 border-r border-default">不是 null</div>
              <div className="px-3 border-r border-default">自增</div>
              <div className="px-3 border-r border-default">键</div>
              <div className="px-3 border-r border-default">默认值</div>
              <div className="px-3 border-r border-default">注释</div>
              <div className="px-3">操作</div>
            </div>
            {columns.map((column) => (
              <div
                key={column.name}
                className="grid grid-cols-[240px_160px_90px_90px_90px_110px_180px_1fr_88px] min-h-8 items-center text-sm border-b border-default hover:bg-surface-secondary/50"
              >
                <button
                  onDoubleClick={() => setColumnModal({ isOpen: true, column })}
                  className="px-3 py-1.5 text-left truncate border-r border-default text-primary"
                  title={
                    column.comment
                      ? `${column.name}: ${column.comment}`
                      : "双击编辑字段"
                  }
                >
                  {column.name}
                </button>
                <div className="px-3 py-1.5 truncate border-r border-default text-secondary">
                  {column.data_type}
                </div>
                <div className="px-3 py-1.5 truncate border-r border-default text-secondary">
                  {column.character_maximum_length ?? ""}
                </div>
                <div className="px-3 py-1.5 border-r border-default">
                  {column.is_nullable ? (
                    ""
                  ) : (
                    <Check size={16} className="text-blue-300" />
                  )}
                </div>
                <div className="px-3 py-1.5 border-r border-default">
                  {column.is_auto_increment ? (
                    <Check size={16} className="text-blue-300" />
                  ) : (
                    ""
                  )}
                </div>
                <div className="px-3 py-1.5 border-r border-default text-amber-300">
                  {column.is_pk ? (
                    <span className="inline-flex items-center gap-1">
                      <KeyRound size={15} />
                      主键
                    </span>
                  ) : ""}
                </div>
                <div className="px-3 py-1.5 truncate border-r border-default text-secondary">
                  {"default_value" in column
                    ? String(column.default_value ?? "")
                    : ""}
                </div>
                <div
                  className="px-3 py-1.5 truncate border-r border-default text-secondary"
                  title={column.comment ?? ""}
                >
                  {column.comment ?? ""}
                </div>
                <div className="px-2 py-1">
                  <button
                    onClick={() => setColumnModal({ isOpen: true, column })}
                    className="px-2 py-1 rounded text-xs text-secondary hover:text-primary hover:bg-surface-secondary"
                  >
                    编辑
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : activeTab === "foreignKeys" ? (
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-[260px_190px_1fr_160px_140px_140px_90px] h-9 items-center text-sm font-medium text-secondary bg-surface-secondary border-b border-default">
              <div className="px-3 border-r border-default">名称</div>
              <div className="px-3 border-r border-default">字段</div>
              <div className="px-3 border-r border-default">引用表</div>
              <div className="px-3 border-r border-default">引用字段</div>
              <div className="px-3 border-r border-default">删除时</div>
              <div className="px-3 border-r border-default">更新时</div>
              <div className="px-3">操作</div>
            </div>
            {foreignKeys.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted">
                未找到外键
              </div>
            ) : (
              foreignKeys.map((foreignKey) => (
                <div
                  key={`${foreignKey.name}:${foreignKey.column_name}:${foreignKey.ref_table}:${foreignKey.ref_column}`}
                  className="grid grid-cols-[260px_190px_1fr_160px_140px_140px_90px] min-h-9 items-center text-sm border-b border-default hover:bg-surface-secondary/50"
                >
                  <div className="px-3 py-1.5 truncate border-r border-default text-primary">
                    {foreignKey.name}
                  </div>
                  <div className="px-3 py-1.5 truncate border-r border-default text-secondary">
                    {foreignKey.column_name}
                  </div>
                  <div className="px-3 py-1.5 truncate border-r border-default text-secondary">
                    {foreignKey.ref_table}
                  </div>
                  <div className="px-3 py-1.5 truncate border-r border-default text-secondary">
                    {foreignKey.ref_column}
                  </div>
                  <div className="px-3 py-1.5 truncate border-r border-default text-secondary">
                    {foreignKey.on_delete ?? "-"}
                  </div>
                  <div className="px-3 py-1.5 truncate border-r border-default text-secondary">
                    {foreignKey.on_update ?? "-"}
                  </div>
                  <div className="px-2 py-1">
                    <button
                      onClick={() => void handleDropForeignKey(foreignKey.name)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-300 hover:bg-red-950/40"
                    >
                      <Trash2 size={13} />
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : activeTab === "triggers" ? (
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[260px_140px_140px_1fr_90px] h-9 items-center text-sm font-medium text-secondary bg-surface-secondary border-b border-default">
              <div className="px-3 border-r border-default">名称</div>
              <div className="px-3 border-r border-default">时机</div>
              <div className="px-3 border-r border-default">事件</div>
              <div className="px-3 border-r border-default">定义</div>
              <div className="px-3">操作</div>
            </div>
            {triggers.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted">
                未找到触发器
              </div>
            ) : (
              triggers.map((trigger) => (
                <div
                  key={trigger.name}
                  className="grid grid-cols-[260px_140px_140px_1fr_90px] min-h-9 items-center text-sm border-b border-default hover:bg-surface-secondary/50"
                >
                  <div className="px-3 py-1.5 truncate border-r border-default text-primary">
                    {trigger.name}
                  </div>
                  <div className="px-3 py-1.5 truncate border-r border-default text-secondary">
                    {trigger.timing}
                  </div>
                  <div className="px-3 py-1.5 truncate border-r border-default text-secondary">
                    {trigger.event}
                  </div>
                  <div
                    className="px-3 py-1.5 truncate border-r border-default text-secondary"
                    title={trigger.definition ?? ""}
                  >
                    {trigger.definition ?? "-"}
                  </div>
                  <div className="px-2 py-1">
                    <button
                      onClick={() => void handleDropTrigger(trigger.name)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-300 hover:bg-red-950/40"
                    >
                      <Zap size={13} />
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : activeTab === "indexes" ? (
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[260px_1fr_120px_100px_100px] h-9 items-center text-sm font-medium text-secondary bg-surface-secondary border-b border-default">
              <div className="px-3 border-r border-default">名称</div>
              <div className="px-3 border-r border-default">字段</div>
              <div className="px-3 border-r border-default">唯一</div>
              <div className="px-3 border-r border-default">主键</div>
              <div className="px-3">操作</div>
            </div>
            {groupedIndexes.map((index) => (
              <div
                key={index.name}
                className="grid grid-cols-[260px_1fr_120px_100px_100px] min-h-9 items-center text-sm border-b border-default hover:bg-surface-secondary/50"
              >
                <div className="px-3 py-1.5 truncate border-r border-default text-primary">
                  {index.name}
                </div>
                <div className="px-3 py-1.5 truncate border-r border-default text-secondary">
                  {index.columns.join(", ")}
                </div>
                <div className="px-3 py-1.5 border-r border-default">
                  {index.isUnique ? <Check size={16} className="text-blue-300" /> : ""}
                </div>
                <div className="px-3 py-1.5 border-r border-default">
                  {index.isPrimary ? <KeyRound size={15} className="text-amber-300" /> : ""}
                </div>
                <div className="px-2 py-1">
                  {!index.isPrimary && (
                    <button
                      onClick={() => void handleDropIndex(index.name)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-300 hover:bg-red-950/40"
                    >
                      <Trash2 size={13} />
                      删除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full p-3 flex flex-col gap-2">
            <div className="shrink-0 flex items-center justify-end gap-3">
              {copyStatus && (
                <span className="text-xs text-muted">{copyStatus}</span>
              )}
              <button
                onClick={() => void handleCopyDdl()}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-default bg-surface-secondary px-3 text-sm text-secondary hover:bg-surface-tertiary hover:text-primary"
              >
                <Copy size={15} />
                复制 SQL
              </button>
            </div>
            <pre className="h-full overflow-auto rounded border border-default bg-input p-4 text-sm leading-6 text-secondary">
              {ddl || "-- 无建表语句"}
            </pre>
          </div>
        )}
      </div>

      <div className="shrink-0 min-h-[88px] border-t border-default bg-surface-secondary p-3 text-sm text-secondary">
        <div className="flex items-center gap-2 mb-2 text-primary">
          <Database size={16} className="text-blue-300" />
          表设计
        </div>
        <div className="text-muted">
          当前版本支持字段、索引、外键、触发器和 SQL 预览；添加/编辑字段、索引和外键前会展示 SQL 或确认弹窗，执行后自动刷新结构。
        </div>
      </div>

      <ModifyColumnModal
        isOpen={columnModal.isOpen}
        onClose={() => setColumnModal({ isOpen: false, column: null })}
        onSuccess={() => void loadDesignerData()}
        connectionId={connectionId}
        tableName={tableName}
        driver={driver}
        column={columnModal.column}
        schema={schema}
      />
      <CreateIndexModal
        isOpen={indexModalOpen}
        onClose={() => setIndexModalOpen(false)}
        onSuccess={() => void loadDesignerData()}
        connectionId={connectionId}
        tableName={tableName}
        driver={driver}
        schema={schema}
      />
      <CreateForeignKeyModal
        isOpen={foreignKeyModalOpen}
        onClose={() => setForeignKeyModalOpen(false)}
        onSuccess={() => void loadDesignerData()}
        connectionId={connectionId}
        tableName={tableName}
        driver={driver}
      />
    </div>
  );
};

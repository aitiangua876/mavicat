import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  Loader2,
  Folder,
  Link as LinkIcon,
  Key,
  List,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import { SidebarColumnItem } from "./SidebarColumnItem";
import { dragState } from "../../../utils/dragState";
import type { TableColumn, ForeignKey, Index } from "../../../types/schema";
import type { ContextMenuData } from "../../../types/sidebar";
import { NavicatTableIcon } from "../../icons/NavicatStyleIcons";

interface SidebarTableItemProps {
  table: { name: string; comment?: string | null };
  activeTable: string | null;
  onTableClick: (name: string) => void;
  onTableDoubleClick: (name: string) => void;
  onContextMenu: (
    e: React.MouseEvent,
    type: string,
    id: string,
    label: string,
    data?: ContextMenuData,
  ) => void;
  connectionId: string;
  driver: string;
  onAddColumn: (tableName: string) => void;
  onEditColumn: (tableName: string, col: TableColumn) => void;
  onAddIndex: (tableName: string) => void;
  onDropIndex: (tableName: string, indexName: string) => void;
  onAddForeignKey: (tableName: string) => void;
  onDropForeignKey: (tableName: string, fkName: string) => void;
  schemaVersion: number;
  schema?: string;
  canManage?: boolean;
}

export const SidebarTableItem = ({
  table,
  activeTable,
  onTableClick,
  onTableDoubleClick,
  onContextMenu,
  connectionId,
  driver,
  canManage,
  onAddColumn,
  onEditColumn,
  onAddIndex,
  onDropIndex,
  onAddForeignKey,
  onDropForeignKey,
  schemaVersion,
  schema,
}: SidebarTableItemProps) => {
  const { t } = useTranslation();
  // Prevent unused variable warning
  void onAddColumn;
  void onAddIndex;
  void onDropIndex;
  void onAddForeignKey;
  void onDropForeignKey;

  const [isExpanded, setIsExpanded] = useState(false);
  const [columns, setColumns] = useState<TableColumn[]>([]);
  const [foreignKeys, setForeignKeys] = useState<ForeignKey[]>([]);
  const [indexes, setIndexes] = useState<Index[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshMetadata = React.useCallback(async () => {
    if (!connectionId) return;
    setIsLoading(true);
    try {
      // Parallel fetch for speed
      const [cols, fks, idxs] = await Promise.all([
        invoke<TableColumn[]>("get_columns", {
          connectionId,
          tableName: table.name,
          ...(schema ? { schema } : {}),
        }),
        invoke<ForeignKey[]>("get_foreign_keys", {
          connectionId,
          tableName: table.name,
          ...(schema ? { schema } : {}),
        }),
        invoke<Index[]>("get_indexes", {
          connectionId,
          tableName: table.name,
          ...(schema ? { schema } : {}),
        }),
      ]);

      setColumns(cols);
      setForeignKeys(fks);
      setIndexes(idxs);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [connectionId, table.name, schema]);

  useEffect(() => {
    if (isExpanded) {
      refreshMetadata();
    }
  }, [isExpanded, schemaVersion, refreshMetadata]); // Re-fetch when schema version bumps

  // Sub-expansion states
  const [expandColumns, setExpandColumns] = useState(true);
  const [expandKeys, setExpandKeys] = useState(false);
  const [expandIndexes, setExpandIndexes] = useState(false);

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  const handleContextMenu = (e: React.MouseEvent, type: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, type, name, name, { tableName: table.name, schema });
  };

  // Group indexes by name since API returns one row per column
  const groupedIndexes = React.useMemo(() => {
    const groups: Record<string, Index & { columns: string[] }> = {};
    indexes.forEach((idx) => {
      if (!groups[idx.name]) {
        groups[idx.name] = { ...idx, columns: [] };
      }
      groups[idx.name].columns.push(idx.column_name);
    });
    return Object.values(groups);
  }, [indexes]);

  const keys = groupedIndexes.filter((i) => i.is_primary || i.is_unique);
  const indexesList = groupedIndexes;
  const tableComment = table.comment?.trim();
  const tableTitle = tableComment
    ? `${table.name}\n\n注释：${tableComment}`
    : table.name;

  return (
    <div className="flex flex-col">
      <div
        onPointerDown={(e) => {
          dragState.start(table.name);
          const ghost = document.createElement('div');
          ghost.id = '__drag-ghost__';
          ghost.textContent = table.name;
          ghost.style.cssText = 'position:fixed;pointer-events:none;background:#1e40af;color:#fff;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:500;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
          ghost.style.left = e.clientX + 12 + 'px';
          ghost.style.top = e.clientY + 12 + 'px';
          document.body.appendChild(ghost);
          const move = (ev: PointerEvent) => {
            ghost.style.left = ev.clientX + 12 + 'px';
            ghost.style.top = ev.clientY + 12 + 'px';
          };
          const up = () => {
            ghost.remove();
            dragState.clear();
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
          };
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
        }}
        onClick={() => onTableClick(table.name)}
        onDoubleClick={() => onTableDoubleClick(table.name)}
        onContextMenu={(e) => handleContextMenu(e, "table", table.name)}
        title={tableTitle}
        className={clsx(
          "flex items-center gap-1.5 pl-1 pr-3 py-1 text-[15px] font-semibold cursor-pointer group select-none transition-colors border-l-2",
          activeTable === table.name
            ? "bg-[#1f3f7f] text-[#f3f8ff] border-[#4aa3ff] shadow-[inset_0_0_0_1px_rgba(96,165,250,0.14)]"
            : "text-[#d7e2f0] border-transparent hover:bg-[#303842] hover:text-white",
        )}
      >
        <button
          onClick={handleExpand}
          className={clsx(
            "p-0.5 rounded transition-colors",
            activeTable === table.name
              ? "text-[#dbeafe] hover:bg-white/10"
              : "text-[#8fa6c3] hover:bg-white/10 hover:text-[#dcecff]",
          )}
        >
          {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
        </button>
        <NavicatTableIcon size={18} className="shrink-0" />
        <span
          className={clsx(
            "truncate flex-1 decoration-dotted underline-offset-4",
            tableComment && "group-hover:underline",
          )}
        >
          {table.name}
        </span>
      </div>
      {isExpanded && (
        <div className="ml-[24px] border-l border-default">
          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" />
              {t("sidebar.loadingSchema")}
            </div>
          ) : (
            <>
              {/* Columns Folder */}
              <div className="flex flex-col">
                <div
                  className="flex items-center gap-2 px-2 py-1 text-sm text-muted hover:text-secondary cursor-pointer select-none"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandColumns(!expandColumns);
                  }}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                >
                  <Folder size={15} className="text-blue-400/70" />
                  <span>{t("sidebar.columns")}</span>
                  <span className="ml-auto text-xs opacity-50">
                    {columns.length}
                  </span>
                </div>
                {expandColumns && (
                  <div className="ml-4 border-l border-default/50">
                    {columns.map((col) => (
                      <SidebarColumnItem
                        key={col.name}
                        column={col}
                        tableName={table.name}
                        connectionId={connectionId}
                        driver={driver}
                        canManage={canManage}
                        onRefresh={refreshMetadata}
                        onEdit={(c) => onEditColumn(table.name, c)}
                        schema={schema}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Keys Folder (PK/Unique) */}
              {keys.length > 0 && (
                <div className="flex flex-col">
                  <div
                    className="flex items-center gap-2 px-2 py-1 text-sm text-muted hover:text-secondary cursor-pointer select-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandKeys(!expandKeys);
                    }}
                  >
                    <Folder size={15} className="text-yellow-500/70" />
                    <span>{t("sidebar.keys")}</span>
                    <span className="ml-auto text-xs opacity-50">
                      {keys.length}
                    </span>
                  </div>
                  {expandKeys && (
                    <div className="ml-4 border-l border-default/50">
                      {keys.map((k) => (
                        <div
                          key={k.name}
                          className="flex items-center gap-2 px-3 py-1 text-sm text-secondary hover:bg-surface-secondary hover:text-primary cursor-pointer group font-mono"
                          title={k.columns.join(", ")}
                          onContextMenu={canManage !== false ? (e) => {
                            handleContextMenu(e, "index", k.name);
                          } : undefined}
                        >
                          <Key
                            size={15}
                            className={
                              k.is_primary ? "text-yellow-500" : "text-secondary"
                            }
                          />
                          <span className="truncate flex-1 min-w-0">{k.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Foreign Keys Folder */}
              <div className="flex flex-col">
                <div
                  className="flex items-center gap-2 px-2 py-1 text-sm text-muted hover:text-secondary cursor-pointer select-none"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onContextMenu={canManage !== false ? (e) =>
                    handleContextMenu(e, "folder_fks", "foreign keys")
                  : undefined}
                >
                  <Folder size={15} className="text-purple-400/70" />
                  <span>{t("sidebar.foreignKeys")}</span>
                  <span className="ml-auto text-xs opacity-50">
                    {foreignKeys.length}
                  </span>
                </div>
                <div className="ml-4 border-l border-default/50">
                  {foreignKeys.map((fk) => (
                    <div
                      key={fk.name}
                      className="flex items-center gap-2 px-3 py-1 text-sm text-secondary hover:bg-surface-secondary hover:text-primary cursor-pointer group font-mono"
                      title={`${fk.column_name} -> ${fk.ref_table}.${fk.ref_column}`}
                      onContextMenu={canManage !== false ? (e) =>
                        handleContextMenu(e, "foreign_key", fk.name)
                      : undefined}
                    >
                      <LinkIcon size={15} className="text-purple-400 shrink-0" />
                      <span className="truncate flex-1 min-w-0">{fk.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Indexes Folder */}
              <div className="flex flex-col">
                <div
                  className="flex items-center gap-2 px-2 py-1 text-sm text-muted hover:text-secondary cursor-pointer select-none"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandIndexes(!expandIndexes);
                  }}
                  onContextMenu={canManage !== false ? (e) =>
                    handleContextMenu(e, "folder_indexes", "indexes")
                  : undefined}
                >
                  <Folder size={15} className="text-green-400/70" />
                  <span>{t("sidebar.indexes")}</span>
                  <span className="ml-auto text-xs opacity-50">
                    {indexesList.length}
                  </span>
                </div>
                {expandIndexes && (
                  <div className="ml-4 border-l border-default/50">
                    {indexesList.map((idx) => (
                      <div
                        key={idx.name}
                        className="flex items-center gap-2 px-3 py-1 text-sm text-secondary hover:bg-surface-secondary hover:text-primary cursor-pointer group font-mono"
                        title={idx.columns.join(", ")}
                        onContextMenu={canManage !== false ? (e) =>
                          handleContextMenu(e, "index", idx.name)
                        : undefined}
                      >
                        <List
                          size={15}
                          className={
                            idx.is_unique ? "text-blue-400" : "text-green-400"
                          }
                        />
                        <span className="truncate flex-1">
                          {idx.name}{" "}
                          <span className="text-muted">
                            ({idx.columns.join(", ")})
                          </span>
                        </span>
                        {idx.is_unique && (
                          <span className="text-[9px] text-muted border border-strong px-1 rounded bg-elevated/50">
                            UNIQUE
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

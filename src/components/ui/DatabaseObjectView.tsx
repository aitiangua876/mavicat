import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clipboard,
  ClipboardPaste,
  Copy,
  Database,
  FileCode,
  Grid2X2,
  List,
  PenTool,
  Search,
  Table2,
} from "lucide-react";
import type { TableInfo, ViewInfo } from "../../contexts/DatabaseContext";
import type { CopiedTableSet } from "../../types/tableClipboard";
import { NavicatDatabaseIcon } from "../icons/NavicatStyleIcons";

type ObjectViewMode = "list" | "icons";

interface DatabaseObjectViewProps {
  connectionId: string;
  connectionName?: string | null;
  databaseName: string;
  tables: TableInfo[];
  views?: ViewInfo[];
  copiedTables: CopiedTableSet | null;
  isLoading?: boolean;
  onCopyTables: (payload: CopiedTableSet) => void;
  onPasteTables: (targetDatabase: string) => void;
  onOpenTable: (tableName: string, databaseName: string) => void;
  onDesignTable: (tableName: string, databaseName: string) => void;
}

export function DatabaseObjectView({
  connectionId,
  connectionName,
  databaseName,
  tables,
  views = [],
  copiedTables,
  isLoading = false,
  onCopyTables,
  onPasteTables,
  onOpenTable,
  onDesignTable,
}: DatabaseObjectViewProps) {
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [viewMode, setViewMode] = useState<ObjectViewMode>("list");
  const [dragState, setDragState] = useState<{
    anchorIndex: number;
    baseSelection: Set<string>;
    additive: boolean;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragMovedRef = useRef(false);

  const filteredTables = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return tables;
    return tables.filter((table) => table.name.toLowerCase().includes(keyword));
  }, [filter, tables]);

  const selectedTables = useMemo(
    () => tables.filter((table) => selectedNames.has(table.name)),
    [selectedNames, tables],
  );
  const selectedCount = selectedTables.length;
  const allFilteredSelected =
    filteredTables.length > 0 &&
    filteredTables.every((table) => selectedNames.has(table.name));
  const canPaste = !!copiedTables && copiedTables.tables.length > 0;
  const copiedDuplicateCount = copiedTables
    ? copiedTables.tables.filter((name) =>
        tables.some((table) => table.name === name),
      ).length
    : 0;

  useEffect(() => {
    setSelectedNames((current) => {
      const available = new Set(tables.map((table) => table.name));
      const next = new Set(
        Array.from(current).filter((name) => available.has(name)),
      );
      return next.size === current.size ? current : next;
    });
  }, [tables]);

  const selectRange = useCallback(
    (fromIndex: number, toIndex: number, baseSelection = new Set<string>()) => {
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);
      const next = new Set(baseSelection);
      filteredTables.slice(start, end + 1).forEach((table) => {
        next.add(table.name);
      });
      setSelectedNames(next);
    },
    [filteredTables],
  );

  const handleObjectClick = useCallback(
    (tableName: string, index: number, event: React.MouseEvent) => {
      rootRef.current?.focus();
      if (dragMovedRef.current) {
        dragMovedRef.current = false;
        return;
      }
      if (event.shiftKey && filteredTables.length > 0) {
        const selectedIndexes = filteredTables
          .map((table, tableIndex) =>
            selectedNames.has(table.name) ? tableIndex : -1,
          )
          .filter((tableIndex) => tableIndex >= 0);
        const anchorIndex = selectedIndexes.at(-1) ?? index;
        selectRange(anchorIndex, index);
        return;
      }

      if (event.metaKey || event.ctrlKey) {
        setSelectedNames((prev) => {
          const next = new Set(prev);
          if (next.has(tableName)) {
            next.delete(tableName);
          } else {
            next.add(tableName);
          }
          return next;
        });
        return;
      }

      setSelectedNames(new Set([tableName]));
    },
    [filteredTables, selectRange, selectedNames],
  );

  const startDragSelection = useCallback(
    (index: number, event: React.MouseEvent) => {
      if (event.button !== 0) return;
      rootRef.current?.focus();
      const table = filteredTables[index];
      if (!table) return;

      const additive = event.metaKey || event.ctrlKey;
      const baseSelection = additive ? new Set(selectedNames) : new Set<string>();
      dragMovedRef.current = false;
      setDragState({ anchorIndex: index, baseSelection, additive });
      selectRange(index, index, baseSelection);
    },
    [filteredTables, selectRange, selectedNames],
  );

  const extendDragSelection = useCallback(
    (index: number) => {
      if (!dragState) return;
      if (index !== dragState.anchorIndex) {
        dragMovedRef.current = true;
      }
      selectRange(
        dragState.anchorIndex,
        index,
        dragState.additive ? dragState.baseSelection : new Set<string>(),
      );
    },
    [dragState, selectRange],
  );

  const finishDragSelection = useCallback(() => {
    setDragState(null);
  }, []);

  const toggleAllFiltered = () => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredTables.forEach((table) => next.delete(table.name));
      } else {
        filteredTables.forEach((table) => next.add(table.name));
      }
      return next;
    });
  };

  const copySelectedTables = useCallback(() => {
    if (selectedTables.length === 0) return;
    onCopyTables({
      sourceConnectionId: connectionId,
      sourceConnectionName: connectionName,
      sourceDatabase: databaseName,
      tables: selectedTables.map((table) => table.name),
      copiedAt: Date.now(),
    });
  }, [
    connectionId,
    connectionName,
    databaseName,
    onCopyTables,
    selectedTables,
  ]);

  const handlePasteTables = useCallback(() => {
    if (!canPaste) return;
    onPasteTables(databaseName);
  }, [canPaste, databaseName, onPasteTables]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping || !(event.ctrlKey || event.metaKey)) return;

      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        copySelectedTables();
      }
      if (key === "v") {
        event.preventDefault();
        handlePasteTables();
      }
      if (key === "a") {
        event.preventDefault();
        setSelectedNames(new Set(filteredTables.map((table) => table.name)));
      }
    },
    [copySelectedTables, filteredTables, handlePasteTables],
  );

  const renderConflictBadge = (tableName: string) =>
    copiedTables?.tables.includes(tableName) ? (
      <span className="rounded-full border border-amber-700/50 bg-amber-600/15 px-2 py-0.5 text-[11px] text-amber-200">
        同名
      </span>
    ) : null;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseUp={finishDragSelection}
      onMouseLeave={finishDragSelection}
      className="h-full min-h-0 flex flex-col bg-base text-primary outline-none"
    >
      <div className="shrink-0 border-b border-default bg-elevated px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-surface-secondary border border-default flex items-center justify-center">
              <NavicatDatabaseIcon size={25} active />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold truncate">
                {databaseName}
              </div>
              <div className="text-xs text-muted truncate">
                {connectionName || "当前连接"} · {tables.length} 表 / {views.length} 视图
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={copySelectedTables}
              disabled={selectedCount === 0}
              className="inline-flex items-center gap-2 h-9 px-3 rounded border border-strong bg-surface-secondary text-sm text-primary hover:bg-blue-500/15 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Copy size={15} />
              复制表
              {selectedCount > 0 && (
                <span className="rounded-full bg-blue-500/20 px-1.5 text-xs text-blue-200">
                  {selectedCount}
                </span>
              )}
            </button>
            <button
              onClick={handlePasteTables}
              disabled={!canPaste}
              className="inline-flex items-center gap-2 h-9 px-3 rounded border border-emerald-700/50 bg-emerald-600/15 text-sm text-emerald-200 hover:bg-emerald-600/25 disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                copiedDuplicateCount > 0
                  ? "目标库存在同名表，将打开数据迁移向导"
                  : "粘贴复制的表"
              }
            >
              <ClipboardPaste size={15} />
              粘贴到此库
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label className="relative flex-1 max-w-md">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="搜索表..."
              className="w-full h-9 rounded border border-strong bg-base pl-9 pr-3 text-sm outline-none focus:border-blue-500"
            />
          </label>
          <div className="inline-flex h-9 rounded border border-default bg-base overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`w-9 inline-flex items-center justify-center border-r border-default ${
                viewMode === "list"
                  ? "bg-blue-500/20 text-blue-200"
                  : "text-secondary hover:bg-surface-secondary hover:text-primary"
              }`}
              title="列表视图"
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("icons")}
              className={`w-9 inline-flex items-center justify-center ${
                viewMode === "icons"
                  ? "bg-blue-500/20 text-blue-200"
                  : "text-secondary hover:bg-surface-secondary hover:text-primary"
              }`}
              title="图标视图"
            >
              <Grid2X2 size={16} />
            </button>
          </div>
          {copiedTables && (
            <div className="flex items-center gap-2 rounded border border-default bg-base px-3 py-2 text-xs text-secondary">
              <Clipboard size={14} className="text-emerald-300" />
              已复制 {copiedTables.tables.length} 张表，来源：
              <span className="font-medium text-primary">
                {copiedTables.sourceDatabase}
              </span>
              {copiedDuplicateCount > 0 && (
                <span className="text-amber-300">
                  · {copiedDuplicateCount} 张同名
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {viewMode === "list" ? (
          <table className="w-full text-left border-collapse select-none">
            <thead className="sticky top-0 z-10 bg-base shadow-sm">
              <tr className="border-b border-default">
                <th className="w-11 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAllFiltered}
                    className="accent-blue-500"
                    aria-label="选择全部表"
                  />
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-muted uppercase">
                  对象名
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-muted uppercase">
                  类型
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-muted uppercase">
                  注释
                </th>
                <th className="w-48 px-3 py-2 text-xs font-semibold text-muted uppercase text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    正在加载对象...
                  </td>
                </tr>
              ) : filteredTables.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    未找到表对象
                  </td>
                </tr>
              ) : (
                filteredTables.map((table, index) => {
                  const selected = selectedNames.has(table.name);
                  return (
                    <tr
                      key={table.name}
                      onMouseDown={(event) => startDragSelection(index, event)}
                      onMouseEnter={() => extendDragSelection(index)}
                      onClick={(event) => handleObjectClick(table.name, index, event)}
                      onDoubleClick={() => onOpenTable(table.name, databaseName)}
                      className={`border-b border-default cursor-pointer transition-colors ${
                        selected
                          ? "bg-blue-500/20"
                          : "hover:bg-surface-secondary/60"
                      }`}
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            event.stopPropagation();
                            setSelectedNames((current) => {
                              const next = new Set(current);
                              if (event.target.checked) {
                                next.add(table.name);
                              } else {
                                next.delete(table.name);
                              }
                              return next;
                            });
                          }}
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          className="accent-blue-500"
                          aria-label={`选择 ${table.name}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Table2 size={17} className="text-sky-300 shrink-0" />
                          <span className="font-mono text-sm font-medium text-primary truncate">
                            {table.name}
                          </span>
                          {renderConflictBadge(table.name)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-sm text-secondary">
                        BASE TABLE
                      </td>
                      <td className="px-3 py-2 text-sm text-muted">
                        {table.comment || "-"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenTable(table.name, databaseName);
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-secondary hover:bg-surface-secondary hover:text-primary"
                          >
                            <Database size={13} />
                            数据
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              onDesignTable(table.name, databaseName);
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-secondary hover:bg-surface-secondary hover:text-primary"
                          >
                            <PenTool size={13} />
                            设计
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          <div className="p-5 select-none">
            {isLoading ? (
              <div className="px-4 py-10 text-center text-muted">
                正在加载对象...
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="px-4 py-10 text-center text-muted">
                未找到表对象
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3">
                {filteredTables.map((table, index) => {
                  const selected = selectedNames.has(table.name);
                  return (
                    <button
                      key={table.name}
                      type="button"
                      onMouseDown={(event) => startDragSelection(index, event)}
                      onMouseEnter={() => extendDragSelection(index)}
                      onClick={(event) => handleObjectClick(table.name, index, event)}
                      onDoubleClick={() => onOpenTable(table.name, databaseName)}
                      className={`group min-h-[116px] rounded-md border p-3 text-left transition-colors ${
                        selected
                          ? "border-blue-400 bg-blue-500/20"
                          : "border-default bg-surface-secondary/40 hover:border-blue-500/50 hover:bg-surface-secondary"
                      }`}
                      title={table.comment ? `${table.name}: ${table.comment}` : table.name}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Table2
                          size={30}
                          className={selected ? "text-blue-200" : "text-sky-300"}
                        />
                        {renderConflictBadge(table.name)}
                      </div>
                      <div className="mt-3 font-mono text-sm font-semibold text-primary break-all line-clamp-2">
                        {table.name}
                      </div>
                      <div className="mt-1 text-xs text-muted truncate">
                        {table.comment || "BASE TABLE"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-default bg-elevated px-5 py-2 text-xs text-muted flex items-center gap-2">
        <FileCode size={13} />
        双击表打开数据页；拖动可多选，Ctrl/Cmd+C 复制，Ctrl/Cmd+V 粘贴。
      </div>
    </div>
  );
}

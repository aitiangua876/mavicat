import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clipboard,
  ClipboardPaste,
  Copy,
  FileCode,
  Grid2X2,
  List,
  Search,
  Table2,
} from "lucide-react";
import type { TableInfo, ViewInfo } from "../../contexts/DatabaseContext";
import type { CopiedTableSet } from "../../types/tableClipboard";
import { NavicatDatabaseIcon, NavicatTableIcon } from "../icons/NavicatStyleIcons";

type ObjectViewMode = "list" | "icons";

interface MarqueeSelectionState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  baseSelection: Set<string>;
  additive: boolean;
}

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
}: DatabaseObjectViewProps) {
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [viewMode, setViewMode] = useState<ObjectViewMode>("icons");
  const [marquee, setMarquee] = useState<MarqueeSelectionState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
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

  const setObjectRef = useCallback(
    (name: string, node: HTMLButtonElement | null) => {
      if (node) {
        itemRefs.current.set(name, node);
      } else {
        itemRefs.current.delete(name);
      }
    },
    [],
  );

  const updateMarqueeSelection = useCallback(
    (state: MarqueeSelectionState) => {
      const left = Math.min(state.startX, state.currentX);
      const right = Math.max(state.startX, state.currentX);
      const top = Math.min(state.startY, state.currentY);
      const bottom = Math.max(state.startY, state.currentY);

      const selectedInRect = filteredTables
        .filter((table) => {
          const node = itemRefs.current.get(table.name);
          if (!node) return false;
          const rect = node.getBoundingClientRect();
          return (
            rect.left <= right &&
            rect.right >= left &&
            rect.top <= bottom &&
            rect.bottom >= top
          );
        })
        .map((table) => table.name);

      const next = state.additive
        ? new Set(state.baseSelection)
        : new Set<string>();
      selectedInRect.forEach((name) => next.add(name));
      setSelectedNames(next);
    },
    [filteredTables],
  );

  const startMarqueeSelection = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "button, input, textarea, select, a, [data-object-item='true']",
        )
      ) {
        return;
      }

      rootRef.current?.focus();
      event.preventDefault();
      dragMovedRef.current = false;

      const next: MarqueeSelectionState = {
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        baseSelection:
          event.metaKey || event.ctrlKey ? new Set(selectedNames) : new Set(),
        additive: event.metaKey || event.ctrlKey,
      };
      setMarquee(next);
      updateMarqueeSelection(next);
    },
    [selectedNames, updateMarqueeSelection],
  );

  useEffect(() => {
    if (!marquee) return;

    const handleMouseMove = (event: MouseEvent) => {
      dragMovedRef.current = true;
      setMarquee((current) => {
        if (!current) return null;
        const next = {
          ...current,
          currentX: event.clientX,
          currentY: event.clientY,
        };
        updateMarqueeSelection(next);
        return next;
      });
    };

    const handleMouseUp = () => {
      setMarquee(null);
      window.setTimeout(() => {
        dragMovedRef.current = false;
      }, 0);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp, { once: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [marquee, updateMarqueeSelection]);

  const marqueeBox = useMemo(() => {
    if (!marquee) return null;
    return {
      left: Math.min(marquee.startX, marquee.currentX),
      top: Math.min(marquee.startY, marquee.currentY),
      width: Math.abs(marquee.currentX - marquee.startX),
      height: Math.abs(marquee.currentY - marquee.startY),
    };
  }, [marquee]);

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
      className="h-full min-h-0 flex flex-col bg-base text-primary outline-none"
    >
      {marqueeBox && (
        <div
          className="pointer-events-none fixed z-[9999] rounded border border-blue-400/80 bg-blue-500/15 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
          style={marqueeBox}
        />
      )}
      <div className="shrink-0 border-b border-default bg-elevated px-5 py-3">
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

        <div className="mt-3 flex items-center gap-3">
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

      <div
        className="min-h-0 flex-1 overflow-auto"
        onMouseDown={startMarqueeSelection}
      >
        {viewMode === "list" ? (
          <div className="select-none px-6 py-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-primary">表</span>
                <span className="text-muted">共 {filteredTables.length} 个</span>
                {selectedCount > 0 && (
                  <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-200">
                    已选 {selectedCount}
                  </span>
                )}
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-secondary">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAllFiltered}
                  className="accent-blue-500"
                  aria-label="选择全部表"
                />
                全选当前结果
              </label>
            </div>

            {isLoading ? (
              <div className="px-4 py-10 text-center text-muted">
                正在加载对象...
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="px-4 py-10 text-center text-muted">
                未找到表对象
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-10 gap-y-1.5">
                {filteredTables.map((table, index) => {
                  const selected = selectedNames.has(table.name);
                  const comment = table.comment?.trim();
                  return (
                    <button
                      key={table.name}
                      ref={(node) => setObjectRef(table.name, node)}
                      data-object-item="true"
                      type="button"
                      onClick={(event) => handleObjectClick(table.name, index, event)}
                      onDoubleClick={() => onOpenTable(table.name, databaseName)}
                      className={`group/object relative flex h-8 min-w-0 items-center gap-2 rounded px-2 text-left transition-colors ${
                        selected
                          ? "bg-blue-500/22 text-primary"
                          : "hover:bg-surface-secondary text-primary"
                      }`}
                    >
                      <Table2
                        size={18}
                        className={`shrink-0 ${
                          selected ? "text-blue-200" : "text-secondary"
                        }`}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">
                        {table.name}
                      </span>
                      <span className="shrink-0 opacity-0 transition-opacity group-hover/object:opacity-100">
                        {renderConflictBadge(table.name)}
                      </span>
                      <span className="pointer-events-none absolute left-9 top-8 z-30 hidden w-[340px] rounded-md border border-strong bg-elevated p-3 text-xs shadow-xl shadow-black/30 group-hover/object:block">
                        <span className="block truncate font-mono text-sm font-semibold text-primary">
                          {table.name}
                        </span>
                        <span className="mt-2 grid grid-cols-[56px_1fr] gap-x-2 gap-y-1 text-secondary">
                          <span className="text-muted">类型</span>
                          <span>BASE TABLE</span>
                          <span className="text-muted">数据库</span>
                          <span className="truncate">{databaseName}</span>
                          <span className="text-muted">备注</span>
                          <span className="line-clamp-4 whitespace-normal text-primary">
                            {comment || "无备注"}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="select-none px-6 py-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-primary">表</span>
                <span className="text-muted">共 {filteredTables.length} 个</span>
                {selectedCount > 0 && (
                  <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-200">
                    已选 {selectedCount}
                  </span>
                )}
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-secondary">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAllFiltered}
                  className="accent-blue-500"
                  aria-label="选择全部表"
                />
                全选当前结果
              </label>
            </div>
            {isLoading ? (
              <div className="px-4 py-10 text-center text-muted">
                正在加载对象...
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="px-4 py-10 text-center text-muted">
                未找到表对象
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(238px,1fr))] gap-x-10 gap-y-1.5">
                {filteredTables.map((table, index) => {
                  const selected = selectedNames.has(table.name);
                  const comment = table.comment?.trim();
                  return (
                    <button
                      key={table.name}
                      ref={(node) => setObjectRef(table.name, node)}
                      data-object-item="true"
                      type="button"
                      onClick={(event) => handleObjectClick(table.name, index, event)}
                      onDoubleClick={() => onOpenTable(table.name, databaseName)}
                      className={`group/object relative flex h-8 min-w-0 items-center gap-2 rounded px-2 text-left transition-colors ${
                        selected
                          ? "bg-blue-500/22 text-primary"
                          : "text-primary hover:bg-surface-secondary"
                      }`}
                      title={comment ? `${table.name}: ${comment}` : table.name}
                    >
                      <NavicatTableIcon
                        size={19}
                        className={`shrink-0 ${
                          selected ? "drop-shadow-[0_0_4px_rgba(96,165,250,0.35)]" : ""
                        }`}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">
                        {table.name}
                      </span>
                      <span className="shrink-0 opacity-0 transition-opacity group-hover/object:opacity-100">
                        {renderConflictBadge(table.name)}
                      </span>
                      <span className="pointer-events-none absolute left-8 top-8 z-30 hidden w-[340px] rounded-md border border-strong bg-elevated p-3 text-xs shadow-xl shadow-black/30 group-hover/object:block">
                        <span className="block truncate font-mono text-sm font-semibold text-primary">
                          {table.name}
                        </span>
                        <span className="mt-2 grid grid-cols-[56px_1fr] gap-x-2 gap-y-1 text-secondary">
                          <span className="text-muted">类型</span>
                          <span>BASE TABLE</span>
                          <span className="text-muted">数据库</span>
                          <span className="truncate">{databaseName}</span>
                          <span className="text-muted">备注</span>
                          <span className="line-clamp-4 whitespace-normal text-primary">
                            {comment || "无备注"}
                          </span>
                        </span>
                      </span>
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

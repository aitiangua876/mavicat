import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { ChevronDown, ChevronRight, Folder, KeyRound } from "lucide-react";
import clsx from "clsx";
import type { TableInfo } from "../../../contexts/DatabaseContext";
import type { ContextMenuData } from "../../../types/sidebar";

interface RedisKeyTreeProps {
  keys: TableInfo[];
  activeKey: string | null;
  search: string;
  onKeyClick: (key: string) => void;
  onKeyDoubleClick: (key: string) => void;
  onContextMenu: (
    event: MouseEvent,
    type: string,
    id: string,
    label: string,
    data?: ContextMenuData,
  ) => void;
}

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  key?: TableInfo;
}

function keyTypeFromComment(comment?: string | null) {
  return comment?.replace(/^Redis\s+/i, "") || "key";
}

function splitRedisKey(key: string) {
  const separator = key.includes(":") ? ":" : key.includes("/") ? "/" : ":";
  return key.split(separator).filter(Boolean);
}

function buildTree(keys: TableInfo[]) {
  const root: TreeNode = { name: "", path: "", children: new Map() };
  for (const key of keys) {
    const parts = splitRedisKey(key.name);
    let node = root;
    let path = "";
    parts.forEach((part, index) => {
      path = path ? `${path}:${part}` : part;
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path, children: new Map() });
      }
      node = node.children.get(part)!;
      if (index === parts.length - 1) {
        node.key = key;
        node.path = key.name;
      }
    });
  }
  return root;
}

function sortNodes(nodes: TreeNode[]) {
  return nodes.sort((a, b) => {
    if (!!a.key !== !!b.key) return a.key ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

export function RedisKeyTree({
  keys,
  activeKey,
  search,
  onKeyClick,
  onKeyDoubleClick,
  onContextMenu,
}: RedisKeyTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const query = search.trim().toLowerCase();

  const filteredKeys = useMemo(() => {
    if (!query) return keys;
    return keys.filter((key) => key.name.toLowerCase().startsWith(query));
  }, [keys, query]);

  const tree = useMemo(() => buildTree(filteredKeys), [filteredKeys]);

  const toggle = (path: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const children = sortNodes(Array.from(node.children.values()));
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(node.path) || !!query;
    const isKey = !!node.key;

    if (isKey && !hasChildren) {
      const type = keyTypeFromComment(node.key?.comment);
      return (
        <div
          key={node.path}
          onClick={() => onKeyClick(node.path)}
          onDoubleClick={() => onKeyDoubleClick(node.path)}
          onContextMenu={(event) =>
            onContextMenu(event, "table", node.path, node.path, { tableName: node.path })
          }
          title={`${node.path}\n类型：${type}`}
          className={clsx(
            "flex items-center gap-1.5 py-1 pr-2 text-[14px] font-medium cursor-pointer select-none border-l-2 transition-colors",
            activeKey === node.path
              ? "bg-accent-primary text-white border-focus"
              : "text-primary border-transparent hover:bg-surface-hover hover:text-primary",
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <span className="w-4" />
          <KeyRound size={15} className="text-red-400 shrink-0" />
          <span className="truncate flex-1">{node.name}</span>
          <span className="text-[10px] uppercase text-muted">{type}</span>
        </div>
      );
    }

    return (
      <div key={node.path || "root"}>
        {node.path && (
          <div
            onClick={() => toggle(node.path)}
            className="flex items-center gap-1.5 py-1 pr-2 text-[13px] font-semibold text-secondary hover:text-primary hover:bg-surface-hover cursor-pointer select-none"
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <Folder size={15} className="text-amber-300 shrink-0" />
            <span className="truncate flex-1">{node.name}</span>
            <span className="text-[10px] text-muted">{children.length}</span>
          </div>
        )}
        {(isExpanded || !node.path) &&
          children.map((child) => renderNode(child, node.path ? depth + 1 : depth))}
      </div>
    );
  };

  if (filteredKeys.length === 0) {
    return (
      <div className="text-center p-2 text-xs text-muted italic">
        {query ? "未找到匹配前缀的 Key" : "未找到 Key"}
      </div>
    );
  }

  return <div>{renderNode(tree, 0)}</div>;
}

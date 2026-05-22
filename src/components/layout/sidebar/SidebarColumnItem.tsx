import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { useAlert } from "../../../hooks/useAlert";
import { Key, Columns, Edit, Copy, Trash2 } from "lucide-react";
import clsx from "clsx";
import { ContextMenu } from "../../ui/ContextMenu";
import type { TableColumn } from "../../../types/schema";
import { quoteIdentifier, quoteTableRef } from "../../../utils/identifiers";

interface SidebarColumnItemProps {
  column: TableColumn;
  tableName: string;
  connectionId: string;
  driver: string;
  onRefresh: () => void;
  onEdit: (column: TableColumn) => void;
  isView?: boolean;
  schema?: string;
  canManage?: boolean;
}

export const SidebarColumnItem = ({
  column,
  tableName,
  connectionId,
  driver,
  onRefresh,
  onEdit,
  isView = false,
  schema,
  canManage,
}: SidebarColumnItemProps) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleDelete = async () => {
    const confirmed = await ask(
      t("sidebar.deleteColumnConfirm", {
        column: column.name,
        table: tableName,
      }),
      { title: t("sidebar.deleteColumn"), kind: "warning" },
    );

    if (confirmed) {
      try {
        const quotedTable = quoteTableRef(tableName, driver, schema);
        const quotedColumn = quoteIdentifier(column.name, driver);
        const query = `ALTER TABLE ${quotedTable} DROP COLUMN ${quotedColumn}`;

        await invoke("execute_query", {
          connectionId,
          query,
          ...(schema ? { schema } : {}),
        });

        onRefresh();
      } catch (e) {
        console.error(e);
        showAlert(t("sidebar.failDeleteColumn") + String(e), {
          title: t("common.error"),
          kind: "error",
        });
      }
    }
  };
  const columnComment = column.comment?.trim();
  const hasTypeLength = /\(.+\)/.test(column.data_type);
  const columnTypeLabel =
    hasTypeLength
      ? column.data_type
      : column.character_maximum_length !== undefined &&
          column.character_maximum_length !== null
        ? `${column.data_type}(${column.character_maximum_length})`
        : column.data_type;
  const columnTitle = [
    column.name,
    `类型：${columnTypeLabel}`,
    columnComment ? `注释：${columnComment}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <div
        className="flex items-center gap-2 px-3 py-1 text-sm text-secondary hover:bg-surface-secondary hover:text-primary cursor-pointer group font-mono"
        onContextMenu={!isView && canManage !== false ? handleContextMenu : undefined}
        onDoubleClick={!isView && canManage !== false ? () => onEdit(column) : undefined}
        title={columnTitle}
      >
        {column.is_pk ? (
          <Key size={15} className="text-yellow-500 shrink-0" />
        ) : (
          <Columns size={15} className="text-muted shrink-0" />
        )}
        <span
          className={clsx(
            "truncate flex-1 min-w-0 decoration-dotted underline-offset-4",
            column.is_pk && "font-bold text-yellow-500/80",
            columnComment && "group-hover:underline",
          )}
        >
          {column.name}
        </span>
        <span className="text-muted text-xs ml-auto shrink-0">
          {columnTypeLabel}
        </span>
      </div>
      {contextMenu && !isView && canManage !== false && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: t("sidebar.modifyColumn"),
              icon: Edit,
              action: () => onEdit(column),
            },
            {
              label: t("sidebar.copyName"),
              icon: Copy,
              action: () => navigator.clipboard.writeText(column.name),
            },
            {
              label: t("sidebar.deleteColumn"),
              icon: Trash2,
              danger: true,
              action: handleDelete,
            },
          ]}
        />
      )}
    </>
  );
};

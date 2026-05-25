import { CheckCircle2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import type { Tab } from "../../types/editor";
import {
  buildPendingChangesPreview,
  type PendingChangePreviewItem,
} from "../../utils/pendingChangesPreview";

interface PendingChangesPreviewModalProps {
  isOpen: boolean;
  tab: Tab | null | undefined;
  applyToAll: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const PendingChangesPreviewModal = ({
  isOpen,
  tab,
  applyToAll,
  onClose,
  onConfirm,
}: PendingChangesPreviewModalProps) => {
  const preview = buildPendingChangesPreview(tab, applyToAll);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div className="w-[760px] max-h-[86vh] overflow-hidden rounded-xl border border-strong bg-elevated shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-default bg-base p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-900/30 p-2">
              <CheckCircle2 size={20} className="text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-primary">提交变更预览</h2>
              <p className="text-xs text-secondary">
                {tab?.activeTable ? `${tab.activeTable} · ` : ""}
                写入数据库前请确认本次改动。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-secondary transition-colors hover:text-primary"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-4 gap-3">
            <Metric label="修改单元格" value={preview.updateCount} tone="blue" />
            <Metric label="新增行" value={preview.insertCount} tone="green" />
            <Metric label="删除行" value={preview.deleteCount} tone="red" />
            <Metric label="总操作" value={preview.totalOperations} tone="neutral" />
          </div>

          <div className="rounded-lg border border-strong bg-base/60 overflow-hidden">
            <div className="flex items-center justify-between border-b border-default px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-primary">变更明细</div>
                <div className="text-xs text-secondary">
                  {preview.selectedOnly
                    ? "当前仅提交选中行中的待处理变更。"
                    : "当前将提交全部待处理变更。"}
                </div>
              </div>
              {preview.omittedCount > 0 && (
                <span className="rounded-full border border-blue-900/50 bg-blue-900/20 px-2 py-1 text-xs text-blue-300">
                  还有 {preview.omittedCount} 项未显示
                </span>
              )}
            </div>

            {preview.items.length > 0 ? (
              <div className="divide-y divide-default">
                {preview.items.map((item) => (
                  <PreviewRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-secondary">
                没有可提交的变更。
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-default bg-base/50 p-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-secondary transition-colors hover:text-primary"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={preview.totalOperations === 0}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-green-950/20 transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            确认提交
          </button>
        </div>
      </div>
    </Modal>
  );
};

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "green" | "red" | "neutral";
}) {
  const toneClass = {
    blue: "border-blue-900/50 bg-blue-900/20 text-blue-300",
    green: "border-green-900/50 bg-green-900/20 text-green-300",
    red: "border-red-900/50 bg-red-900/20 text-red-300",
    neutral: "border-default bg-surface-secondary text-primary",
  }[tone];

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <div className="text-xs text-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function PreviewRow({ item }: { item: PendingChangePreviewItem }) {
  const icon = {
    update: <Pencil size={15} className="text-blue-300" />,
    insert: <Plus size={15} className="text-green-300" />,
    delete: <Trash2 size={15} className="text-red-300" />,
  }[item.kind];

  const label = {
    update: "修改",
    insert: "新增",
    delete: "删除",
  }[item.kind];

  return (
    <div className="grid grid-cols-[88px_minmax(130px,180px)_1fr] gap-3 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-primary">
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-mono text-xs text-secondary truncate" title={item.rowLabel}>
        {item.rowLabel}
      </div>
      <div className="min-w-0 text-secondary">
        {item.kind === "update" && (
          <>
            <span className="font-medium text-primary">{item.columnName}</span>
            <span className="mx-2 text-muted">=</span>
            <span className="font-mono text-primary">{item.valuePreview}</span>
          </>
        )}
        {item.kind === "insert" && (
          <>
            <span className="text-primary">{item.fieldCount ?? 0} 个字段</span>
            <span className="mx-2 text-muted">·</span>
            <span className="font-mono">{item.valuePreview}</span>
          </>
        )}
        {item.kind === "delete" && <span>删除整行数据</span>}
      </div>
    </div>
  );
}

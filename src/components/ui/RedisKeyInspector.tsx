import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Loader2, RefreshCw, Save, Trash2 } from "lucide-react";
import type { RedisKeyValue } from "../../types/redis";
import { toErrorMessage } from "../../utils/errors";

interface RedisKeyInspectorProps {
  connectionId: string;
  redisKey: string;
  onDeleted?: () => void;
}

function formatBytes(size?: number | null) {
  if (size == null) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatTtl(ttl: number) {
  if (ttl === -2) return "已过期";
  if (ttl === -1) return "不过期";
  return `${ttl}s`;
}

function prettyValue(key: RedisKeyValue | null) {
  if (!key) return "";
  if (key.keyType === "string") return String(key.value ?? "");
  return JSON.stringify(key.value ?? null, null, 2);
}

function parseDraft(keyType: string, draft: string) {
  if (keyType === "string") return draft;
  return JSON.parse(draft);
}

export function RedisKeyInspector({
  connectionId,
  redisKey,
  onDeleted,
}: RedisKeyInspectorProps) {
  const [data, setData] = useState<RedisKeyValue | null>(null);
  const [draft, setDraft] = useState("");
  const [ttlDraft, setTtlDraft] = useState("-1");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const next = await invoke<RedisKeyValue>("redis_get_key", {
        connectionId,
        key: redisKey,
      });
      setData(next);
      setDraft(prettyValue(next));
      setTtlDraft(String(next.ttl));
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [connectionId, redisKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const parsedPreview = useMemo(() => {
    if (!data || data.keyType === "string") return null;
    try {
      const parsed = JSON.parse(draft);
      return Array.isArray(parsed) ? `${parsed.length} 项` : "JSON";
    } catch {
      return "JSON 格式错误";
    }
  }, [data, draft]);

  const saveValue = async () => {
    if (!data) return;
    setIsSaving(true);
    setError("");
    try {
      await invoke("redis_save_key", {
        request: {
          connectionId,
          key: data.key,
          keyType: data.keyType,
          value: parseDraft(data.keyType, draft),
          ttl: Number(ttlDraft),
        },
      });
      await load();
    } catch (err) {
      setError(`保存失败：${toErrorMessage(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteKey = async () => {
    const confirmed = await ask(`确认删除 Redis Key "${redisKey}"？`, {
      title: "删除 Redis Key",
      kind: "warning",
    });
    if (!confirmed) return;

    setIsSaving(true);
    setError("");
    try {
      await invoke("redis_delete_key", { connectionId, key: redisKey });
      onDeleted?.();
    } catch (err) {
      setError(`删除失败：${toErrorMessage(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full min-h-0 bg-base text-primary flex flex-col">
      <div className="h-12 shrink-0 border-b border-default bg-elevated px-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{redisKey}</div>
          <div className="text-[11px] text-muted">
            {data ? `${data.keyType.toUpperCase()} · TTL ${formatTtl(data.ttl)} · ${formatBytes(data.size)}` : "Redis Key"}
          </div>
        </div>
        <button
          onClick={load}
          disabled={isLoading || isSaving}
          className="h-8 px-2 rounded border border-default text-secondary hover:text-primary hover:bg-surface-secondary disabled:opacity-50"
          title="刷新"
        >
          {isLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
        <button
          onClick={saveValue}
          disabled={!data || isLoading || isSaving}
          className="h-8 inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          保存
        </button>
        <button
          onClick={deleteKey}
          disabled={!data || isSaving}
          className="h-8 inline-flex items-center gap-1.5 rounded bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          <Trash2 size={14} />
          删除
        </button>
      </div>

      {error && (
        <div className="m-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {isLoading && !data ? (
        <div className="flex-1 flex items-center justify-center text-muted">
          <Loader2 size={20} className="animate-spin mr-2" />
          正在加载 Redis Key...
        </div>
      ) : data ? (
        <div className="flex-1 min-h-0 p-3 grid grid-rows-[auto_1fr] gap-3">
          <div className="grid grid-cols-4 gap-2">
            <label className="grid gap-1">
              <span className="text-[11px] text-muted font-semibold">类型</span>
              <input
                value={data.keyType}
                readOnly
                className="h-8 rounded border border-default bg-surface-secondary px-2 text-sm text-secondary"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] text-muted font-semibold">TTL 秒</span>
              <input
                value={ttlDraft}
                onChange={(event) => setTtlDraft(event.target.value.replace(/[^\d-]/g, ""))}
                className="h-8 rounded border border-default bg-surface-secondary px-2 text-sm text-primary outline-none focus:border-blue-400"
              />
            </label>
            <div className="grid gap-1">
              <span className="text-[11px] text-muted font-semibold">大小</span>
              <div className="h-8 rounded border border-default bg-surface-secondary px-2 text-sm text-secondary flex items-center">
                {formatBytes(data.size)}
              </div>
            </div>
            <div className="grid gap-1">
              <span className="text-[11px] text-muted font-semibold">结构</span>
              <div className="h-8 rounded border border-default bg-surface-secondary px-2 text-sm text-secondary flex items-center">
                {parsedPreview ?? "文本"}
              </div>
            </div>
          </div>

          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            className="min-h-0 h-full resize-none rounded border border-default bg-elevated p-3 font-mono text-sm leading-6 text-primary outline-none focus:border-blue-400"
          />
        </div>
      ) : null}
    </div>
  );
}

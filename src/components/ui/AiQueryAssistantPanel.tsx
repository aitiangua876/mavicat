import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import {
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  Code2,
  KeyRound,
  Loader2,
  Play,
  PlusCircle,
  Send,
  Server,
  Settings2,
  ShieldAlert,
  Sparkles,
  Wand2,
} from "lucide-react";
import clsx from "clsx";
import type { AiMessage, AiSqlBlock } from "../../types/ai";

const AI_MODELS = [
  "gpt-5.4",
  "gpt-5.5",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
];

const STORAGE_KEYS = {
  baseUrl: "mavicat.ai.baseUrl",
  apiKey: "mavicat.ai.apiKey",
  model: "mavicat.ai.model",
  configOpen: "mavicat.ai.configOpen",
};

interface AiChatResponse {
  content: string;
  sqlBlocks: AiSqlBlock[];
}

export interface AiDatabaseContext {
  connectionName?: string | null;
  databaseName?: string | null;
  schema?: string | null;
  driver?: string | null;
  tables: string[];
  currentSql?: string | null;
}

interface AiQueryAssistantPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  disabled?: boolean;
  context: AiDatabaseContext;
  messages: AiMessage[];
  sqlBlocks: AiSqlBlock[];
  inputDraft: string;
  onMessagesChange: (messages: AiMessage[]) => void;
  onSqlBlocksChange: (blocks: AiSqlBlock[]) => void;
  onInputDraftChange: (value: string) => void;
  onAppendSql: (sql: string) => void;
  onRunSql: (sql: string) => Promise<void> | void;
}

function readStoredValue(key: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

function sqlKindLabel(kind: AiSqlBlock["kind"]) {
  if (kind === "query") return "查询";
  if (kind === "mutation") return "写入";
  if (kind === "ddl") return "结构变更";
  return "SQL";
}

export function AiQueryAssistantPanel({
  collapsed,
  onToggle,
  disabled,
  context,
  messages,
  sqlBlocks,
  inputDraft,
  onMessagesChange,
  onSqlBlocksChange,
  onInputDraftChange,
  onAppendSql,
  onRunSql,
}: AiQueryAssistantPanelProps) {
  const [baseUrl, setBaseUrl] = useState(() =>
    readStoredValue(STORAGE_KEYS.baseUrl, "https://api.openai.com/v1"),
  );
  const [apiKey, setApiKey] = useState(() =>
    readStoredValue(STORAGE_KEYS.apiKey, ""),
  );
  const [model, setModel] = useState(() =>
    readStoredValue(STORAGE_KEYS.model, AI_MODELS[0]),
  );
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(
    () => readStoredValue(STORAGE_KEYS.configOpen, apiKey ? "false" : "true") === "true",
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.baseUrl, baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
  }, [apiKey]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.model, model);
  }, [model]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.configOpen, String(isConfigOpen));
  }, [isConfigOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sqlBlocks, error]);

  const contextLabel = useMemo(() => {
    const db = context.schema || context.databaseName || "未选择数据库";
    const conn = context.connectionName || "未连接";
    return `${conn} / ${db}`;
  }, [context.connectionName, context.databaseName, context.schema]);

  const hasConfig = Boolean(baseUrl.trim() && apiKey.trim() && model.trim());
  const currentSql = context.currentSql?.trim() ?? "";

  const quickActions = useMemo(
    () => [
      {
        label: "写查询",
        icon: Code2,
        disabled: false,
        prompt:
          "请根据当前数据库上下文，帮我写一条安全的 SELECT 查询。如果条件不足，先用一句话问我需要补充什么；如果足够，请给出 SQL。",
      },
      {
        label: "解释 SQL",
        icon: BookOpen,
        disabled: !currentSql,
        prompt: `请解释当前 SQL 的用途、涉及的表、筛选条件和潜在风险：\n\n${currentSql}`,
      },
      {
        label: "优化 SQL",
        icon: Wand2,
        disabled: !currentSql,
        prompt: `请优化当前 SQL，说明优化点，并给出优化后的 SQL：\n\n${currentSql}`,
      },
    ],
    [currentSql],
  );

  const sendMessage = async (overridePrompt?: string) => {
    const prompt = (overridePrompt ?? inputDraft).trim();
    if (!prompt || isSending) return;
    if (!hasConfig) {
      setError("请先配置 AI Base URL、Key 和模型。");
      setIsConfigOpen(true);
      return;
    }

    const nextMessages: AiMessage[] = [...messages, { role: "user", content: prompt }];
    onMessagesChange(nextMessages);
    onInputDraftChange("");
    setError("");
    setIsSending(true);

    try {
      const response = await invoke<AiChatResponse>("ai_chat_completion", {
        request: {
          baseUrl,
          apiKey,
          model,
          messages: nextMessages,
          context,
        },
      });
      onMessagesChange([
        ...nextMessages,
        { role: "assistant", content: response.content },
      ]);
      onSqlBlocksChange(response.sqlBlocks ?? []);
    } catch (err) {
      setError(typeof err === "string" ? err : "AI 请求失败");
    } finally {
      setIsSending(false);
    }
  };

  const confirmAndRun = async (block: AiSqlBlock) => {
    if (block.requiresConfirmation) {
      const confirmed = await ask(
        `即将执行 ${sqlKindLabel(block.kind)} SQL，可能会修改数据或结构。确认继续？`,
        { title: "确认执行 AI SQL", kind: "warning" },
      );
      if (!confirmed) return;
    }
    await onRunSql(block.sql);
  };

  if (collapsed) {
    return (
      <aside className="absolute right-3 top-1/2 z-20 -translate-y-1/2">
        <button
          type="button"
          onClick={onToggle}
          className="group flex h-11 items-center gap-1.5 rounded-l-full rounded-r-md border border-purple-500/25 bg-elevated/90 px-2.5 text-purple-300 shadow-lg backdrop-blur transition-colors hover:bg-purple-500/15 hover:text-purple-100"
          title="展开 AI 助手"
        >
          <Sparkles size={16} />
          <span className="hidden text-xs font-semibold group-hover:inline">AI</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="absolute right-0 top-[86px] bottom-0 z-30 w-[390px] border-l border-default bg-elevated shadow-2xl flex flex-col">
      <div className="h-11 px-3 border-b border-default flex items-center gap-2 shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-purple-500/15 text-purple-300">
          <Bot size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-primary">AI 数据库助手</div>
          <div className="text-[11px] text-muted truncate">{contextLabel}</div>
        </div>
        <button
          type="button"
          onClick={() => setIsConfigOpen((value) => !value)}
          className={clsx(
            "h-8 w-8 inline-flex items-center justify-center rounded transition-colors",
            isConfigOpen
              ? "bg-purple-500/15 text-purple-300"
              : "text-muted hover:text-primary hover:bg-surface-secondary",
          )}
          title="AI 配置"
        >
          <Settings2 size={16} />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="h-8 w-8 inline-flex items-center justify-center rounded text-muted hover:text-primary hover:bg-surface-secondary"
          title="折叠 AI 助手"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="border-b border-default shrink-0">
        <div className="flex items-center gap-2 px-3 py-2">
          <span
            className={clsx(
              "h-2 w-2 rounded-full",
              hasConfig ? "bg-emerald-400" : "bg-muted",
            )}
          />
          <span className="min-w-0 flex-1 truncate text-xs text-secondary">
            {hasConfig ? `${model} · ${baseUrl}` : "未配置 AI，不影响正常写 SQL"}
          </span>
          {!hasConfig && (
            <button
              type="button"
              onClick={() => setIsConfigOpen(true)}
              className="rounded bg-purple-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-purple-500"
            >
              配置
            </button>
          )}
        </div>

        {isConfigOpen && (
          <div className="grid gap-2 px-3 pb-3">
            <label className="grid gap-1">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <Server size={12} /> Base URL
              </span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                className="h-8 rounded border border-strong bg-base px-2 text-xs text-primary outline-none focus:border-purple-400"
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <div className="grid grid-cols-[1fr_142px] gap-2">
              <label className="grid gap-1">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <KeyRound size={12} /> Key
                </span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  className="h-8 rounded border border-strong bg-base px-2 text-xs text-primary outline-none focus:border-purple-400"
                  placeholder="sk-..."
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Model
                </span>
                <select
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="h-8 rounded border border-strong bg-base px-2 text-xs text-primary outline-none focus:border-purple-400"
                >
                  {AI_MODELS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-b border-default grid grid-cols-3 gap-1.5 shrink-0">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              disabled={disabled || isSending || action.disabled}
              onClick={() => void sendMessage(action.prompt)}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-default bg-base text-xs text-secondary hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-200 disabled:opacity-35 disabled:cursor-not-allowed"
              title={action.disabled ? "当前编辑器没有 SQL" : action.label}
            >
              <Icon size={13} />
              {action.label}
            </button>
          );
        })}
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="rounded border border-default bg-base/70 p-3 text-xs text-secondary leading-6">
            <div className="mb-2 font-semibold text-primary">需要时再用，不会打断当前工作流。</div>
            <div>
              可以直接写 SQL，也可以让 AI 基于当前连接、数据库和已加载表辅助生成、解释或优化。查询类 SQL 可一键执行，增删改和结构变更会先二次确认。
            </div>
          </div>
        )}

        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onMessagesChange([]);
              onSqlBlocksChange([]);
              setError("");
            }}
            className="ml-auto flex rounded px-2 py-1 text-[11px] text-muted hover:bg-surface-secondary hover:text-primary"
          >
            清空对话
          </button>
        )}

        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={clsx(
              "rounded border px-3 py-2 text-xs leading-6 whitespace-pre-wrap",
              message.role === "user"
                ? "ml-8 border-blue-500/25 bg-blue-500/10 text-blue-50"
                : "mr-8 border-default bg-base text-secondary",
            )}
          >
            {message.content}
          </div>
        ))}

        {sqlBlocks.length > 0 && (
          <div className="space-y-2">
            {sqlBlocks.map((block, index) => (
              <div key={`${block.kind}-${index}`} className="rounded border border-default bg-base overflow-hidden">
                <div className="px-3 py-2 border-b border-default flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-primary">
                    {sqlKindLabel(block.kind)}
                  </span>
                  {block.requiresConfirmation && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                      <ShieldAlert size={11} /> 需确认
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onAppendSql(block.sql)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-secondary hover:bg-surface-secondary hover:text-primary"
                    >
                      <PlusCircle size={12} /> 追加
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void confirmAndRun(block)}
                      className={clsx(
                        "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-white disabled:opacity-40 disabled:cursor-not-allowed",
                        block.requiresConfirmation
                          ? "bg-amber-600 hover:bg-amber-500"
                          : "bg-green-700 hover:bg-green-600",
                      )}
                    >
                      <Play size={12} fill="currentColor" />
                      {block.requiresConfirmation ? "确认执行" : "一键执行"}
                    </button>
                  </div>
                </div>
                <pre className="max-h-48 overflow-auto p-3 text-[11px] leading-5 text-secondary font-mono whitespace-pre-wrap">
                  {block.sql}
                </pre>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 whitespace-pre-wrap">
            {error}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-default shrink-0">
        <textarea
          value={inputDraft}
          disabled={disabled || isSending}
          onChange={(event) => onInputDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void sendMessage();
            }
          }}
          className="h-20 w-full resize-none rounded border border-strong bg-base p-2 text-xs leading-5 text-primary outline-none focus:border-purple-400 disabled:opacity-60"
          placeholder="问 AI 写查询、解释 SQL、优化脚本..."
        />
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary"
          >
            <ChevronLeft size={13} /> 收起
          </button>
          <button
            type="button"
            disabled={disabled || isSending || !inputDraft.trim()}
            onClick={() => void sendMessage()}
            className="inline-flex h-8 items-center gap-2 rounded bg-purple-600 px-3 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            发送
          </button>
        </div>
      </div>
    </aside>
  );
}

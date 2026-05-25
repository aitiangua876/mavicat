import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Database, Loader2, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import { SqlPreview } from "../ui/SqlPreview";
import {
  buildCreateDatabaseSql,
  getDatabaseCollationOptions,
  getDatabaseEncodingOptions,
  getDefaultDatabaseCollation,
  getDefaultDatabaseEncoding,
} from "../../utils/createDatabase";
import { toErrorMessage } from "../../utils/errors";

interface CreateDatabaseModalProps {
  isOpen: boolean;
  connectionId: string;
  connectionName: string;
  driver: string;
  onClose: () => void;
  onSuccess: (databaseName: string) => void | Promise<void>;
}

export const CreateDatabaseModal = ({
  isOpen,
  connectionId,
  connectionName,
  driver,
  onClose,
  onSuccess,
}: CreateDatabaseModalProps) => {
  const [databaseName, setDatabaseName] = useState("");
  const [encoding, setEncoding] = useState(() => getDefaultDatabaseEncoding(driver));
  const [collation, setCollation] = useState(() => getDefaultDatabaseCollation(driver, getDefaultDatabaseEncoding(driver)));
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const nextEncoding = getDefaultDatabaseEncoding(driver);
    setEncoding(nextEncoding);
    setCollation(getDefaultDatabaseCollation(driver, nextEncoding));
    setError("");
  }, [driver, isOpen]);

  useEffect(() => {
    const options = getDatabaseCollationOptions(driver, encoding);
    if (options.length > 0 && !options.includes(collation)) {
      setCollation(options[0]);
    }
    if (options.length === 0 && collation) {
      setCollation("");
    }
  }, [driver, encoding, collation]);

  const encodingOptions = useMemo(() => getDatabaseEncodingOptions(driver), [driver]);
  const collationOptions = useMemo(() => getDatabaseCollationOptions(driver, encoding), [driver, encoding]);
  const isSqlServer = driver === "sqlserver" || driver === "mssql";
  const isPostgres = driver === "postgres";

  const sqlPreview = useMemo(() => {
    if (!databaseName.trim()) return "-- 输入数据库名称后预览 SQL";
    try {
      return buildCreateDatabaseSql(driver, databaseName, encoding, collation);
    } catch (e) {
      return `-- ${toErrorMessage(e)}`;
    }
  }, [collation, databaseName, driver, encoding]);

  const handleCreate = async () => {
    const name = databaseName.trim();
    if (!name) {
      setError("请输入数据库名称");
      return;
    }

    setIsCreating(true);
    setError("");

    try {
      const sql = buildCreateDatabaseSql(driver, name, encoding, collation);
      await invoke("execute_query", {
        connectionId,
        query: sql,
      });
      await onSuccess(name);
      setDatabaseName("");
      onClose();
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} overlayClassName="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]">
      <div className="w-[680px] max-w-[92vw] max-h-[88vh] overflow-hidden rounded-xl border border-strong bg-elevated shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-default bg-base">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-300 flex items-center justify-center">
              <Database size={21} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-primary">新建数据库</h2>
              <p className="text-xs text-muted">{connectionName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-secondary hover:text-primary transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <label className="block text-xs uppercase font-bold text-muted mb-1.5">
              数据库名称 <span className="text-red-400">*</span>
            </label>
            <input
              value={databaseName}
              onChange={(event) => {
                setDatabaseName(event.target.value);
                setError("");
              }}
              autoFocus
              placeholder="例如 mavicat_app"
              className="w-full h-10 bg-base border border-strong rounded-lg px-3 text-primary font-mono focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase font-bold text-muted mb-1.5">
                {isSqlServer ? "排序规则" : "编码"}
              </label>
              <select
                value={encoding}
                onChange={(event) => setEncoding(event.target.value)}
                className="w-full h-10 bg-base border border-strong rounded-lg px-3 text-primary focus:border-blue-500 focus:outline-none"
              >
                {encodingOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {!isPostgres && !isSqlServer && (
              <div>
                <label className="block text-xs uppercase font-bold text-muted mb-1.5">
                  排序规则
                </label>
                <select
                  value={collation}
                  onChange={(event) => setCollation(event.target.value)}
                  className="w-full h-10 bg-base border border-strong rounded-lg px-3 text-primary focus:border-blue-500 focus:outline-none"
                >
                  {collationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <div className="text-xs uppercase font-bold text-muted mb-1.5">SQL 预览</div>
            <SqlPreview sql={sqlPreview} height="180px" />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-default bg-base">
          <button
            onClick={onClose}
            disabled={isCreating}
            className="px-4 py-2 rounded-lg border border-strong text-secondary hover:text-primary hover:bg-surface-secondary disabled:opacity-60"
          >
            取消
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={isCreating || !databaseName.trim()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCreating && <Loader2 size={16} className="animate-spin" />}
            创建
          </button>
        </div>
      </div>
    </Modal>
  );
};

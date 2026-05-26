import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ConfirmModal } from "./modals/ConfirmModal";
import { useAlert } from "../hooks/useAlert";
import { useSettings } from "../hooks/useSettings";

interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
}

interface UpdateConfig {
  lastDismissedVersion?: string;
}

export function UpdateChecker() {
  const { settings, isLoading } = useSettings();
  const { showAlert } = useAlert();
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (isLoading || settings.autoCheckUpdatesOnStartup === false) {
      return;
    }

    let cancelled = false;

    async function checkUpdates() {
      try {
        const [result, config] = await Promise.all([
          invoke<UpdateCheckResult>("check_for_updates", { force: false }),
          invoke<UpdateConfig>("get_config"),
        ]);

        if (
          !cancelled &&
          result.hasUpdate &&
          config.lastDismissedVersion !== result.latestVersion
        ) {
          setUpdate(result);
        }
      } catch {
        // Startup update checks stay quiet unless an update is actually available.
      }
    }

    void checkUpdates();

    return () => {
      cancelled = true;
    };
  }, [isLoading, settings.autoCheckUpdatesOnStartup]);

  const dismissUpdate = async () => {
    if (update) {
      await invoke("save_config", {
        config: { lastDismissedVersion: update.latestVersion },
      }).catch(() => {});
    }
    setUpdate(null);
  };

  const installUpdate = async () => {
    setIsInstalling(true);
    setProgress(0);
    setStatus("正在准备下载更新...");

    const unlistenProgress = await listen<number>("update-progress", (event) => {
      setProgress(Math.max(0, Math.min(100, Math.round(event.payload))));
      setStatus("正在下载更新...");
    });
    const unlistenInstalling = await listen("update-installing", () => {
      setProgress(100);
      setStatus("下载完成，正在安装并重启...");
    });

    try {
      await invoke("download_and_install_update");
    } catch (error) {
      setIsInstalling(false);
      setProgress(0);
      setStatus("");
      showAlert(`自动更新失败：${error instanceof Error ? error.message : String(error)}`, {
        title: "更新失败",
        kind: "error",
      });
    } finally {
      unlistenProgress();
      unlistenInstalling();
    }
  };

  return (
    <ConfirmModal
      isOpen={update !== null}
      onClose={() => void dismissUpdate()}
      title={update ? `发现新版本 ${update.latestVersion}` : "发现新版本"}
      message={
        update
          ? `当前版本 ${update.currentVersion}。${update.releaseNotes || "建议更新到最新版本以获得功能改进和修复。"}`
          : ""
      }
      confirmLabel={isInstalling ? "正在更新..." : "立即更新"}
      confirmDisabled={isInstalling}
      onConfirm={() => void installUpdate()}
      variant="info"
    >
      {isInstalling && (
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>{status || "正在更新..."}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-secondary border border-default">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </ConfirmModal>
  );
}

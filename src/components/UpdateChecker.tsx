import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
    try {
      await invoke("download_and_install_update");
    } catch (error) {
      setIsInstalling(false);
      showAlert(`自动更新失败：${error instanceof Error ? error.message : String(error)}`, {
        title: "更新失败",
        kind: "error",
      });
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
      onConfirm={() => void installUpdate()}
      variant="info"
    />
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Github, Code2, Library, RefreshCw } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import { useAlert } from "../../hooks/useAlert";
import { APP_DISPLAY_VERSION } from "../../version";
import { SettingSection } from "./SettingControls";
import { OpenSourceLibrariesModal } from "../modals/OpenSourceLibrariesModal";
import { ConfirmModal } from "../modals/ConfirmModal";

interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
}

export function InfoTab() {
  const { t } = useTranslation();
  const { currentTheme } = useTheme();
  const { showAlert } = useAlert();
  const [isOpenSourceLibrariesOpen, setIsOpenSourceLibrariesOpen] =
    useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStatus, setUpdateStatus] = useState("");
  const [availableUpdate, setAvailableUpdate] =
    useState<UpdateCheckResult | null>(null);

  const checkUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      const result = await invoke<UpdateCheckResult>("check_for_updates", {
        force: true,
      });
      if (result.hasUpdate) {
        setAvailableUpdate(result);
      } else {
        showAlert(`当前已经是最新版本：${result.currentVersion}`, {
          title: "检查更新",
          kind: "info",
        });
      }
    } catch (error) {
      showAlert(`检查更新失败：${error instanceof Error ? error.message : String(error)}`, {
        title: "检查更新",
        kind: "error",
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const installUpdate = async () => {
    setIsInstallingUpdate(true);
    setUpdateProgress(0);
    setUpdateStatus("正在准备下载更新...");

    const unlistenProgress = await listen<number>("update-progress", (event) => {
      setUpdateProgress(Math.max(0, Math.min(100, Math.round(event.payload))));
      setUpdateStatus("正在下载更新...");
    });
    const unlistenInstalling = await listen("update-installing", () => {
      setUpdateProgress(100);
      setUpdateStatus("下载完成，正在安装并重启...");
    });

    try {
      await invoke("download_and_install_update");
    } catch (error) {
      setIsInstallingUpdate(false);
      setUpdateStatus("");
      setUpdateProgress(0);
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
    <div>
      <div className="bg-gradient-to-br from-blue-900/20 to-elevated border border-blue-500/20 rounded-2xl p-8 text-center relative overflow-hidden mb-8">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Code2 size={120} />
        </div>

        <div className="p-2">
          <img
            src="/logo.png"
            alt="Mavicat"
            className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-lg shadow-blue-500/30"
            style={{
              backgroundColor: !currentTheme?.id?.includes("-light")
                ? currentTheme?.colors?.surface?.secondary || "#334155"
                : currentTheme?.colors?.bg?.elevated || "#f8fafc",
            }}
          />
        </div>

        <h1 className="text-3xl font-bold text-primary mb-2">Mavicat</h1>
        <p className="text-secondary max-w-lg mx-auto mb-6">
          A cross-platform database manager built with Tauri, Rust, React, and
          TypeScript.
        </p>

        <div className="flex justify-center gap-4 flex-wrap">
          <button
            onClick={() => openUrl("https://github.com/aitiangua876/mavicat")}
            className="flex items-center gap-2 bg-surface-secondary hover:bg-surface-tertiary text-primary px-4 py-2 rounded-lg font-medium transition-colors border border-strong"
          >
            <Github size={18} />
            GitHub
          </button>
          <div className="flex items-center gap-2 bg-accent/10 text-accent px-4 py-2 rounded-lg border border-accent/30">
            <span className="text-xs font-bold uppercase tracking-wider">
              {t("settings.version")}
            </span>
            <span className="font-mono font-bold">{APP_DISPLAY_VERSION}</span>
          </div>
          <button
            onClick={() => setIsOpenSourceLibrariesOpen(true)}
            className="flex items-center gap-2 bg-blue-900/20 hover:bg-blue-900/30 text-blue-400 px-4 py-2 rounded-lg font-medium transition-colors border border-blue-500/30"
          >
            <Library size={18} />
            {t("settings.openSourceLibraries")}
          </button>
          <button
            onClick={() => void checkUpdates()}
            disabled={isCheckingUpdate}
            className="flex items-center gap-2 bg-orange-900/20 hover:bg-orange-900/30 disabled:opacity-60 disabled:cursor-not-allowed text-orange-300 px-4 py-2 rounded-lg font-medium transition-colors border border-orange-500/30"
          >
            <RefreshCw size={18} className={isCheckingUpdate ? "animate-spin" : ""} />
            {isCheckingUpdate ? "检查中..." : "检查更新"}
          </button>
        </div>
      </div>

      <SettingSection
        title={t("settings.openSourceLibraries")}
        icon={<Library size={14} className="text-muted" />}
      >
        <div className="pt-3 text-sm text-secondary">
          Mavicat is based on the Apache-2.0 licensed Mavicat project and
          keeps its third-party library notices available here.
        </div>
      </SettingSection>

      <OpenSourceLibrariesModal
        isOpen={isOpenSourceLibrariesOpen}
        onClose={() => setIsOpenSourceLibrariesOpen(false)}
      />
      <ConfirmModal
        isOpen={availableUpdate !== null}
        onClose={() => setAvailableUpdate(null)}
        title={
          availableUpdate
            ? `发现新版本 ${availableUpdate.latestVersion}`
            : "发现新版本"
        }
        message={
          availableUpdate
            ? `当前版本 ${availableUpdate.currentVersion}。${availableUpdate.releaseNotes || "建议更新到最新版本以获得功能改进和修复。"}`
            : ""
        }
        confirmLabel={isInstallingUpdate ? "正在更新..." : "立即更新"}
        confirmDisabled={isInstallingUpdate}
        onConfirm={() => void installUpdate()}
        variant="info"
      >
        {isInstallingUpdate && (
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-secondary">
              <span>{updateStatus || "正在更新..."}</span>
              <span>{updateProgress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-secondary border border-default">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-200"
                style={{ width: `${updateProgress}%` }}
              />
            </div>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}

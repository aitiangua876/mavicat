import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Github, Code2, Library } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import { APP_DISPLAY_VERSION } from "../../version";
import { SettingSection } from "./SettingControls";
import { OpenSourceLibrariesModal } from "../modals/OpenSourceLibrariesModal";

export function InfoTab() {
  const { t } = useTranslation();
  const { currentTheme } = useTheme();
  const [isOpenSourceLibrariesOpen, setIsOpenSourceLibrariesOpen] =
    useState(false);

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
    </div>
  );
}

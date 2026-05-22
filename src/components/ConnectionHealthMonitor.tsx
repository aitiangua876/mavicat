import { useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAlert } from "../hooks/useAlert";

const CONNECTION_FAILED_EVENT = "mavicat-connection-failed";

type ConnectionFailedDetail = {
  connectionId: string;
  name?: string;
  error: string;
};

/**
 * Headless component that listens for connection failure events and shows a
 * global alert. Must be rendered inside AlertProvider and BrowserRouter.
 */
export function ConnectionHealthMonitor() {
  const { showAlert } = useAlert();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const goToConnections = useCallback(() => {
    navigate("/connections");
  }, [navigate]);

  useEffect(() => {
    const handleConnectionFailed = (event: Event) => {
      const detail = (event as CustomEvent<ConnectionFailedDetail>).detail;
      const name = detail?.name || detail?.connectionId || t("common.connect");
      const error = detail?.error || t("common.error");

      showAlert(
        `${t("connections.failConnect", { name })}\n\n${error}`,
        {
          kind: "error",
          title: t("common.error"),
          onClose: goToConnections,
        },
      );
    };

    window.addEventListener(CONNECTION_FAILED_EVENT, handleConnectionFailed);

    const unlisten = listen<{ connectionId: string; error: string }>(
      "connection-health-failed",
      (event) => {
        const { error } = event.payload;
        showAlert(
          `${t("healthCheck.connectionLost")}: ${error}`,
          {
            kind: "error",
            title: t("healthCheck.title"),
            onClose: goToConnections,
          },
        );
      },
    );
    return () => {
      window.removeEventListener(CONNECTION_FAILED_EVENT, handleConnectionFailed);
      unlisten.then((fn) => fn());
    };
  }, [showAlert, t, goToConnections]);

  return null;
}

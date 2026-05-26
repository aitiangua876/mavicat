import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { MainLayout } from "./components/layout/MainLayout";
import { ConnectionLayoutProvider } from "./contexts/ConnectionLayoutProvider";
import { KeybindingsProvider } from "./contexts/KeybindingsProvider";
import { AlertProvider } from "./contexts/AlertProvider";
import { Connections } from "./pages/Connections";
import { Editor } from "./pages/Editor";
import { Settings } from "./pages/Settings";
import { SchemaDiagramPage } from "./pages/SchemaDiagramPage";
import { VisualExplainPage } from "./pages/VisualExplainPage";
import { JsonViewerPage } from "./pages/JsonViewerPage";
import { ConnectionHealthMonitor } from "./components/ConnectionHealthMonitor";
import { UpdateChecker } from "./components/UpdateChecker";
import { EditorErrorBoundary } from "./components/ui/EditorErrorBoundary";

export function App() {
  const [isDebugMode, setIsDebugMode] = useState(false);

  useEffect(() => {
    invoke<boolean>("is_debug_mode").then((debugMode) => {
      setIsDebugMode(debugMode);
    });
  }, []);

  useEffect(() => {
    if (isDebugMode) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [isDebugMode]);

  return (
    <>
      <AlertProvider>
        <BrowserRouter>
          <ConnectionHealthMonitor />
          <UpdateChecker />
          <KeybindingsProvider>
            <ConnectionLayoutProvider>
              <Routes>
                <Route path="/" element={<MainLayout />}>
                  <Route
                    index
                    element={<Navigate to="/editor" replace />}
                  />
                  <Route path="connections" element={<Connections />} />
                  <Route
                    path="editor"
                    element={
                      <EditorErrorBoundary>
                        <Editor />
                      </EditorErrorBoundary>
                    }
                  />
                  <Route path="settings" element={<Settings />} />
                </Route>
                <Route
                  path="/schema-diagram"
                  element={<SchemaDiagramPage />}
                />
                <Route path="/visual-explain" element={<VisualExplainPage />} />
                <Route path="/json-viewer" element={<JsonViewerPage />} />
              </Routes>
            </ConnectionLayoutProvider>
          </KeybindingsProvider>
        </BrowserRouter>
      </AlertProvider>
    </>
  );
}

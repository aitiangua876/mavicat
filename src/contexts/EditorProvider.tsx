import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import type { Tab, SchemaCache, TableSchema } from "../types/editor";
import { EditorContext } from "./EditorContext";
import { useDatabase } from "../hooks/useDatabase";
import { invoke } from "@tauri-apps/api/core";
import {
  generateTabId,
  loadEditorPreferences,
  saveTabsToStorage,
  createInitialTabState,
  generateTabTitle,
  findExistingTableTab,
  getConnectionTabs,
  getActiveTab,
  closeTabWithState,
  closeAllTabsForConnection,
  closeOtherTabsForConnection,
  closeTabsToLeft,
  closeTabsToRight,
  updateTabInList,
  shouldUseCachedSchema,
  createSchemaCacheEntry,
} from "../utils/editor";

export const EditorProvider = ({ children }: { children: ReactNode }) => {
  const { activeConnectionId } = useDatabase();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabIds, setActiveTabIds] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  const schemaCacheRef = useRef<Record<string, SchemaCache>>({});
  const tabsRef = useRef<Tab[]>([]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // Load tabs from file storage when connection changes
  useEffect(() => {
    if (!activeConnectionId) {
      setIsLoading(false);
      return;
    }

    const loadPreferences = async () => {
      setIsLoading(true);
      try {
        const { tabs: restoredTabs, activeTabId: loadedActiveTabId } = await loadEditorPreferences(activeConnectionId);
        const loadedTabs = restoredTabs.filter((tab) => tab.type !== "notebook");

        if (loadedTabs.length > 0) {
          const restoredActiveTab = loadedActiveTabId && loadedTabs.some((tab) => tab.id === loadedActiveTabId)
            ? loadedActiveTabId
            : loadedTabs[0].id;
          // Merge loaded tabs with tabs from other connections
          setTabs((prev) => {
            const tabsFromOtherConnections = prev.filter(t => t.connectionId !== activeConnectionId);
            return [...tabsFromOtherConnections, ...loadedTabs];
          });
          setActiveTabIds((prev) => ({
            ...prev,
            [activeConnectionId]: restoredActiveTab,
          }));
        } else {
          // Create initial tab if no tabs exist, preserving other connections' tabs
          const initialTab = createInitialTabState(activeConnectionId);
          setTabs((prev) => {
            const tabsFromOtherConnections = prev.filter(t => t.connectionId !== activeConnectionId);
            return [...tabsFromOtherConnections, initialTab];
          });
          setActiveTabIds((prev) => ({
            ...prev,
            [activeConnectionId]: initialTab.id,
          }));
        }
      } catch (e) {
        console.error("Failed to load preferences:", e);
        // Fallback: create initial tab, preserving other connections' tabs
        const initialTab = createInitialTabState(activeConnectionId);
        setTabs((prev) => {
          const tabsFromOtherConnections = prev.filter(t => t.connectionId !== activeConnectionId);
          return [...tabsFromOtherConnections, initialTab];
        });
        setActiveTabIds((prev) => ({
          ...prev,
          [activeConnectionId]: initialTab.id,
        }));
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, [activeConnectionId]);

  const createInitialTab = useCallback(
    (partial?: Partial<Tab>): Tab => {
      return createInitialTabState(activeConnectionId, partial);
    },
    [activeConnectionId],
  );

  // Save tabs to file storage when they change
  useEffect(() => {
    if (!activeConnectionId || isLoading) return;

    const connectionTabs = tabs.filter(
      (t) => t.connectionId === activeConnectionId,
    );
    const activeTabId = activeTabIds[activeConnectionId] || null;

    saveTabsToStorage(activeConnectionId, connectionTabs, activeTabId);
  }, [tabs, activeTabIds, activeConnectionId, isLoading]);

  const activeTabId = activeConnectionId
    ? activeTabIds[activeConnectionId] || null
    : null;

  const setActiveTabId = useCallback(
    (id: string | null) => {
      if (activeConnectionId && id) {
        setActiveTabIds((prev) => ({ ...prev, [activeConnectionId]: id }));
      }
    },
    [activeConnectionId],
  );

  const addTab = useCallback(
    (partial?: Partial<Tab>) => {
      if (!activeConnectionId) return "";

      if (partial?.type === "database_objects" && partial.schema) {
        const existing = tabsRef.current.find(
          (tab) =>
            tab.connectionId === activeConnectionId &&
            tab.type === "database_objects" &&
            tab.schema === partial.schema,
        );
        if (existing) {
          setActiveTabId(existing.id);
          return existing.id;
        }
      }

      const existing = findExistingTableTab(
        tabsRef.current,
        activeConnectionId,
        partial?.type === "table_design"
          ? partial?.designTable || undefined
          : partial?.activeTable || undefined,
        partial?.schema,
        partial?.type === "table_design" ? "table_design" : "table",
      );
      if (existing) {
        setActiveTabId(existing.id);
        return existing.id;
      }

      const id = generateTabId();
      setTabs((prev) => {
        const title = generateTabTitle(prev, activeConnectionId, partial);
        const newTab = createInitialTab({
          id,
          title,
          connectionId: activeConnectionId,
          ...partial,
        });
        return [...prev, newTab];
      });
      setActiveTabId(id);
      return id;
    },
    [createInitialTab, activeConnectionId, setActiveTabId],
  );

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const {
          newTabs,
          newActiveTabId: nextActiveId,
        } = closeTabWithState(
          prev,
          activeConnectionId || "",
          activeTabId,
          id,
        );

        if (nextActiveId !== activeTabId) {
          setActiveTabIds((prevIds) => ({
            ...prevIds,
            [activeConnectionId || ""]: nextActiveId || "",
          }));
        }

        return newTabs;
      });
    },
    [activeConnectionId, activeTabId],
  );

  const closeAllTabs = useCallback(() => {
    if (!activeConnectionId) return;
    setTabs((prev) => {
      const { newTabs, newActiveTabId } = closeAllTabsForConnection(
        prev,
        activeConnectionId,
      );
      setActiveTabIds((prevIds) => ({
        ...prevIds,
        [activeConnectionId]: newActiveTabId || "",
      }));
      return newTabs;
    });
  }, [activeConnectionId]);

  const closeOtherTabs = useCallback(
    (id: string) => {
      if (!activeConnectionId) return;
      setTabs((prev) => {
        const newTabs = closeOtherTabsForConnection(
          prev,
          activeConnectionId,
          id,
        );
        setActiveTabIds((prevIds) => ({
          ...prevIds,
          [activeConnectionId]: id,
        }));
        return newTabs;
      });
    },
    [activeConnectionId],
  );

  const closeTabsToLeftInternal = useCallback(
    (id: string) => {
      if (!activeConnectionId) return;
      setTabs((prev) => {
        const { newTabs, newActiveTabId } = closeTabsToLeft(
          prev,
          activeConnectionId,
          id,
          activeTabId,
        );
        if (newActiveTabId && newActiveTabId !== activeTabId) {
          setActiveTabIds((prevIds) => ({
            ...prevIds,
            [activeConnectionId]: newActiveTabId,
          }));
        }
        return newTabs;
      });
    },
    [activeConnectionId, activeTabId],
  );

  const closeTabsToRightInternal = useCallback(
    (id: string) => {
      if (!activeConnectionId) return;
      setTabs((prev) => {
        const { newTabs, newActiveTabId } = closeTabsToRight(
          prev,
          activeConnectionId,
          id,
          activeTabId,
        );
        if (newActiveTabId && newActiveTabId !== activeTabId) {
          setActiveTabIds((prevIds) => ({
            ...prevIds,
            [activeConnectionId]: newActiveTabId,
          }));
        }
        return newTabs;
      });
    },
    [activeConnectionId, activeTabId],
  );

  const updateTab = useCallback((id: string, partial: Partial<Tab>) => {
    setTabs((prev) => updateTabInList(prev, id, partial));
  }, []);

  const moveTabToConnection = useCallback(
    async (
      id: string,
      targetConnectionId: string,
      partial?: Partial<Tab>,
    ): Promise<boolean> => {
      const currentTabs = tabsRef.current;
      const tab = currentTabs.find((item) => item.id === id);
      if (!tab) return false;

      const sourceConnectionId = tab.connectionId;
      const movedTab: Tab = {
        ...tab,
        ...partial,
        id,
        connectionId: targetConnectionId,
      };
      const nextTabs = currentTabs.map((item) =>
        item.id === id ? movedTab : item,
      );
      const sourceTabs = nextTabs.filter(
        (item) => item.connectionId === sourceConnectionId,
      );
      const targetTabs = nextTabs.filter(
        (item) => item.connectionId === targetConnectionId,
      );
      const sourceActiveTabId =
        activeTabIds[sourceConnectionId] === id
          ? sourceTabs[0]?.id ?? null
          : activeTabIds[sourceConnectionId] ?? null;

      setTabs(nextTabs);
      setActiveTabIds((prev) => ({
        ...prev,
        [sourceConnectionId]: sourceActiveTabId ?? "",
        [targetConnectionId]: id,
      }));

      await Promise.all([
        saveTabsToStorage(sourceConnectionId, sourceTabs, sourceActiveTabId),
        saveTabsToStorage(targetConnectionId, targetTabs, id),
      ]);

      return true;
    },
    [activeTabIds],
  );

  const closeTabsForDatabase = useCallback(
    async (connectionId: string, database: string): Promise<number> => {
      const currentTabs = tabsRef.current;
      const tabsToClose = currentTabs.filter(
        (tab) => tab.connectionId === connectionId && tab.schema === database,
      );
      if (tabsToClose.length === 0) return 0;

      const closingIds = new Set(tabsToClose.map((tab) => tab.id));
      const nextTabs = currentTabs.filter((tab) => !closingIds.has(tab.id));
      const connectionTabs = nextTabs.filter(
        (tab) => tab.connectionId === connectionId,
      );
      const currentActiveId = activeTabIds[connectionId] ?? null;
      const nextActiveTabId =
        currentActiveId && !closingIds.has(currentActiveId)
          ? currentActiveId
          : connectionTabs[0]?.id ?? null;

      setTabs(nextTabs);
      setActiveTabIds((prev) => ({
        ...prev,
        [connectionId]: nextActiveTabId ?? "",
      }));

      await saveTabsToStorage(connectionId, connectionTabs, nextActiveTabId);
      return tabsToClose.length;
    },
    [activeTabIds],
  );

  const getSchema = useCallback(
    async (
      connectionId: string,
      schemaVersion?: number,
      schema?: string,
    ): Promise<TableSchema[]> => {
      const cacheKey = schema ? `${connectionId}:${schema}` : connectionId;
      const cached = schemaCacheRef.current[cacheKey];

      if (shouldUseCachedSchema(cached, schemaVersion)) {
        return cached!.data;
      }

      const data = await invoke<TableSchema[]>("get_schema_snapshot", {
        connectionId,
        ...(schema ? { schema } : {}),
      });

      // Update cache in ref (no state update = no re-render)
      schemaCacheRef.current = {
        ...schemaCacheRef.current,
        [cacheKey]: createSchemaCacheEntry(data, schemaVersion || 0),
      };

      return data;
    },
    [],
  ); // No dependencies - stable function

  const activeTab = useMemo(() => {
    return getActiveTab(tabs, activeConnectionId, activeTabId);
  }, [tabs, activeTabId, activeConnectionId]);

  const connectionTabs = useMemo(() => {
    return getConnectionTabs(tabs, activeConnectionId);
  }, [tabs, activeConnectionId]);

  const contextValue = useMemo(
    () => ({
      tabs: connectionTabs,
      activeTabId,
      activeTab,
      addTab,
      closeTab,
      updateTab,
      moveTabToConnection,
      closeTabsForDatabase,
      setActiveTabId,
      closeAllTabs,
      closeOtherTabs,
      closeTabsToLeft: closeTabsToLeftInternal,
      closeTabsToRight: closeTabsToRightInternal,
      getSchema,
    }),
    [
      connectionTabs,
      activeTabId,
      activeTab,
      addTab,
      closeTab,
      updateTab,
      moveTabToConnection,
      closeTabsForDatabase,
      setActiveTabId,
      closeAllTabs,
      closeOtherTabs,
      closeTabsToLeftInternal,
      closeTabsToRightInternal,
      getSchema,
    ],
  );

  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
};

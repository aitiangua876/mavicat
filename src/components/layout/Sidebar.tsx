import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Edit2,
  Loader2,
  Plus,
  Power,
  Search,
  Settings,
  Shield,
  Terminal,
} from "lucide-react";
import { useDatabase } from "../../hooks/useDatabase";
import { useSidebarResize } from "../../hooks/useSidebarResize";
import { useConnectionManager, type ConnectionStatus } from "../../hooks/useConnectionManager";
import { useDrivers } from "../../hooks/useDrivers";
import { getDriverColor, getDriverIcon } from "../../utils/driverUI";
import { ExplorerSidebar, type SidebarTab } from "./ExplorerSidebar";
import { PanelDatabaseProvider } from "./PanelDatabaseProvider";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { NewConnectionModal } from "../modals/NewConnectionModal";
import type { SavedConnection } from "../../contexts/DatabaseContext";
import { NavicatConnectionIcon } from "../icons/NavicatStyleIcons";
import { CreateDatabaseModal } from "../modals/CreateDatabaseModal";
import { isMultiDatabaseCapable } from "../../utils/database";
import { supportsCreateDatabase } from "../../utils/createDatabase";

export const Sidebar = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    activeConnectionId,
    connections: savedConnections,
    connectionDataMap,
    loadConnections,
    loadDatabaseData,
    setSelectedDatabases,
  } = useDatabase();
  const {
    connections,
    handleConnect,
    handleDisconnect,
    handleSwitch,
  } = useConnectionManager();
  const { allDrivers } = useDrivers();

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("structure");
  const [search, setSearch] = useState("");
  const [expandedConnectionIds, setExpandedConnectionIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    connectionId: string;
  } | null>(null);
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null);
  const [createDatabaseTarget, setCreateDatabaseTarget] = useState<ConnectionStatus | null>(null);
  const { sidebarWidth, startResize } = useSidebarResize(() => undefined);

  useEffect(() => {
    if (!activeConnectionId) return;
    setExpandedConnectionIds((prev) => new Set(prev).add(activeConnectionId));
  }, [activeConnectionId]);

  const filteredConnections = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = (value?: string | null) =>
      !!value && value.toLowerCase().includes(query);
    const dataMatches = (connectionId: string) => {
      if (!query) return true;
      const data = connectionDataMap[connectionId];
      if (!data) return false;
      const objectNames = [
        data.databaseName,
        ...data.selectedDatabases,
        ...data.schemas,
        ...data.tables.map((table) => table.name),
        ...data.views.map((view) => view.name),
        ...data.routines.map((routine) => routine.name),
        ...data.triggers.map((trigger) => trigger.name),
        ...Object.entries(data.databaseDataMap).flatMap(([database, databaseData]) => [
          database,
          ...databaseData.tables.map((table) => table.name),
          ...databaseData.views.map((view) => view.name),
          ...databaseData.routines.map((routine) => routine.name),
          ...databaseData.triggers.map((trigger) => trigger.name),
        ]),
        ...Object.entries(data.schemaDataMap).flatMap(([schema, schemaData]) => [
          schema,
          ...schemaData.tables.map((table) => table.name),
          ...schemaData.views.map((view) => view.name),
          ...schemaData.routines.map((routine) => routine.name),
          ...schemaData.triggers.map((trigger) => trigger.name),
        ]),
      ];
      return objectNames.some((value) => matches(value));
    };
    const list = query
      ? connections.filter((conn) =>
          [conn.name, conn.database, conn.host, conn.driver].some((value) => matches(value)) ||
          dataMatches(conn.id),
        )
      : connections;

    return [...list].sort((a, b) => {
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [connectionDataMap, connections, search]);

  const toggleExpanded = (connectionId: string) => {
    setExpandedConnectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(connectionId)) next.delete(connectionId);
      else next.add(connectionId);
      return next;
    });
  };

  const openConnection = async (connection: ConnectionStatus) => {
    try {
      if (!connection.isOpen) {
        await handleConnect(connection.id);
      } else {
        handleSwitch(connection.id);
      }
      setExpandedConnectionIds((prev) => new Set(prev).add(connection.id));
      navigate("/editor");
    } catch (error) {
      console.error("Failed to open connection", error);
    }
  };

  const closeConnection = async (connectionId: string) => {
    await handleDisconnect(connectionId);
    setExpandedConnectionIds((prev) => {
      const next = new Set(prev);
      next.delete(connectionId);
      return next;
    });
  };

  const savedConnectionById = useMemo(() => {
    return new Map(savedConnections.map((connection) => [connection.id, connection]));
  }, [savedConnections]);

  const openEditConnection = async (connectionId: string) => {
    const savedConnection = savedConnectionById.get(connectionId);
    if (!savedConnection) return;

    const status = connections.find((connection) => connection.id === connectionId);
    if (status?.isOpen) {
      await closeConnection(connectionId);
    }
    setEditingConnection(savedConnection);
  };

  const openCreateDatabase = async (connection: ConnectionStatus) => {
    if (!supportsCreateDatabase(connection.driver)) return;

    if (!connection.isOpen) {
      await openConnection(connection);
    } else {
      handleSwitch(connection.id);
      setExpandedConnectionIds((prev) => new Set(prev).add(connection.id));
    }

    setCreateDatabaseTarget(connection);
  };

  const handleCreateDatabaseSuccess = async (databaseName: string) => {
    if (!createDatabaseTarget) return;

    const connectionId = createDatabaseTarget.id;
    const data = connectionDataMap[connectionId];
    const manifest = allDrivers.find((driver) => driver.id === createDatabaseTarget.driver);
    const capabilities = data?.capabilities ?? manifest?.capabilities ?? null;

    if (isMultiDatabaseCapable(capabilities)) {
      const current = data?.selectedDatabases ?? [];
      const next = current.includes(databaseName) ? current : [...current, databaseName];
      setSelectedDatabases(next, connectionId);
      await loadDatabaseData(databaseName, connectionId);
    }

    setExpandedConnectionIds((prev) => new Set(prev).add(connectionId));
    handleSwitch(connectionId);
  };

  const handleConnectionContextMenu = (
    event: React.MouseEvent,
    connectionId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      connectionId,
    });
  };

  const contextConnection =
    contextMenu != null
      ? connections.find((connection) => connection.id === contextMenu.connectionId)
      : undefined;

  const contextMenuItems: ContextMenuItem[] = contextConnection
    ? [
        {
          label: contextConnection.isOpen ? "切换到此连接" : "打开连接",
          icon: Terminal,
          action: () => void openConnection(contextConnection),
        },
        ...(supportsCreateDatabase(contextConnection.driver)
          ? [
              {
                label: "新建数据库...",
                icon: Database,
                action: () => void openCreateDatabase(contextConnection),
              },
            ]
          : []),
        {
          label: "编辑连接...",
          icon: Edit2,
          action: () => void openEditConnection(contextConnection.id),
        },
        { separator: true },
        {
          label: "复制名称",
          icon: Copy,
          action: () => void navigator.clipboard.writeText(contextConnection.name),
        },
        { separator: true },
        {
          label: t("connections.disconnect"),
          icon: Power,
          action: () => void closeConnection(contextConnection.id),
          disabled: !contextConnection.isOpen,
          danger: true,
        },
      ]
    : [];

  return (
    <aside
      className="relative shrink-0 bg-[#242424] border-r border-[#151515] text-[#e6e6e6] flex flex-col min-h-0"
      style={{ width: sidebarWidth }}
    >
      <div
        onMouseDown={startResize}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/60 z-40"
      />

      <div className="h-10 px-2.5 flex items-center justify-between border-b border-[#151515] bg-[#2f2f2f]">
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          <NavicatConnectionIcon size={22} />
          <span>我的连接</span>
        </div>
        <div className="flex items-center">
          <button
            onClick={() => navigate("/connections")}
            className="p-1.5 rounded-sm text-[#d7d7d7] hover:bg-white/10 hover:text-white"
            title={t("connections.addConnection")}
          >
            <Plus size={19} />
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="p-1.5 rounded-sm text-[#d7d7d7] hover:bg-white/10 hover:text-white"
            title={t("sidebar.settings")}
          >
            <Settings size={19} />
          </button>
        </div>
      </div>

      <div className="p-2 border-b border-[#151515]">
        <div className="relative">
          <Search size={17} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8a8a8a]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索"
            className="w-full h-9 bg-[#1f1f1f] border border-[#3a3a3a] rounded-sm pl-8 pr-2.5 text-[15px] text-[#eeeeee] placeholder:text-[#777] focus:outline-none focus:border-[#3778d8]"
          />
        </div>
      </div>

      <div className="custom-scrollbar overflow-y-auto flex-1 min-h-0 py-1">
        {filteredConnections.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-[#8a8a8a]">
            暂无连接
          </div>
        ) : (
          filteredConnections.map((connection) => {
            const isExpanded = expandedConnectionIds.has(connection.id) || !!search.trim();
            const isActive = activeConnectionId === connection.id;
            const driverManifest = allDrivers.find((driver) => driver.id === connection.driver);
            const driverColor = getDriverColor(driverManifest);
            const hasError = !!connection.error;
            const isConnected = connection.isOpen && connection.isConnected && !hasError;
            const iconBackground = connection.isConnecting
              ? "#475569"
              : isConnected
                ? driverColor
                : hasError
                  ? "#6f2e2e"
                  : "#565656";
            const statusTitle = connection.isConnecting
              ? "连接中"
              : hasError
                ? `连接失败：${connection.error}`
                : isConnected
                  ? "已连接"
                  : "未连接";
            const statusDotClass = connection.isConnecting
              ? "bg-sky-400 animate-pulse"
              : hasError
                ? "bg-red-400"
                : isConnected
                  ? "bg-emerald-400"
                  : "bg-[#777]";

            return (
              <div key={connection.id}>
                <div
                  className={`group flex items-center gap-1 h-8 pl-1 pr-1.5 text-[15px] font-semibold cursor-default ${
                    isActive
                      ? "bg-[#2f78d6] text-white"
                      : connection.isOpen
                        ? "text-[#dcdcdc] hover:bg-[#343434]"
                        : "text-[#a6a6a6] hover:bg-[#303030]"
                  }`}
                  onDoubleClick={() => void openConnection(connection)}
                  onContextMenu={(event) => handleConnectionContextMenu(event, connection.id)}
                  title={statusTitle}
                >
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!connection.isOpen) {
                        void openConnection(connection);
                      } else {
                        toggleExpanded(connection.id);
                      }
                    }}
                    className="w-5 h-full flex items-center justify-center text-current/80"
                    title={isExpanded ? "收起" : "展开"}
                  >
                    {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                  </button>

                  <button
                    onClick={() => void openConnection(connection)}
                    className="flex-1 min-w-0 flex items-center gap-2 h-full text-left"
                  >
                    <span
                      className={`relative w-6 h-6 rounded-[5px] flex items-center justify-center text-white shrink-0 shadow-sm transition-all ${
                        isConnected ? "" : "opacity-85 grayscale"
                      }`}
                      style={{ backgroundColor: iconBackground }}
                      title={statusTitle}
                    >
                      {connection.isConnecting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        getDriverIcon(driverManifest, 17)
                      )}
                      <span
                        className={`absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full border border-[#242424] ${statusDotClass}`}
                      />
                    </span>
                    <span className={`truncate ${connection.isOpen ? "" : "opacity-85"}`}>
                      {connection.name}
                    </span>
                    {connection.sshEnabled && (
                      <Shield size={13} className="text-emerald-300 shrink-0" />
                    )}
                  </button>

                  {connection.isOpen && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void closeConnection(connection.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-sm hover:bg-black/20"
                      title={t("connections.disconnect")}
                    >
                      <Power size={14} />
                    </button>
                  )}
                </div>

                {isExpanded && connection.isOpen && (
                  <div className="pl-5">
                    <PanelDatabaseProvider connectionId={connection.id}>
                      <ExplorerSidebar
                        sidebarWidth={sidebarWidth}
                        startResize={startResize}
                        onCollapse={() => undefined}
                        sidebarTab={sidebarTab}
                        onSidebarTabChange={setSidebarTab}
                        embedded
                        globalSearch={search}
                      />
                    </PanelDatabaseProvider>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      <NewConnectionModal
        isOpen={editingConnection !== null}
        onClose={() => setEditingConnection(null)}
        onSave={() => {
          void loadConnections();
          setEditingConnection(null);
        }}
        initialConnection={editingConnection}
      />

      {createDatabaseTarget && (
        <CreateDatabaseModal
          isOpen={createDatabaseTarget !== null}
          connectionId={createDatabaseTarget.id}
          connectionName={createDatabaseTarget.name}
          driver={createDatabaseTarget.driver}
          onClose={() => setCreateDatabaseTarget(null)}
          onSuccess={handleCreateDatabaseSuccess}
        />
      )}
    </aside>
  );
};

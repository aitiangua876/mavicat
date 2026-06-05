import React, { useState } from "react";
import { supportsManageTables } from "../../../utils/driverCapabilities";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
  Download,
  Upload,
  Network,
} from "lucide-react";
import { Accordion } from "./Accordion";
import { SidebarTableItem } from "./SidebarTableItem";
import { SidebarViewItem } from "./SidebarViewItem";
import { SidebarRoutineItem } from "./SidebarRoutineItem";
import { SidebarTriggerItem } from "./SidebarTriggerItem";
import type { SchemaData, RoutineInfo, TriggerInfo } from "../../../contexts/DatabaseContext";
import type { TableColumn } from "../../../types/schema";
import type { ContextMenuData } from "../../../types/sidebar";
import type { DriverCapabilities } from "../../../types/plugins";
import { groupRoutinesByType } from "../../../utils/routines";
import { formatObjectCount } from "../../../utils/schema";
import { NavicatDatabaseIcon } from "../../icons/NavicatStyleIcons";

interface SidebarDatabaseItemProps {
  databaseName: string;
  databaseData: SchemaData | undefined;
  activeTable: string | null;
  activeSchema: string | null;
  connectionId: string;
  driver: string;
  schemaVersion: number;
  isOpen: boolean;
  isSelected?: boolean;
  onSelectDatabase: (database: string) => void;
  onOpenDatabase: (database: string) => void;
  onCloseDatabase: (database: string) => void;
  onRefreshDatabase: (database: string) => void;
  onTableClick: (name: string, database: string) => void;
  onTableDoubleClick: (name: string, database: string) => void;
  onViewClick: (name: string) => void;
  onViewDoubleClick: (name: string, database: string) => void;
  onRoutineDoubleClick: (routine: RoutineInfo, database: string) => void;
  onTriggerDoubleClick: (trigger: TriggerInfo, database: string) => void;
  onContextMenu: (
    e: React.MouseEvent,
    type: string,
    id: string,
    label: string,
    data?: ContextMenuData,
  ) => void;
  onAddColumn: (tableName: string) => void;
  onEditColumn: (tableName: string, col: TableColumn) => void;
  onAddIndex: (tableName: string) => void;
  onDropIndex: (tableName: string, indexName: string) => void;
  onAddForeignKey: (tableName: string) => void;
  onDropForeignKey: (tableName: string, fkName: string) => void;
  onCreateTable: () => void;
  onCreateView: () => void;
  onCreateTrigger: (schema: string) => void;
  onDump?: (database: string) => void;
  onImport?: (database: string) => void;
  onViewDiagram?: (database: string) => void;
  capabilities?: DriverCapabilities | null;
  globalSearch?: string;
}

export const SidebarDatabaseItem = ({
  databaseName,
  databaseData,
  activeTable,
  activeSchema,
  connectionId,
  driver,
  schemaVersion,
  isOpen,
  isSelected = false,
  onSelectDatabase,
  onOpenDatabase,
  onCloseDatabase,
  onRefreshDatabase,
  onTableClick,
  onTableDoubleClick,
  onViewClick,
  onViewDoubleClick,
  onRoutineDoubleClick,
  onTriggerDoubleClick,
  onContextMenu,
  onAddColumn,
  onEditColumn,
  onAddIndex,
  onDropIndex,
  onAddForeignKey,
  onDropForeignKey,
  onCreateTable,
  onCreateView,
  onCreateTrigger,
  onDump,
  onImport,
  onViewDiagram,
  capabilities,
  globalSearch = "",
}: SidebarDatabaseItemProps) => {
  const { t } = useTranslation();

  const [tablesOpen, setTablesOpen] = useState(true);
  const [viewsOpen, setViewsOpen] = useState(true);
  const [routinesOpen, setRoutinesOpen] = useState(false);
  const [triggersOpen, setTriggersOpen] = useState(false);
  const [functionsOpen, setFunctionsOpen] = useState(true);
  const [proceduresOpen, setProceduresOpen] = useState(true);
  const objectFilter = globalSearch.trim().toLowerCase();

  const tables = databaseData?.tables ?? [];
  const filteredTables = objectFilter
    ? tables.filter((t) => t.name.toLowerCase().includes(objectFilter))
    : tables;
  const views = databaseData?.views ?? [];
  const filteredViews = objectFilter
    ? views.filter((v) => v.name.toLowerCase().includes(objectFilter))
    : views;
  const routines = databaseData?.routines ?? [];
  const triggers = databaseData?.triggers ?? [];
  const filteredTriggers = objectFilter
    ? triggers.filter((tr) => tr.name.toLowerCase().includes(objectFilter))
    : triggers;
  const isLoading = databaseData?.isLoading ?? false;
  const isLoaded = databaseData?.isLoaded ?? false;

  const groupedRoutines = routines.length > 0
    ? groupRoutinesByType(routines)
    : { procedures: [], functions: [] };

  const handleOpen = () => {
    onOpenDatabase(databaseName);
  };

  const handleSelect = () => {
    onSelectDatabase(databaseName);
  };

  const handleToggle = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isOpen) {
      onCloseDatabase(databaseName);
    } else {
      handleOpen();
    }
  };

  const itemCount = isLoaded
    ? formatObjectCount(tables.length, views.length, routines.length, triggers.length)
    : "";

  return (
    <div className="flex flex-col">
      {/* Database header */}
      <div
        className={`flex items-center justify-between px-2 py-1 group/db cursor-pointer transition-colors ${
          isSelected
            ? "bg-accent-success text-white border-l-2 border-accent-success"
            : "border-l-2 border-transparent hover:bg-surface-secondary"
        }`}
        onClick={handleSelect}
        onDoubleClick={handleOpen}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e, "database", databaseName, databaseName);
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            onClick={handleToggle}
            className="p-0.5 rounded hover:bg-surface-secondary text-muted hover:text-primary transition-colors"
          >
            {isOpen ? (
              <ChevronDown size={17} className="text-muted shrink-0" />
            ) : (
              <ChevronRight size={17} className="text-muted shrink-0" />
            )}
          </button>
          <NavicatDatabaseIcon
            size={18}
            active={isOpen}
            className="shrink-0"
          />
          <span
            className={`text-[15px] font-semibold truncate ${
              isSelected ? "text-white" : isOpen ? "text-primary" : "text-muted"
            }`}
          >
            {databaseName}
          </span>
          {isLoaded && (
            <span className="ml-1 text-xs text-muted opacity-60 shrink-0">
              {itemCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {isOpen && onImport && (
            <button
              onClick={(e) => { e.stopPropagation(); onImport(databaseName); }}
              className="p-1 rounded hover:bg-surface-secondary text-muted hover:text-green-400 transition-colors"
              title={t("dump.importDatabase")}
            >
              <Upload size={16} />
            </button>
          )}
          {isOpen && onDump && (
            <button
              onClick={(e) => { e.stopPropagation(); onDump(databaseName); }}
              className="p-1 rounded hover:bg-surface-secondary text-muted hover:text-blue-400 transition-colors"
              title={t("dump.dumpDatabase")}
            >
              <Download size={16} />
            </button>
          )}
          {isOpen && onViewDiagram && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewDiagram(databaseName); }}
              className="p-1 rounded hover:bg-surface-secondary text-muted hover:text-orange-400 transition-colors"
              title={t("sidebar.viewERDiagram")}
            >
              <Network size={16} className="rotate-90" />
            </button>
          )}
          {isOpen && <button
            onClick={(e) => { e.stopPropagation(); onRefreshDatabase(databaseName); }}
            className="p-1 rounded hover:bg-surface-secondary text-muted hover:text-primary transition-colors"
            title={t("sidebar.refreshTables")}
          >
            <RefreshCw size={16} />
          </button>}
        </div>
      </div>

      {/* Database contents */}
      {isOpen && (
        <div className="ml-3.5 border-l border-default">
          {isLoading && !isLoaded ? (
            <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" />
              {t("sidebar.loadingSchema")}
            </div>
          ) : (
            <>
              {/* Tables */}
              <Accordion
                title={`${t("sidebar.tables")} (${tables.length})`}
                isOpen={tablesOpen}
                onToggle={() => setTablesOpen(!tablesOpen)}
                actions={
                  supportsManageTables(capabilities) ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateTable();
                      }}
                      className="p-1 rounded hover:bg-surface-secondary text-muted hover:text-primary transition-colors"
                      title="Create New Table"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  ) : undefined
                }
              >
                {filteredTables.length === 0 ? (
                  <div className="text-center p-2 text-xs text-muted italic">
                    {objectFilter ? t("sidebar.noTablesMatch") : t("sidebar.noTables")}
                  </div>
                ) : (
                  <div>
                    {filteredTables.map((table) => (
                      <SidebarTableItem
                        key={table.name}
                        table={table}
                        activeTable={activeSchema === databaseName ? activeTable : null}
                        onTableClick={(name) => onTableClick(name, databaseName)}
                        onTableDoubleClick={(name) => onTableDoubleClick(name, databaseName)}
                        onContextMenu={onContextMenu}
                        connectionId={connectionId}
                        driver={driver}
                        canManage={supportsManageTables(capabilities)}
                        onAddColumn={onAddColumn}
                        onEditColumn={onEditColumn}
                        onAddIndex={onAddIndex}
                        onDropIndex={onDropIndex}
                        onAddForeignKey={onAddForeignKey}
                        onDropForeignKey={onDropForeignKey}
                        schemaVersion={schemaVersion}
                        schema={databaseName}
                      />
                    ))}
                  </div>
                )}
              </Accordion>

              {/* Views */}
              {capabilities?.views !== false && (
              <Accordion
                title={`${t("sidebar.views")} (${views.length})`}
                isOpen={viewsOpen}
                onToggle={() => setViewsOpen(!viewsOpen)}
                actions={
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateView();
                      }}
                      className="p-1 rounded hover:bg-surface-secondary text-muted hover:text-primary transition-colors"
                      title={t("sidebar.createView") || "Create New View"}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                }
              >
                {filteredViews.length === 0 ? (
                  <div className="text-center p-2 text-xs text-muted italic">
                    {objectFilter ? t("sidebar.noViewsMatch") : t("sidebar.noViews")}
                  </div>
                ) : (
                  <div>
                    {filteredViews.map((view) => (
                      <SidebarViewItem
                        key={view.name}
                        view={view}
                        activeView={null}
                        onViewClick={onViewClick}
                        onViewDoubleClick={(name) => onViewDoubleClick(name, databaseName)}
                        onContextMenu={onContextMenu}
                        connectionId={connectionId}
                        driver={driver}
                        schema={databaseName}
                      />
                    ))}
                  </div>
                )}
              </Accordion>
              )}

              {/* Triggers */}
              {capabilities?.triggers === true && (
                <Accordion
                  title={`${t("sidebar.triggers")} (${triggers.length})`}
                  isOpen={triggersOpen}
                  onToggle={() => setTriggersOpen(!triggersOpen)}
                  actions={
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreateTrigger(databaseName);
                        }}
                        className="p-1 rounded hover:bg-surface-secondary text-muted hover:text-primary transition-colors"
                        title={t("sidebar.createTrigger") || "Create New Trigger"}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  }
                >
                  {filteredTriggers.length === 0 ? (
                    <div className="text-center p-2 text-xs text-muted italic">
                      {objectFilter ? t("sidebar.noTriggersMatch") : t("sidebar.noTriggers")}
                    </div>
                  ) : (
                    <div>
                      {filteredTriggers.map((trigger) => (
                        <SidebarTriggerItem
                          key={trigger.name}
                          trigger={trigger}
                          connectionId={connectionId}
                          onContextMenu={onContextMenu}
                          onDoubleClick={(tr) => onTriggerDoubleClick(tr, databaseName)}
                          schema={databaseName}
                        />
                      ))}
                    </div>
                  )}
                </Accordion>
              )}

              {/* Routines */}
              {capabilities?.routines === true && (
              <Accordion
                title={`${t("sidebar.routines")} (${routines.length})`}
                isOpen={routinesOpen}
                onToggle={() => setRoutinesOpen(!routinesOpen)}
              >
                {routines.length === 0 ? (
                  <div className="text-center p-2 text-xs text-muted italic">
                    {t("sidebar.noRoutines")}
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {groupedRoutines.functions.length > 0 && (
                      <div className="mb-2">
                        <button
                          onClick={() => setFunctionsOpen(!functionsOpen)}
                          className="flex items-center gap-1 px-2 py-1 w-full text-left text-xs font-semibold text-muted uppercase tracking-wider hover:text-secondary transition-colors"
                        >
                          {functionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          <span>{t("sidebar.functions")}</span>
                          <span className="ml-auto text-[10px] opacity-50">{groupedRoutines.functions.length}</span>
                        </button>
                        {functionsOpen && groupedRoutines.functions.map((routine) => (
                          <SidebarRoutineItem
                            key={routine.name}
                            routine={routine}
                            connectionId={connectionId}
                            onContextMenu={onContextMenu}
                            onDoubleClick={(r) => onRoutineDoubleClick(r, databaseName)}
                            schema={databaseName}
                          />
                        ))}
                      </div>
                    )}

                    {groupedRoutines.procedures.length > 0 && (
                      <div>
                        <button
                          onClick={() => setProceduresOpen(!proceduresOpen)}
                          className="flex items-center gap-1 px-2 py-1 w-full text-left text-xs font-semibold text-muted uppercase tracking-wider hover:text-secondary transition-colors"
                        >
                          {proceduresOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          <span>{t("sidebar.procedures")}</span>
                          <span className="ml-auto text-[10px] opacity-50">{groupedRoutines.procedures.length}</span>
                        </button>
                        {proceduresOpen && groupedRoutines.procedures.map((routine) => (
                          <SidebarRoutineItem
                            key={routine.name}
                            routine={routine}
                            connectionId={connectionId}
                            onContextMenu={onContextMenu}
                            onDoubleClick={(r) => onRoutineDoubleClick(r, databaseName)}
                            schema={databaseName}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Accordion>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

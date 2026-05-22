import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ask, open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import {
  ArrowRightLeft,
  Archive,
  DatabaseBackup,
  Download,
  FilePlus2,
  FileInput,
  Plus,
  Upload,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { SplitPaneLayout } from './SplitPaneLayout';
import { useConnectionLayoutContext } from '../../hooks/useConnectionLayoutContext';
import { useGlobalShortcuts } from '../../hooks/useGlobalShortcuts';
import { useDatabase } from '../../hooks/useDatabase';
import { useEditor } from '../../hooks/useEditor';
import { ToolWizardModal } from '../modals/ToolWizardModal';
import { ExportProgressModal, type ExportStatus } from '../modals/ExportProgressModal';
import { DumpDatabaseModal } from '../modals/DumpDatabaseModal';
import { ImportDatabaseModal } from '../modals/ImportDatabaseModal';
import { ClipboardImportModal } from '../modals/ClipboardImportModal';
import { reconstructTableQuery } from '../../utils/editor';
import { toErrorMessage } from '../../utils/errors';
import { getDatabaseList, isMultiDatabaseCapable } from '../../utils/database';

type ToolbarAction =
  | 'connections'
  | 'query'
  | 'import'
  | 'export'
  | 'backup'
  | 'sql_import'
  | 'schema_sync'
  | 'data_transfer';

interface ExportProgress {
  rows_processed: number;
}

type ExportFormat = 'csv' | 'json' | 'excel' | 'sql';

const EXPORT_FILE_META: Record<ExportFormat, { label: string; extension: string }> = {
  csv: { label: 'CSV', extension: 'csv' },
  json: { label: 'JSON', extension: 'json' },
  excel: { label: 'Excel', extension: 'xls' },
  sql: { label: 'SQL', extension: 'sql' },
};

const toolbarItems = [
  { label: '连接', icon: Plus, tone: 'text-emerald-300', action: 'connections' },
  { label: '新建查询', icon: FilePlus2, tone: 'text-sky-300', action: 'query' },
  { label: '导入', icon: Upload, tone: 'text-cyan-300', action: 'import' },
  { label: '导出', icon: Download, tone: 'text-indigo-300', action: 'export' },
  { label: '备份', icon: DatabaseBackup, tone: 'text-amber-300', action: 'backup' },
  { label: 'SQL文件', icon: FileInput, tone: 'text-rose-300', action: 'sql_import' },
  { label: '结构同步', icon: ArrowRightLeft, tone: 'text-violet-300', action: 'schema_sync' },
  { label: '数据迁移', icon: Archive, tone: 'text-lime-300', action: 'data_transfer' },
] as const;

function WorkbenchToolbar() {
  const navigate = useNavigate();
  const { addTab, activeTab } = useEditor();
  const {
    activeConnectionId,
    activeConnectionName,
    activeDatabaseName,
    activeDriver,
    activeCapabilities,
    activeSchema,
    connections,
    connectionDataMap,
    openConnectionIds,
    connect,
    switchConnection,
    selectedDatabases,
    selectedSchemas,
    schemas,
    loadDatabaseData,
    setActiveTable,
    tables,
    refreshTables,
  } = useDatabase();
  const [wizardKind, setWizardKind] = useState<Exclude<ToolbarAction, 'connections' | 'query'> | null>(null);
  const [wizardConnectionId, setWizardConnectionId] = useState('');
  const [wizardDatabaseName, setWizardDatabaseName] = useState('');
  const [transferTargetConnectionId, setTransferTargetConnectionId] = useState('');
  const [transferTargetDatabaseName, setTransferTargetDatabaseName] = useState('');
  const [dumpModal, setDumpModal] = useState<{ connectionId: string; databaseName: string } | null>(null);
  const [importModal, setImportModal] = useState<{ connectionId: string; filePath: string; database: string } | null>(null);
  const [dataImportModal, setDataImportModal] = useState<{ text?: string; sourceLabel?: string } | null>(null);
  const [exportState, setExportState] = useState<{
    isOpen: boolean;
    status: ExportStatus;
    rowsProcessed: number;
    fileName: string;
    errorMessage?: string;
  }>({
    isOpen: false,
    status: 'exporting',
    rowsProcessed: 0,
    fileName: '',
  });

  const connectionOptions = useMemo(
    () => connections.map((connection) => ({
      id: connection.id,
      name: connection.name,
    })),
    [connections],
  );

  const getConnectionDatabaseOptions = useCallback(
    (connectionId: string) => {
      if (!connectionId) return [];

      const connection = connections.find((item) => item.id === connectionId);
      const connectionData = connectionDataMap[connectionId];
      const candidates = [
        ...(connectionData?.selectedDatabases ?? []),
        ...Object.keys(connectionData?.databaseDataMap ?? {}),
        ...(connection ? getDatabaseList(connection.params.database) : []),
        ...(connectionData?.selectedSchemas ?? []),
        ...(connectionData?.schemas ?? []),
        connectionData?.activeSchema ?? '',
        connectionData?.databaseName ?? '',
      ];

      return Array.from(new Set(candidates.filter(Boolean)));
    },
    [connections, connectionDataMap],
  );

  const selectedWizardConnectionId =
    wizardConnectionId || activeConnectionId || connectionOptions[0]?.id || '';

  const wizardDatabaseOptions = useMemo(
    () => getConnectionDatabaseOptions(selectedWizardConnectionId),
    [getConnectionDatabaseOptions, selectedWizardConnectionId],
  );

  const selectedWizardDatabaseName =
    wizardDatabaseName && wizardDatabaseOptions.includes(wizardDatabaseName)
      ? wizardDatabaseName
      : wizardDatabaseOptions[0] ?? '';

  const selectedTransferTargetConnectionId =
    transferTargetConnectionId || selectedWizardConnectionId;

  const transferTargetDatabaseOptions = useMemo(
    () => getConnectionDatabaseOptions(selectedTransferTargetConnectionId),
    [getConnectionDatabaseOptions, selectedTransferTargetConnectionId],
  );

  const selectedTransferTargetDatabaseName =
    transferTargetDatabaseName &&
    transferTargetDatabaseOptions.includes(transferTargetDatabaseName)
      ? transferTargetDatabaseName
      : transferTargetDatabaseOptions[0] ?? '';

  const transferTableOptions = useMemo(() => {
    const connectionData = connectionDataMap[selectedWizardConnectionId];
    const schemaData =
      connectionData?.databaseDataMap[selectedWizardDatabaseName] ??
      connectionData?.schemaDataMap[selectedWizardDatabaseName];
    return (schemaData?.tables ?? connectionData?.tables ?? tables).map((table) => table.name);
  }, [connectionDataMap, selectedWizardConnectionId, selectedWizardDatabaseName, tables]);

  const activateWizardConnection = useCallback(async () => {
    if (!selectedWizardConnectionId) return false;

    if (openConnectionIds.includes(selectedWizardConnectionId)) {
      switchConnection(selectedWizardConnectionId);
      return true;
    }

    await connect(selectedWizardConnectionId);
    return true;
  }, [connect, openConnectionIds, selectedWizardConnectionId, switchConnection]);

  useEffect(() => {
    const unlisten = listen<ExportProgress>('export_progress', (event) => {
      setExportState((prev) => ({
        ...prev,
        rowsProcessed: event.payload.rows_processed,
      }));
    });
    return () => {
      unlisten.then((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    if (!wizardKind) return;

    const nextConnectionId = activeConnectionId || connectionOptions[0]?.id || '';
    const activeDatabase =
      activeSchema ||
      activeDatabaseName ||
      selectedDatabases[0] ||
      selectedSchemas[0] ||
      schemas[0] ||
      '';
    const databaseOptions = getConnectionDatabaseOptions(nextConnectionId);

    setWizardConnectionId(nextConnectionId);
    setWizardDatabaseName(
      activeDatabase && databaseOptions.includes(activeDatabase)
        ? activeDatabase
        : databaseOptions[0] ?? activeDatabase,
    );
    setTransferTargetConnectionId(nextConnectionId);
    setTransferTargetDatabaseName(
      activeDatabase && databaseOptions.includes(activeDatabase)
        ? activeDatabase
        : databaseOptions[0] ?? activeDatabase,
    );
  }, [wizardKind]);

  useEffect(() => {
    if (wizardKind !== 'data_transfer' || !selectedWizardConnectionId || !selectedWizardDatabaseName) {
      return;
    }

    const connectionData = connectionDataMap[selectedWizardConnectionId];
    if (isMultiDatabaseCapable(connectionData?.capabilities)) {
      void loadDatabaseData(selectedWizardDatabaseName, selectedWizardConnectionId);
    }
  }, [
    connectionDataMap,
    loadDatabaseData,
    selectedWizardConnectionId,
    selectedWizardDatabaseName,
    wizardKind,
  ]);

  const handleWizardConnectionChange = useCallback(
    (connectionId: string) => {
      setWizardConnectionId(connectionId);

      const databaseOptions = getConnectionDatabaseOptions(connectionId);
      setWizardDatabaseName(databaseOptions[0] ?? '');

      void (async () => {
        try {
          if (openConnectionIds.includes(connectionId)) {
            switchConnection(connectionId);
          } else {
            await connect(connectionId);
          }
        } catch (e) {
          console.error('Failed to activate wizard connection:', e);
        }
      })();
    },
    [connect, getConnectionDatabaseOptions, openConnectionIds, switchConnection],
  );

  const handleWizardDatabaseChange = useCallback(
    (databaseName: string) => {
      setWizardDatabaseName(databaseName);

      const connectionData = connectionDataMap[selectedWizardConnectionId];
      if (databaseName && isMultiDatabaseCapable(connectionData?.capabilities)) {
        void loadDatabaseData(databaseName, selectedWizardConnectionId);
      }
      if (databaseName && selectedWizardConnectionId === activeConnectionId) {
        setActiveTable(null, databaseName);
      }
    },
    [activeConnectionId, connectionDataMap, loadDatabaseData, selectedWizardConnectionId, setActiveTable],
  );

  const handleTransferTargetConnectionChange = useCallback(
    (connectionId: string) => {
      setTransferTargetConnectionId(connectionId);
      const databaseOptions = getConnectionDatabaseOptions(connectionId);
      setTransferTargetDatabaseName(databaseOptions[0] ?? '');

      void (async () => {
        try {
          if (!openConnectionIds.includes(connectionId)) {
            await connect(connectionId);
          }
        } catch (e) {
          console.error('Failed to activate transfer target connection:', e);
        }
      })();
    },
    [connect, getConnectionDatabaseOptions, openConnectionIds],
  );

  const handleTransferTargetDatabaseChange = useCallback(
    (databaseName: string) => {
      setTransferTargetDatabaseName(databaseName);
      const connectionData = connectionDataMap[selectedTransferTargetConnectionId];
      if (databaseName && isMultiDatabaseCapable(connectionData?.capabilities)) {
        void loadDatabaseData(databaseName, selectedTransferTargetConnectionId);
      }
    },
    [connectionDataMap, loadDatabaseData, selectedTransferTargetConnectionId],
  );

  const runDataTransfer = useCallback(
    async (request: {
      sourceConnectionId: string;
      targetConnectionId: string;
      sourceSchema?: string;
      targetSchema?: string;
      sourceTable: string;
      targetTable?: string;
      writeMode: 'append' | 'delete_then_insert';
      batchSize: number;
    }) => {
      const report = await invoke<{
        rowsRead: number;
        rowsInserted: number;
        failedStatements: number;
        errors: string[];
      }>('start_data_transfer', { request });

      if (request.targetSchema) {
        await loadDatabaseData(request.targetSchema, request.targetConnectionId);
      }

      const suffix =
        report.failedStatements > 0
          ? `，失败 ${report.failedStatements} 条：${report.errors[0] ?? '请查看日志'}`
          : '';
      return `迁移完成：读取 ${report.rowsRead} 行，写入 ${report.rowsInserted} 行${suffix}`;
    },
    [loadDatabaseData],
  );

  const handleAction = (action: ToolbarAction) => {
    if (action === 'connections') {
      navigate('/connections');
      return;
    }

    if (action === 'query') {
      addTab({ type: 'console' });
      navigate('/editor');
      return;
    }

    setWizardKind(action);
  };

  const handleClipboardImport = () => {
    void (async () => {
      if (await activateWizardConnection()) {
        setDataImportModal({});
      }
    })();
  };

  const openFileImport = useCallback(() => {
    void (async () => {
      if (!(await activateWizardConnection())) return;

      const file = await open({
        filters: [
          { name: 'Data File', extensions: ['csv', 'tsv', 'json', 'txt'] },
        ],
      });
      if (!file || typeof file !== 'string') return;

      const text = await readTextFile(file);
      const fileName = file.split(/[/\\]/).pop() || file;
      setDataImportModal({
        text,
        sourceLabel: `来源文件：${fileName}`,
      });
      setWizardKind(null);
    })();
  }, [activateWizardConnection]);

  const exportQuery = useCallback(
    (format: ExportFormat) => {
      if (!activeTab || !activeConnectionId) return;

      const effectiveSchema = activeCapabilities?.schemas === true ? activeTab.schema : undefined;
      const tabForQuery = { ...activeTab, schema: effectiveSchema };
      const query =
        activeTab.type === 'table' && activeTab.activeTable
          ? reconstructTableQuery(tabForQuery, activeDriver ?? undefined)
          : activeTab.query;

      if (!query?.trim()) return;

      void (async () => {
        try {
          const meta = EXPORT_FILE_META[format];
          const exportTableName =
            activeTab.type === 'table' && activeTab.activeTable
              ? activeTab.activeTable
              : undefined;
          const filePath = await save({
            filters: [{ name: meta.label, extensions: [meta.extension] }],
            defaultPath: `result_${Date.now()}.${meta.extension}`,
          });

          if (!filePath) return;

          setExportState({
            isOpen: true,
            status: 'exporting',
            rowsProcessed: 0,
            fileName: filePath.split(/[/\\]/).pop() || filePath,
          });

          await invoke('export_query_to_file', {
            connectionId: activeConnectionId,
            query,
            filePath,
            format,
            csvDelimiter: format === 'csv' ? ',' : undefined,
            exportTableName,
            exportSchema: effectiveSchema,
          });

          setExportState((prev) => ({ ...prev, status: 'completed' }));
        } catch (e) {
          setExportState((prev) => ({
            ...prev,
            status: 'error',
            errorMessage: toErrorMessage(e),
          }));
        }
      })();
    },
    [activeCapabilities, activeConnectionId, activeDriver, activeTab],
  );

  const cancelExport = useCallback(() => {
    if (!activeConnectionId) return;
    void invoke('cancel_export', { connectionId: activeConnectionId }).finally(() => {
      setExportState((prev) => ({ ...prev, isOpen: false }));
    });
  }, [activeConnectionId]);

  const openSqlImport = useCallback(() => {
    void (async () => {
      if (!(await activateWizardConnection())) return;

      const file = await open({
        filters: [{ name: 'SQL / Zip File', extensions: ['sql', 'zip'] }],
      });
      if (!file || typeof file !== 'string') return;

      const confirmed = await ask(`确认导入 ${file.split(/[\\/]/).pop()}？`, {
        title: '执行 SQL 文件',
        kind: 'warning',
      });
      if (!confirmed) return;

      setImportModal({
        connectionId: selectedWizardConnectionId,
        filePath: file,
        database: selectedWizardDatabaseName || activeDatabaseName || activeConnectionName || '',
      });
      setWizardKind(null);
    })();
  }, [
    activateWizardConnection,
    activeConnectionName,
    activeDatabaseName,
    selectedWizardConnectionId,
    selectedWizardDatabaseName,
  ]);

  const canExport = !!activeConnectionId && !!activeTab && !!(
    activeTab.type === 'table' && activeTab.activeTable
      ? reconstructTableQuery(activeTab, activeDriver ?? undefined).trim()
      : activeTab.query?.trim()
  );

  const dumpConnectionData = dumpModal ? connectionDataMap[dumpModal.connectionId] : undefined;
  const dumpSchemaData = dumpModal
    ? dumpConnectionData?.databaseDataMap[dumpModal.databaseName]
      ?? dumpConnectionData?.schemaDataMap[dumpModal.databaseName]
    : undefined;
  const dumpTables = (dumpSchemaData?.tables ?? dumpConnectionData?.tables ?? tables)
    .map((table) => table.name);

  return (
    <>
      <header className="mavicat-toolbar shrink-0 bg-[#3d3d3d] border-b border-[#202020] text-[#e5e5e5]">
        <div className="h-[82px] flex items-stretch px-3 gap-1">
          {toolbarItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={`${item.label}-${index}`}
                onClick={() => handleAction(item.action)}
                className="w-[78px] flex flex-col items-center justify-center gap-1.5 border-x border-transparent text-xs text-[#eeeeee] hover:bg-white/10 hover:border-white/10 transition-colors"
                title={item.label}
              >
                <Icon size={29} strokeWidth={1.8} className={item.tone} />
                <span className="leading-none">{item.label}</span>
              </button>
            );
          })}
          <div className="ml-auto flex items-center pr-2">
            <img src="/logo-sm.png" alt="Mavicat" className="w-11 h-11 rounded-xl bg-white" />
          </div>
        </div>
      </header>

      <ToolWizardModal
        isOpen={wizardKind !== null}
        kind={wizardKind}
        onClose={() => setWizardKind(null)}
        connectionOptions={connectionOptions}
        databaseOptions={wizardDatabaseOptions}
        selectedConnectionId={selectedWizardConnectionId}
        selectedDatabaseName={selectedWizardDatabaseName}
        onConnectionChange={handleWizardConnectionChange}
        onDatabaseChange={handleWizardDatabaseChange}
        targetDatabaseOptions={transferTargetDatabaseOptions}
        selectedTargetConnectionId={selectedTransferTargetConnectionId}
        selectedTargetDatabaseName={selectedTransferTargetDatabaseName}
        onTargetConnectionChange={handleTransferTargetConnectionChange}
        onTargetDatabaseChange={handleTransferTargetDatabaseChange}
        tableOptions={transferTableOptions}
        hasConnection={!!selectedWizardConnectionId}
        canExport={canExport}
        onClipboardImport={handleClipboardImport}
        onFileImport={openFileImport}
        onExport={exportQuery}
        onBackup={() => {
          void (async () => {
            if (!(await activateWizardConnection())) return;

            const targetConnectionId = selectedWizardConnectionId;
            const targetDatabaseName =
              selectedWizardDatabaseName || activeDatabaseName || activeConnectionName || 'database';
            const connectionData = connectionDataMap[targetConnectionId];
            if (targetDatabaseName && isMultiDatabaseCapable(connectionData?.capabilities)) {
              await loadDatabaseData(targetDatabaseName, targetConnectionId);
            }

            setDumpModal({
              connectionId: targetConnectionId,
              databaseName: targetDatabaseName,
            });
            setWizardKind(null);
          })();
        }}
        onSqlImport={openSqlImport}
        onDataTransfer={runDataTransfer}
      />
      <ExportProgressModal
        isOpen={exportState.isOpen}
        status={exportState.status}
        rowsProcessed={exportState.rowsProcessed}
        fileName={exportState.fileName}
        errorMessage={exportState.errorMessage}
        onCancel={cancelExport}
        onClose={() => setExportState((prev) => ({ ...prev, isOpen: false }))}
      />
      {dumpModal && (
        <DumpDatabaseModal
          isOpen={true}
          onClose={() => setDumpModal(null)}
          connectionId={dumpModal.connectionId}
          databaseName={dumpModal.databaseName}
          tables={dumpTables}
        />
      )}
      {importModal && (
        <ImportDatabaseModal
          isOpen={true}
          onClose={() => setImportModal(null)}
          connectionId={importModal.connectionId}
          databaseName={importModal.database}
          filePath={importModal.filePath}
          onSuccess={() => {
            void refreshTables(importModal.connectionId);
          }}
        />
      )}
      {activeConnectionId && dataImportModal && (
        <ClipboardImportModal
          isOpen={true}
          onClose={() => setDataImportModal(null)}
          onSuccess={() => {
            void refreshTables(activeConnectionId);
          }}
          initialText={dataImportModal.text}
          sourceLabel={dataImportModal.sourceLabel}
        />
      )}
    </>
  );
}

function WorkbenchStatusBar() {
  const { activeConnectionName, activeDatabaseName, activeConnectionId } = useDatabase();

  return (
    <footer className="h-7 shrink-0 bg-[#3c3c3c] border-t border-[#202020] text-xs text-[#e0e0e0] flex items-center">
      <div className="px-3 border-r border-white/10 min-w-[260px] truncate">
        {activeConnectionId ? activeConnectionName : '未连接'}
      </div>
      <div className="px-3 border-r border-white/10 truncate">
        {activeDatabaseName || '无活动数据库'}
      </div>
      <div className="ml-auto px-3 text-[#d8d8d8]">就绪</div>
    </footer>
  );
}

export const MainLayout = () => {
  const { splitView, isSplitVisible } = useConnectionLayoutContext();
  const location = useLocation();
  useGlobalShortcuts();

  const showSplit = !!splitView
    && isSplitVisible
    && location.pathname !== '/'
    && location.pathname !== '/connections'
    && location.pathname !== '/settings';

  return (
    <div className="flex h-screen bg-[#222] text-primary overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0">
        <WorkbenchToolbar />
        <div className="flex flex-1 min-h-0 overflow-hidden bg-base">
          <Sidebar />
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {showSplit ? <SplitPaneLayout {...splitView} /> : <Outlet />}
          </main>
        </div>
        <WorkbenchStatusBar />
      </div>
    </div>
  );
};

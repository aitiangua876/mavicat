import type { Tab } from '../types/editor';

/**
 * Interface representing a cleaned tab with only persistent data
 */
export interface CleanedTab {
  id: string;
  title: string;
  type: 'console' | 'table' | 'table_design' | 'database_objects' | 'query_builder' | 'notebook';
  query: string;
  page: number;
  activeTable: string | null;
  designTable?: string;
  pkColumn: string | null;
  result?: Tab['result'];
  error?: string;
  executionTime?: number | null;
  autoIncrementColumns?: string[];
  defaultValueColumns?: string[];
  nullableColumns?: string[];
  columnMetadata?: Tab['columnMetadata'];
  foreignKeys?: Tab['foreignKeys'];
  connectionId: string;
  flowState?: Tab['flowState'];
  pendingChanges?: Tab['pendingChanges'];
  pendingDeletions?: Tab['pendingDeletions'];
  pendingInsertions?: Tab['pendingInsertions'];
  selectedRows?: number[];
  isEditorOpen?: boolean;
  filterClause?: string;
  sortClause?: string;
  limitClause?: number;
  queryParams?: Record<string, string>;
  notebookId?: string;
  schema?: string;
  readOnly?: boolean;
  results?: Tab['results'];
  activeResultId?: string;
}

/**
 * Removes runtime-only data from a tab, keeping the visible workbench state
 * so closing the app or disconnecting a connection can restore tabs intact.
 * Excludes: isLoading and deprecated notebookState.
 * For notebook tabs: only persists notebookId reference, not the full notebookState.
 *
 * @param tab - The tab to clean
 * @returns A cleaned tab with only persistent data
 */
export function cleanTabForStorage(tab: Tab): CleanedTab {
  return {
    id: tab.id,
    title: tab.title,
    type: tab.type,
    query: tab.query,
    page: tab.page,
    activeTable: tab.activeTable,
    designTable: tab.designTable,
    pkColumn: tab.pkColumn,
    result: tab.result,
    error: tab.error,
    executionTime: tab.executionTime,
    autoIncrementColumns: tab.autoIncrementColumns,
    defaultValueColumns: tab.defaultValueColumns,
    nullableColumns: tab.nullableColumns,
    columnMetadata: tab.columnMetadata,
    foreignKeys: tab.foreignKeys,
    connectionId: tab.connectionId,
    flowState: tab.flowState,
    pendingChanges: tab.pendingChanges,
    pendingDeletions: tab.pendingDeletions,
    pendingInsertions: tab.pendingInsertions,
    selectedRows: tab.selectedRows,
    isEditorOpen: tab.isEditorOpen,
    filterClause: tab.filterClause,
    sortClause: tab.sortClause,
    limitClause: tab.limitClause,
    queryParams: tab.queryParams,
    notebookId: tab.notebookId,
    schema: tab.schema,
    readOnly: tab.readOnly,
    results: tab.results,
    activeResultId: tab.activeResultId,
  };
}

/**
 * Restores a tab from storage, adding default values for temporary fields
 *
 * @param cleanedTab - The cleaned tab from storage
 * @returns A full tab with default values for temporary fields
 */
export function restoreTabFromStorage(cleanedTab: Partial<Tab>): Tab {
  return {
    ...cleanedTab,
    id: cleanedTab.id || '',
    title: cleanedTab.title || 'Untitled',
    type: cleanedTab.type || 'console',
    query: cleanedTab.query || '',
    page: cleanedTab.page || 1,
    activeTable: cleanedTab.activeTable || null,
    designTable: cleanedTab.designTable,
    pkColumn: cleanedTab.pkColumn || null,
    connectionId: cleanedTab.connectionId || '',
    result: cleanedTab.result || null,
    error: cleanedTab.error || '',
    executionTime: cleanedTab.executionTime ?? null,
    autoIncrementColumns: cleanedTab.autoIncrementColumns,
    defaultValueColumns: cleanedTab.defaultValueColumns,
    nullableColumns: cleanedTab.nullableColumns,
    columnMetadata: cleanedTab.columnMetadata,
    foreignKeys: cleanedTab.foreignKeys,
    isLoading: false,
    pendingChanges: cleanedTab.pendingChanges,
    pendingDeletions: cleanedTab.pendingDeletions,
    pendingInsertions: cleanedTab.pendingInsertions,
    selectedRows: cleanedTab.selectedRows,
    isEditorOpen: cleanedTab.isEditorOpen,
    filterClause: cleanedTab.filterClause,
    sortClause: cleanedTab.sortClause,
    limitClause: cleanedTab.limitClause,
    queryParams: cleanedTab.queryParams,
    schema: cleanedTab.schema,
    readOnly: cleanedTab.readOnly,
    results: cleanedTab.results,
    activeResultId: cleanedTab.activeResultId,
    notebookId: cleanedTab.notebookId,
    notebookState: undefined,
  };
}

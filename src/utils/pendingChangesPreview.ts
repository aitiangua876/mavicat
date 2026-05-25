import type { PendingInsertion, Tab } from "../types/editor";

export type PendingChangePreviewKind = "update" | "delete" | "insert";

export interface PendingChangePreviewItem {
  id: string;
  kind: PendingChangePreviewKind;
  rowLabel: string;
  columnName?: string;
  valuePreview?: string;
  fieldCount?: number;
}

export interface PendingChangesPreview {
  updateCount: number;
  deleteCount: number;
  insertCount: number;
  totalOperations: number;
  selectedOnly: boolean;
  omittedCount: number;
  items: PendingChangePreviewItem[];
}

type PreviewableTab = Pick<
  Tab,
  | "result"
  | "pkColumn"
  | "pendingChanges"
  | "pendingDeletions"
  | "pendingInsertions"
  | "selectedRows"
>;

export function buildPendingChangesPreview(
  tab: PreviewableTab | null | undefined,
  applyToAll: boolean,
  maxItems = 80,
): PendingChangesPreview {
  if (!tab) {
    return createEmptyPreview(false);
  }

  const selectedRows = tab.selectedRows ?? [];
  const hasSelection = !applyToAll && selectedRows.length > 0;
  const selectedPkSet = getSelectedPkSet(tab, hasSelection);
  const selectedDisplayIndices = new Set(selectedRows);

  const items: PendingChangePreviewItem[] = [];
  let updateCount = 0;
  let deleteCount = 0;
  let insertCount = 0;

  for (const [pkKey, rowData] of Object.entries(tab.pendingChanges ?? {})) {
    if (hasSelection && !selectedPkSet.has(pkKey)) continue;

    for (const [columnName, newValue] of Object.entries(rowData.changes)) {
      updateCount += 1;
      pushPreviewItem(items, maxItems, {
        id: `update:${pkKey}:${columnName}`,
        kind: "update",
        rowLabel: formatPrimaryKey(rowData.pkOriginalValue),
        columnName,
        valuePreview: formatPreviewValue(newValue),
      });
    }
  }

  for (const [pkKey, pkValue] of Object.entries(tab.pendingDeletions ?? {})) {
    if (hasSelection && !selectedPkSet.has(pkKey)) continue;

    deleteCount += 1;
    pushPreviewItem(items, maxItems, {
      id: `delete:${pkKey}`,
      kind: "delete",
      rowLabel: formatPrimaryKey(pkValue),
    });
  }

  getFilteredInsertions(tab.pendingInsertions ?? {}, tab.result?.rows.length ?? 0, hasSelection, selectedDisplayIndices)
    .forEach(([tempId, insertion]) => {
      insertCount += 1;
      pushPreviewItem(items, maxItems, {
        id: `insert:${tempId}`,
        kind: "insert",
        rowLabel: "新行",
        fieldCount: Object.keys(insertion.data).length,
        valuePreview: summarizeInsertion(insertion),
      });
    });

  const totalOperations = updateCount + deleteCount + insertCount;

  return {
    updateCount,
    deleteCount,
    insertCount,
    totalOperations,
    selectedOnly: hasSelection,
    omittedCount: Math.max(0, totalOperations - items.length),
    items,
  };
}

export function formatPreviewValue(value: unknown): string {
  if (value === null) return "NULL";
  if (value === undefined) return "未设置";
  if (typeof value === "string") return truncateValue(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return truncateValue(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function createEmptyPreview(selectedOnly: boolean): PendingChangesPreview {
  return {
    updateCount: 0,
    deleteCount: 0,
    insertCount: 0,
    totalOperations: 0,
    selectedOnly,
    omittedCount: 0,
    items: [],
  };
}

function getSelectedPkSet(tab: PreviewableTab, hasSelection: boolean): Set<string> {
  const selectedPkSet = new Set<string>();
  if (!hasSelection || !tab.result || !tab.pkColumn) return selectedPkSet;

  const pkIndex = tab.result.columns.indexOf(tab.pkColumn);
  if (pkIndex === -1) return selectedPkSet;

  for (const rowIndex of tab.selectedRows ?? []) {
    const row = tab.result.rows[rowIndex];
    if (row) selectedPkSet.add(String(row[pkIndex]));
  }

  return selectedPkSet;
}

function getFilteredInsertions(
  pendingInsertions: Record<string, PendingInsertion>,
  existingRowCount: number,
  hasSelection: boolean,
  selectedDisplayIndices: Set<number>,
): Array<[string, PendingInsertion]> {
  return Object.entries(pendingInsertions).filter(([, insertion], index) => {
    if (!hasSelection) return true;
    const actualDisplayIndex = existingRowCount + index;
    return (
      selectedDisplayIndices.has(actualDisplayIndex) ||
      selectedDisplayIndices.has(insertion.displayIndex)
    );
  });
}

function pushPreviewItem(
  items: PendingChangePreviewItem[],
  maxItems: number,
  item: PendingChangePreviewItem,
) {
  if (items.length < maxItems) {
    items.push(item);
  }
}

function formatPrimaryKey(value: unknown): string {
  return `PK = ${formatPreviewValue(value)}`;
}

function summarizeInsertion(insertion: PendingInsertion): string {
  const entries = Object.entries(insertion.data)
    .filter(([, value]) => value !== undefined && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${formatPreviewValue(value)}`);

  return entries.length > 0 ? entries.join(", ") : "空值行";
}

function truncateValue(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
}

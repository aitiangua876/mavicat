import { describe, expect, it } from "vitest";
import {
  buildPendingChangesPreview,
  formatPreviewValue,
} from "../../src/utils/pendingChangesPreview";
import type { Tab } from "../../src/types/editor";

describe("pendingChangesPreview", () => {
  it("summarizes all pending operations", () => {
    const preview = buildPendingChangesPreview(createTab(), true);

    expect(preview.updateCount).toBe(2);
    expect(preview.deleteCount).toBe(1);
    expect(preview.insertCount).toBe(1);
    expect(preview.totalOperations).toBe(4);
    expect(preview.selectedOnly).toBe(false);
    expect(preview.items.map((item) => item.kind)).toEqual([
      "update",
      "update",
      "delete",
      "insert",
    ]);
  });

  it("filters operations to the selected rows", () => {
    const tab = createTab();
    tab.selectedRows = [1, 2];

    const preview = buildPendingChangesPreview(tab, false);

    expect(preview.selectedOnly).toBe(true);
    expect(preview.updateCount).toBe(0);
    expect(preview.deleteCount).toBe(1);
    expect(preview.insertCount).toBe(1);
  });

  it("limits preview rows but keeps total operation count", () => {
    const preview = buildPendingChangesPreview(createTab(), true, 2);

    expect(preview.items).toHaveLength(2);
    expect(preview.totalOperations).toBe(4);
    expect(preview.omittedCount).toBe(2);
  });

  it("formats values safely", () => {
    expect(formatPreviewValue(null)).toBe("NULL");
    expect(formatPreviewValue(undefined)).toBe("未设置");
    expect(formatPreviewValue({ a: 1 })).toBe("{\"a\":1}");
    expect(formatPreviewValue("a".repeat(120))).toHaveLength(96);
  });
});

function createTab(): Tab {
  return {
    id: "tab-1",
    title: "users",
    type: "table",
    query: "select * from users",
    result: {
      columns: ["id", "name", "status"],
      rows: [
        [1, "Alice", "active"],
        [2, "Bob", "active"],
      ],
      affected_rows: 0,
    },
    error: "",
    executionTime: null,
    page: 1,
    activeTable: "users",
    pkColumn: "id",
    connectionId: "conn-1",
    pendingChanges: {
      "1": {
        pkOriginalValue: 1,
        changes: {
          name: "Alicia",
          status: "disabled",
        },
      },
    },
    pendingDeletions: {
      "2": 2,
    },
    pendingInsertions: {
      temp_1: {
        tempId: "temp_1",
        displayIndex: 2,
        data: {
          name: "Carol",
          status: "active",
        },
      },
    },
  };
}

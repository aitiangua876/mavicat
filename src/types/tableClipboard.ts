export interface CopiedTableSet {
  sourceConnectionId: string;
  sourceDatabase: string;
  sourceConnectionName?: string | null;
  tables: string[];
  copiedAt: number;
}

export interface OpenDataTransferRequest {
  sourceConnectionId: string;
  targetConnectionId: string;
  sourceDatabase?: string;
  targetDatabase?: string;
  sourceTable: string;
  sourceTables?: string[];
  targetTable?: string;
  writeMode?: "append" | "delete_then_insert" | "create_then_insert";
}

export const OPEN_DATA_TRANSFER_EVENT = "mavicat:open-data-transfer";

export function dispatchOpenDataTransfer(request: OpenDataTransferRequest) {
  window.dispatchEvent(
    new CustomEvent<OpenDataTransferRequest>(OPEN_DATA_TRANSFER_EVENT, {
      detail: request,
    }),
  );
}

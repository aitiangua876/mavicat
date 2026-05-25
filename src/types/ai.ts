export type AiRole = "user" | "assistant";

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface AiSqlBlock {
  sql: string;
  kind: "query" | "mutation" | "ddl" | "unknown";
  requiresConfirmation: boolean;
}

export interface AiResultContext {
  query?: string | null;
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  totalRows?: number | null;
  affectedRows?: number | null;
  truncated?: boolean;
  error?: string | null;
}

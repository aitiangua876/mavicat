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

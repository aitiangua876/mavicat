import { Network, Database, FolderOpen, Plug } from "lucide-react";
import type { ReactNode } from "react";
import type { PluginManifest } from "../types/plugins";
import {
  MariaDBIcon,
  MongoDBIcon,
  MySQLIcon,
  OracleIcon,
  PostgreSQLIcon,
  RedisIcon,
  SQLiteIcon,
  SQLServerIcon,
} from "./driverIcons";

const FALLBACK_COLOR = "#64748b"; // slate-500

/**
 * Returns the hex color for a driver, falling back to a neutral gray.
 */
export function getDriverColor(manifest: PluginManifest | undefined | null): string {
  const key = manifest?.icon || manifest?.id || "";
  switch (key) {
    case "mysql":
      return "#69d45a";
    case "postgres":
    case "postgresql":
      return "#4f79e8";
    case "sqlserver":
    case "mssql":
    case "sql-server":
      return "#f6b33a";
    case "oracle":
      return "#f2323f";
    case "sqlite":
      return "#7ed8d0";
    case "mariadb":
      return "#c2a57d";
    case "mongodb":
      return "#bd5b17";
    case "redis":
      return "#f17d7d";
    default:
      return manifest?.color || FALLBACK_COLOR;
  }
}

/**
 * Returns a ReactNode icon for a driver.
 * Priority: brand SVG icon → lucide icon → generic fallback.
 */
export function getDriverIcon(manifest: PluginManifest | undefined | null, size = 14): ReactNode {
  const iconName = manifest?.icon || "";

  // Brand icons for built-in drivers
  switch (iconName) {
    case "postgres":
    case "postgresql":
      return <PostgreSQLIcon size={size} />;
    case "mysql":
      return <MySQLIcon size={size} />;
    case "sqlserver":
    case "mssql":
    case "sql-server":
      return <SQLServerIcon size={size} />;
    case "oracle":
      return <OracleIcon size={size} />;
    case "sqlite":
      return <SQLiteIcon size={size} />;
    case "mariadb":
      return <MariaDBIcon size={size} />;
    case "mongodb":
      return <MongoDBIcon size={size} />;
    case "redis":
      return <RedisIcon size={size} />;
  }

  // Legacy lucide icon names
  switch (iconName) {
    case "network":
      return <Network size={size} />;
    case "database":
      return <Database size={size} />;
    case "folder-open":
      return <FolderOpen size={size} />;
    default:
      return <Plug size={size} />;
  }
}

/**
 * Returns an inline style object with backgroundColor set to the driver color.
 * Use this on elements that render a colored driver badge/dot.
 */
export function getDriverColorStyle(manifest: PluginManifest | undefined | null): { backgroundColor: string } {
  return { backgroundColor: getDriverColor(manifest) };
}

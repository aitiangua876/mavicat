# Mavicat

Mavicat is a cross-platform desktop database manager built with [Tauri v2](https://v2.tauri.app/), Rust,
React 19, and TypeScript. It provides a Navicat-like experience for MySQL/MariaDB, PostgreSQL, SQLite,
SQL Server, and Redis — all in a native desktop shell.

This repository currently uses [Tabularis](https://github.com/TabularisDB/tabularis) as its Apache-2.0
licensed base. The first Mavicat milestone keeps the proven database-client core and removes or disables
product layers that are not needed for an initial Navicat-like app.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri v2 Shell                        │
│  ┌─────────────────────┐   ┌─────────────────────────┐  │
│  │   Frontend (Vite)   │   │    Rust Backend         │  │
│  │                     │   │                         │  │
│  │  React 19 + TS 5.9  │◄──►  Tauri Commands         │  │
│  │  Monaco Editor      │   │  (invoke / events)      │  │
│  │  Tailwind CSS v4    │   │                         │  │
│  │  React Router v7    │   │  ┌───────────────────┐  │  │
│  │  @xyflow/react      │   │  │  Driver Registry  │  │  │
│  │  @tanstack/react-   │   │  │  ┌─────────────┐  │  │  │
│  │    table/virtual    │   │  │  │ MySQL       │  │  │  │
│  │  i18next (8 locale) │   │  │  │ PostgreSQL  │  │  │  │
│  └─────────┬───────────┘   │  │  │ SQLite      │  │  │  │
│            │               │  │  │ SQL Server  │  │  │  │
│            │ IPC           │  │  │ Redis       │  │  │  │
│            ▼               │  │  └─────────────┘  │  │  │
│  ┌─────────────────────┐   │  └───────────────────┘  │  │
│  │  OS Integration     │   │  ┌───────────────────┐  │  │
│  │  • Keychain (OS)    │   │  │ Pool Manager      │  │  │
│  │  • Dialog/FS        │   │  │ (sqlx connections)│  │  │
│  │  • Updater          │   │  └───────────────────┘  │  │
│  │  • Clipboard        │   │  ┌───────────────────┐  │  │
│  └─────────────────────┘   │  │ SSH Tunnel        │  │  │
│                            │  │ (russh + fallback)│  │  │
│                            │  └───────────────────┘  │  │
│                            │  ┌───────────────────┐  │  │
│                            │  │ Persistence       │  │  │
│                            │  │ (connections,     │  │  │
│                            │  │  config, history) │  │  │
│                            │  └───────────────────┘  │  │
│                            └─────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Config File |
|---|---|---|
| **Desktop Shell** | Tauri v2 (Rust) | `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` |
| **Frontend** | React 19 + TypeScript 5.9 | `package.json`, `tsconfig.app.json` |
| **Build Tool** | Vite 7.3 | `vite.config.ts` |
| **CSS** | Tailwind CSS v4 + PostCSS | `postcss.config.js` |
| **Routing** | React Router DOM v7 | `src/App.tsx` |
| **SQL Editor** | Monaco Editor (via `@monaco-editor/react`) | |
| **UI Components** | Lucide icons, @xyflow/react (diagrams), @tanstack/react-table | `package.json` |
| **i18n** | i18next + LanguageDetector | `src/i18n/config.ts`, 8 locale JSON files |
| **Testing** | Vitest v4 (frontend), `cargo test` (Rust) | `vitest.config.ts` |
| **Package Manager** | pnpm 10.30 | `pnpm-workspace.yaml` |
| **Database** | sqlx 0.8 (MySQL, PostgreSQL, SQLite), tiberius 0.12 (SQL Server), redis 0.27 | `Cargo.toml` |
| **Credential Store** | keyring 3.6 (OS-native: Apple Keychain, Windows Credential Manager, libsecret) | `Cargo.toml` |
| **SSH Tunneling** | russh 0.43 (pure Rust SSH) + fallback system ssh | `src-tauri/src/ssh_tunnel.rs` |
| **Packaging** | Tauri bundler (DMG, MSI, AppImage, deb) + Snapcraft + Arch PKGBUILD | `src-tauri/tauri.conf.json` |

---

## Directory Layout

```
.
├── README.md                         # This file
├── CHANGELOG.md                      # Conventional-changelog
├── package.json                      # Frontend deps + scripts
├── pnpm-workspace.yaml               # Single workspace
├── vite.config.ts                    # Vite bundler config
├── vitest.config.ts                  # Test runner config
├── tsconfig.json                     # Project references (app + node)
├── eslint.config.js                  # Flat ESLint config
├── postcss.config.js                 # PostCSS + Tailwind
├── index.html                        # HTML entry point
│
├── src/                              # React/TypeScript frontend
├── src-tauri/                        # Rust backend (Tauri)
├── tests/                            # Frontend tests
├── public/                           # Static assets (fonts, logos)
├── scripts/                          # Build/dev helper scripts
├── demo/                             # Demo docker-compose + seed SQL
├── .github/                          # CI/CD workflows
├── .rules/                           # AI coding rules
├── snap/                             # Snapcraft packaging
├── aur/                              # Arch Linux PKGBUILD
└── dist/                             # Built frontend output
```

---

## Frontend Architecture (`src/`)

### Entry Point

```
src/main.tsx
  │
  ├── Polyfills (Buffer, process for browser)
  ├── Providers (order matters):
  │   ├── ThemeProvider       → ThemeContext
  │   ├── SettingsProvider    → SettingsContext
  │   ├── DatabaseProvider    → DatabaseContext
  │   ├── SavedQueriesProvider → SavedQueriesContext
  │   ├── QueryHistoryProvider → QueryHistoryContext
  │   └── EditorProvider      → EditorContext
  │
  └── src/App.tsx
        ├── AlertProvider     → AlertContext
        ├── BrowserRouter
        ├── ConnectionHealthMonitor
        ├── KeybindingsProvider → KeybindingsContext
        ├── ConnectionLayoutProvider → ConnectionLayoutContext
        └── Routes
              ├── /editor               → Editor page (default)
              ├── /connections          → Connections page
              ├── /settings             → Settings page
              ├── /schema-diagram       → SchemaDiagramPage
              ├── /visual-explain       → VisualExplainPage
              └── /json-viewer          → JsonViewerPage
```

### Provider → Context → Hook Pattern

Each provider manages a slice of global state via React Context. Components consume via hooks:

| Context | Provider | Hook | Purpose |
|---|---|---|---|
| `ThemeContext` | `ThemeProvider` | `useTheme` | Dark/light + Monaco themes |
| `SettingsContext` | `SettingsProvider` | `useSettings` | App config (font, i18n, etc.) |
| `DatabaseContext` | `DatabaseProvider` | `useDatabase` | Active connections, schemas, tables, views, routines, triggers |
| `SavedQueriesContext` | `SavedQueriesProvider` | `useSavedQueries` | Persisted query snippets |
| `QueryHistoryContext` | `QueryHistoryProvider` | `useQueryHistory` | Recent query log |
| `EditorContext` | `EditorProvider` | `useEditor` | SQL editor state, open tabs |
| `AlertContext` | `AlertProvider` | `useAlert` | Toast/notification system |
| `KeybindingsContext` | `KeybindingsProvider` | `useKeybindings` | Custom keyboard shortcuts |
| `ConnectionLayoutContext` | `ConnectionLayoutProvider` | `useConnectionLayout` | Sidebar pane layout |

### Page Components

| Page | File | Purpose |
|---|---|---|
| **Editor** | `src/pages/Editor.tsx` | Main workspace — SQL editor, result grid, schema sidebar |
| **Connections** | `src/pages/Connections.tsx` | Connection list management |
| **Settings** | `src/pages/Settings.tsx` | App-wide preferences (general, appearance, shortcuts, AI, logs, plugins) |
| **SchemaDiagram** | `src/pages/SchemaDiagramPage.tsx` | ER diagram viewer (full-window) |
| **VisualExplain** | `src/pages/VisualExplainPage.tsx` | SQL query plan visualizer |
| **JsonViewer** | `src/pages/JsonViewerPage.tsx` | JSON document viewer |

### UI Component Groups

| Group | Path | Key Components |
|---|---|---|
| **Layout** | `src/components/layout/` | `MainLayout`, `Sidebar`, `ExplorerSidebar`, `SplitPaneLayout`, `PanelDatabaseProvider` |
| **Connections** | `src/components/connections/` | `ConnectionCard`, `ConnectionListItem`, `GroupHeader`, `StatusBadge`, `ActionButtons` |
| **Modals** | `src/components/modals/` | ~30 modal dialogs — `NewConnectionModal`, `CreateTableModal`, `QueryModal`, `SchemaModal`, `DumpDatabaseModal`, `ExportProgressModal`, `SshConnectionsModal`, etc. |
| **UI Widgets** | `src/components/ui/` | `DataGrid`, `SqlEditorWrapper`, `TableDesigner`, `PaginationControls`, `FilterRow`, `RowEditorSidebar`, `ContextMenu`, `SchemaDiagram`, `VisualQueryBuilder`, `JsonTreeView`, cell editors, etc. |
| **Settings** | `src/components/settings/` | `GeneralTab`, `AppearanceTab`, `LocalizationTab`, `ShortcutsTab`, `AiTab`, `LogsTab`, `PluginsTab`, etc. |
| **Icons** | `src/components/icons/` | `ClientIcons`, `NavicatStyleIcons`, `DiscordIcon` |
| **Explain** | `src/components/explain/` | `VisualExplainView` |

### Utility Modules (`src/utils/`)

~60 utility files covering: connection management, schema metadata, SQL formatting, data grid, clipboard parsing, dump/export helpers, autocomplete, theme, keybindings, data types, geometry, JSON tree, query parameters, etc.

### Type Definitions (`src/types/`)

Shared TypeScript interfaces for: schema, editor state, query history, themes, plugins, explain plans, sidebar.

### Themes (`src/themes/`)

Two-tier theming system:
- **Presets** (`src/themes/presets/`): 12 built-in color palettes (Dracula, Nord, One Dark, Solarized, GitHub Dark/Light, Monokai, Tabularis Dark/Light, etc.)
- **Monaco themes** (`src/themes/monaco/`): Corresponding Monaco editor JSON themes
- **Registry** (`src/themes/themeRegistry.ts`): Theme manager and custom theme persistence

### Localization (`src/i18n/`)

8 supported languages: English, German, Spanish, French, Italian, Japanese, Russian, Chinese. Uses `i18next` + browser language detection.

---

## Backend Architecture (`src-tauri/src/`)

### Module Map

| Module | Purpose |
|---|---|
| `lib.rs` | App entry — Tauri builder, plugin registration, command handler wiring |
| `main.rs` | Binary entry — delegates to `lib::run()` |
| `commands.rs` | All Tauri IPC command handlers (~180 commands) |
| `models.rs` | Shared data types — `SavedConnection`, `ConnectionParams`, `QueryResult`, `ColumnDefinition`, `TableInfo`, `ForeignKey`, etc. |
| `drivers/` | Database driver system (see below) |
| `pool_manager.rs` | Connection pool management (sqlx for MySQL/PostgreSQL/SQLite, tokio-postgres for PG, tiberius for SQL Server) |
| `ssh_tunnel.rs` | SSH tunneling via russh (pure Rust) + system ssh fallback |
| `config.rs` | `AppConfig` struct, JSON config load/save, prompt management |
| `persistence.rs` | Connection file read/write, format migration (v0 → v1) |
| `connection_cache.rs` | In-memory cache of active connections |
| `credential_cache.rs` | In-memory cache for keychain credentials |
| `keychain_utils.rs` | OS-native credential storage via `keyring` crate |
| `query_history.rs` | Query history persistence (JSON file) |
| `saved_queries.rs` | Saved query snippets persistence |
| `data_transfer.rs` | Database-to-database data migration |
| `export.rs` | Query result export (CSV, JSON, SQL, etc.) |
| `dump_commands.rs` | Database dump (mysqldump/pg_dump) + import |
| `dump_utils.rs` | Dump file processing utilities |
| `explain_import.rs` | Import external explain plan files for visual explain |
| `health_check.rs` | Background connection ping loop (heartbeat) |
| `heartbeat.rs` | Per-connection periodic keepalive |
| `json_viewer.rs` | JSON viewer secondary window management |
| `clipboard_import.rs` | Parse clipboard data into insert statements |
| `log_commands.rs` | Log buffer management, tailing, export |
| `logger.rs` | Custom logger (captures logs to shared buffer + stderr) |
| `paths.rs` | Platform-specific data/config directory resolution |
| `preferences.rs` | SQL editor preferences persistence |
| `updater.rs` | Application update check + download (Tauri updater plugin) |
| `theme_commands.rs` | Theme CRUD commands |
| `theme_models.rs` | Theme data types |
| `plugins/` | Plugin system — registration, installation, RPC, driver lifecycle |
| `mcp/` | MCP protocol support (Model Context Protocol server) |
| `ai_*` | AI assistant modules (notebook export, approval, activity logs) |
| `notebooks.rs` | Notebook/query bookmarks |
| `cli.rs` | CLI argument parsing |

### Driver System

```
drivers/
├── driver_trait.rs        # DatabaseDriver trait — contract every driver implements
│                          #   + DriverCapabilities (schemas, views, routines, etc.)
├── registry.rs            # Global driver registry (RwLock<HashMap<String, Arc<dyn DatabaseDriver>>>)
│
├── common.rs              # Shared types re-export
├── common/
│   ├── query.rs           # Common query helpers
│   ├── blob.rs            # BLOB data handling
│   └── safe_int.rs        # Safe integer parsing
│
├── mysql/                 # MySQL/MariaDB driver
│   ├── mod.rs             # Schema/table/column introspection + query execution
│   ├── export.rs          # MySQL-specific export logic
│   ├── explain.rs         # EXPLAIN plan parsing
│   ├── helpers.rs         # Identifier escaping, row extraction
│   ├── types.rs           # MySQL type definitions
│   └── extract/           # Data type extraction (binary, geometry, json, scalar, temporal)
│
├── postgres/              # PostgreSQL driver
│   ├── mod.rs             # Schema/table/column introspection + query execution
│   ├── export.rs          # PG-specific export logic
│   ├── explain.rs         # EXPLAIN plan parsing
│   ├── helpers.rs         # Identifier escaping, bind params
│   ├── types.rs           # PG type definitions
│   ├── binding.rs         # Parameter binding
│   ├── client.rs          # Connection pool client wrapper
│   └── extract/           # Data type extraction (advanced, array, composite, enum, range, etc.)
│
├── sqlite/                # SQLite driver
│   ├── mod.rs             # Schema/table/column introspection + query execution
│   ├── export.rs          # SQLite export logic
│   ├── explain.rs         # EXPLAIN plan parsing
│   ├── types.rs           # SQLite type definitions
│   └── extract/           # Data type extraction (blob, scalar)
│
├── sqlserver/             # SQL Server driver (via tiberius)
│   ├── mod.rs             # Introspection + query execution
│   └── ...                # (smaller module — tiberius wraps TDS protocol)
│
└── redis/                 # Redis driver
    └── mod.rs             # Redis connection + command execution (via redis-rs)
```

Each driver implements the `DatabaseDriver` trait which defines:

- `connect()` — establish a connection or pool
- `get_databases()` / `get_schemas()` / `get_tables()` / `get_columns()` — metadata introspection
- `get_views()` / `get_view_definition()` — view management
- `get_routines()` / `get_routine_parameters()` — stored procedure/function introspection
- `get_triggers()` / `get_trigger_definition()` — trigger management
- `get_foreign_keys()` / `get_indexes()` — constraint introspection
- `execute_query()` — run SQL, return `QueryResult`
- `insert_record()` / `update_record()` / `delete_record()` — row CRUD
- `get_create_table_sql()` / DDL generation helpers

The frontend queries `get_driver_manifest()` for each driver's `DriverCapabilities` to conditionally show/hide UI sections (schemas, views, routines, etc.).

### IPC: Frontend ↔ Backend Communication

The frontend calls Rust via `@tauri-apps/api/core`'s `invoke()` function, which maps 1:1 to `#[tauri::command]` handlers registered in `lib.rs`.

Example flow — fetching tables of a schema:

```
User clicks schema in sidebar
  → ExplorerSidebar.tsx calls useDatabase()
    → DatabaseProvider dispatches invoke("get_tables", { params, schema })
      → Rust commands::get_tables()
        → driver_for("postgres") -> PostgresDriver
          → pool_manager::get_pg_pool(params) -> existing or new pool
            → sqlx::query("SELECT ... FROM information_schema.tables ...")
              → returns Vec<TableInfo>
                → serialized as JSON → deserialized on frontend
                  → DatabaseContext state updated → sidebar re-renders
```

Cluster of what the ~180 commands cover:

| Category | Examples |
|---|---|
| **Connection lifecycle** | `test_connection`, `list_databases`, `save_connection`, `delete_connection`, `disconnect_connection`, `register_active_connection` |
| **Schema introspection** | `get_schemas`, `get_tables`, `get_columns`, `get_views`, `get_routines`, `get_triggers`, `get_foreign_keys`, `get_indexes` |
| **Query execution** | `execute_query`, `execute_query_batch`, `cancel_query`, `count_query`, `explain_query_plan`, `get_server_now` |
| **Data mutation** | `insert_record`, `update_record`, `delete_record` |
| **DDL generation** | `get_create_table_sql`, `get_add_column_sql`, `get_alter_column_sql`, `get_create_index_sql`, `get_create_foreign_key_sql` |
| **Data transfer** | `start_data_transfer`, `export_query_to_file`, `dump_database`, `import_database` |
| **SSH** | `test_ssh_connection`, `save_ssh_connection`, `delete_ssh_connection` |
| **Config & Preferences** | `get_config`, `save_config`, `get_schema_preference`, editor preferences, system prompts, theme CRUD |
| **Query history / Saved queries** | `get_query_history`, `add_query_history_entry`, `save_query`, `delete_saved_query` |
| **Logs** | `get_logs`, `clear_logs`, `export_logs` |
| **Updater** | `check_for_updates`, `download_and_install_update` |
| **JSON Viewer / Explain** | `open_json_viewer_window`, `load_explain_from_file`, `open_visual_explain_window` |

### SSH Tunneling

`ssh_tunnel.rs` implements dual-backend SSH tunneling:

1. **Primary**: `russh` — pure Rust SSH client library. Handles password and key-based auth.
2. **Fallback**: `system ssh` — spawns `ssh -L` process for edge cases.

Tunnels are managed per-connection, mapping local ports to remote database endpoints through SSH bastion hosts.

### Connection & Credential Management

Connections are stored in a JSON file (`~/.mavicat/connections.json`) with connection groups for organization. Passwords are stored in the OS keychain via the `keyring` crate (Apple Keychain, Windows Credential Manager, or libsecret on Linux). The `credential_cache` provides in-memory caching to avoid repeated keychain lookups.

Connection pools are managed per-driver in `pool_manager.rs` — each active connection gets a pool entry keyed by connection ID. Pools are lazily created on first use and can be evicted on disconnect.

### Health Check System

A background tokio task (`health_check.rs`) periodically pings every open connection to detect stale/disconnected sessions. Configurable interval (default: 30s). When a ping fails, the UI receives a `mavicat-connection-failed` event, which triggers reconnection or disconnection UI.

---

## Current Scope

- Native desktop shell with Tauri v2.
- React/TypeScript UI with Monaco SQL editing.
- Built-in MySQL/MariaDB, PostgreSQL, SQLite, SQL Server, and Redis drivers.
- Connection management with secure OS credential storage.
- SSH tunneling (pure Rust + system ssh fallback).
- Schema explorer with tree-navigation of databases, schemas, tables, columns, views, routines, triggers.
- SQL editor with syntax highlighting, autocomplete, multi-tab.
- Result data grid with filtering, sorting, pagination, inline editing.
- Row editor sidebar for detailed record modification.
- Visual query builder (drag-and-drop join graph).
- ER diagram viewer (powered by @xyflow/react + dagre layout).
- Visual explain plan viewer.
- JSON document viewer (separate window).
- Query history and saved queries.
- Database dump/restore (via mysqldump, pg_dump, sqlite3).
- CSV/JSON/SQL export and clipboard import.
- Database-to-database data transfer.
- Multi-language UI (8 locales).
- Custom theming system with 12+ built-in themes.
- macOS, Windows, and Linux packaging.

## First-Wave Simplification

The following upstream features are intentionally hidden or disabled while
Mavicat establishes its own product base:

- AI assistant surfaces.
- MCP server UI.
- Plugin marketplace/settings UI.
- Community, sponsor, welcome, and changelog popups.
- Automatic update prompts pointing at the upstream project.

Some source modules still exist so the application can be reduced gradually
without destabilizing the working database-client core.

---

## Development

### Prerequisites

- **Node.js** 20.19+ or 22.12+
- **pnpm** 10.x (`npm install -g pnpm`)
- **Rust** 1.77.2+ (stable)
- Platform dependencies for [Tauri v2](https://v2.tauri.app/start/prerequisites/)

### Commands

```bash
# Install frontend dependencies
pnpm install

# Start development (Vite dev server + Tauri window)
pnpm tauri dev

# Build for production
pnpm tauri build

# Run frontend tests
pnpm test

# Run Rust tests
pnpm test:rust

# Run all tests
pnpm test:all

# TypeScript type check
pnpm typecheck

# Lint
pnpm lint
```

### Project Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Vite dev server only |
| `pnpm build` | Frontend production build (tsc + vite) |
| `pnpm tauri` | Tauri CLI passthrough |
| `pnpm roadtmap` | Update roadmap from docs |
| `pnpm sync-links` | Synchronize link references across locales |
| `pnpm version` | Bump version, update CHANGELOG, sync files |

---

## Attribution

Mavicat is based on [Tabularis](https://github.com/TabularisDB/tabularis),
licensed under Apache License 2.0. The original license is retained in
[`LICENSE`](./LICENSE).

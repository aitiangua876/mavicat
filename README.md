# Mavicat

Mavicat is a cross-platform desktop database manager built with Tauri, Rust,
React, and TypeScript.

This repository currently uses Tabularis as its Apache-2.0 licensed base. The
first Mavicat milestone keeps the proven database-client core and removes or
disables product layers that are not needed for an initial Navicat-like app.

## Current Scope

- Native desktop shell with Tauri v2.
- React/TypeScript UI with Monaco SQL editing.
- Built-in MySQL/MariaDB, PostgreSQL, and SQLite drivers.
- Connection management with secure OS credential storage.
- SSH tunneling.
- Schema explorer, SQL editor, result grid, query history, saved queries, and
  export/import foundations.
- macOS and Windows packaging through Tauri.

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

## Development

Install dependencies:

```bash
pnpm install
```

Build the frontend:

```bash
pnpm run build
```

Build or run the desktop app after installing Rust:

```bash
pnpm tauri dev
pnpm tauri build
```

The project currently requires Node.js 20.19+ or 22.12+ for Vite 7.

## Attribution

Mavicat is based on [Tabularis](https://github.com/TabularisDB/tabularis),
licensed under Apache License 2.0. The original license is retained in
[`LICENSE`](./LICENSE).

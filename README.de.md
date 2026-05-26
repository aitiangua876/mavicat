<div align="center">
  <img src="public/logo-sm.png" width="120" height="120" alt="Mavicat logo" />

# Mavicat

**Ein schnelles Open-Source-Desktop-Workspace für alle, die täglich mit SQL arbeiten.**

[Website](https://mavicat.kailingteck.com/) · [Releases](https://github.com/aitiangua876/mavicat/releases) · [Issues](https://github.com/aitiangua876/mavicat/issues) · [Contributing](./CONTRIBUTING.md)

[![Website](https://img.shields.io/badge/Website-mavicat.kailingteck.com-22c55e)](https://mavicat.kailingteck.com/)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue)](./LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24c8db?logo=tauri)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-backend-orange?logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![Stars](https://img.shields.io/github/stars/aitiangua876/mavicat?style=social)](https://github.com/aitiangua876/mavicat/stargazers)

<p>
  <strong>README:</strong>
  <a href="./README.md">English</a> |
  <a href="./README.zh-CN.md">中文</a> |
  <a href="./README.de.md">Deutsch</a> |
  <a href="./README.es.md">Español</a> |
  <a href="./README.fr.md">Français</a> |
  <a href="./README.it.md">Italiano</a> |
  <a href="./README.ja.md">日本語</a> |
  <a href="./README.ru.md">Русский</a>
</p>
</div>

![Mavicat workspace](open/public/assets/mavicat-workspace.svg)

Mavicat bringt professionelle Datenbank-Workflows in eine moderne, lokale und gut erweiterbare Desktop-App. Die App basiert auf Tauri v2, Rust, React und TypeScript: native Hülle, schneller Start, leistungsfähige Datenbanklogik und eine flexible Oberfläche.

Wenn dir die Richtung gefällt, gib dem Projekt gern einen Star. Das hilft, Mavicat sichtbarer zu machen und die Open-Source-Roadmap voranzubringen.

## Warum Mavicat?

- **Ein Workspace für den Alltag**: Verbindungen, Schemas, SQL-Tabs, Tabellenansichten, Tabellen-Designer, Export, Backup, Synchronisierung, Migration, Redis und KI-Unterstützung.
- **Vertraute Desktop-UX**: kompakter Verbindungsbaum, Objektansichten, Tabs, Ergebnispanels, Kontextmenüs und assistentenbasierte Tools.
- **Frischer Mavicat-Stil**: sattere Toolbar-Icons, ein klareres Navicat-ähnliches Workspace-Layout und ein einheitliches Light/Dark Theme.
- **Local-first**: Verbindungen, Verlauf, Einstellungen und KI-Konfiguration bleiben lokal, sofern du nichts anderes entscheidest.
- **Keine Treibersuche**: gängige Datenbanktreiber sind über das Rust-Backend integriert; für typische Workflows brauchst du keine separaten JDBC-, ODBC- oder Client-Pakete.
- **Schlanker Desktop-Footprint**: Tauri hält die Shell kompakt, Rust übernimmt die schweren Datenbankaufgaben ohne großen Hintergrunddienst.
- **Rust + React**: Rust übernimmt Datenbankzugriff und OS-Integration, React liefert Editor, Grids und Interaktion.
- **Offen und erweiterbar**: Apache-2.0, mit einer Roadmap für praktische Plugins und Treiber.

## Produkttour

### Alles in einem Datenbank-Workspace

![Mavicat workspace](open/public/assets/mavicat-workspace.svg)

Der Hauptbereich kombiniert Verbindungsbaum, SQL-Editor, Ergebnisraster, Toolbar-Aktionen und Datenbankkontext. So wechselst du schnell zwischen Verbindungen, Datenbanken, Tabellen, Query-Tabs und Exportaufgaben.

| Bereich | Nutzen |
|---|---|
| Verbindungsbaum | Verbindungen, Datenbanken, Schemas, Tabellen, Spalten, Views und Redis Keys durchsuchen. |
| SQL-Editor | Auswahl oder gesamtes Script ausführen, mehrere Resultsets prüfen, SQL formatieren und KI pro Tab nutzen. |
| Datenraster | Aktuelle Seite, gefilterte Ergebnisse oder komplette Daten nach CSV, JSON, Excel und SQL exportieren. |
| Objekt-Tools | Tabellen designen, DDL anzeigen, Dictionaries exportieren, Backups erstellen, Schemas vergleichen und Daten migrieren. |
| Nativer Runtime | Kein separates Treiber-Setup für typische Workflows, geringerer Speicher- und Plattenbedarf. |

## Unterstützte Datenbanken

| Datenbank | Status |
|---|---|
| MySQL / MariaDB | Aktiv |
| PostgreSQL | Aktiv |
| SQLite | Aktiv |
| SQL Server | Aktiv |
| Redis | Aktiv, Key-Browsing und Bearbeitung werden ausgebaut |
| Oracle | Geplant, noch nicht Teil des aktuellen Meilensteins |

## Highlights

### Datenbank-Workspace

- Linker Verbindungsbaum mit Status für Verbindung, Datenbank und Tabellen.
- Objektseite pro Datenbank mit Listen- und Icon-Ansicht.
- Kontextmenüs für Verbindungen, Datenbanken, Tabellen und Ergebnisraster.
- Mehrere Tabs und eine Oberfläche, die für lange Arbeitssitzungen gedacht ist.

### SQL-Editor

- Monaco Editor mit Formatierung, Ausführungshistorie, Auswahl- oder Gesamtausführung und mehreren Ergebnissen.
- Verbindung und Datenbank können pro Query-Tab gewechselt werden.
- Ctrl-Klick auf Objekte öffnet die passende Tabellenansicht.
- KI-Assistent pro Query-Fenster: SQL schreiben, erklären, optimieren und in den Editor übernehmen; schreibende Aktionen brauchen Bestätigung.

### Datenraster

- Export der aktuellen Seite, aller gefilterten Daten oder aller Daten.
- Export nach CSV, JSON, Excel und SQL.
- Spaltenauswahl, Pagination, Kopieren als SQL und Ergebnis-Workflows.
- In Arbeit: sichere Bearbeitung mit Vorschau, Commit/Rollback, Undo und klarer Fehlerzuordnung.

### Tabellen-Designer

- Felder, Primärschlüssel, Indizes, SQL-Vorschau und DDL-Ansicht.
- Ziel ist eine robuste Oberfläche für tägliche Schema-Arbeit.

### Import, Export, Backup, Migration

- Einheitliche Assistenten für Export, Import, Backup, SQL-Dateien, Schema-Sync und Datentransfer.
- Datenbank-Dictionary als HTML, Excel oder Markdown.
- Schema-Diff mit SQL-Vorschau vor der Ausführung.
- Cross-Database-Migration mit Feldmapping und konservativer Typkonvertierung.

### Redis

- Redis-Verbindungen direkt neben relationalen Datenbanken.
- Prefix-Suche, hierarchische Ansicht, Anzeigen, Bearbeiten und Löschen werden weiter verbessert.

## Download

- [Offizielle Website](https://mavicat.kailingteck.com/)
- [GitHub Releases](https://github.com/aitiangua876/mavicat/releases)
- [Aktuelles Release](https://github.com/aitiangua876/mavicat/releases/latest)
- [Download über die Website](https://mavicat.kailingteck.com/)

Mavicat zielt auf macOS, Windows und Linux. Die verfügbaren Artefakte können je nach Meilenstein variieren.

## Entwicklung

```bash
pnpm install
pnpm tauri dev
```

Build:

```bash
pnpm tauri build
```

Checks:

```bash
pnpm run build
pnpm test
cd src-tauri && cargo test
```

## Tech-Stack

- Tauri v2
- Rust, SQLx, Tiberius, Redis client
- React 19, TypeScript, Vite, Tailwind CSS
- Monaco Editor
- TanStack Table / Virtualisierung
- XYFlow

## Roadmap

- **P0**: sichere Datenbearbeitung, bessere SQL-Ausführung, stabile Verbindungszustände, klare Fehler.
- **P1**: Import/Export, Schema-Sync, Datentransfer, Backup/Restore mit Fortschritt und Abbruch.
- **P2**: Tabellen-Designer, ER-Diagramme, Datenwörterbuch, Kommentare, Indizes, Fremdschlüssel, Trigger.
- **P3**: einheitliche Assistenten, kompakte Sidebar, vollständige Kontextmenüs, bessere Langzeit-Tasks.

## Mitmachen

Issues, Reproduktionen, UI-Feedback, Datenbank-Sonderfälle, Übersetzungen und Pull Requests sind willkommen.

## Danksagung

Danke an das Open-Source-Projekt [Tabularis](https://github.com/TabularisDB/tabularis) für frühere Arbeit und Inspiration.

## Lizenz und Hinweise

[Apache License 2.0](./LICENSE)

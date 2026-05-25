<div align="center">
  <img src="public/logo-sm.png" width="120" height="120" alt="Mavicat logo" />

# Mavicat

**Un workspace database desktop, open source, per chi lavora ogni giorno con SQL.**

[Sito web](https://mavicat.kailingteck.com/) · [Releases](https://github.com/chenlong/Mavicat/releases) · [Issues](https://github.com/chenlong/Mavicat/issues) · [Contribuire](./CONTRIBUTING.md)

[![Website](https://img.shields.io/badge/Sito-mavicat.kailingteck.com-22c55e)](https://mavicat.kailingteck.com/)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue)](./LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24c8db?logo=tauri)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-backend-orange?logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![Stars](https://img.shields.io/github/stars/chenlong/Mavicat?style=social)](https://github.com/chenlong/Mavicat/stargazers)

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

Mavicat porta i flussi di lavoro database professionali in una app desktop moderna, locale ed estendibile. È costruita con Tauri v2, Rust, React e TypeScript per unire shell nativa, backend solido e UI ricca.

Se il progetto ti piace, lascia una stella: aiuta altri sviluppatori a scoprirlo e rende più sostenibile la roadmap open source.

## Perché Mavicat?

- **Un workspace per il lavoro quotidiano**: connessioni, schemi, SQL, risultati, editing dati, table design, export, backup, sync, migrazione, Redis e IA.
- **UX desktop familiare**: albero connessioni compatto, viste oggetti, tab, pannelli risultati, menu contestuali e wizard.
- **Local-first**: profili, cronologia, preferenze e configurazione IA restano locali di default.
- **Niente caccia ai driver**: i driver comuni sono integrati nel backend Rust; per l'uso quotidiano non servono pacchetti JDBC, ODBC o client esterni.
- **Footprint leggero**: Tauri mantiene l'app compatta e Rust gestisce il lavoro pesante senza un grande servizio in background.
- **Rust + React**: Rust per database e integrazione OS, React per editor e griglie.
- **Aperto ed estendibile**: licenza Apache-2.0, con una roadmap per plugin e driver pratici.

## Tour del prodotto

### Database workspace tutto in uno

![Mavicat workspace](open/public/assets/mavicat-workspace.svg)

La schermata principale riunisce albero connessioni, editor SQL, griglia risultati, toolbar e contesto database. È pensata per passare rapidamente tra connessioni, database, tabelle, query tab ed export.

| Area | A cosa serve |
|---|---|
| Albero connessioni | Esplorare connessioni, database, schemi, tabelle, colonne, viste e Redis key. |
| Editor SQL | Eseguire selezione o script completo, vedere risultati multipli, formattare SQL e usare IA per tab. |
| Data grid | Esportare pagina corrente, risultati filtrati o dati completi in CSV, JSON, Excel e SQL. |
| Object tools | Disegnare tabelle, vedere DDL, esportare dizionari, fare backup, confrontare schemi e migrare dati. |
| Runtime nativo | Nessun setup extra di driver per workflow comuni, con minore uso di memoria e disco. |

## Database supportati

| Database | Stato |
|---|---|
| MySQL / MariaDB | Attivo |
| PostgreSQL | Attivo |
| SQLite | Attivo |
| SQL Server | Attivo |
| Redis | Attivo, key browsing ed editing in miglioramento |
| Oracle | Pianificato, non incluso nel milestone attuale |

## Funzionalità

### Database workspace

- Albero laterale con stato di connessioni, database e tabelle.
- Pagina oggetti per database con vista lista e icone.
- Azioni con tasto destro su connessioni, database, tabelle e risultati.
- Interfaccia multi-tab per sessioni di lavoro lunghe.

### Editor SQL

- Monaco Editor con formatting, cronologia, esecuzione selezione o script completo e risultati multipli.
- Connessione e database selezionabili per ogni tab.
- Ctrl-click sugli oggetti per aprire i dati tabella.
- Assistente IA per finestra: scrive, spiega e ottimizza SQL; le operazioni di scrittura richiedono conferma.

### Data grid

- Export pagina corrente, tutti i dati filtrati o tutti i dati.
- CSV, JSON, Excel e SQL.
- Visibilità colonne, paginazione, copy-as-SQL e workflow sui risultati.
- In corso: editing più sicuro con preview, commit/rollback, undo e errori più chiari.

### Table designer

- Campi, chiavi primarie, indici, anteprima SQL e DDL.
- Pensato per diventare la superficie principale del lavoro sugli schemi.

### Import, export, backup, migrazione

- Wizard coerenti per export, import, backup, file SQL, schema sync e data transfer.
- Dizionario database in HTML, Excel e Markdown.
- Diff schema con anteprima SQL prima dell'esecuzione.
- Migrazione cross-database con mapping campi e conversione prudente dei tipi.

### Redis

- Redis nello stesso workspace.
- Navigazione gerarchica, ricerca per prefisso, visualizzazione, modifica ed eliminazione sono in evoluzione.

## Download

- [Sito ufficiale](https://mavicat.kailingteck.com/)
- [GitHub Releases](https://github.com/chenlong/Mavicat/releases)

Mavicat punta a macOS, Windows e Linux. Gli artefatti disponibili possono variare per milestone.

## Sviluppo

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

## Stack

- Tauri v2
- Rust, SQLx, Tiberius, Redis client
- React 19, TypeScript, Vite, Tailwind CSS
- Monaco Editor
- TanStack Table / virtualizzazione
- XYFlow

## Roadmap

- **P0**: editing sicuro, migliore esecuzione SQL, stati connessione stabili, errori chiari.
- **P1**: import/export, schema sync, data transfer, backup/restore con progress e cancel.
- **P2**: table designer, ER diagrams, dizionario, commenti, indici, foreign key, trigger.
- **P3**: wizard unificati, sidebar compatta, menu completi, feedback migliore sui task lunghi.

## Contribuire

Issue, bug riproducibili, feedback UI, casi specifici database, traduzioni e pull request sono benvenuti.

## Licenza e note

[Apache License 2.0](./LICENSE)

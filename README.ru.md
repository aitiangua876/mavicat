<div align="center">
  <img src="public/logo-sm.png" width="120" height="120" alt="Mavicat logo" />

# Mavicat

**Быстрое open-source desktop-приложение для тех, кто каждый день работает с SQL.**

[Сайт](https://mavicat.kailingteck.com/) · [Releases](https://github.com/chenlong/Mavicat/releases) · [Issues](https://github.com/chenlong/Mavicat/issues) · [Contributing](./CONTRIBUTING.md)

[![Website](https://img.shields.io/badge/Website-mavicat.kailingteck.com-22c55e)](https://mavicat.kailingteck.com/)
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

Mavicat переносит профессиональные database-workflows в современное, локальное и расширяемое desktop-приложение. Оно построено на Tauri v2, Rust, React и TypeScript: нативная оболочка, быстрый интерфейс и надежная backend-логика.

Если вам нравится направление проекта, поставьте Star. Это помогает другим разработчикам найти Mavicat и поддерживает развитие open-source roadmap.

## Почему Mavicat?

- **Один workspace для ежедневной работы**: подключения, схемы, SQL, результаты, редактирование данных, дизайн таблиц, экспорт, backup, sync, миграция, Redis и AI.
- **Привычный desktop UX**: компактное дерево подключений, object views, вкладки, панели результатов, context menu и мастера.
- **Local-first**: подключения, история, настройки и AI-конфигурация по умолчанию хранятся локально.
- **Без поиска драйверов**: основные драйверы встроены в Rust backend; для обычной работы не нужно ставить отдельные JDBC, ODBC или client packages.
- **Легкий footprint**: Tauri держит приложение компактным, а Rust выполняет тяжелые database-задачи без большого фонового сервиса.
- **Rust + React**: Rust отвечает за базы данных и OS-интеграцию, React — за редактор и data grid.
- **Открытый и расширяемый**: лицензия Apache-2.0, roadmap для практичных plugins и drivers.

## Product tour

### All-in-one database workspace

![Mavicat workspace](open/public/assets/mavicat-workspace.svg)

Главный экран объединяет connection tree, SQL editor, result grid, toolbar actions и database context. Он помогает быстро переключаться между connections, databases, tables, query tabs и export tasks.

| Область | Для чего нужна |
|---|---|
| Connection tree | Просмотр connections, databases, schemas, tables, columns, views и Redis keys. |
| SQL editor | Выполнение выделения или всего скрипта, multi-result output, formatting и AI на уровне tab. |
| Data grid | Export current page, filtered results или full data в CSV, JSON, Excel и SQL. |
| Object tools | Table design, DDL, dictionary export, backup, schema compare и data migration. |
| Native runtime | Без отдельной настройки drivers для обычных сценариев, меньше расход памяти и диска. |

## Поддерживаемые базы

| База данных | Статус |
|---|---|
| MySQL / MariaDB | Активно |
| PostgreSQL | Активно |
| SQLite | Активно |
| SQL Server | Активно |
| Redis | Активно, просмотр и редактирование ключей улучшаются |
| Oracle | Запланировано, не входит в текущий milestone |

## Возможности

### Database workspace

- Левое дерево со статусами подключений, баз и таблиц.
- Страница объектов базы данных с list/icon view.
- Right-click действия для подключений, баз, таблиц и результатов.
- Multi-tab интерфейс для длинных рабочих сессий.

### SQL editor

- Monaco Editor с форматированием, историей, выполнением выделения или всего скрипта и multi-result output.
- Подключение и база выбираются на уровне query tab.
- Ctrl-click по объекту открывает данные таблицы.
- AI assistant на уровне окна: пишет, объясняет и оптимизирует SQL; write-операции требуют подтверждения.

### Data grid

- Экспорт текущей страницы, всех отфильтрованных данных или всех данных.
- CSV, JSON, Excel и SQL.
- Видимость колонок, pagination, copy-as-SQL и result workflows.
- В разработке: безопасное редактирование с preview, commit/rollback, undo и точным показом ошибок.

### Table designer

- Поля, primary keys, indexes, SQL preview и DDL.
- Цель — надежная поверхность для ежедневной работы со схемами.

### Import, export, backup, migration

- Единые мастера для export, import, backup, SQL files, schema sync и data transfer.
- Database dictionary в HTML, Excel и Markdown.
- Schema diff с SQL preview перед выполнением.
- Cross-database migration с field mapping и осторожным type conversion.

### Redis

- Redis в том же workspace.
- Иерархический просмотр, prefix search, просмотр, редактирование и удаление улучшаются.

## Скачать

- [Официальный сайт](https://mavicat.kailingteck.com/)
- [GitHub Releases](https://github.com/chenlong/Mavicat/releases)

Mavicat ориентирован на macOS, Windows и Linux. Доступные сборки могут отличаться по milestone.

## Разработка

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
- TanStack Table / virtualization
- XYFlow

## Roadmap

- **P0**: безопасное редактирование, лучшее SQL execution, стабильные connection states, понятные ошибки.
- **P1**: import/export, schema sync, data transfer, backup/restore с progress и cancel.
- **P2**: table designer, ER diagrams, dictionary, comments, indexes, foreign keys, triggers.
- **P3**: единые мастера, компактная sidebar, полные context menus, лучший feedback для долгих задач.

## Contributing

Issues, воспроизводимые bugs, UI feedback, database edge cases, переводы и pull requests приветствуются.

## Лицензия и примечания

[Apache License 2.0](./LICENSE)

<div align="center">
  <img src="public/logo-sm.png" width="120" height="120" alt="Mavicat logo" />

# Mavicat

**为每天写 SQL 的人打造的开源桌面数据库工作台。**

[官网](https://mavicat.kailingteck.com/) · [下载](https://github.com/chenlong/Mavicat/releases) · [问题反馈](https://github.com/chenlong/Mavicat/issues) · [贡献指南](./CONTRIBUTING.md)

[![Website](https://img.shields.io/badge/官网-mavicat.kailingteck.com-22c55e)](https://mavicat.kailingteck.com/)
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

Mavicat 希望把高频、顺手、专业的数据库工作流，做成一个现代、轻量、本地优先、可持续开源的桌面工具。它基于 Tauri v2、Rust、React 和 TypeScript 构建，既有原生桌面应用的手感，也保留了前端界面的迭代速度。

如果你喜欢这个方向，欢迎给项目点一个 Star。对早期开源项目来说，Star 会直接帮助更多开发者发现它，也能让路线图更容易持续推进。

## 为什么做 Mavicat？

- **一个窗口完成日常数据库工作**：连接、库表浏览、SQL、多结果集、数据编辑、表设计、导入导出、备份、结构同步、数据迁移、Redis、AI 辅助。
- **熟悉的桌面体验**：紧凑连接树、对象视图、多标签页、结果面板、右键菜单、向导式工具，尽量贴近大家已经习惯的专业数据库工具工作流。
- **本地优先**：连接配置、查询历史、应用设置和 AI 配置默认保存在本机。
- **无需到处安装驱动**：常用数据库驱动由 Rust 后端内置，日常连接 MySQL、PostgreSQL、SQLite、SQL Server、Redis 不需要额外折腾 JDBC、ODBC 或数据库客户端包。
- **体积和占用更克制**：Tauri 提供轻量桌面壳，Rust 负责高负载数据库任务，不需要在后台常驻一整套笨重服务。
- **Rust 后端 + React 前端**：数据库访问、导出、迁移、系统集成交给 Rust；复杂 UI 和编辑器体验交给 React。
- **开放可扩展**：Apache-2.0 许可证，后续会继续完善插件和驱动扩展能力。

## 功能截图与介绍

### 一体化数据库工作台

![Mavicat workspace](open/public/assets/mavicat-workspace.svg)

主界面把连接树、SQL 编辑器、结果网格、工具栏和数据库上下文放在同一个工作区里。你可以在连接、数据库、表、查询标签和导出任务之间快速切换，不需要在多个窗口之间来回找东西。

| 区域 | 适合做什么 |
|---|---|
| 连接树 | 浏览连接、数据库、Schema、表、字段、视图和 Redis Key。 |
| SQL 编辑器 | 执行选中 SQL 或完整脚本，查看多结果集，格式化 SQL，使用查询窗口级 AI 助手。 |
| 数据网格 | 按当前页、当前筛选全部、全部数据导出 CSV、JSON、Excel、SQL。 |
| 对象工具 | 设计表、查看 DDL、导出数据库字典、备份数据库、结构对比、数据迁移。 |
| 原生运行时 | 常用场景无需额外安装数据库驱动，磁盘体积和内存占用更克制。 |

## 支持的数据库

| 数据库 | 状态 |
|---|---|
| MySQL / MariaDB | 已支持 |
| PostgreSQL | 已支持 |
| SQLite | 已支持 |
| SQL Server | 已支持 |
| Redis | 已支持，键浏览和编辑体验持续增强中 |
| Oracle | 规划中，当前阶段暂不包含 |

## 核心功能

### 数据库工作台

- 紧凑的左侧连接树，清晰显示连接、数据库、表和状态。
- 点击数据库后可在右侧查看所有表对象，支持列表/图标视图。
- 连接、数据库、表、结果网格都提供右键快捷操作。
- 多标签工作区，后续会持续增强会话恢复能力。

### SQL 编辑器

- Monaco 编辑器，支持 SQL 格式化、执行历史、选中/全部执行、多结果集展示。
- 每个查询窗口都可以切换连接和数据库。
- 支持 Ctrl + 点击对象跳转到表数据页面。
- 查询窗口级 AI 助手，可写 SQL、解释 SQL、优化 SQL，并把 SQL 追加到编辑器；增删改需要人工二次确认。

### 数据表与结果网格

- 支持当前页、当前筛选全部、全部数据三种导出范围。
- 支持 CSV、JSON、Excel、SQL 导出。
- 支持列显示筛选、分页、复制为 SQL、结果集导出等日常操作。
- 正在强化更安全的数据编辑体验：修改预览、提交/回滚、撤销、错误定位。

### 表设计器

- 字段、主键、索引、SQL 预览、建表语句查看。
- 目标是成为长期可用的表结构编辑核心界面。

### 导入导出、备份、迁移

- 导出、导入、备份、执行 SQL 文件、结构同步、数据迁移统一使用向导式体验。
- 数据库字典支持 HTML、Excel、Markdown。
- 结构对比后先生成 SQL 预览，确认后再执行。
- 跨库迁移支持字段映射和保守类型转换。

### Redis 工作区

- Redis 连接与关系型数据库统一管理。
- 正在向主流 Redis 客户端体验靠近：层级浏览、前缀搜索、查看、编辑、删除。

## 下载

最新版本请查看：

- [Mavicat 官网](https://mavicat.kailingteck.com/)
- [GitHub Releases](https://github.com/chenlong/Mavicat/releases)

Mavicat 通过 Tauri 打包，目标支持 macOS、Windows 和 Linux。不同里程碑可用安装包可能不同。

## 本地开发

环境要求：

- Node.js 20+
- pnpm 10+
- Rust stable
- 当前系统对应的 Tauri 依赖环境

启动：

```bash
pnpm install
pnpm tauri dev
```

构建：

```bash
pnpm tauri build
```

常用检查：

```bash
pnpm run build
pnpm test
cd src-tauri && cargo test
```

## 技术栈

- **桌面容器**：Tauri v2
- **后端**：Rust、SQLx、Tiberius、Redis client
- **前端**：React 19、TypeScript、Vite、Tailwind CSS
- **编辑器**：Monaco Editor
- **数据网格**：TanStack Table / virtualization
- **图形视图**：XYFlow

## 路线图

- **P0 日常体验**：更安全的数据编辑、更顺手的 SQL 执行、更稳定的连接状态、更清晰的错误提示。
- **P1 数据库工具链**：导入导出、结构同步、数据迁移、备份恢复、进度和取消。
- **P2 专业能力**：表设计器、ER 图、数据字典、注释、索引、外键、触发器。
- **P3 产品打磨**：统一向导、紧凑高对比侧边栏、完整右键菜单、长任务反馈。

## 参与贡献

欢迎提交 Issue、Bug 复现、UI/UE 建议、数据库兼容性问题、翻译和 Pull Request。反馈时最好带上数据库类型、系统版本、操作步骤和期望行为。

## 许可证

[Apache License 2.0](./LICENSE)

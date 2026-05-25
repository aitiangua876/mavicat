<div align="center">
  <img src="public/logo-sm.png" width="120" height="120" alt="Mavicat logo" />

# Mavicat

**SQL を日常的に扱う人のための、オープンソースのデスクトップデータベースワークスペース。**

[公式サイト](https://mavicat.kailingteck.com/) · [Releases](https://github.com/aitiangua876/mavicat/releases) · [Issues](https://github.com/aitiangua876/mavicat/issues) · [Contributing](./CONTRIBUTING.md)

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

Mavicat は、プロ向けデータベースワークフローを、モダンでローカルファーストなデスクトップアプリとして再構築するプロジェクトです。Tauri v2、Rust、React、TypeScript により、ネイティブな操作感と柔軟な UI を両立します。

気に入っていただけたら Star をお願いします。プロジェクトを見つけてもらいやすくなり、オープンソースのロードマップを継続しやすくなります。

## Mavicat の特徴

- **日常作業を 1 つのワークスペースに**: 接続、スキーマ、SQL、結果、データ編集、テーブル設計、エクスポート、バックアップ、同期、移行、Redis、AI 支援。
- **馴染みのあるデスクトップ UX**: コンパクトな接続ツリー、オブジェクトビュー、タブ、結果パネル、コンテキストメニュー、ウィザード。
- **ローカルファースト**: 接続、履歴、設定、AI 構成はデフォルトでローカル保存。
- **ドライバ探し不要**: 一般的なデータベースドライバは Rust バックエンドに組み込まれており、日常利用で JDBC、ODBC、外部クライアントを別途入れる必要はありません。
- **軽量なデスクトップ設計**: Tauri がアプリ本体をコンパクトに保ち、Rust が重い DB 処理を担当します。
- **Rust + React**: Rust が DB 処理と OS 連携を担当し、React がエディタとデータグリッドを担当。
- **オープンで拡張可能**: Apache-2.0、実用的なプラグインとドライバ拡張を目指しています。

## プロダクトツアー

### オールインワンのデータベースワークスペース

![Mavicat workspace](open/public/assets/mavicat-workspace.svg)

メイン画面には接続ツリー、SQL エディタ、結果グリッド、ツールバー、DB コンテキストがまとまっています。接続、DB、テーブル、クエリタブ、エクスポート作業を素早く切り替えられます。

| エリア | できること |
|---|---|
| 接続ツリー | 接続、データベース、スキーマ、テーブル、カラム、ビュー、Redis キーを閲覧。 |
| SQL エディタ | 選択範囲または全体実行、複数結果、SQL 整形、タブ単位の AI 支援。 |
| データグリッド | 現在ページ、フィルタ結果、全データを CSV、JSON、Excel、SQL に出力。 |
| オブジェクトツール | テーブル設計、DDL 表示、辞書出力、バックアップ、スキーマ比較、データ移行。 |
| ネイティブランタイム | 一般的な作業で追加ドライバ設定が不要、メモリとディスク使用も抑えめ。 |

## 対応データベース

| Database | Status |
|---|---|
| MySQL / MariaDB | 対応 |
| PostgreSQL | 対応 |
| SQLite | 対応 |
| SQL Server | 対応 |
| Redis | 対応、キー閲覧と編集を改善中 |
| Oracle | 計画中、現在のマイルストーンには未含有 |

## 主な機能

### データベースワークスペース

- 接続、データベース、テーブルの状態が分かる左サイドツリー。
- データベースごとのオブジェクトページ、リスト/アイコン表示。
- 接続、DB、テーブル、結果グリッドの右クリック操作。
- 長時間の作業に向いたマルチタブ UI。

### SQL エディタ

- Monaco Editor によるフォーマット、履歴、選択/全体実行、複数結果表示。
- クエリタブごとに接続とデータベースを切り替え可能。
- Ctrl + クリックでオブジェクトからテーブルデータへ移動。
- タブ単位の AI アシスタント。SQL の作成、説明、最適化、挿入に対応し、書き込み操作は確認が必要。

### データグリッド

- 現在ページ、フィルタ済み全件、全データのエクスポート。
- CSV、JSON、Excel、SQL。
- 列表示、ページング、SQL としてコピー、結果操作。
- 改善中: プレビュー、コミット/ロールバック、Undo、エラー位置表示を備えた安全な編集。

### テーブルデザイナー

- フィールド、主キー、インデックス、SQL プレビュー、DDL 表示。
- 日常的なスキーマ編集の中心となる画面を目指しています。

### インポート、エクスポート、バックアップ、移行

- エクスポート、インポート、バックアップ、SQL ファイル実行、スキーマ同期、データ移行を統一ウィザードで提供。
- データベース辞書を HTML、Excel、Markdown で出力。
- スキーマ差分から SQL プレビューを生成し、確認後に実行。
- フィールドマッピングと慎重な型変換によるクロス DB 移行。

### Redis

- リレーショナル DB と同じワークスペースで Redis を管理。
- 階層表示、プレフィックス検索、表示、編集、削除を改善中。

## ダウンロード

- [公式サイト](https://mavicat.kailingteck.com/)
- [GitHub Releases](https://github.com/aitiangua876/mavicat/releases)
- [macOS 版をダウンロード](https://github.com/aitiangua876/mavicat/releases/download/v1.0.3/Mavicat_1.0.3_aarch64.dmg)
- [Windows 版をダウンロード](https://github.com/aitiangua876/mavicat/releases/download/v1.0.3/Mavicat_1.0.3_Windows_Setup.exe)

Mavicat は macOS、Windows、Linux を対象にしています。利用可能なビルドはマイルストーンにより異なります。

## 開発

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

## 技術スタック

- Tauri v2
- Rust、SQLx、Tiberius、Redis client
- React 19、TypeScript、Vite、Tailwind CSS
- Monaco Editor
- TanStack Table / virtualization
- XYFlow

## Roadmap

- **P0**: 安全なデータ編集、SQL 実行改善、接続状態安定化、明確なエラー。
- **P1**: import/export、schema sync、data transfer、進捗とキャンセル付き backup/restore。
- **P2**: table designer、ER diagrams、dictionary、comments、indexes、foreign keys、triggers。
- **P3**: 統一ウィザード、コンパクトな sidebar、完全な context menu、長時間タスクのフィードバック。

## コントリビュート

Issue、再現可能なバグ、UI フィードバック、DB 固有ケース、翻訳、Pull Request を歓迎します。

## 謝辞

初期の取り組みとインスピレーションを与えてくれた open-source プロジェクト [Tabularis](https://github.com/TabularisDB/tabularis) に感謝します。

## ライセンスと注記

[Apache License 2.0](./LICENSE)

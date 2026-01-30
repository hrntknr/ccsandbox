# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ccsandboxはGitHubリポジトリ用のセッションベース開発環境マネージャー。Web UIとCLIでリポジトリのクローン、devcontainerの起動、xterm.jsによるターミナル管理を提供する。

## Build & Development Commands

```bash
# ビルド
npm run build          # 全パッケージをビルド
npm run clean          # distディレクトリを削除
npm run typecheck      # 型チェックのみ

# テスト
npm test               # 全テスト実行
npm run test:watch     # ウォッチモード
npm test -w=@ccsandbox/server  # 特定パッケージのテスト

# 開発
npm run dev            # 開発モードでCLI起動
npm run dev -w=@ccsandbox/server  # サーバーのみ開発モード
npm run dev -w=@ccsandbox/web     # Webのみ開発モード

# 実行
npm start
```

## Architecture

TypeScript monorepo (npm workspaces) with 4 packages:

```
packages/
├── cli/      # CLIエントリーポイント (commander)
├── server/   # Express.js + WebSocket バックエンド
├── web/      # React + Vite フロントエンド (xterm.js)
└── shared/   # 共有型定義
```

**データフロー**: CLI → Server (Express + WebSocket) ↔ Web (React) → Services → Persistence (JSON: ~/.ccsandbox/)

### Server Structure

- `routes/` - REST API (`/api/github`, `/api/sessions`)
- `services/` - ビジネスロジック (git, GitHub, devcontainer, terminal)
- `persistence/` - JSONベースのセッション永続化
- `ws/` - WebSocket (ターミナルI/O, セッション同期)

### Web Structure

- `components/` - React UI (SessionList, TerminalPane, Terminal, NewSessionModal)
- `hooks/` - カスタムフック (useApi, useSessionSync, useTerminalWebSocket)

## TypeScript Configuration

- ES2022 target, NodeNext module
- Strict mode enabled
- `noUncheckedIndexedAccess: true`

## Git Conventions

Conventional Commits形式: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`

## CLI Options

```
--config-dir <path>        設定ディレクトリ (default: ~/.ccsandbox)
--repo-dir <path>          リポジトリディレクトリ (default: ~/.ccsandbox/repo)
--listen <host>            バインドホスト (default: 127.0.0.1)
--port <port>              ポート (default: 3000)
--devcontainer-cli <path>  devcontainer CLIパス
```

GitHub PAT と API Base URL は Web UI の Settings から設定。

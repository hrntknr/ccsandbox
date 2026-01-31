# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ccsandboxはGitHubリポジトリ用のセッションベース開発環境マネージャー。Web UIとCLIでリポジトリのクローン、devcontainerの起動、xterm.jsによるターミナル管理を提供する。

## Build & Development Commands

```bash
# ビルド
npm run build          # サーバーとWebをビルド
npm run clean          # distディレクトリを削除
npm run typecheck      # 型チェックのみ

# テスト (ビルド不要)
npm test               # 全テスト実行
npm run test:watch     # ウォッチモード

# 開発
npm run dev            # サーバーとWebを並列起動

# 実行 (ビルド後)
npm start
```

## Architecture

```
src/                   # バックエンド (CLI + Server)
├── cli.ts             # CLIエントリーポイント (commander)
├── index.ts           # サーバーエントリーポイント
├── app.ts             # Express.js アプリケーション
├── routes/            # REST API (`/api/github`, `/api/sessions`)
├── services/          # ビジネスロジック (git, GitHub, devcontainer, terminal)
├── persistence/       # JSONベースのセッション永続化
├── websocket/         # WebSocket (ターミナルI/O, セッション同期)
├── shared/            # 共有型定義
└── __tests__/         # テスト

web/                   # フロントエンド (React + Vite)
├── App.tsx            # メインコンポーネント
├── components/        # React UI (SessionList, TerminalPane, Terminal, NewSessionModal)
└── hooks/             # カスタムフック (useApi, useSessionSync, useTerminalWebSocket)
```

**データフロー**: CLI → Server (Express + WebSocket) ↔ Web (React) → Services → Persistence (JSON: ~/.ccsandbox/)

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

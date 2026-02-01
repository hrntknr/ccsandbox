# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Note**: Keep this file up to date with project changes. Update this file when adding new files, routes, services, or components.

## Project Overview

ccsandbox is a session-based development environment manager for GitHub repositories. It provides repository cloning, devcontainer startup, xterm.js terminal management, and Claude CLI integration via Web UI and CLI.

## Build & Development Commands

```bash
# Build
npm run build          # Build server and web (esbuild + Vite)
npm run build:server   # Build server only
npm run build:web      # Build web only
npm run clean          # Remove dist/ and web/dist
npm run typecheck      # Type check only

# Test (no build required)
npm test               # Run all tests (vitest)
npm run test:watch     # Watch mode

# Development
npm run dev            # Start server and web in parallel
npm run dev:server     # Server only (tsx)
npm run dev:web        # Web only (Vite watch)

# Run (after build)
npm start
```

## Architecture

```
src/                   # Backend (CLI + Server)
├── cli.ts             # CLI entry point (commander)
├── index.ts           # Server entry point
├── app.ts             # Express.js application
├── config.ts          # Global server config management
├── middleware/
│   └── auth.ts        # Token + password authentication
├── routes/api/
│   ├── index.ts       # /api/health, route aggregation
│   ├── github.ts      # /api/github (repository list)
│   ├── sessions.ts    # /api/sessions (CRUD, diff)
│   └── config.ts      # /api/config (get/update settings)
├── services/
│   ├── git.service.ts           # clone, diff
│   ├── github.service.ts        # GitHub API, cache
│   ├── devcontainer.service.ts  # Container start/stop
│   ├── terminal.service.ts      # PTY management
│   ├── container-health.service.ts  # Health check
│   ├── claude.service.ts        # Claude CLI subprocess management
│   └── port-forwarding.service.ts  # Host→container port forwarding
├── persistence/
│   ├── session-store.ts   # Session persistence (JSON)
│   └── config-store.ts    # Config persistence (JSON)
├── websocket/
│   ├── index.ts           # WSS setup, message routing
│   ├── connection-manager.ts    # Client connection tracking
│   ├── terminal.handler.ts      # Terminal/Claude tab management
│   ├── session-create.handler.ts  # Session creation
│   └── session-sync-manager.ts  # Multi-tab sync
├── shared/types/
│   ├── session.ts     # Session, TerminalTab, TabType
│   ├── api.ts         # ApiResponse, etc.
│   ├── github.ts      # Repository, GitHubUser
│   ├── container.ts   # ContainerInfo, DevcontainerUpResult
│   ├── claude.ts      # ClaudeEvent, ClaudeMessage, ClaudePermissionMode
│   └── terminal.ts    # TerminalClientMessage, TerminalServerMessage
├── utils/
│   └── auth.ts        # Token generation/verification, password hashing
└── __tests__/         # Tests (16 files)

web/                   # Frontend (React + Vite + Tailwind CSS)
├── App.tsx            # Main component
├── components/
│   ├── SessionList/       # Session list
│   ├── TerminalPane/      # Terminal UI wrapper
│   ├── Terminal/          # xterm.js integration
│   ├── NewSessionModal/   # Session creation modal
│   ├── SettingsModal/     # Settings editor
│   ├── ClaudeChat/        # Claude UI components
│   │   ├── MessageList.tsx
│   │   ├── InputForm.tsx
│   │   ├── PermissionDialog.tsx
│   │   ├── PermissionModeSelector.tsx
│   │   └── AnsiOutput.tsx
│   ├── DiffView/          # Git diff display
│   └── PortForwardingModal/  # Port forwarding settings
└── hooks/
    ├── useApi.ts              # API requests
    ├── useSessionSync.ts      # Multi-tab sync
    ├── useSessionCreate.ts    # Session creation logic
    └── useTerminalWebSocket.ts  # WebSocket connection
```

**Data Flow**: CLI → Server (Express + WebSocket) ↔ Web (React) → Services → Persistence (JSON: ~/.ccsandbox/)

## API Routes

```
GET  /api/health                         # Health check
GET  /api/config                         # Get config (PAT masked)
PUT  /api/config                         # Update config

GET  /api/github/repos                   # List repositories
POST /api/github/refresh                 # Refresh cache

GET  /api/sessions                       # List sessions
POST /api/sessions                       # Create session
GET  /api/sessions/:sessionId            # Get session details
PUT  /api/sessions/:sessionId            # Update session
DELETE /api/sessions/:sessionId          # Delete session
GET  /api/sessions/:sessionId/diff-stats   # Git diff statistics
GET  /api/sessions/:sessionId/diff-detail  # Git diff details
GET  /api/sessions/:sessionId/ports        # List port forwardings
POST /api/sessions/:sessionId/ports        # Add port forwarding
DELETE /api/sessions/:sessionId/ports/:portId  # Remove port forwarding

WS   /ws                                 # WebSocket (terminal + Claude)
```

## TypeScript Configuration

- ES2022 target, NodeNext module
- Strict mode enabled
- `noUncheckedIndexedAccess: true`
- `noImplicitOverride: true`
- `noPropertyAccessFromIndexSignature: true`

## Git Conventions

Conventional Commits format: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`

## CLI Options

```
--config-dir <path>        Config directory (default: ~/.ccsandbox)
--repo-dir <path>          Repository directory (default: ~/.ccsandbox/repo)
--listen <host>            Bind host (default: 0.0.0.0)
--port <port>              Port (default: 3000)
--devcontainer-cli <path>  devcontainer CLI path
```

## Configuration (Settings)

Configurable via Web UI Settings:

- **GitHub PAT**: GitHub Personal Access Token
- **API Base URL**: For GitHub Enterprise (optional)
- **Password**: Authentication password (bcrypt hashed)
- **Default Shell**: Default shell
- **Dotfiles**: Repository URL, target path, install command

## Testing

Uses Vitest. 16 test files:

```
src/__tests__/
├── routes: app, github.routes, sessions.routes
├── services: git, github, devcontainer, terminal, container-health
├── websocket: index, terminal.handler, session-create.handler
├── persistence: session-store
└── other: config, server, cli/cli
```

## Dependencies

**Runtime**: commander, express, ws, @lydell/node-pty, bcrypt, cookie-parser, uuid
**Web**: react, xterm, tailwindcss, streamdown
**Node**: >=20.11.0

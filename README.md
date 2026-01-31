# ccsandbox

A self-hostable Claude Code-like web environment. Run AI agents safely by sandboxing Claude Code inside a devcontainer, with no impact on your host machine.

## Features

- List and clone repositories from GitHub / GitHub Enterprise
- Launch and manage containers via devcontainer
- Web terminal powered by xterm.js (multi-tab support)
- Claude CLI integration (chat, permission management)
- Session persistence (JSON)
- Real-time sync across multiple browser tabs

## Requirements

- Node.js >= 20.11.0
- Docker
- devcontainer CLI

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
# Start the server
npm start

# With options
npm start -- --port 8080 --listen 0.0.0.0
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--config-dir <path>` | Configuration directory | `~/.ccsandbox` |
| `--repo-dir <path>` | Repository directory | `~/.ccsandbox/repo` |
| `--listen <host>` | Bind host | `127.0.0.1` |
| `--port <port>` | Port | `3000` |
| `--devcontainer-cli <path>` | devcontainer CLI path | - |

## Development

```bash
# Start dev server (server + web in parallel)
npm run dev

# Build
npm run build

# Test
npm test
npm run test:watch

# Type check
npm run typecheck

# Clean
npm run clean
```

## Configuration

Configure the following from Settings in the Web UI:

- **GitHub PAT**: GitHub Personal Access Token
- **API Base URL**: For GitHub Enterprise (optional)
- **Password**: Authentication password
- **Default Shell**: Default shell
- **Dotfiles**: Dotfiles repository settings

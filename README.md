# ccsandbox

A self-hostable Claude Code-like web environment. Run AI agents safely by sandboxing Claude Code inside a devcontainer, with no impact on your host machine.

<!-- Screenshots -->
<table align="center">
  <tr>
    <td align="center">
      <img src="docs/images/screenshot-desktop.png" alt="Desktop View" width="600">
      <br>
      <em>Desktop View</em>
    </td>
    <td align="center">
      <img src="docs/images/screenshot-mobile.png" alt="Mobile View" width="180">
      <br>
      <em>Mobile View</em>
    </td>
  </tr>
</table>

## Features

- List and clone repositories from GitHub / GitHub Enterprise
- Launch and manage containers via devcontainer
- Web terminal powered by xterm.js (multi-tab support)
- Claude CLI integration (chat, permission management)
- Session persistence
- Real-time sync across multiple browser tabs

## Advantages (vs. Claude Code Web)

This tool is mainly about choosing the right execution environment and tools, but it also covers several gaps where Claude Code Web is less convenient or not supported.

* **Use tools that Claude Code Web doesn't support**

  * e.g. `EnterPlanMode` (plan → approval workflow)
  * e.g. `AskUserQuestion` (asking questions via selectable options)

    <table>
      <tr>
        <td align="center">
          <img src="docs/images/askuserquestion-desktop.png" alt="AskUserQuestion Desktop" width="500">
          <br>
          <em>Desktop</em>
        </td>
        <td align="center">
          <img src="docs/images/askuserquestion-mobile.png" alt="AskUserQuestion Mobile" width="150">
          <br>
          <em>Mobile</em>
        </td>
      </tr>
    </table>

* **Ship a project-specific development environment (devcontainer support)**

  * Devcontainer is one of [Claude Code's recommended best practices](https://docs.anthropic.com/en/docs/claude-code/tutorials#use-devcontainers)
  * Include a devcontainer configuration in the repo to handle environment-specific setup
  * Improves reproducibility for team development and onboarding

* **Run local services and view them in the browser (port forwarding)**

  * Faster build → run → verify loops with browser-based access

* **Work with compatible APIs and multiple API providers**

  * Doesn't require a Claude Code plan
  * Works in environments where traffic must go through a company API proxy

## Advantages (vs. claudecodeui)

Compared to [siteboon/claudecodeui](https://github.com/siteboon/claudecodeui):

- **Sandboxed execution** – Each session runs inside a devcontainer, so YOLO mode can be used safely without affecting your host machine.
- **Full tool support** – Handles `AskUserQuestion` and `EnterPlanMode` tools that claudecodeui does not support.
- **Project lifecycle management** – Manages git operations (clone, branch, checkout) per session, making it easy to work on multiple PRs in parallel.

## Advantages (vs. claude-code-sandbox / claudebox)

Compared to [textcortex/claude-code-sandbox](https://github.com/textcortex/claude-code-sandbox) and [RchGrav/claudebox](https://github.com/RchGrav/claudebox):

- **Multi-session support** – Manage multiple repositories and workspaces simultaneously, enabling parallel development across different projects or branches.
- **Web UI included** – Provides a browser-based interface out of the box; no additional setup required.

## Requirements

Before using ccsandbox, make sure you have the following installed:

- **Docker** - Container runtime
  - [Install Docker](https://docs.docker.com/get-docker/)
- **@devcontainers/cli** - Dev Container CLI
  ```bash
  npm install -g @devcontainers/cli
  ```

## Quick Start

### 1. Start ccsandbox

```bash
npx ccsandbox@latest
```

The server starts at `http://localhost:3000` by default.

### 2. Initial Setup

1. Open `http://localhost:3000` in your browser
2. Click the **Settings** icon (gear icon)
3. Enter your **GitHub Personal Access Token (PAT)**
   - Required scopes: `contents` (read/write)
   - [Create a new PAT (Fine-grained)](https://github.com/settings/personal-access-tokens/new)
4. (Optional) Set a **Password** for authentication
5. Save your settings

## CLI Options

| Option                      | Description             | Default             |
| --------------------------- | ----------------------- | ------------------- |
| `--port <port>`             | Port                    | `3000`              |
| `--listen <host>`           | Bind host               | `0.0.0.0`           |
| `--config-dir <path>`       | Configuration directory | `~/.ccsandbox`      |
| `--repo-dir <path>`         | Repository directory    | `~/.ccsandbox/repo` |
| `--devcontainer-cli <path>` | devcontainer CLI path   | (auto-detect)       |

### Examples

```bash
# Start on a different port
npx ccsandbox@latest --port 8080

# Specify custom directories
npx ccsandbox@latest --config-dir ./my-config --repo-dir ./my-repos
```

## Running as a systemd Service

An example systemd user service file is provided in [`examples/ccsandbox.service`](examples/ccsandbox.service).

```bash
# Copy the service file
mkdir -p ~/.config/systemd/user
cp examples/ccsandbox.service ~/.config/systemd/user/ccsandbox.service

# Edit the service file if needed (e.g., change ExecStart for your setup)
# vim ~/.config/systemd/user/ccsandbox.service

# Enable and start the service
systemctl --user daemon-reload
systemctl --user enable --now ccsandbox

# View logs
journalctl --user -u ccsandbox -f
```

## Development

```bash
# Clone the repository
git clone https://github.com/ryoppippi/ccsandbox.git
cd ccsandbox

# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Build
npm run build
```

## License

MIT

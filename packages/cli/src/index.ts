#!/usr/bin/env node
import { program } from 'commander';
import os from 'node:os';
import path from 'node:path';

interface CliOptions {
  pat: string;
  apiBase: string;
  repoDir: string;
  listen: string;
  port: string;
  devcontainerCli?: string;
  dotfilesRepository?: string;
  dotfilesTargetPath?: string;
  dotfilesInstallCommand?: string;
}

const DEFAULT_REPO_DIR = path.join(os.homedir(), '.ccsandbox');
const DEFAULT_LISTEN = '127.0.0.1';
const DEFAULT_PORT = '3000';
const DEFAULT_API_BASE = 'https://api.github.com';

program
  .name('ccsandbox')
  .description('CLI for starting the ccsandbox Web UI server')
  .version('0.0.0')
  .requiredOption('--pat <token>', 'GitHub Personal Access Token (required)')
  .option('--api-base <url>', 'GitHub API Base URL', DEFAULT_API_BASE)
  .option('--repo-dir <path>', 'Workspace root directory', DEFAULT_REPO_DIR)
  .option('--listen <host>', 'Bind host', DEFAULT_LISTEN)
  .option('--port <port>', 'Listen port', DEFAULT_PORT)
  .option('--devcontainer-cli <path>', 'Path to devcontainer CLI')
  .option('--dotfiles-repository <url>', 'Dotfiles repository URL')
  .option('--dotfiles-target-path <path>', 'Dotfiles target path')
  .option('--dotfiles-install-command <command>', 'Dotfiles install command')
  .action(async (options: CliOptions) => {
    const { startServer } = await import('@ccsandbox/server');

    const port = parseInt(options.port, 10);
    if (isNaN(port) || port < 0 || port > 65535) {
      console.error(`Invalid port: ${options.port}`);
      process.exit(1);
    }

    try {
      await startServer({
        pat: options.pat,
        apiBase: options.apiBase,
        repoDir: options.repoDir,
        listen: options.listen,
        port,
        devcontainerCli: options.devcontainerCli,
        dotfilesRepository: options.dotfilesRepository,
        dotfilesTargetPath: options.dotfilesTargetPath,
        dotfilesInstallCommand: options.dotfilesInstallCommand,
        serveStatic: true,
      });
    } catch (err) {
      console.error('Failed to start server:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();

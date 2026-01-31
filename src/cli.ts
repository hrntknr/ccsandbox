#!/usr/bin/env node
import { program } from 'commander';
import os from 'node:os';
import path from 'node:path';

interface CliOptions {
  configDir: string;
  repoDir: string;
  listen: string;
  port: string;
  devcontainerCli?: string;
  dev?: boolean;
}

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.ccsandbox');
const DEFAULT_REPO_DIR = path.join(os.homedir(), '.ccsandbox', 'repo');
const DEFAULT_LISTEN = '0.0.0.0';
const DEFAULT_PORT = '3000';

program
  .name('ccsandbox')
  .description('CLI for starting the ccsandbox Web UI server')
  .version('0.0.0')
  .option('--config-dir <path>', 'Configuration directory', DEFAULT_CONFIG_DIR)
  .option('--repo-dir <path>', 'Workspace root directory', DEFAULT_REPO_DIR)
  .option('--listen <host>', 'Bind host', DEFAULT_LISTEN)
  .option('--port <port>', 'Listen port', DEFAULT_PORT)
  .option('--devcontainer-cli <path>', 'Path to devcontainer CLI')
  .action(async (options: CliOptions) => {
    const { startServer } = await import('./index.js');

    const port = parseInt(options.port, 10);
    if (isNaN(port) || port < 0 || port > 65535) {
      console.error(`Invalid port: ${options.port}`);
      process.exit(1);
    }

    try {
      await startServer({
        configDir: options.configDir,
        repoDir: options.repoDir,
        listen: options.listen,
        port,
        devcontainerCli: options.devcontainerCli,
        serveStatic: true,
      });
    } catch (err) {
      console.error('Failed to start server:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();

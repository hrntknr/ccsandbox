import http from 'node:http';
import { createApp, type CreateAppOptions } from './app.js';
import { setConfig, type ServerConfig } from './config.js';
import { setupWebSocketServer, type WebSocketServerInstance } from './websocket/index.js';
import { resetTerminalManager } from './services/terminal.service.js';
import { startBackgroundRefresh, stopBackgroundRefresh } from './services/github.service.js';
import { getConfigStore } from './persistence/config-store.js';

export { getConfig, hasConfig, setConfig, updateConfig, type ServerConfig } from './config.js';
export { getConfigStore, resetConfigStore, ConfigStore } from './persistence/config-store.js';
export { createApp, type CreateAppOptions } from './app.js';
export { setupWebSocketServer, type WebSocketServerInstance } from './websocket/index.js';
export { getTerminalManager, resetTerminalManager } from './services/terminal.service.js';

export interface StartServerOptions {
  /** GitHub API Base URL */
  apiBase: string;
  /** Workspace root directory */
  repoDir: string;
  /** Bind host */
  listen: string;
  /** Listen port */
  port: number;
  /** Path to devcontainer CLI (optional) */
  devcontainerCli?: string;
  /** Enable static file serving for production mode */
  serveStatic?: boolean;
}

export interface ServerInstance {
  /** The HTTP server instance */
  server: http.Server;
  /** The WebSocket server instance */
  wss: WebSocketServerInstance;
  /** The configured port (may differ from requested if port 0 was used) */
  port: number;
  /** Close the server */
  close: () => Promise<void>;
}

/**
 * Start the server with the given configuration.
 * Returns a promise that resolves when the server is listening.
 */
export async function startServer(options: StartServerOptions): Promise<ServerInstance> {
  // Load persisted configuration from config.json
  const configStore = getConfigStore(options.repoDir);
  const persistedConfig = await configStore.read();

  // Merge CLI options with persisted config
  // Editable options (pat, apiBase, dotfiles, defaultShell) come from persisted config if available
  // CLI options serve as defaults
  const effectiveApiBase = persistedConfig.apiBase ?? options.apiBase;

  setConfig({
    pat: persistedConfig.pat,
    apiBase: effectiveApiBase,
    repoDir: options.repoDir,
    listen: options.listen,
    port: options.port,
    devcontainerCli: options.devcontainerCli,
    dotfilesRepository: persistedConfig.dotfilesRepository,
    dotfilesTargetPath: persistedConfig.dotfilesTargetPath,
    dotfilesInstallCommand: persistedConfig.dotfilesInstallCommand,
    defaultShell: persistedConfig.defaultShell,
  });

  // Create Express app
  const app = createApp({
    serveStatic: options.serveStatic,
  });

  // Create HTTP server (separate from Express for WebSocket support)
  const server = http.createServer(app);

  // Setup WebSocket server for terminal connections
  const wss = setupWebSocketServer(server);

  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      reject(err);
    });

    server.listen(options.port, options.listen, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address
        ? address.port
        : options.port;

      console.log(`Server listening on http://${options.listen}:${actualPort}`);
      console.log(`WebSocket terminal endpoint: ws://${options.listen}:${actualPort}/ws/terminal`);

      // Start background repository cache refresh (only if PAT is configured)
      if (persistedConfig.pat) {
        startBackgroundRefresh(persistedConfig.pat, effectiveApiBase);
      }

      resolve({
        server,
        wss,
        port: actualPort,
        close: () => new Promise<void>((resolveClose, rejectClose) => {
          // Stop background refresh
          stopBackgroundRefresh();

          // Close WebSocket server and cleanup terminals
          wss.close();
          resetTerminalManager();

          server.close((err) => {
            if (err) {
              rejectClose(err);
            } else {
              resolveClose();
            }
          });
        }),
      });
    });
  });
}

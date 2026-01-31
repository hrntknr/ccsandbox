import http from 'node:http';
import { mkdir } from 'node:fs/promises';
import { createApp, type CreateAppOptions } from './app.js';
import { setConfig, type ServerConfig } from './config.js';
import { setupWebSocketServer, type WebSocketServerInstance } from './websocket/index.js';
import { resetTerminalManager } from './services/terminal.service.js';
import { startBackgroundRefresh, stopBackgroundRefresh } from './services/github.service.js';
import { startContainerHealthCheck, stopContainerHealthCheck } from './services/container-health.service.js';
import { getConfigStore } from './persistence/config-store.js';
import { generateAuthToken } from './utils/auth.js';

export { getConfig, hasConfig, setConfig, updateConfig, type ServerConfig } from './config.js';
export { getConfigStore, resetConfigStore, ConfigStore } from './persistence/config-store.js';
export { createApp, type CreateAppOptions } from './app.js';
export { setupWebSocketServer, type WebSocketServerInstance } from './websocket/index.js';
export { getTerminalManager, resetTerminalManager } from './services/terminal.service.js';
export {
  startContainerHealthCheck,
  stopContainerHealthCheck,
  isHealthCheckRunning,
} from './services/container-health.service.js';

export interface StartServerOptions {
  /** Configuration directory (sessions.json, config.json) */
  configDir: string;
  /** Workspace root directory for cloned repositories */
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
  // Ensure configDir and repoDir exist
  await mkdir(options.configDir, { recursive: true });
  await mkdir(options.repoDir, { recursive: true });

  // Load persisted configuration from config.json
  const configStore = getConfigStore(options.configDir);
  let persistedConfig = await configStore.read();

  // Generate auth token if not present
  if (!persistedConfig.authToken) {
    const newToken = generateAuthToken();
    persistedConfig = await configStore.write({ authToken: newToken });
  }

  // Use persisted apiBase or default
  const effectiveApiBase = persistedConfig.apiBase ?? 'https://api.github.com';

  setConfig({
    pat: persistedConfig.pat,
    apiBase: effectiveApiBase,
    configDir: options.configDir,
    repoDir: options.repoDir,
    listen: options.listen,
    port: options.port,
    devcontainerCli: options.devcontainerCli,
    dotfilesRepository: persistedConfig.dotfilesRepository,
    dotfilesTargetPath: persistedConfig.dotfilesTargetPath,
    dotfilesInstallCommand: persistedConfig.dotfilesInstallCommand,
    defaultShell: persistedConfig.defaultShell,
    authToken: persistedConfig.authToken,
    authPasswordHash: persistedConfig.authPasswordHash,
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

      // Always print authentication URL
      if (persistedConfig.authToken) {
        console.log('');
        console.log('Authentication URL:');
        console.log(`  http://${options.listen}:${actualPort}/?token=${persistedConfig.authToken}`);
      }

      // Start background repository cache refresh (only if PAT is configured)
      if (persistedConfig.pat) {
        startBackgroundRefresh(persistedConfig.pat, effectiveApiBase);
      }

      // Start container health check
      startContainerHealthCheck();

      resolve({
        server,
        wss,
        port: actualPort,
        close: () => new Promise<void>((resolveClose, rejectClose) => {
          // Stop background refresh
          stopBackgroundRefresh();

          // Stop container health check
          stopContainerHealthCheck();

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

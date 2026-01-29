import http from 'node:http';
import { createApp, type CreateAppOptions } from './app.js';
import { setConfig, type ServerConfig } from './config.js';
import { setupWebSocketServer, type WebSocketServerInstance } from './websocket/index.js';
import { resetTerminalManager } from './services/terminal.service.js';

export { getConfig, hasConfig, setConfig, type ServerConfig } from './config.js';
export { createApp, type CreateAppOptions } from './app.js';
export { setupWebSocketServer, type WebSocketServerInstance } from './websocket/index.js';
export { getTerminalManager, resetTerminalManager } from './services/terminal.service.js';

export interface StartServerOptions extends ServerConfig {
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
  // Store configuration for use by routes
  setConfig({
    pat: options.pat,
    apiBase: options.apiBase,
    repoDir: options.repoDir,
    listen: options.listen,
    port: options.port,
    devcontainerCli: options.devcontainerCli,
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

      resolve({
        server,
        wss,
        port: actualPort,
        close: () => new Promise<void>((resolveClose, rejectClose) => {
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

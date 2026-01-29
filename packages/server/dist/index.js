import http from 'node:http';
import { createApp } from './app.js';
import { setConfig } from './config.js';
import { setupWebSocketServer } from './websocket/index.js';
import { resetTerminalManager } from './services/terminal.service.js';
export { getConfig, hasConfig, setConfig } from './config.js';
export { createApp } from './app.js';
export { setupWebSocketServer } from './websocket/index.js';
export { getTerminalManager, resetTerminalManager } from './services/terminal.service.js';
/**
 * Start the server with the given configuration.
 * Returns a promise that resolves when the server is listening.
 */
export async function startServer(options) {
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
                close: () => new Promise((resolveClose, rejectClose) => {
                    // Close WebSocket server and cleanup terminals
                    wss.close();
                    resetTerminalManager();
                    server.close((err) => {
                        if (err) {
                            rejectClose(err);
                        }
                        else {
                            resolveClose();
                        }
                    });
                }),
            });
        });
    });
}
//# sourceMappingURL=index.js.map
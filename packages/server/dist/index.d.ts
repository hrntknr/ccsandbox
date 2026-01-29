import http from 'node:http';
import { type ServerConfig } from './config.js';
import { type WebSocketServerInstance } from './websocket/index.js';
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
export declare function startServer(options: StartServerOptions): Promise<ServerInstance>;
//# sourceMappingURL=index.d.ts.map
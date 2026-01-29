import http from 'node:http';
import { WebSocketServer } from 'ws';
/**
 * WebSocket server instance with cleanup function
 */
export interface WebSocketServerInstance {
    terminalWss: WebSocketServer;
    sessionWss: WebSocketServer;
    close: () => void;
}
/**
 * Setup WebSocket servers on an existing HTTP server
 */
export declare function setupWebSocketServer(server: http.Server): WebSocketServerInstance;
//# sourceMappingURL=index.d.ts.map
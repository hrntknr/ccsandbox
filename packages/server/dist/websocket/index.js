import { WebSocketServer } from 'ws';
import { createTerminalHandler } from './terminal.handler.js';
import { createSessionCreateHandler } from './session-create.handler.js';
/**
 * Validate that a message conforms to TerminalClientMessage structure
 */
function isValidTerminalClientMessage(message) {
    if (typeof message !== 'object' || message === null) {
        return false;
    }
    const msg = message;
    if (typeof msg['type'] !== 'string') {
        return false;
    }
    switch (msg['type']) {
        case 'attach':
            return typeof msg['sessionId'] === 'string' &&
                (msg['tabId'] === undefined || typeof msg['tabId'] === 'string');
        case 'input':
            return typeof msg['data'] === 'string';
        case 'resize':
            return typeof msg['cols'] === 'number' && typeof msg['rows'] === 'number';
        case 'detach':
            return true;
        default:
            return false;
    }
}
/**
 * Validate that a message conforms to SessionCreateClientMessage structure
 */
function isValidSessionCreateMessage(message) {
    if (typeof message !== 'object' || message === null) {
        return false;
    }
    const msg = message;
    if (msg['type'] !== 'create-session') {
        return false;
    }
    return (typeof msg['repo'] === 'string' &&
        typeof msg['baseBranch'] === 'string' &&
        typeof msg['workBranch'] === 'string' &&
        (msg['title'] === undefined || typeof msg['title'] === 'string'));
}
/**
 * Setup WebSocket servers on an existing HTTP server
 */
export function setupWebSocketServer(server) {
    // Create WebSocket servers in noServer mode
    const terminalWss = new WebSocketServer({ noServer: true });
    const sessionWss = new WebSocketServer({ noServer: true });
    // Handle HTTP upgrade requests and route to the appropriate WebSocket server
    server.on('upgrade', (request, socket, head) => {
        const pathname = request.url;
        if (pathname === '/ws/terminal') {
            terminalWss.handleUpgrade(request, socket, head, (ws) => {
                terminalWss.emit('connection', ws, request);
            });
        }
        else if (pathname === '/ws/session') {
            sessionWss.handleUpgrade(request, socket, head, (ws) => {
                sessionWss.emit('connection', ws, request);
            });
        }
        else {
            socket.destroy();
        }
    });
    // Handle terminal connections
    terminalWss.on('connection', (ws) => {
        const handler = createTerminalHandler(ws);
        ws.on('message', (data) => {
            try {
                const parsed = JSON.parse(data.toString());
                if (!isValidTerminalClientMessage(parsed)) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Invalid message structure',
                    }));
                    return;
                }
                handler.handleMessage(parsed);
            }
            catch {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid message format',
                }));
            }
        });
        ws.on('close', () => {
            handler.cleanup();
        });
        ws.on('error', (error) => {
            console.error('WebSocket error:', error.message);
            handler.cleanup();
        });
    });
    // Handle session creation connections
    sessionWss.on('connection', (ws) => {
        const handler = createSessionCreateHandler(ws);
        ws.on('message', (data) => {
            try {
                const parsed = JSON.parse(data.toString());
                if (!isValidSessionCreateMessage(parsed)) {
                    ws.send(JSON.stringify({
                        type: 'session-error',
                        message: 'Invalid message structure',
                    }));
                    return;
                }
                handler.handleMessage(parsed);
            }
            catch {
                ws.send(JSON.stringify({
                    type: 'session-error',
                    message: 'Invalid message format',
                }));
            }
        });
        ws.on('close', () => {
            handler.cleanup();
        });
        ws.on('error', (error) => {
            console.error('WebSocket error (session):', error.message);
            handler.cleanup();
        });
    });
    // Handle server errors
    terminalWss.on('error', (error) => {
        console.error('WebSocket server error (terminal):', error.message);
    });
    sessionWss.on('error', (error) => {
        console.error('WebSocket server error (session):', error.message);
    });
    return {
        terminalWss,
        sessionWss,
        close: () => {
            // Close all terminal connections
            terminalWss.clients.forEach((client) => {
                client.close();
            });
            terminalWss.close();
            // Close all session connections
            sessionWss.clients.forEach((client) => {
                client.close();
            });
            sessionWss.close();
        },
    };
}
//# sourceMappingURL=index.js.map
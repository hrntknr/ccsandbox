import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { TerminalClientMessage, SessionCreateClientMessage } from '@ccsandbox/shared';
import { createTerminalHandler } from './terminal.handler.js';
import { createSessionCreateHandler } from './session-create.handler.js';
import { getConnectionManager, resetConnectionManager } from './connection-manager.js';
import { getTerminalManager } from '../services/terminal.service.js';

/**
 * Validate that a message conforms to TerminalClientMessage structure
 */
function isValidTerminalClientMessage(message: unknown): message is TerminalClientMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Record<string, unknown>;

  if (typeof msg['type'] !== 'string') {
    return false;
  }

  switch (msg['type']) {
    case 'join-session':
      return typeof msg['sessionId'] === 'string' && typeof msg['clientId'] === 'string';
    case 'add-tab':
      return msg['title'] === undefined || typeof msg['title'] === 'string';
    case 'attach':
      return typeof msg['tabId'] === 'string';
    case 'switch-tab':
      return typeof msg['tabId'] === 'string';
    case 'close-tab':
      return typeof msg['tabId'] === 'string';
    case 'rename-tab':
      return typeof msg['tabId'] === 'string' && typeof msg['title'] === 'string';
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
function isValidSessionCreateMessage(message: unknown): message is SessionCreateClientMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Record<string, unknown>;

  if (msg['type'] !== 'create-session') {
    return false;
  }

  return (
    typeof msg['repo'] === 'string' &&
    typeof msg['baseBranch'] === 'string' &&
    typeof msg['workBranch'] === 'string' &&
    (msg['title'] === undefined || typeof msg['title'] === 'string')
  );
}

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
export function setupWebSocketServer(server: http.Server): WebSocketServerInstance {
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
    } else if (pathname === '/ws/session') {
      sessionWss.handleUpgrade(request, socket, head, (ws) => {
        sessionWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Get connection manager singleton and initialize with terminal manager
  const connectionManager = getConnectionManager();
  const terminalManager = getTerminalManager();
  connectionManager.initialize(terminalManager);

  // Handle terminal connections
  terminalWss.on('connection', (ws: WebSocket) => {
    const handler = createTerminalHandler(ws, connectionManager);

    ws.on('message', (data: Buffer) => {
      try {
        const parsed: unknown = JSON.parse(data.toString());

        if (!isValidTerminalClientMessage(parsed)) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message structure',
          }));
          return;
        }

        handler.handleMessage(parsed);
      } catch {
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
  sessionWss.on('connection', (ws: WebSocket) => {
    const handler = createSessionCreateHandler(ws);

    ws.on('message', (data: Buffer) => {
      try {
        const parsed: unknown = JSON.parse(data.toString());

        if (!isValidSessionCreateMessage(parsed)) {
          ws.send(JSON.stringify({
            type: 'session-error',
            message: 'Invalid message structure',
          }));
          return;
        }

        handler.handleMessage(parsed);
      } catch {
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

      // Reset connection manager
      resetConnectionManager();
    },
  };
}

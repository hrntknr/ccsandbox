import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import { setupWebSocketServer } from './index.js';

// Mock terminal handler
vi.mock('./terminal.handler.js', () => ({
  createTerminalHandler: vi.fn(() => ({
    handleMessage: vi.fn(),
    cleanup: vi.fn(),
  })),
}));

// Mock session-create handler
vi.mock('./session-create.handler.js', () => ({
  createSessionCreateHandler: vi.fn(() => ({
    handleMessage: vi.fn(),
    cleanup: vi.fn(),
  })),
}));

describe('setupWebSocketServer', () => {
  let server: http.Server;
  let wssInstance: ReturnType<typeof setupWebSocketServer>;
  let port: number;

  beforeEach(async () => {
    server = http.createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        port = typeof address === 'object' && address ? address.port : 0;
        resolve();
      });
    });
    wssInstance = setupWebSocketServer(server);
  });

  afterEach(async () => {
    wssInstance.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    vi.resetAllMocks();
  });

  // Helper function to send message and wait for response
  async function sendAndWaitForMessage(
    wsUrl: string,
    messageToSend: string | object
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const messages: string[] = [];

      ws.on('open', () => {
        const data = typeof messageToSend === 'string' ? messageToSend : JSON.stringify(messageToSend);
        ws.send(data);
      });

      ws.on('message', (data: Buffer) => {
        messages.push(data.toString());
        ws.close();
      });

      ws.on('close', () => {
        resolve(messages);
      });

      ws.on('error', (err) => {
        reject(err);
      });

      // Timeout fallback
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }, 2000);
    });
  }

  describe('message validation', () => {
    it('should reject message with missing type', async () => {
      const messages = await sendAndWaitForMessage(
        `ws://127.0.0.1:${port}/ws/terminal`,
        { sessionId: 'test' }
      );

      expect(messages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid message structure' })
      );
    });

    it('should reject attach message without sessionId', async () => {
      const messages = await sendAndWaitForMessage(
        `ws://127.0.0.1:${port}/ws/terminal`,
        { type: 'attach' }
      );

      expect(messages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid message structure' })
      );
    });

    it('should reject attach message with non-string sessionId', async () => {
      const messages = await sendAndWaitForMessage(
        `ws://127.0.0.1:${port}/ws/terminal`,
        { type: 'attach', sessionId: 123 }
      );

      expect(messages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid message structure' })
      );
    });

    it('should reject input message without data', async () => {
      const messages = await sendAndWaitForMessage(
        `ws://127.0.0.1:${port}/ws/terminal`,
        { type: 'input' }
      );

      expect(messages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid message structure' })
      );
    });

    it('should reject resize message with missing cols', async () => {
      const messages = await sendAndWaitForMessage(
        `ws://127.0.0.1:${port}/ws/terminal`,
        { type: 'resize', rows: 24 }
      );

      expect(messages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid message structure' })
      );
    });

    it('should reject resize message with non-number cols', async () => {
      const messages = await sendAndWaitForMessage(
        `ws://127.0.0.1:${port}/ws/terminal`,
        { type: 'resize', cols: '80', rows: 24 }
      );

      expect(messages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid message structure' })
      );
    });

    it('should reject unknown message type', async () => {
      const messages = await sendAndWaitForMessage(
        `ws://127.0.0.1:${port}/ws/terminal`,
        { type: 'unknown' }
      );

      expect(messages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid message structure' })
      );
    });

    it('should reject invalid JSON', async () => {
      const messages = await sendAndWaitForMessage(
        `ws://127.0.0.1:${port}/ws/terminal`,
        'not valid json'
      );

      expect(messages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid message format' })
      );
    });

    it('should reject null message', async () => {
      const messages = await sendAndWaitForMessage(
        `ws://127.0.0.1:${port}/ws/terminal`,
        'null'
      );

      expect(messages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid message structure' })
      );
    });
  });

  describe('session WebSocket validation', () => {
    it('should reject invalid session message structure', async () => {
      const messages = await sendAndWaitForMessage(
        `ws://127.0.0.1:${port}/ws/session`,
        { type: 'create-session' } // missing required fields
      );

      expect(messages).toContainEqual(
        JSON.stringify({ type: 'session-error', message: 'Invalid message structure' })
      );
    });

    it('should reject invalid JSON on session WebSocket', async () => {
      const messages = await sendAndWaitForMessage(
        `ws://127.0.0.1:${port}/ws/session`,
        'not valid json'
      );

      expect(messages).toContainEqual(
        JSON.stringify({ type: 'session-error', message: 'Invalid message format' })
      );
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { createTerminalHandler } from './terminal.handler.js';
import * as terminalService from '../services/terminal.service.js';
import * as config from '../config.js';
import { SessionStore } from '../persistence/session-store.js';

// Mock dependencies
vi.mock('../services/terminal.service.js', () => ({
  getTerminalManager: vi.fn(),
}));

vi.mock('../config.js', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../persistence/session-store.js', () => ({
  SessionStore: vi.fn(),
}));

describe('createTerminalHandler', () => {
  let mockWs: WebSocket;
  let mockTerminalManager: EventEmitter & {
    create: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    kill: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };
  let mockSessionStore: {
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let sentMessages: string[];

  beforeEach(() => {
    sentMessages = [];

    // Create mock WebSocket
    mockWs = {
      readyState: WebSocket.OPEN,
      send: vi.fn((data: string) => {
        sentMessages.push(data);
      }),
    } as unknown as WebSocket;

    // Create mock terminal manager
    mockTerminalManager = new EventEmitter() as typeof mockTerminalManager;
    mockTerminalManager.create = vi.fn().mockResolvedValue('789e0123-e89b-12d3-a456-426614174002');
    mockTerminalManager.write = vi.fn().mockReturnValue(true);
    mockTerminalManager.resize = vi.fn().mockReturnValue(true);
    mockTerminalManager.kill = vi.fn().mockReturnValue(true);
    // Default to undefined (no existing terminal) to test new terminal creation
    mockTerminalManager.get = vi.fn().mockReturnValue(undefined);
    mockTerminalManager.on = vi.fn((event, handler) => {
      EventEmitter.prototype.on.call(mockTerminalManager, event, handler);
    });
    mockTerminalManager.off = vi.fn((event, handler) => {
      EventEmitter.prototype.off.call(mockTerminalManager, event, handler);
    });

    vi.mocked(terminalService.getTerminalManager).mockReturnValue(
      mockTerminalManager as unknown as terminalService.TerminalManager
    );

    // Create mock session store (using valid UUID and containerId formats)
    mockSessionStore = {
      get: vi.fn().mockResolvedValue({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        state: 'RUNNING',
        containerId: 'abc123def456',
        tabs: [],
      }),
      update: vi.fn().mockResolvedValue({}),
    };

    vi.mocked(SessionStore).mockImplementation(function() {
      return mockSessionStore as unknown as SessionStore;
    } as unknown as typeof SessionStore);

    // Mock config
    vi.mocked(config.getConfig).mockReturnValue({
      pat: 'test-pat',
      apiBase: 'https://api.github.com',
      repoDir: '/tmp/test',
      listen: '127.0.0.1',
      port: 3000,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('attach message', () => {
    it('should attach to a new terminal', async () => {
      // After create, get should return shell info for updating session tabs
      mockTerminalManager.get.mockImplementation((tabId: string) => {
        if (tabId === '789e0123-e89b-12d3-a456-426614174002') {
          return { shell: 'bash' };
        }
        return undefined;
      });

      const handler = createTerminalHandler(mockWs);

      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });

      // Wait for async operations
      await vi.waitFor(() => {
        expect(mockTerminalManager.create).toHaveBeenCalledWith({
          sessionId: '123e4567-e89b-12d3-a456-426614174000',
          containerId: 'abc123def456',
          tabId: undefined,
        });
      });

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'attached', tabId: '789e0123-e89b-12d3-a456-426614174002' })
      );
    });

    it('should reattach to existing terminal if tabId provided', async () => {
      mockTerminalManager.get.mockReturnValue({
        tabId: '456e7890-e89b-12d3-a456-426614174001',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        shell: 'bash',
      });

      const handler = createTerminalHandler(mockWs);

      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        tabId: '456e7890-e89b-12d3-a456-426614174001',
      });

      await vi.waitFor(() => {
        expect(sentMessages).toContainEqual(
          JSON.stringify({ type: 'attached', tabId: '456e7890-e89b-12d3-a456-426614174001' })
        );
      });

      expect(mockTerminalManager.create).not.toHaveBeenCalled();
    });

    it('should send error if session not running', async () => {
      mockSessionStore.get.mockResolvedValue({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        state: 'READY',
        containerId: 'abc123def456',
      });

      const handler = createTerminalHandler(mockWs);

      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });

      await vi.waitFor(() => {
        expect(sentMessages).toContainEqual(
          JSON.stringify({ type: 'error', message: 'Session is not running' })
        );
      });
    });

    it('should send error if session has no container', async () => {
      mockSessionStore.get.mockResolvedValue({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        state: 'RUNNING',
        containerId: undefined,
      });

      const handler = createTerminalHandler(mockWs);

      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });

      await vi.waitFor(() => {
        expect(sentMessages).toContainEqual(
          JSON.stringify({ type: 'error', message: 'Session has no container' })
        );
      });
    });
  });

  describe('input message', () => {
    it('should write data to terminal', async () => {
      const handler = createTerminalHandler(mockWs);

      // First attach
      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });

      await vi.waitFor(() => {
        expect(mockTerminalManager.create).toHaveBeenCalled();
      });

      // Then send input
      handler.handleMessage({
        type: 'input',
        data: 'ls -la\n',
      });

      expect(mockTerminalManager.write).toHaveBeenCalledWith('789e0123-e89b-12d3-a456-426614174002', 'ls -la\n');
    });

    it('should send error if not attached', () => {
      const handler = createTerminalHandler(mockWs);

      handler.handleMessage({
        type: 'input',
        data: 'ls -la\n',
      });

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Not attached to a terminal' })
      );
    });
  });

  describe('resize message', () => {
    it('should resize terminal', async () => {
      const handler = createTerminalHandler(mockWs);

      // First attach
      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });

      await vi.waitFor(() => {
        expect(mockTerminalManager.create).toHaveBeenCalled();
      });

      // Then resize
      handler.handleMessage({
        type: 'resize',
        cols: 120,
        rows: 40,
      });

      expect(mockTerminalManager.resize).toHaveBeenCalledWith('789e0123-e89b-12d3-a456-426614174002', 120, 40);
    });

    it('should send error if not attached', () => {
      const handler = createTerminalHandler(mockWs);

      handler.handleMessage({
        type: 'resize',
        cols: 120,
        rows: 40,
      });

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Not attached to a terminal' })
      );
    });
  });

  describe('detach message', () => {
    it('should detach from terminal', async () => {
      const handler = createTerminalHandler(mockWs);

      // First attach
      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });

      await vi.waitFor(() => {
        expect(mockTerminalManager.create).toHaveBeenCalled();
      });

      // Then detach
      handler.handleMessage({
        type: 'detach',
      });

      // Try to send input - should fail since detached
      handler.handleMessage({
        type: 'input',
        data: 'test',
      });

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Not attached to a terminal' })
      );
    });
  });

  describe('terminal events', () => {
    it('should forward data events to WebSocket', async () => {
      const handler = createTerminalHandler(mockWs);

      // Attach
      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });

      await vi.waitFor(() => {
        expect(mockTerminalManager.create).toHaveBeenCalled();
      });

      // Emit data event
      mockTerminalManager.emit('data', '789e0123-e89b-12d3-a456-426614174002', 'output data');

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'output', data: 'output data' })
      );
    });

    it('should forward exit events to WebSocket', async () => {
      const handler = createTerminalHandler(mockWs);

      // Attach
      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });

      await vi.waitFor(() => {
        expect(mockTerminalManager.create).toHaveBeenCalled();
      });

      // Emit exit event
      mockTerminalManager.emit('exit', '789e0123-e89b-12d3-a456-426614174002', 0);

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'exit', code: 0 })
      );
    });
  });

  describe('cleanup', () => {
    it('should remove event listeners on cleanup', () => {
      const handler = createTerminalHandler(mockWs);

      handler.cleanup();

      expect(mockTerminalManager.off).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockTerminalManager.off).toHaveBeenCalledWith('exit', expect.any(Function));
      expect(mockTerminalManager.off).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('sessionId validation', () => {
    it('should reject invalid sessionId format', () => {
      const handler = createTerminalHandler(mockWs);

      handler.handleMessage({
        type: 'attach',
        sessionId: 'invalid-session-id',
      });

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid sessionId format' })
      );
      expect(mockSessionStore.get).not.toHaveBeenCalled();
    });

    it('should reject sessionId with injection attempt', () => {
      const handler = createTerminalHandler(mockWs);

      handler.handleMessage({
        type: 'attach',
        sessionId: '../../../etc/passwd',
      });

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid sessionId format' })
      );
    });

    it('should accept valid UUID sessionId', async () => {
      const handler = createTerminalHandler(mockWs);

      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });

      await vi.waitFor(() => {
        expect(mockSessionStore.get).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
      });
    });

    it('should reject invalid tabId format', () => {
      const handler = createTerminalHandler(mockWs);

      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        tabId: 'invalid-tab-id',
      });

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid tabId format' })
      );
    });
  });

  describe('cols/rows validation', () => {
    it('should reject cols below minimum', async () => {
      const handler = createTerminalHandler(mockWs);

      // First attach
      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });

      await vi.waitFor(() => {
        expect(mockTerminalManager.create).toHaveBeenCalled();
      });

      handler.handleMessage({
        type: 'resize',
        cols: 0,
        rows: 24,
      });

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid cols value: must be between 1 and 500' })
      );
    });

    it('should reject rows above maximum', async () => {
      const handler = createTerminalHandler(mockWs);

      // First attach
      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });

      await vi.waitFor(() => {
        expect(mockTerminalManager.create).toHaveBeenCalled();
      });

      handler.handleMessage({
        type: 'resize',
        cols: 80,
        rows: 501,
      });

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid rows value: must be between 1 and 500' })
      );
    });

    it('should reject non-integer cols', async () => {
      const handler = createTerminalHandler(mockWs);

      // First attach
      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });

      await vi.waitFor(() => {
        expect(mockTerminalManager.create).toHaveBeenCalled();
      });

      handler.handleMessage({
        type: 'resize',
        cols: 80.5,
        rows: 24,
      });

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid cols value: must be between 1 and 500' })
      );
    });

    it('should accept valid cols and rows', async () => {
      const handler = createTerminalHandler(mockWs);

      // First attach
      handler.handleMessage({
        type: 'attach',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });

      await vi.waitFor(() => {
        expect(mockTerminalManager.create).toHaveBeenCalled();
      });

      handler.handleMessage({
        type: 'resize',
        cols: 120,
        rows: 40,
      });

      expect(mockTerminalManager.resize).toHaveBeenCalledWith('789e0123-e89b-12d3-a456-426614174002', 120, 40);
    });
  });
});

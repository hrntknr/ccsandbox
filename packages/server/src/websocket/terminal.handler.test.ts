import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { createTerminalHandler } from './terminal.handler.js';
import * as terminalService from '../services/terminal.service.js';
import * as config from '../config.js';
import { SessionStore } from '../persistence/session-store.js';
import { ConnectionManager } from './connection-manager.js';

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
    getOutputHistory: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };
  let mockSessionStore: {
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockConnectionManager: ConnectionManager;
  let sentMessages: string[];

  const testSessionId = '123e4567-e89b-12d3-a456-426614174000';
  const testClientId = '789e0123-e89b-12d3-a456-426614174001';
  const testTabId = '456e7890-e89b-12d3-a456-426614174002';

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
    mockTerminalManager.create = vi.fn().mockResolvedValue(testTabId);
    mockTerminalManager.write = vi.fn().mockReturnValue(true);
    mockTerminalManager.resize = vi.fn().mockReturnValue(true);
    mockTerminalManager.kill = vi.fn().mockReturnValue(true);
    mockTerminalManager.get = vi.fn().mockReturnValue(undefined);
    mockTerminalManager.getOutputHistory = vi.fn().mockReturnValue(null);
    mockTerminalManager.on = vi.fn((event, handler) => {
      EventEmitter.prototype.on.call(mockTerminalManager, event, handler);
    });
    mockTerminalManager.off = vi.fn((event, handler) => {
      EventEmitter.prototype.off.call(mockTerminalManager, event, handler);
    });

    vi.mocked(terminalService.getTerminalManager).mockReturnValue(
      mockTerminalManager as unknown as terminalService.TerminalManager
    );

    // Create mock session store
    mockSessionStore = {
      get: vi.fn().mockResolvedValue({
        sessionId: testSessionId,
        state: 'RUNNING',
        workspacePath: '/workspaces/test-project',
        containerId: 'abc123def456',
        tabs: [],
      }),
      update: vi.fn().mockResolvedValue({}),
    };

    vi.mocked(SessionStore).mockImplementation(function() {
      return mockSessionStore as unknown as SessionStore;
    } as unknown as typeof SessionStore);

    // Create mock connection manager
    mockConnectionManager = new ConnectionManager();

    // Mock config
    vi.mocked(config.getConfig).mockReturnValue({
      pat: 'test-pat',
      apiBase: 'https://api.github.com',
      repoDir: '/tmp/test',
      listen: '127.0.0.1',
      port: 3000,
      devcontainerCli: '/usr/local/bin/devcontainer',
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    mockConnectionManager.cleanup();
  });

  describe('join-session message', () => {
    it('should join session and send sync-state', async () => {
      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages).toContainEqual(
          JSON.stringify({ type: 'sync-state', tabs: [] })
        );
      });
    });

    it('should send error if session not running', async () => {
      mockSessionStore.get.mockResolvedValue({
        sessionId: testSessionId,
        state: 'READY',
        workspacePath: '/workspaces/test-project',
      });

      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages).toContainEqual(
          JSON.stringify({ type: 'error', message: 'Session is not running' })
        );
      });
    });
  });

  describe('add-tab message', () => {
    it('should create terminal and broadcast tab-added', async () => {
      mockTerminalManager.get.mockImplementation((tabId: string) => {
        if (tabId === testTabId) {
          return { shell: 'bash' };
        }
        return undefined;
      });

      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      // First join session
      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('sync-state'))).toBe(true);
      });

      // Then add tab
      handler.handleMessage({
        type: 'add-tab',
        title: 'My Terminal',
      });

      await vi.waitFor(() => {
        expect(mockTerminalManager.create).toHaveBeenCalledWith({
          sessionId: testSessionId,
          workspacePath: '/workspaces/test-project',
          devcontainerCliPath: '/usr/local/bin/devcontainer',
          tabId: expect.any(String),
        });
      });

      // Check tab-added was broadcast
      expect(sentMessages.some(m => m.includes('tab-added'))).toBe(true);
    });

    it('should send error if not joined to session', () => {
      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      handler.handleMessage({
        type: 'add-tab',
      });

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Not joined to a session' })
      );
    });

    it('should broadcast tab-added immediately with ready:false, then tab-ready after terminal creation', async () => {
      // Setup: terminal creation resolves after a delay
      let resolveCreate: () => void;
      const createPromise = new Promise<void>((resolve) => {
        resolveCreate = resolve;
      });
      mockTerminalManager.create.mockReturnValue(createPromise);
      mockTerminalManager.get.mockReturnValue({ shell: 'zsh' });

      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      // First join session
      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('sync-state'))).toBe(true);
      });

      // Clear messages before add-tab test
      sentMessages.length = 0;

      // Add tab
      handler.handleMessage({
        type: 'add-tab',
        title: 'My Terminal',
      });

      // Immediately check for tab-added with ready:false
      await vi.waitFor(() => {
        const tabAddedMessage = sentMessages.find(m => m.includes('tab-added'));
        expect(tabAddedMessage).toBeDefined();
        const parsed = JSON.parse(tabAddedMessage!);
        expect(parsed.type).toBe('tab-added');
        expect(parsed.tab.ready).toBe(false);
        expect(parsed.tab.title).toBe('My Terminal');
      });

      // At this point, tab-ready should NOT have been sent yet
      expect(sentMessages.some(m => m.includes('tab-ready'))).toBe(false);

      // Now resolve the create promise
      resolveCreate!();

      // After terminal creation completes, tab-ready should be broadcast
      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('tab-ready'))).toBe(true);
      });

      const tabReadyMessage = sentMessages.find(m => m.includes('tab-ready'));
      const parsed = JSON.parse(tabReadyMessage!);
      expect(parsed.type).toBe('tab-ready');
      expect(parsed.tabId).toBeDefined();
    });

    it('should remove tab and broadcast tab-removed on terminal creation failure', async () => {
      // Setup: terminal creation rejects
      mockTerminalManager.create.mockRejectedValue(new Error('Terminal creation failed'));

      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      // First join session
      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('sync-state'))).toBe(true);
      });

      // Clear messages before add-tab test
      sentMessages.length = 0;

      // Add tab
      handler.handleMessage({
        type: 'add-tab',
        title: 'My Terminal',
      });

      // First, tab-added with ready:false should be sent
      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('tab-added'))).toBe(true);
      });

      // After failure, tab-removed should be broadcast and error sent
      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('tab-removed'))).toBe(true);
        expect(sentMessages.some(m => m.includes('Terminal creation failed'))).toBe(true);
      });

      // The tab should have been removed from the connection manager
      const tabs = mockConnectionManager.getTabs(testSessionId);
      expect(tabs.length).toBe(0);
    });
  });

  describe('attach message', () => {
    it('should attach to existing tab', async () => {
      // Setup room with existing tab
      mockConnectionManager.joinSession(testSessionId, testClientId, mockWs);
      mockConnectionManager.addTab(testSessionId, {
        tabId: testTabId,
        title: 'Terminal 1',
        shell: 'bash',
      });

      mockTerminalManager.get.mockReturnValue({
        tabId: testTabId,
        sessionId: testSessionId,
        shell: 'bash',
      });

      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      // Join session first
      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('sync-state'))).toBe(true);
      });

      // Then attach
      handler.handleMessage({
        type: 'attach',
        tabId: testTabId,
      });

      await vi.waitFor(() => {
        expect(sentMessages).toContainEqual(
          JSON.stringify({ type: 'attached', tabId: testTabId })
        );
      });
    });

    it('should send error if tab not found', async () => {
      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      // Join session
      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('sync-state'))).toBe(true);
      });

      // Try to attach to non-existent tab
      handler.handleMessage({
        type: 'attach',
        tabId: testTabId,
      });

      await vi.waitFor(() => {
        expect(sentMessages).toContainEqual(
          JSON.stringify({ type: 'error', message: 'Tab not found' })
        );
      });
    });
  });

  describe('input message', () => {
    it('should write data to terminal', async () => {
      // Setup
      mockConnectionManager.joinSession(testSessionId, testClientId, mockWs);
      mockConnectionManager.addTab(testSessionId, {
        tabId: testTabId,
        title: 'Terminal 1',
        shell: 'bash',
      });

      mockTerminalManager.get.mockReturnValue({
        tabId: testTabId,
        sessionId: testSessionId,
        shell: 'bash',
      });

      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      // Join and attach
      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('sync-state'))).toBe(true);
      });

      handler.handleMessage({
        type: 'attach',
        tabId: testTabId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('attached'))).toBe(true);
      });

      // Send input
      handler.handleMessage({
        type: 'input',
        data: 'ls -la\n',
      });

      expect(mockTerminalManager.write).toHaveBeenCalledWith(testTabId, 'ls -la\n');
    });

    it('should send error if not attached', () => {
      const handler = createTerminalHandler(mockWs, mockConnectionManager);

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
      // Setup
      mockConnectionManager.joinSession(testSessionId, testClientId, mockWs);
      mockConnectionManager.addTab(testSessionId, {
        tabId: testTabId,
        title: 'Terminal 1',
        shell: 'bash',
      });

      mockTerminalManager.get.mockReturnValue({
        tabId: testTabId,
        sessionId: testSessionId,
        shell: 'bash',
      });

      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      // Join and attach
      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('sync-state'))).toBe(true);
      });

      handler.handleMessage({
        type: 'attach',
        tabId: testTabId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('attached'))).toBe(true);
      });

      // Resize
      handler.handleMessage({
        type: 'resize',
        cols: 120,
        rows: 40,
      });

      expect(mockTerminalManager.resize).toHaveBeenCalledWith(testTabId, 120, 40);
    });

    it('should send error if not attached', () => {
      const handler = createTerminalHandler(mockWs, mockConnectionManager);

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
      // Setup
      mockConnectionManager.joinSession(testSessionId, testClientId, mockWs);
      mockConnectionManager.addTab(testSessionId, {
        tabId: testTabId,
        title: 'Terminal 1',
        shell: 'bash',
      });

      mockTerminalManager.get.mockReturnValue({
        tabId: testTabId,
        sessionId: testSessionId,
        shell: 'bash',
      });

      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      // Join and attach
      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('sync-state'))).toBe(true);
      });

      handler.handleMessage({
        type: 'attach',
        tabId: testTabId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('attached'))).toBe(true);
      });

      // Detach
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

  describe('cleanup', () => {
    it('should leave session on cleanup', async () => {
      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      // Join a session first
      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('sync-state'))).toBe(true);
      });

      // Verify client is in the room
      expect(mockConnectionManager.getClient(testSessionId, testClientId)).toBeDefined();

      handler.cleanup();

      // Verify client has left the room
      expect(mockConnectionManager.getClient(testSessionId, testClientId)).toBeUndefined();
    });
  });

  describe('validation', () => {
    it('should reject invalid sessionId format', () => {
      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      handler.handleMessage({
        type: 'join-session',
        sessionId: 'invalid-session-id',
        clientId: testClientId,
      });

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid sessionId format' })
      );
    });

    it('should reject invalid clientId format', () => {
      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: 'invalid-client-id',
      });

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid clientId format' })
      );
    });

    it('should reject invalid tabId format', () => {
      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      handler.handleMessage({
        type: 'attach',
        tabId: 'invalid-tab-id',
      });

      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'error', message: 'Invalid tabId format' })
      );
    });

    it('should reject cols below minimum', async () => {
      // Setup
      mockConnectionManager.joinSession(testSessionId, testClientId, mockWs);
      mockConnectionManager.addTab(testSessionId, {
        tabId: testTabId,
        title: 'Terminal 1',
        shell: 'bash',
      });

      mockTerminalManager.get.mockReturnValue({
        tabId: testTabId,
        sessionId: testSessionId,
        shell: 'bash',
      });

      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      // Join and attach
      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('sync-state'))).toBe(true);
      });

      handler.handleMessage({
        type: 'attach',
        tabId: testTabId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('attached'))).toBe(true);
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
      // Setup
      mockConnectionManager.joinSession(testSessionId, testClientId, mockWs);
      mockConnectionManager.addTab(testSessionId, {
        tabId: testTabId,
        title: 'Terminal 1',
        shell: 'bash',
      });

      mockTerminalManager.get.mockReturnValue({
        tabId: testTabId,
        sessionId: testSessionId,
        shell: 'bash',
      });

      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      // Join and attach
      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('sync-state'))).toBe(true);
      });

      handler.handleMessage({
        type: 'attach',
        tabId: testTabId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('attached'))).toBe(true);
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
  });

  describe('exited terminal handling', () => {
    it('should attach to exited tab without error', async () => {
      // Setup: tab exists in room but terminal process has exited
      mockConnectionManager.joinSession(testSessionId, testClientId, mockWs);
      mockConnectionManager.addTab(testSessionId, {
        tabId: testTabId,
        title: 'Terminal 1',
        shell: 'bash',
        exited: true,
      });

      // Terminal is gone (process exited)
      mockTerminalManager.get.mockReturnValue(undefined);
      mockTerminalManager.getOutputHistory.mockReturnValue('');

      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      // Join session
      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('sync-state'))).toBe(true);
      });

      // Attach to exited tab - should succeed without error
      handler.handleMessage({
        type: 'attach',
        tabId: testTabId,
      });

      await vi.waitFor(() => {
        expect(sentMessages).toContainEqual(
          JSON.stringify({ type: 'attached', tabId: testTabId })
        );
      });

      // Should also send empty history
      expect(sentMessages).toContainEqual(
        JSON.stringify({ type: 'history', data: '' })
      );

      // Should NOT send an error
      expect(sentMessages.some(m => m.includes('"type":"error"'))).toBe(false);
    });

    it('should silently ignore input to exited terminal', async () => {
      // Setup: tab exists but terminal process has exited
      mockConnectionManager.joinSession(testSessionId, testClientId, mockWs);
      mockConnectionManager.addTab(testSessionId, {
        tabId: testTabId,
        title: 'Terminal 1',
        shell: 'bash',
        exited: true,
      });

      mockTerminalManager.get.mockReturnValue(undefined);
      mockTerminalManager.getOutputHistory.mockReturnValue('');
      mockTerminalManager.write.mockReturnValue(false); // write fails for exited terminal

      const handler = createTerminalHandler(mockWs, mockConnectionManager);

      // Join and attach
      handler.handleMessage({
        type: 'join-session',
        sessionId: testSessionId,
        clientId: testClientId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('sync-state'))).toBe(true);
      });

      handler.handleMessage({
        type: 'attach',
        tabId: testTabId,
      });

      await vi.waitFor(() => {
        expect(sentMessages.some(m => m.includes('attached'))).toBe(true);
      });

      // Clear messages before input test
      sentMessages.length = 0;

      // Send input to exited terminal
      handler.handleMessage({
        type: 'input',
        data: 'test',
      });

      // Should NOT send an error for input to exited terminal
      expect(sentMessages.some(m => m.includes('"type":"error"'))).toBe(false);
    });
  });
});

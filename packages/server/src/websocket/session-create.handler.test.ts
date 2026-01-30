import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { createSessionCreateHandler } from './session-create.handler.js';

// Mock dependencies
vi.mock('../persistence/session-store.js', () => ({
  getSessionStore: vi.fn(() => ({
    create: vi.fn(),
    update: vi.fn(),
  })),
  WorkspaceExistsError: class extends Error {
    workspacePath: string;
    constructor(path: string) {
      super(`Workspace exists: ${path}`);
      this.workspacePath = path;
    }
  },
}));

vi.mock('../services/git.service.js', () => ({
  cloneRepository: vi.fn(),
  GitOperationError: class extends Error {
    operation: string;
    stderr: string;
    constructor(op: string, stderr: string) {
      super(`Git ${op} failed`);
      this.operation = op;
      this.stderr = stderr;
    }
  },
}));

vi.mock('../services/devcontainer.service.js', () => ({
  hasDevcontainerConfig: vi.fn(),
  startDevcontainer: vi.fn(),
  DevcontainerConfigNotFoundError: class extends Error {
    constructor(path: string) {
      super(`No devcontainer config: ${path}`);
    }
  },
  DevcontainerCliError: class extends Error {},
}));

vi.mock('../config.js', () => ({
  getConfig: vi.fn(() => ({
    configDir: '/tmp/test',
    repoDir: '/tmp/test/repo',
    pat: 'test-token',
    apiBase: 'https://api.github.com',
  })),
}));

describe('session-create.handler', () => {
  let mockWs: Partial<WebSocket>;
  let sentMessages: string[];
  let closeCallCount: number;

  beforeEach(() => {
    sentMessages = [];
    closeCallCount = 0;
    mockWs = {
      readyState: WebSocket.OPEN,
      send: vi.fn((data: string) => {
        sentMessages.push(data);
      }),
      close: vi.fn(() => {
        closeCallCount++;
      }),
    };
    vi.clearAllMocks();
  });

  describe('sendError closes WebSocket (regression test for loading stuck issue)', () => {
    it('should close WebSocket after sending error for missing required fields', () => {
      const handler = createSessionCreateHandler(mockWs as WebSocket);

      handler.handleMessage({
        type: 'create-session',
        repo: '',
        baseBranch: '',
        workBranch: '',
      });

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(sentMessages.length).toBeGreaterThan(0);
          const lastMessage = JSON.parse(sentMessages[sentMessages.length - 1]!);
          expect(lastMessage.type).toBe('session-error');
          // Regression test: WebSocket should be closed after error
          expect(closeCallCount).toBe(1);
          resolve();
        }, 50);
      });
    });

    it('should close WebSocket after sending error for missing PAT', async () => {
      const { getConfig } = await import('../config.js');
      vi.mocked(getConfig).mockReturnValue({
        configDir: '/tmp/test',
        repoDir: '/tmp/test/repo',
        pat: undefined,
        apiBase: 'https://api.github.com',
        listen: '127.0.0.1',
        port: 3000,
      });

      const handler = createSessionCreateHandler(mockWs as WebSocket);

      handler.handleMessage({
        type: 'create-session',
        repo: 'owner/repo',
        baseBranch: 'main',
        workBranch: 'feature',
      });

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(sentMessages.length).toBeGreaterThan(0);
          const lastMessage = JSON.parse(sentMessages[sentMessages.length - 1]!);
          expect(lastMessage.type).toBe('session-error');
          expect(lastMessage.message).toContain('PAT');
          // Regression test: WebSocket should be closed after error
          expect(closeCallCount).toBe(1);
          resolve();
        }, 50);
      });
    });
  });
});

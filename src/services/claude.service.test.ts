import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeSessionManager, resetClaudeSessionManager } from './claude/index.js';

// Mock the SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// Mock fs operations for wrapper script
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    writeFileSync: vi.fn(),
    chmodSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

describe('ClaudeSessionManager', () => {
  let manager: ClaudeSessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ClaudeSessionManager('/tmp/test-wrappers');
  });

  afterEach(() => {
    manager.killAll();
    resetClaudeSessionManager();
  });

  describe('basic operations', () => {
    it('should return undefined for non-existent session', () => {
      const session = manager.get('non-existent');
      expect(session).toBeUndefined();
    });

    it('should return empty messages for non-existent session', () => {
      const messages = manager.getMessages('non-existent');
      expect(messages).toEqual([]);
    });

    it('should return empty pending permissions for non-existent session', () => {
      const permissions = manager.getPendingPermissions('non-existent');
      expect(permissions).toEqual([]);
    });

    it('should return empty todos for non-existent session', () => {
      const todos = manager.getTodos('non-existent');
      expect(todos).toEqual([]);
    });

    it('should return false for sendMessage on non-existent session', () => {
      const result = manager.sendMessage('non-existent', 'hello');
      expect(result).toBeNull();
    });

    it('should return false for respondToPermission on non-existent session', () => {
      const result = manager.respondToPermission('non-existent', 'req-123', 'allow');
      expect(result).toBe(false);
    });
  });

  describe('setPermissionMode', () => {
    it('should return false if session does not exist', async () => {
      const result = await manager.setPermissionMode('non-existent', 'acceptEdits');
      expect(result).toBe(false);
    });
  });

  describe('getBySession', () => {
    it('should return empty array for non-existent session', () => {
      const sessions = manager.getBySession('non-existent');
      expect(sessions).toEqual([]);
    });
  });

  describe('hasPendingPermissionsForSession', () => {
    it('should return false for non-existent session', () => {
      const result = manager.hasPendingPermissionsForSession('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getProcessingStatsForSession', () => {
    it('should return zero stats for non-existent session', () => {
      const stats = manager.getProcessingStatsForSession('non-existent');
      expect(stats).toEqual({ running: 0, total: 0 });
    });
  });

  describe('kill', () => {
    it('should return false for non-existent session', () => {
      const result = manager.kill('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('killBySession', () => {
    it('should handle non-existent session gracefully', () => {
      expect(() => manager.killBySession('non-existent')).not.toThrow();
    });
  });

  describe('killAll', () => {
    it('should handle empty manager gracefully', () => {
      expect(() => manager.killAll()).not.toThrow();
    });
  });

  describe('size', () => {
    it('should return 0 for empty manager', () => {
      expect(manager.size).toBe(0);
    });
  });
});

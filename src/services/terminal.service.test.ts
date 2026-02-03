import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter, Readable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import {
  TerminalManager,
  getTerminalManager,
  resetTerminalManager,
} from './terminal.service.js';

// Mock child_process (still used for shell detection)
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock node-pty
vi.mock('@lydell/node-pty', () => ({
  spawn: vi.fn(),
}));

import * as pty from '@lydell/node-pty';

// Helper to create a mock IPty object
function createMockPty() {
  const dataCallbacks: Array<(data: string) => void> = [];
  const exitCallbacks: Array<(e: { exitCode: number; signal?: number }) => void> = [];

  return {
    pid: 12345,
    cols: 80,
    rows: 24,
    process: 'bash',
    onData: vi.fn((callback: (data: string) => void) => {
      dataCallbacks.push(callback);
      return { dispose: vi.fn() };
    }),
    onExit: vi.fn((callback: (e: { exitCode: number; signal?: number }) => void) => {
      exitCallbacks.push(callback);
      return { dispose: vi.fn() };
    }),
    resize: vi.fn(),
    clear: vi.fn(),
    write: vi.fn(),
    kill: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    // Helper methods for testing
    _emitData(data: string) {
      for (const cb of dataCallbacks) {
        cb(data);
      }
    },
    _emitExit(exitCode: number, signal?: number) {
      for (const cb of exitCallbacks) {
        cb({ exitCode, signal });
      }
    },
  };
}

describe('TerminalManager', () => {
  let terminalManager: TerminalManager;
  let mockPty: ReturnType<typeof createMockPty>;
  let mockDetectProcess: ChildProcess;

  beforeEach(() => {
    terminalManager = new TerminalManager();
    mockPty = createMockPty();

    // Create mock process for shell detection
    mockDetectProcess = new EventEmitter() as ChildProcess;
    mockDetectProcess.stdout = new Readable({ read() {} });
    mockDetectProcess.stderr = new Readable({ read() {} });

    // Mock pty.spawn to return our mock PTY
    vi.mocked(pty.spawn).mockReturnValue(mockPty as unknown as ReturnType<typeof pty.spawn>);

    // Mock child_process spawn for shell detection
    vi.mocked(spawn).mockReturnValue(mockDetectProcess);
  });

  afterEach(() => {
    vi.resetAllMocks();
    resetTerminalManager();
  });

  describe('create', () => {
    it('should create a new terminal with default options', async () => {
      const createPromise = terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
      });

      // Simulate bash detection failure -> fallback to sh
      mockDetectProcess.emit('close', 1);

      const tabId = await createPromise;

      expect(tabId).toBeDefined();
      expect(terminalManager.size).toBe(1);
    });

    it('should create a terminal with specified tabId', async () => {
      const tabId = await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'my-tab-id',
        shell: 'bash',
      });

      expect(tabId).toBe('my-tab-id');
      expect(terminalManager.get('my-tab-id')).toBeDefined();
    });

    it('should emit data events from PTY', async () => {
      const dataHandler = vi.fn();
      terminalManager.on('data', dataHandler);

      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
      });

      // Simulate PTY data
      mockPty._emitData('Hello World');

      expect(dataHandler).toHaveBeenCalledWith('tab-1', 'Hello World');
    });

    it('should emit exit event when PTY exits', async () => {
      const exitHandler = vi.fn();
      terminalManager.on('exit', exitHandler);

      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
      });

      expect(terminalManager.size).toBe(1);

      // Simulate PTY exit
      mockPty._emitExit(0);

      expect(exitHandler).toHaveBeenCalledWith('tab-1', 0);
      expect(terminalManager.size).toBe(0);
    });

    it('should use devcontainer exec command via node-pty', async () => {
      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
        devcontainerCliPath: '/usr/local/bin/devcontainer',
      });

      // Check that pty.spawn was called with devcontainer exec command
      expect(pty.spawn).toHaveBeenCalledWith(
        '/usr/local/bin/devcontainer',
        [
          'exec',
          '--workspace-folder',
          '/workspaces/test-project',
          '--remote-env',
          'TERM=xterm-256color',
          '--remote-env',
          'LANG=C.UTF-8',
          '--remote-env',
          'LC_ALL=C.UTF-8',
          '--remote-env',
          'LC_CTYPE=C.UTF-8',
          'bash',
          '-l',
        ],
        expect.objectContaining({
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          env: expect.objectContaining({
            TERM: 'xterm-256color',
            LANG: 'C.UTF-8',
            LC_ALL: 'C.UTF-8',
            LC_CTYPE: 'C.UTF-8',
          }),
        })
      );
    });
  });

  describe('write', () => {
    it('should write data to PTY', async () => {
      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
      });

      const result = terminalManager.write('tab-1', 'ls -la\n');

      expect(result).toBe(true);
      expect(mockPty.write).toHaveBeenCalledWith('ls -la\n');
    });

    it('should return false for non-existent terminal', () => {
      const result = terminalManager.write('non-existent', 'data');
      expect(result).toBe(false);
    });
  });

  describe('resize', () => {
    it('should update terminal dimensions and call pty.resize', async () => {
      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
        cols: 80,
        rows: 24,
      });

      const result = terminalManager.resize('tab-1', 120, 40);

      expect(result).toBe(true);
      const terminal = terminalManager.get('tab-1');
      expect(terminal?.cols).toBe(120);
      expect(terminal?.rows).toBe(40);
      expect(mockPty.resize).toHaveBeenCalledWith(120, 40);
    });

    it('should return false for non-existent terminal', () => {
      const result = terminalManager.resize('non-existent', 100, 50);
      expect(result).toBe(false);
    });
  });

  describe('kill', () => {
    it('should kill terminal PTY', async () => {
      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
      });

      expect(terminalManager.size).toBe(1);

      const result = terminalManager.kill('tab-1');

      expect(result).toBe(true);
      expect(mockPty.kill).toHaveBeenCalled();
      expect(terminalManager.size).toBe(0);
    });

    it('should return false for non-existent terminal', () => {
      const result = terminalManager.kill('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getBySession', () => {
    it('should return all terminals for a session', async () => {
      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
      });

      // Create second mock PTY
      const mockPty2 = createMockPty();
      vi.mocked(pty.spawn).mockReturnValueOnce(mockPty2 as unknown as ReturnType<typeof pty.spawn>);

      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-2',
        shell: 'bash',
      });

      // Create terminal for different session
      const mockPty3 = createMockPty();
      vi.mocked(pty.spawn).mockReturnValueOnce(mockPty3 as unknown as ReturnType<typeof pty.spawn>);

      await terminalManager.create({
        sessionId: 'session-2',
        workspacePath: '/workspaces/other-project',
        tabId: 'tab-3',
        shell: 'bash',
      });

      const session1Terminals = terminalManager.getBySession('session-1');
      expect(session1Terminals).toHaveLength(2);
      expect(session1Terminals.map((t) => t.tabId)).toEqual(['tab-1', 'tab-2']);
    });
  });

  describe('killBySession', () => {
    it('should kill all terminals for a session', async () => {
      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
      });

      const mockPty2 = createMockPty();
      vi.mocked(pty.spawn).mockReturnValueOnce(mockPty2 as unknown as ReturnType<typeof pty.spawn>);

      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-2',
        shell: 'bash',
      });

      expect(terminalManager.size).toBe(2);

      terminalManager.killBySession('session-1');

      expect(terminalManager.size).toBe(0);
    });
  });

  describe('killAll', () => {
    it('should kill all terminals', async () => {
      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
      });

      const mockPty2 = createMockPty();
      vi.mocked(pty.spawn).mockReturnValueOnce(mockPty2 as unknown as ReturnType<typeof pty.spawn>);

      await terminalManager.create({
        sessionId: 'session-2',
        workspacePath: '/workspaces/other-project',
        tabId: 'tab-2',
        shell: 'bash',
      });

      expect(terminalManager.size).toBe(2);

      terminalManager.killAll();

      expect(terminalManager.size).toBe(0);
    });
  });
});

describe('getTerminalManager', () => {
  afterEach(() => {
    resetTerminalManager();
  });

  it('should return singleton instance', () => {
    const manager1 = getTerminalManager();
    const manager2 = getTerminalManager();
    expect(manager1).toBe(manager2);
  });
});

describe('resetTerminalManager', () => {
  it('should reset the singleton instance', () => {
    const manager1 = getTerminalManager();
    resetTerminalManager();
    const manager2 = getTerminalManager();
    expect(manager1).not.toBe(manager2);
  });
});

describe('workspacePath validation', () => {
  let terminalManager: TerminalManager;

  beforeEach(() => {
    terminalManager = new TerminalManager();
  });

  afterEach(() => {
    resetTerminalManager();
  });

  it('should reject empty workspacePath', async () => {
    await expect(terminalManager.create({
      sessionId: 'session-1',
      workspacePath: '',
      shell: 'bash',
    })).rejects.toThrow('Invalid workspace path');
  });

  it('should reject relative workspacePath', async () => {
    await expect(terminalManager.create({
      sessionId: 'session-1',
      workspacePath: 'relative/path',
      shell: 'bash',
    })).rejects.toThrow('Invalid workspace path');
  });

  it('should reject workspacePath starting with dot-dot', async () => {
    await expect(terminalManager.create({
      sessionId: 'session-1',
      workspacePath: '../etc/passwd',
      shell: 'bash',
    })).rejects.toThrow('Invalid workspace path');
  });

  it('should accept valid absolute workspacePath', async () => {
    const mockPty = createMockPty();
    vi.mocked(pty.spawn).mockReturnValue(mockPty as unknown as ReturnType<typeof pty.spawn>);

    const tabId = await terminalManager.create({
      sessionId: 'session-1',
      workspacePath: '/workspaces/test-project',
      shell: 'bash',
    });

    expect(tabId).toBeDefined();
  });
});

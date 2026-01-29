import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter, Readable, Writable } from 'node:stream';
import {
  TerminalManager,
  getTerminalManager,
  resetTerminalManager,
} from './terminal.service.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('TerminalManager', () => {
  let terminalManager: TerminalManager;
  let mockProcess: ChildProcess;
  let mockStdin: Writable;
  let mockStdout: Readable;
  let mockStderr: Readable;

  beforeEach(() => {
    terminalManager = new TerminalManager();

    // Create mock streams
    mockStdin = new Writable({
      write(chunk, encoding, callback) {
        callback();
        return true;
      },
    });
    mockStdout = new Readable({ read() {} });
    mockStderr = new Readable({ read() {} });

    // Create mock process
    mockProcess = new EventEmitter() as ChildProcess;
    mockProcess.stdin = mockStdin;
    mockProcess.stdout = mockStdout;
    mockProcess.stderr = mockStderr;
    mockProcess.kill = vi.fn().mockReturnValue(true);

    // Mock spawn to return our mock process
    vi.mocked(spawn).mockReturnValue(mockProcess);
  });

  afterEach(() => {
    vi.resetAllMocks();
    resetTerminalManager();
  });

  describe('create', () => {
    it('should create a new terminal with default options', async () => {
      // Mock shell detection
      const detectProcess = new EventEmitter() as ChildProcess;
      detectProcess.stdout = new Readable({ read() {} });
      detectProcess.stderr = new Readable({ read() {} });

      vi.mocked(spawn).mockReturnValueOnce(detectProcess);

      const createPromise = terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
      });

      // Simulate bash detection failure -> fallback to sh
      detectProcess.emit('close', 1);

      vi.mocked(spawn).mockReturnValueOnce(mockProcess);

      const tabId = await createPromise;

      expect(tabId).toBeDefined();
      expect(terminalManager.size).toBe(1);
    });

    it('should create a terminal with specified tabId', async () => {
      // Skip shell detection by providing shell
      const tabId = await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'my-tab-id',
        shell: 'bash',
      });

      expect(tabId).toBe('my-tab-id');
      expect(terminalManager.get('my-tab-id')).toBeDefined();
    });

    it('should emit data events from stdout', async () => {
      const dataHandler = vi.fn();
      terminalManager.on('data', dataHandler);

      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
      });

      // Simulate stdout data using emit
      mockStdout.emit('data', Buffer.from('Hello World'));

      expect(dataHandler).toHaveBeenCalledWith('tab-1', 'Hello World');
    });

    it('should emit data events from stderr', async () => {
      const dataHandler = vi.fn();
      terminalManager.on('data', dataHandler);

      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
      });

      // Simulate stderr data using emit
      mockStderr.emit('data', Buffer.from('Error message'));

      expect(dataHandler).toHaveBeenCalledWith('tab-1', 'Error message');
    });

    it('should emit exit event when process closes', async () => {
      const exitHandler = vi.fn();
      terminalManager.on('exit', exitHandler);

      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
      });

      expect(terminalManager.size).toBe(1);

      // Simulate process exit
      mockProcess.emit('close', 0);

      expect(exitHandler).toHaveBeenCalledWith('tab-1', 0);
      expect(terminalManager.size).toBe(0);
    });

    it('should emit error event on process error', async () => {
      const errorHandler = vi.fn();
      terminalManager.on('error', errorHandler);

      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
      });

      // Simulate process error
      const testError = new Error('Process failed');
      mockProcess.emit('error', testError);

      expect(errorHandler).toHaveBeenCalledWith('tab-1', testError);
      expect(terminalManager.size).toBe(0);
    });

    it('should use devcontainer exec command', async () => {
      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
        devcontainerCliPath: '/usr/local/bin/devcontainer',
      });

      // Check that spawn was called with script wrapper and devcontainer exec command
      expect(spawn).toHaveBeenCalledWith(
        'script',
        [
          '-q',
          '-c',
          '/usr/local/bin/devcontainer exec --workspace-folder "/workspaces/test-project" bash',
          '/dev/null',
        ],
        expect.objectContaining({
          stdio: ['pipe', 'pipe', 'pipe'],
          env: expect.objectContaining({
            TERM: 'xterm-256color',
          }),
        })
      );
    });
  });

  describe('write', () => {
    it('should write data to terminal stdin', async () => {
      const writeSpy = vi.spyOn(mockStdin, 'write');

      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
      });

      const result = terminalManager.write('tab-1', 'ls -la\n');

      expect(result).toBe(true);
      expect(writeSpy).toHaveBeenCalledWith('ls -la\n');
    });

    it('should return false for non-existent terminal', () => {
      const result = terminalManager.write('non-existent', 'data');
      expect(result).toBe(false);
    });
  });

  describe('resize', () => {
    it('should update terminal dimensions', async () => {
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
    });

    it('should return false for non-existent terminal', () => {
      const result = terminalManager.resize('non-existent', 100, 50);
      expect(result).toBe(false);
    });
  });

  describe('kill', () => {
    it('should kill terminal process', async () => {
      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-1',
        shell: 'bash',
      });

      expect(terminalManager.size).toBe(1);

      const result = terminalManager.kill('tab-1');

      expect(result).toBe(true);
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
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

      // Create second mock process
      const mockProcess2 = new EventEmitter() as ChildProcess;
      mockProcess2.stdin = new Writable({ write(_, __, cb) { cb(); return true; } });
      mockProcess2.stdout = new Readable({ read() {} });
      mockProcess2.stderr = new Readable({ read() {} });
      mockProcess2.kill = vi.fn();
      vi.mocked(spawn).mockReturnValueOnce(mockProcess2);

      await terminalManager.create({
        sessionId: 'session-1',
        workspacePath: '/workspaces/test-project',
        tabId: 'tab-2',
        shell: 'bash',
      });

      // Create terminal for different session
      const mockProcess3 = new EventEmitter() as ChildProcess;
      mockProcess3.stdin = new Writable({ write(_, __, cb) { cb(); return true; } });
      mockProcess3.stdout = new Readable({ read() {} });
      mockProcess3.stderr = new Readable({ read() {} });
      mockProcess3.kill = vi.fn();
      vi.mocked(spawn).mockReturnValueOnce(mockProcess3);

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

      const mockProcess2 = new EventEmitter() as ChildProcess;
      mockProcess2.stdin = new Writable({ write(_, __, cb) { cb(); return true; } });
      mockProcess2.stdout = new Readable({ read() {} });
      mockProcess2.stderr = new Readable({ read() {} });
      mockProcess2.kill = vi.fn();
      vi.mocked(spawn).mockReturnValueOnce(mockProcess2);

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

      const mockProcess2 = new EventEmitter() as ChildProcess;
      mockProcess2.stdin = new Writable({ write(_, __, cb) { cb(); return true; } });
      mockProcess2.stdout = new Readable({ read() {} });
      mockProcess2.stderr = new Readable({ read() {} });
      mockProcess2.kill = vi.fn();
      vi.mocked(spawn).mockReturnValueOnce(mockProcess2);

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
    const mockProcess = new EventEmitter() as ChildProcess;
    mockProcess.stdin = new Writable({ write(_, __, cb) { cb(); return true; } });
    mockProcess.stdout = new Readable({ read() {} });
    mockProcess.stderr = new Readable({ read() {} });
    mockProcess.kill = vi.fn();
    vi.mocked(spawn).mockReturnValue(mockProcess);

    const tabId = await terminalManager.create({
      sessionId: 'session-1',
      workspacePath: '/workspaces/test-project',
      shell: 'bash',
    });

    expect(tabId).toBeDefined();
  });
});

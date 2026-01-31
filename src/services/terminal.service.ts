/// <reference path="../types/node-pty.d.ts" />
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { resolve, normalize } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import * as pty from '@lydell/node-pty';
import type { IPty } from '@lydell/node-pty';

/**
 * Validate workspace path to prevent path traversal attacks.
 * The path must be absolute and normalized (no .. or . components that resolve outside).
 */
function isValidWorkspacePath(workspacePath: string): boolean {
  if (!workspacePath || typeof workspacePath !== 'string') {
    return false;
  }

  // Must be an absolute path
  if (!workspacePath.startsWith('/')) {
    return false;
  }

  // Normalize and resolve to check for path traversal
  const normalized = normalize(workspacePath);
  const resolved = resolve(workspacePath);

  // After normalization, should be the same as resolved
  return normalized === resolved;
}

/**
 * Output buffer configuration
 */
const OUTPUT_BUFFER_MAX_LINES = 1000;
const OUTPUT_BUFFER_MAX_BYTES = 50 * 1024; // 50KB

/**
 * Information about an active terminal instance
 */
export interface TerminalInstance {
  tabId: string;
  sessionId: string;
  workspacePath: string;
  shell: string;
  pty: IPty;
  cols: number;
  rows: number;
  outputBuffer: string[];
  outputBufferBytes: number;
}

/**
 * Events emitted by TerminalManager
 */
export interface TerminalManagerEvents {
  data: (tabId: string, data: string) => void;
  exit: (tabId: string, code: number) => void;
  error: (tabId: string, error: Error) => void;
}

/**
 * Options for creating a new terminal
 */
export interface CreateTerminalOptions {
  sessionId: string;
  workspacePath: string;
  devcontainerCliPath?: string;
  tabId?: string;
  shell?: string;
  cols?: number;
  rows?: number;
  /** Additional remote environment variables (name=value format) */
  remoteEnv?: string[];
}

/**
 * Manages terminal instances (PTY via docker exec)
 */
export class TerminalManager extends EventEmitter {
  private terminals: Map<string, TerminalInstance> = new Map();

  constructor() {
    super();
  }

  /**
   * Check if bash is available in a container via devcontainer exec
   */
  private async detectShell(workspacePath: string, cliPath: string): Promise<string> {
    if (!isValidWorkspacePath(workspacePath)) {
      throw new Error('Invalid workspace path');
    }

    return new Promise((resolve) => {
      const check = spawn(cliPath, ['exec', '--workspace-folder', workspacePath, 'which', 'bash'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';
      check.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      check.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve('bash');
        } else {
          resolve('sh');
        }
      });

      check.on('error', () => {
        resolve('sh');
      });
    });
  }

  /**
   * Create a new terminal instance
   */
  async create(options: CreateTerminalOptions): Promise<string> {
    const {
      sessionId,
      workspacePath,
      devcontainerCliPath = 'devcontainer',
      tabId = uuidv4(),
      cols = 80,
      rows = 24,
    } = options;

    // Validate workspacePath to prevent path traversal attacks
    if (!isValidWorkspacePath(workspacePath)) {
      throw new Error('Invalid workspace path');
    }

    // Detect shell if not specified
    const shell = options.shell ?? await this.detectShell(workspacePath, devcontainerCliPath);

    // Build remote-env arguments
    const remoteEnvArgs: string[] = ['--remote-env', 'TERM=xterm-256color'];
    if (options.remoteEnv) {
      for (const env of options.remoteEnv) {
        remoteEnvArgs.push('--remote-env', env);
      }
    }

    // Spawn devcontainer exec with node-pty for real PTY support
    const ptyProcess = pty.spawn(devcontainerCliPath, [
      'exec',
      '--workspace-folder',
      workspacePath,
      ...remoteEnvArgs,
      shell,
    ], {
      name: 'xterm-256color',
      cols,
      rows,
      env: {
        ...global.process.env,
        TERM: 'xterm-256color',
      },
    });

    const terminal: TerminalInstance = {
      tabId,
      sessionId,
      workspacePath,
      shell,
      pty: ptyProcess,
      cols,
      rows,
      outputBuffer: [],
      outputBufferBytes: 0,
    };

    this.terminals.set(tabId, terminal);

    // Handle PTY data output
    ptyProcess.onData((data: string) => {
      this.appendToBuffer(terminal, data);
      this.emit('data', tabId, data);
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode }) => {
      this.terminals.delete(tabId);
      this.emit('exit', tabId, exitCode);
    });

    return tabId;
  }

  /**
   * Append data to the output buffer, respecting size limits
   */
  private appendToBuffer(terminal: TerminalInstance, data: string): void {
    const dataBytes = Buffer.byteLength(data, 'utf8');

    terminal.outputBuffer.push(data);
    terminal.outputBufferBytes += dataBytes;

    // Trim buffer if it exceeds limits
    while (
      terminal.outputBuffer.length > OUTPUT_BUFFER_MAX_LINES ||
      terminal.outputBufferBytes > OUTPUT_BUFFER_MAX_BYTES
    ) {
      const removed = terminal.outputBuffer.shift();
      if (removed) {
        terminal.outputBufferBytes -= Buffer.byteLength(removed, 'utf8');
      }
    }
  }

  /**
   * Get output history for a terminal
   */
  getOutputHistory(tabId: string): string {
    const terminal = this.terminals.get(tabId);
    if (!terminal) {
      return '';
    }
    return terminal.outputBuffer.join('');
  }

  /**
   * Write data to a terminal
   */
  write(tabId: string, data: string): boolean {
    const terminal = this.terminals.get(tabId);
    if (!terminal) {
      return false;
    }

    terminal.pty.write(data);
    return true;
  }

  /**
   * Resize a terminal
   */
  resize(tabId: string, cols: number, rows: number): boolean {
    const terminal = this.terminals.get(tabId);
    if (!terminal) {
      return false;
    }

    terminal.cols = cols;
    terminal.rows = rows;
    terminal.pty.resize(cols, rows);

    return true;
  }

  /**
   * Kill a terminal
   */
  kill(tabId: string): boolean {
    const terminal = this.terminals.get(tabId);
    if (!terminal) {
      return false;
    }

    terminal.pty.kill();
    this.terminals.delete(tabId);
    return true;
  }

  /**
   * Get terminal by tabId
   */
  get(tabId: string): TerminalInstance | undefined {
    return this.terminals.get(tabId);
  }

  /**
   * Get all terminals for a session
   */
  getBySession(sessionId: string): TerminalInstance[] {
    return Array.from(this.terminals.values()).filter(
      (t) => t.sessionId === sessionId
    );
  }

  /**
   * Kill all terminals for a session
   */
  killBySession(sessionId: string): void {
    const terminals = this.getBySession(sessionId);
    for (const terminal of terminals) {
      this.kill(terminal.tabId);
    }
  }

  /**
   * Kill all terminals
   */
  killAll(): void {
    for (const tabId of this.terminals.keys()) {
      this.kill(tabId);
    }
  }

  /**
   * Get the number of active terminals
   */
  get size(): number {
    return this.terminals.size;
  }
}

// Singleton instance
let terminalManager: TerminalManager | null = null;

/**
 * Get the singleton TerminalManager instance
 */
export function getTerminalManager(): TerminalManager {
  if (!terminalManager) {
    terminalManager = new TerminalManager();
  }
  return terminalManager;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetTerminalManager(): void {
  if (terminalManager) {
    terminalManager.killAll();
    terminalManager = null;
  }
}

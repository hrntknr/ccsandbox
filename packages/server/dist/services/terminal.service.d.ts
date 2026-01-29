import { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
/**
 * Information about an active terminal instance
 */
export interface TerminalInstance {
    tabId: string;
    sessionId: string;
    containerId: string;
    shell: string;
    process: ChildProcess;
    cols: number;
    rows: number;
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
    containerId: string;
    tabId?: string;
    shell?: string;
    cols?: number;
    rows?: number;
}
/**
 * Manages terminal instances (PTY via docker exec)
 */
export declare class TerminalManager extends EventEmitter {
    private terminals;
    constructor();
    /**
     * Check if bash is available in a container
     */
    private detectShell;
    /**
     * Create a new terminal instance
     */
    create(options: CreateTerminalOptions): Promise<string>;
    /**
     * Write data to a terminal
     */
    write(tabId: string, data: string): boolean;
    /**
     * Resize a terminal
     * Note: docker exec via script doesn't support runtime resize.
     * We only store the dimensions for reference.
     * The terminal size is set at creation time via environment variables.
     */
    resize(tabId: string, cols: number, rows: number): boolean;
    /**
     * Kill a terminal
     */
    kill(tabId: string): boolean;
    /**
     * Get terminal by tabId
     */
    get(tabId: string): TerminalInstance | undefined;
    /**
     * Get all terminals for a session
     */
    getBySession(sessionId: string): TerminalInstance[];
    /**
     * Kill all terminals for a session
     */
    killBySession(sessionId: string): void;
    /**
     * Kill all terminals
     */
    killAll(): void;
    /**
     * Get the number of active terminals
     */
    get size(): number;
}
/**
 * Get the singleton TerminalManager instance
 */
export declare function getTerminalManager(): TerminalManager;
/**
 * Reset the singleton instance (for testing)
 */
export declare function resetTerminalManager(): void;
//# sourceMappingURL=terminal.service.d.ts.map
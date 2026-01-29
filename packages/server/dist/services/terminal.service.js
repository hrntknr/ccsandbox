import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { v4 as uuidv4 } from 'uuid';
/**
 * Validate Docker container ID format.
 * Container IDs are hexadecimal strings, typically 12 (short) or 64 (full) characters.
 */
function isValidContainerId(containerId) {
    // Docker container IDs are 12-64 character hexadecimal strings
    return /^[a-f0-9]{12,64}$/i.test(containerId);
}
/**
 * Manages terminal instances (PTY via docker exec)
 */
export class TerminalManager extends EventEmitter {
    terminals = new Map();
    constructor() {
        super();
    }
    /**
     * Check if bash is available in a container
     */
    async detectShell(containerId) {
        if (!isValidContainerId(containerId)) {
            throw new Error('Invalid container ID format');
        }
        return new Promise((resolve) => {
            const check = spawn('docker', ['exec', containerId, 'which', 'bash'], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            let output = '';
            check.stdout?.on('data', (data) => {
                output += data.toString();
            });
            check.on('close', (code) => {
                if (code === 0 && output.trim()) {
                    resolve('bash');
                }
                else {
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
    async create(options) {
        const { sessionId, containerId, tabId = uuidv4(), cols = 80, rows = 24, } = options;
        // Validate containerId format to prevent command injection
        if (!isValidContainerId(containerId)) {
            throw new Error('Invalid container ID format');
        }
        // Detect shell if not specified
        const shell = options.shell ?? await this.detectShell(containerId);
        // Spawn docker exec with pseudo-terminal allocation
        // Using 'script' command to create a PTY wrapper for docker exec
        // This is necessary because Node.js spawn doesn't allocate a real PTY
        const dockerCmd = `docker exec -it -e TERM=xterm-256color -e COLUMNS=${cols} -e LINES=${rows} ${containerId} ${shell}`;
        const process = spawn('script', [
            '-q', // Quiet mode (no start/end messages)
            '-c', // Command to run
            dockerCmd,
            '/dev/null', // Output file (discard)
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const terminal = {
            tabId,
            sessionId,
            containerId,
            shell,
            process,
            cols,
            rows,
        };
        this.terminals.set(tabId, terminal);
        // Handle stdout
        process.stdout?.on('data', (data) => {
            this.emit('data', tabId, data.toString());
        });
        // Handle stderr (merge with stdout for terminal output)
        process.stderr?.on('data', (data) => {
            this.emit('data', tabId, data.toString());
        });
        // Handle process exit
        process.on('close', (code) => {
            this.terminals.delete(tabId);
            this.emit('exit', tabId, code ?? 0);
        });
        // Handle process error
        process.on('error', (error) => {
            this.terminals.delete(tabId);
            this.emit('error', tabId, error);
        });
        return tabId;
    }
    /**
     * Write data to a terminal
     */
    write(tabId, data) {
        const terminal = this.terminals.get(tabId);
        if (!terminal || !terminal.process.stdin) {
            return false;
        }
        return terminal.process.stdin.write(data);
    }
    /**
     * Resize a terminal
     * Note: docker exec via script doesn't support runtime resize.
     * We only store the dimensions for reference.
     * The terminal size is set at creation time via environment variables.
     */
    resize(tabId, cols, rows) {
        const terminal = this.terminals.get(tabId);
        if (!terminal) {
            return false;
        }
        terminal.cols = cols;
        terminal.rows = rows;
        // Note: Runtime resize is not supported with docker exec via script.
        // The terminal size is fixed at creation time.
        // For true resize support, consider using docker attach with a PTY library.
        return true;
    }
    /**
     * Kill a terminal
     */
    kill(tabId) {
        const terminal = this.terminals.get(tabId);
        if (!terminal) {
            return false;
        }
        terminal.process.kill('SIGTERM');
        this.terminals.delete(tabId);
        return true;
    }
    /**
     * Get terminal by tabId
     */
    get(tabId) {
        return this.terminals.get(tabId);
    }
    /**
     * Get all terminals for a session
     */
    getBySession(sessionId) {
        return Array.from(this.terminals.values()).filter((t) => t.sessionId === sessionId);
    }
    /**
     * Kill all terminals for a session
     */
    killBySession(sessionId) {
        const terminals = this.getBySession(sessionId);
        for (const terminal of terminals) {
            this.kill(terminal.tabId);
        }
    }
    /**
     * Kill all terminals
     */
    killAll() {
        for (const tabId of this.terminals.keys()) {
            this.kill(tabId);
        }
    }
    /**
     * Get the number of active terminals
     */
    get size() {
        return this.terminals.size;
    }
}
// Singleton instance
let terminalManager = null;
/**
 * Get the singleton TerminalManager instance
 */
export function getTerminalManager() {
    if (!terminalManager) {
        terminalManager = new TerminalManager();
    }
    return terminalManager;
}
/**
 * Reset the singleton instance (for testing)
 */
export function resetTerminalManager() {
    if (terminalManager) {
        terminalManager.killAll();
        terminalManager = null;
    }
}
//# sourceMappingURL=terminal.service.js.map
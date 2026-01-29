import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { generateWorkspacePath } from '@ccsandbox/shared';
/**
 * Error thrown when workspace path already exists.
 */
export class WorkspaceExistsError extends Error {
    workspacePath;
    constructor(workspacePath) {
        super(`Workspace path already exists: ${workspacePath}`);
        this.workspacePath = workspacePath;
        this.name = 'WorkspaceExistsError';
    }
}
/**
 * Error thrown when session is not found.
 */
export class SessionNotFoundError extends Error {
    sessionId;
    constructor(sessionId) {
        super(`Session not found: ${sessionId}`);
        this.sessionId = sessionId;
        this.name = 'SessionNotFoundError';
    }
}
/**
 * Session store that persists sessions to a JSON file.
 */
export class SessionStore {
    sessionsFilePath;
    repoDir;
    lockPromise = null;
    /**
     * Creates a new SessionStore.
     *
     * @param repoDir - Base directory for repositories (default: $HOME/.ccsandbox)
     */
    constructor(repoDir) {
        this.repoDir = repoDir ?? join(process.env['HOME'] ?? homedir(), '.ccsandbox');
        this.sessionsFilePath = join(this.repoDir, '.ccsandbox', 'sessions.json');
    }
    /**
     * Executes a function with exclusive lock to prevent race conditions.
     */
    async withLock(fn) {
        while (this.lockPromise) {
            await this.lockPromise;
        }
        let resolve;
        this.lockPromise = new Promise((r) => {
            resolve = r;
        });
        try {
            return await fn();
        }
        finally {
            this.lockPromise = null;
            resolve();
        }
    }
    /**
     * Ensures the directory for sessions.json exists.
     */
    async ensureDirectory() {
        const dir = dirname(this.sessionsFilePath);
        await mkdir(dir, { recursive: true });
    }
    /**
     * Reads all sessions from the JSON file.
     */
    async readSessions() {
        try {
            const content = await readFile(this.sessionsFilePath, 'utf-8');
            const data = JSON.parse(content);
            return data.sessions;
        }
        catch (error) {
            if (error instanceof Error &&
                'code' in error &&
                error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }
    /**
     * Writes all sessions to the JSON file.
     */
    async writeSessions(sessions) {
        await this.ensureDirectory();
        const data = { sessions };
        await writeFile(this.sessionsFilePath, JSON.stringify(data, null, 2));
    }
    /**
     * Checks if a path exists on the filesystem.
     */
    async pathExists(path) {
        try {
            await stat(path);
            return true;
        }
        catch (error) {
            if (error instanceof Error &&
                'code' in error &&
                error.code === 'ENOENT') {
                return false;
            }
            throw error;
        }
    }
    /**
     * Gets the repository directory path.
     */
    getRepoDir() {
        return this.repoDir;
    }
    /**
     * Lists all sessions.
     */
    async list() {
        return this.readSessions();
    }
    /**
     * Gets a session by ID.
     *
     * @throws SessionNotFoundError if session does not exist
     */
    async get(sessionId) {
        const sessions = await this.readSessions();
        const session = sessions.find((s) => s.sessionId === sessionId);
        if (!session) {
            throw new SessionNotFoundError(sessionId);
        }
        return session;
    }
    /**
     * Creates a new session.
     *
     * @throws WorkspaceExistsError if workspace path already exists
     */
    async create(options) {
        return this.withLock(async () => {
            const workspacePath = generateWorkspacePath(this.repoDir, options.repo, options.workBranch);
            // Check if workspace path already exists (Section 8.3)
            if (await this.pathExists(workspacePath)) {
                throw new WorkspaceExistsError(workspacePath);
            }
            const sessions = await this.readSessions();
            const session = {
                sessionId: uuidv4(),
                title: options.title,
                repo: options.repo,
                apiBase: options.apiBase,
                baseBranch: options.baseBranch,
                workBranch: options.workBranch,
                workspacePath,
                state: 'READY',
                createdAt: new Date().toISOString(),
            };
            sessions.push(session);
            await this.writeSessions(sessions);
            return session;
        });
    }
    /**
     * Updates an existing session.
     *
     * @throws SessionNotFoundError if session does not exist
     */
    async update(sessionId, options) {
        return this.withLock(async () => {
            const sessions = await this.readSessions();
            const index = sessions.findIndex((s) => s.sessionId === sessionId);
            if (index === -1) {
                throw new SessionNotFoundError(sessionId);
            }
            const session = sessions[index];
            if (options.title !== undefined) {
                session.title = options.title;
            }
            if (options.state !== undefined) {
                session.state = options.state;
            }
            if (options.containerId !== undefined) {
                if (options.containerId === null) {
                    delete session.containerId;
                }
                else {
                    session.containerId = options.containerId;
                }
            }
            if (options.containerName !== undefined) {
                if (options.containerName === null) {
                    delete session.containerName;
                }
                else {
                    session.containerName = options.containerName;
                }
            }
            if (options.tabs !== undefined) {
                session.tabs = options.tabs;
            }
            await this.writeSessions(sessions);
            return session;
        });
    }
    /**
     * Deletes a session by ID.
     *
     * @throws SessionNotFoundError if session does not exist
     */
    async delete(sessionId) {
        return this.withLock(async () => {
            const sessions = await this.readSessions();
            const index = sessions.findIndex((s) => s.sessionId === sessionId);
            if (index === -1) {
                throw new SessionNotFoundError(sessionId);
            }
            sessions.splice(index, 1);
            await this.writeSessions(sessions);
        });
    }
}
//# sourceMappingURL=session-store.js.map
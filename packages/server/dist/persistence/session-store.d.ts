import type { Session, SessionState, TerminalTab } from '@ccsandbox/shared';
/**
 * Options for creating a new session.
 */
export interface CreateSessionOptions {
    title: string;
    repo: string;
    apiBase: string;
    baseBranch: string;
    workBranch: string;
}
/**
 * Options for updating an existing session.
 */
export interface UpdateSessionOptions {
    title?: string;
    state?: SessionState;
    containerId?: string | null;
    containerName?: string | null;
    tabs?: TerminalTab[];
}
/**
 * Error thrown when workspace path already exists.
 */
export declare class WorkspaceExistsError extends Error {
    readonly workspacePath: string;
    constructor(workspacePath: string);
}
/**
 * Error thrown when session is not found.
 */
export declare class SessionNotFoundError extends Error {
    readonly sessionId: string;
    constructor(sessionId: string);
}
/**
 * Session store that persists sessions to a JSON file.
 */
export declare class SessionStore {
    private readonly sessionsFilePath;
    private readonly repoDir;
    private lockPromise;
    /**
     * Creates a new SessionStore.
     *
     * @param repoDir - Base directory for repositories (default: $HOME/.ccsandbox)
     */
    constructor(repoDir?: string);
    /**
     * Executes a function with exclusive lock to prevent race conditions.
     */
    private withLock;
    /**
     * Ensures the directory for sessions.json exists.
     */
    private ensureDirectory;
    /**
     * Reads all sessions from the JSON file.
     */
    private readSessions;
    /**
     * Writes all sessions to the JSON file.
     */
    private writeSessions;
    /**
     * Checks if a path exists on the filesystem.
     */
    private pathExists;
    /**
     * Gets the repository directory path.
     */
    getRepoDir(): string;
    /**
     * Lists all sessions.
     */
    list(): Promise<Session[]>;
    /**
     * Gets a session by ID.
     *
     * @throws SessionNotFoundError if session does not exist
     */
    get(sessionId: string): Promise<Session>;
    /**
     * Creates a new session.
     *
     * @throws WorkspaceExistsError if workspace path already exists
     */
    create(options: CreateSessionOptions): Promise<Session>;
    /**
     * Updates an existing session.
     *
     * @throws SessionNotFoundError if session does not exist
     */
    update(sessionId: string, options: UpdateSessionOptions): Promise<Session>;
    /**
     * Deletes a session by ID.
     *
     * @throws SessionNotFoundError if session does not exist
     */
    delete(sessionId: string): Promise<void>;
}
//# sourceMappingURL=session-store.d.ts.map
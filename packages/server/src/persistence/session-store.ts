import { EventEmitter } from 'node:events';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { Session, SessionState } from '@ccsandbox/shared';
import { generateWorkspacePath } from '@ccsandbox/shared';

/**
 * Interface for session data stored in JSON file.
 */
interface SessionsData {
  sessions: Session[];
}

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
}

/**
 * Error thrown when workspace path already exists.
 */
export class WorkspaceExistsError extends Error {
  constructor(public readonly workspacePath: string) {
    super(`Workspace path already exists: ${workspacePath}`);
    this.name = 'WorkspaceExistsError';
  }
}

/**
 * Error thrown when session is not found.
 */
export class SessionNotFoundError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Event types emitted by SessionStore.
 */
export interface SessionStoreEvents {
  created: (session: Session) => void;
  updated: (session: Session) => void;
  deleted: (sessionId: string) => void;
}

/**
 * Session store that persists sessions to a JSON file.
 * Extends EventEmitter to notify listeners of session changes.
 */
export class SessionStore extends EventEmitter {
  private readonly sessionsFilePath: string;
  private readonly repoDir: string;
  private lockPromise: Promise<void> | null = null;

  /**
   * Creates a new SessionStore.
   *
   * @param repoDir - Base directory for repositories (default: $HOME/.ccsandbox)
   */
  constructor(repoDir?: string) {
    super();
    this.repoDir = repoDir ?? join(process.env['HOME'] ?? homedir(), '.ccsandbox');
    this.sessionsFilePath = join(this.repoDir, '.ccsandbox', 'sessions.json');
  }

  /**
   * Type-safe event emitter methods.
   */
  override emit<K extends keyof SessionStoreEvents>(
    event: K,
    ...args: Parameters<SessionStoreEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  override on<K extends keyof SessionStoreEvents>(
    event: K,
    listener: SessionStoreEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override off<K extends keyof SessionStoreEvents>(
    event: K,
    listener: SessionStoreEvents[K]
  ): this {
    return super.off(event, listener);
  }

  /**
   * Executes a function with exclusive lock to prevent race conditions.
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    while (this.lockPromise) {
      await this.lockPromise;
    }

    let resolve: () => void;
    this.lockPromise = new Promise((r) => {
      resolve = r;
    });

    try {
      return await fn();
    } finally {
      this.lockPromise = null;
      resolve!();
    }
  }

  /**
   * Ensures the directory for sessions.json exists.
   */
  private async ensureDirectory(): Promise<void> {
    const dir = dirname(this.sessionsFilePath);
    await mkdir(dir, { recursive: true });
  }

  /**
   * Reads all sessions from the JSON file.
   */
  private async readSessions(): Promise<Session[]> {
    try {
      const content = await readFile(this.sessionsFilePath, 'utf-8');
      const data = JSON.parse(content) as SessionsData;
      return data.sessions;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Writes all sessions to the JSON file.
   */
  private async writeSessions(sessions: Session[]): Promise<void> {
    await this.ensureDirectory();
    const data: SessionsData = { sessions };
    await writeFile(this.sessionsFilePath, JSON.stringify(data, null, 2));
  }

  /**
   * Checks if a path exists on the filesystem.
   */
  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Gets the repository directory path.
   */
  getRepoDir(): string {
    return this.repoDir;
  }

  /**
   * Lists all sessions.
   */
  async list(): Promise<Session[]> {
    return this.readSessions();
  }

  /**
   * Gets a session by ID.
   *
   * @throws SessionNotFoundError if session does not exist
   */
  async get(sessionId: string): Promise<Session> {
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
  async create(options: CreateSessionOptions): Promise<Session> {
    return this.withLock(async () => {
      const workspacePath = generateWorkspacePath(
        this.repoDir,
        options.repo,
        options.workBranch
      );

      // Check if workspace path already exists (Section 8.3)
      if (await this.pathExists(workspacePath)) {
        throw new WorkspaceExistsError(workspacePath);
      }

      const sessions = await this.readSessions();

      const session: Session = {
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

      this.emit('created', session);
      return session;
    });
  }

  /**
   * Updates an existing session.
   *
   * @throws SessionNotFoundError if session does not exist
   */
  async update(
    sessionId: string,
    options: UpdateSessionOptions
  ): Promise<Session> {
    return this.withLock(async () => {
      const sessions = await this.readSessions();
      const index = sessions.findIndex((s) => s.sessionId === sessionId);
      if (index === -1) {
        throw new SessionNotFoundError(sessionId);
      }

      const session = sessions[index]!;

      if (options.title !== undefined) {
        session.title = options.title;
      }
      if (options.state !== undefined) {
        session.state = options.state;
      }
      if (options.containerId !== undefined) {
        if (options.containerId === null) {
          delete session.containerId;
        } else {
          session.containerId = options.containerId;
        }
      }
      if (options.containerName !== undefined) {
        if (options.containerName === null) {
          delete session.containerName;
        } else {
          session.containerName = options.containerName;
        }
      }

      await this.writeSessions(sessions);

      this.emit('updated', session);
      return session;
    });
  }

  /**
   * Deletes a session by ID.
   *
   * @throws SessionNotFoundError if session does not exist
   */
  async delete(sessionId: string): Promise<void> {
    return this.withLock(async () => {
      const sessions = await this.readSessions();
      const index = sessions.findIndex((s) => s.sessionId === sessionId);
      if (index === -1) {
        throw new SessionNotFoundError(sessionId);
      }

      sessions.splice(index, 1);
      await this.writeSessions(sessions);

      this.emit('deleted', sessionId);
    });
  }
}

// Singleton instance for shared state across the application
let sessionStoreInstance: SessionStore | null = null;

/**
 * Gets the singleton SessionStore instance.
 * Creates the instance on first call using config.repoDir.
 */
export function getSessionStore(repoDir?: string): SessionStore {
  if (!sessionStoreInstance) {
    sessionStoreInstance = new SessionStore(repoDir);
  }
  return sessionStoreInstance;
}

/**
 * Resets the singleton SessionStore instance (for testing).
 */
export function resetSessionStore(): void {
  sessionStoreInstance = null;
}

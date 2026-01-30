import { WebSocket } from 'ws';
import type { SessionCreateClientMessage, SessionCreateServerMessage, Session } from '@ccsandbox/shared';
import { getSessionStore, WorkspaceExistsError } from '../persistence/session-store.js';
import { cloneRepository, GitOperationError } from '../services/git.service.js';
import {
  hasDevcontainerConfig,
  startDevcontainer,
  DevcontainerConfigNotFoundError,
  DevcontainerCliError,
} from '../services/devcontainer.service.js';
import { getConfig } from '../config.js';

/**
 * Session creation WebSocket handler for a single connection
 */
export interface SessionCreateHandler {
  handleMessage: (message: SessionCreateClientMessage) => void;
  cleanup: () => void;
}

/**
 * Send a message to the WebSocket client
 */
function sendMessage(ws: WebSocket, message: SessionCreateServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Send a log message
 */
function sendLog(ws: WebSocket, data: string): void {
  sendMessage(ws, { type: 'session-log', data });
}

/**
 * Send an error message and close the connection
 */
function sendError(ws: WebSocket, message: string): void {
  sendMessage(ws, { type: 'session-error', message });
  ws.close();
}

/**
 * Send a success message with the created session and close the connection
 */
function sendCreated(ws: WebSocket, session: Session): void {
  sendMessage(ws, { type: 'session-created', session });
  ws.close();
}

/**
 * Create a session creation handler for a WebSocket connection
 */
export function createSessionCreateHandler(ws: WebSocket): SessionCreateHandler {
  let isCreating = false;

  /**
   * Handle create-session message
   */
  async function handleCreateSession(message: SessionCreateClientMessage): Promise<void> {
    // Prevent multiple concurrent creations
    if (isCreating) {
      sendError(ws, 'Session creation already in progress');
      return;
    }

    isCreating = true;

    const config = getConfig();
    const sessionStore = getSessionStore(config.configDir, config.repoDir);

    const { title, repo, baseBranch, workBranch, shell } = message;

    // Validate required fields
    if (!repo || !baseBranch || !workBranch) {
      sendError(ws, 'Missing required fields: repo, baseBranch, workBranch');
      isCreating = false;
      return;
    }

    // Check if PAT is configured
    if (!config.pat) {
      sendError(ws, 'GitHub PAT is not configured. Please configure it in Settings.');
      isCreating = false;
      return;
    }

    const sessionTitle = title || `${repo.split('/').pop()} - ${workBranch}`;
    let session: Session | null = null;

    try {
      // Step 1: Create session record
      sendLog(ws, `Creating session: ${sessionTitle}\n`);
      session = await sessionStore.create({
        title: sessionTitle,
        repo,
        apiBase: config.apiBase,
        baseBranch,
        workBranch,
        shell,
      });
      sendLog(ws, `Session created with ID: ${session.sessionId}\n\n`);

      // Step 2: Clone repository
      sendLog(ws, `=== Git Clone ===\n`);
      try {
        await cloneRepository({
          apiBase: config.apiBase,
          repo,
          pat: config.pat!,
          workspacePath: session.workspacePath,
          baseBranch,
          workBranch,
          onLog: (data) => sendLog(ws, data),
        });
      } catch (error) {
        // Clone failed - update session state to ERROR
        await sessionStore.update(session.sessionId, { state: 'ERROR' });
        throw error;
      }

      sendLog(ws, `\n`);

      // Step 3: Check for devcontainer config
      sendLog(ws, `=== Checking devcontainer config ===\n`);
      const hasConfig = await hasDevcontainerConfig(session.workspacePath);
      if (!hasConfig) {
        await sessionStore.update(session.sessionId, { state: 'ERROR' });
        throw new DevcontainerConfigNotFoundError(session.workspacePath);
      }
      sendLog(ws, `Found .devcontainer configuration\n\n`);

      // Step 4: Start devcontainer
      sendLog(ws, `=== Starting devcontainer ===\n`);
      try {
        const containerInfo = await startDevcontainer({
          workspacePath: session.workspacePath,
          devcontainerCliPath: config.devcontainerCli,
          onLog: (data) => sendLog(ws, data),
          dotfilesRepository: config.dotfilesRepository,
          dotfilesTargetPath: config.dotfilesTargetPath,
          dotfilesInstallCommand: config.dotfilesInstallCommand,
        });

        // Update session with container info
        const updatedSession = await sessionStore.update(session.sessionId, {
          state: 'RUNNING',
          containerId: containerInfo.containerId,
          containerName: containerInfo.containerName,
        });

        sendLog(ws, `\n=== Session ready ===\n`);
        sendCreated(ws, updatedSession);
      } catch (error) {
        // Devcontainer failed
        await sessionStore.update(session.sessionId, { state: 'ERROR' });
        throw error;
      }
    } catch (error) {
      let errorMessage: string;

      if (error instanceof WorkspaceExistsError) {
        errorMessage = `Workspace already exists: ${error.workspacePath}`;
      } else if (error instanceof GitOperationError) {
        errorMessage = `Git ${error.operation} failed: ${error.stderr}`;
      } else if (error instanceof DevcontainerConfigNotFoundError) {
        errorMessage = 'Repository does not contain a .devcontainer configuration';
      } else if (error instanceof DevcontainerCliError) {
        errorMessage = `Devcontainer CLI failed: ${error.message}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = 'Unknown error occurred';
      }

      sendLog(ws, `\nError: ${errorMessage}\n`);
      sendError(ws, errorMessage);
    } finally {
      isCreating = false;
    }
  }

  /**
   * Process incoming WebSocket messages
   */
  function handleMessage(message: SessionCreateClientMessage): void {
    if (message.type === 'create-session') {
      handleCreateSession(message).catch((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Unexpected error';
        sendError(ws, errorMessage);
      });
    } else {
      sendError(ws, 'Unknown message type');
    }
  }

  /**
   * Clean up resources when connection closes
   */
  function cleanup(): void {
    // Nothing to clean up for now
    // Future: could abort in-progress creation
  }

  return {
    handleMessage,
    cleanup,
  };
}

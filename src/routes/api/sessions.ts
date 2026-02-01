import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { CreateSessionRequest, ApiResponse, Session, DiffStatsResponse, DiffDetailResponse, AddPortForwardingRequest, PortForwardingListResponse, PortForwarding } from '../../shared/index.js';
import { getConfig } from '../../config.js';
import {
  getSessionStore,
  resetSessionStore,
  SessionNotFoundError,
  WorkspaceExistsError,
} from '../../persistence/session-store.js';
import { cloneRepository, GitOperationError, getDiffStats, getDiffDetail } from '../../services/git.service.js';
import { getAuthenticatedUsername } from '../../services/github.service.js';
import {
  hasDevcontainerConfig,
  startDevcontainer,
  stopContainer,
  removeContainer,
  isContainerRunning,
  DevcontainerConfigNotFoundError,
  DevcontainerCliError,
  DockerOperationError,
} from '../../services/devcontainer.service.js';
import { getTerminalManager } from '../../services/terminal.service.js';
import { getClaudeManager } from '../../services/claude/index.js';
import { getConnectionManager } from '../../websocket/connection-manager.js';
import {
  getPortForwardingManager,
  PortForwardingError,
  PortInUseError,
  PortForwardingNotFoundError,
} from '../../services/port-forwarding.service.js';

const router = Router();

/**
 * Async handler wrapper to catch errors.
 */
function asyncHandler<P = Record<string, string>>(
  fn: (req: Request<P>, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request<P>, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * POST /api/sessions
 * Create a new session (git clone + devcontainer up).
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CreateSessionRequest;
    const config = getConfig();
    const store = getSessionStore(getConfig().configDir, getConfig().repoDir);

    // Validate request
    if (!body.title || !body.repo || !body.baseBranch || !body.workBranch) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing required fields: title, repo, baseBranch, workBranch',
      };
      res.status(400).json(response);
      return;
    }

    // Check if PAT is configured
    if (!config.pat) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'GitHub PAT is not configured. Please configure it in Settings.',
      };
      res.status(401).json(response);
      return;
    }

    try {
      // Step 1: Create session record
      const session = await store.create({
        title: body.title,
        repo: body.repo,
        apiBase: config.apiBase,
        baseBranch: body.baseBranch,
        workBranch: body.workBranch,
      });

      // Step 2: Clone repository
      try {
        await cloneRepository({
          apiBase: config.apiBase,
          repo: body.repo,
          pat: config.pat!,
          workspacePath: session.workspacePath,
          baseBranch: body.baseBranch,
          workBranch: body.workBranch,
        });
      } catch (error) {
        // Clone failed - update session state to ERROR
        await store.update(session.sessionId, { state: 'ERROR' });
        throw error;
      }

      // Step 3: Check for devcontainer config
      const hasConfig = await hasDevcontainerConfig(session.workspacePath);
      if (!hasConfig) {
        await store.update(session.sessionId, { state: 'ERROR' });
        throw new DevcontainerConfigNotFoundError(session.workspacePath);
      }

      // Step 4: Get GitHub username
      const username = await getAuthenticatedUsername(config.pat!, config.apiBase);

      // Step 5: Start devcontainer
      try {
        const containerInfo = await startDevcontainer({
          workspacePath: session.workspacePath,
          devcontainerCliPath: config.devcontainerCli,
          dotfilesRepository: config.dotfilesRepository,
          dotfilesTargetPath: config.dotfilesTargetPath,
          dotfilesInstallCommand: config.dotfilesInstallCommand,
          gitCredential: {
            apiBase: config.apiBase,
            pat: config.pat!,
            username,
            configDir: config.configDir,
            sessionId: session.sessionId,
          },
        });

        // Update session with container info
        const updatedSession = await store.update(session.sessionId, {
          state: 'RUNNING',
          containerId: containerInfo.containerId,
          containerName: containerInfo.containerName,
        });

        const response: ApiResponse<{ session: Session }> = {
          success: true,
          data: { session: updatedSession },
        };
        res.status(201).json(response);
      } catch (error) {
        // Devcontainer failed - session is in READY state (workspace exists)
        await store.update(session.sessionId, { state: 'ERROR' });
        throw error;
      }
    } catch (error) {
      if (error instanceof WorkspaceExistsError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Workspace already exists: ${error.workspacePath}`,
        };
        res.status(409).json(response);
        return;
      }

      if (error instanceof GitOperationError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Git operation failed: ${error.operation} - ${error.stderr}`,
        };
        res.status(500).json(response);
        return;
      }

      if (error instanceof DevcontainerConfigNotFoundError) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Repository does not contain a .devcontainer configuration',
        };
        res.status(400).json(response);
        return;
      }

      if (error instanceof DevcontainerCliError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Devcontainer CLI failed: ${error.message}`,
        };
        res.status(500).json(response);
        return;
      }

      throw error;
    }
  })
);

/**
 * GET /api/sessions
 * List all sessions.
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const store = getSessionStore(getConfig().configDir, getConfig().repoDir);
    const sessions = await store.list();

    const response: ApiResponse<{ sessions: Session[] }> = {
      success: true,
      data: { sessions },
    };
    res.json(response);
  })
);

/**
 * GET /api/sessions/:id
 * Get a session by ID.
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const store = getSessionStore(getConfig().configDir, getConfig().repoDir);

    try {
      const session = await store.get(id);

      // Check actual container status if containerId exists
      if (session.containerId) {
        const running = await isContainerRunning(session.containerId);
        if (running && session.state !== 'RUNNING') {
          await store.update(id, { state: 'RUNNING' });
          session.state = 'RUNNING';
        } else if (!running && session.state === 'RUNNING') {
          await store.update(id, { state: 'STOPPED' });
          session.state = 'STOPPED';
        }
      }

      const response: ApiResponse<{ session: Session }> = {
        success: true,
        data: { session },
      };
      res.json(response);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Session not found: ${id}`,
        };
        res.status(404).json(response);
        return;
      }
      throw error;
    }
  })
);

/**
 * DELETE /api/sessions/:id
 * Delete a session.
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const store = getSessionStore(getConfig().configDir, getConfig().repoDir);

    try {
      const session = await store.get(id);

      // Remove container if it exists
      if (session.containerId) {
        try {
          await removeContainer(session.containerId, true);
        } catch {
          // Ignore errors when removing container (it might not exist)
        }
      }

      // Remove workspace directory
      if (session.workspacePath) {
        try {
          await rm(session.workspacePath, { recursive: true, force: true });
        } catch {
          // Ignore errors when removing directory (it might not exist)
        }
      }

      await store.delete(id);

      const response: ApiResponse<null> = {
        success: true,
      };
      res.json(response);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Session not found: ${id}`,
        };
        res.status(404).json(response);
        return;
      }
      throw error;
    }
  })
);

/**
 * POST /api/sessions/:id/start
 * Start the container for a session.
 */
router.post(
  '/:id/start',
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const store = getSessionStore(getConfig().configDir, getConfig().repoDir);
    const config = getConfig();

    try {
      const session = await store.get(id);

      // Get GitHub username if PAT is configured
      const username = config.pat
        ? await getAuthenticatedUsername(config.pat, config.apiBase)
        : undefined;

      // devcontainer up is idempotent - it starts stopped containers or reuses running ones
      const containerInfo = await startDevcontainer({
        workspacePath: session.workspacePath,
        devcontainerCliPath: config.devcontainerCli,
        dotfilesRepository: config.dotfilesRepository,
        dotfilesTargetPath: config.dotfilesTargetPath,
        dotfilesInstallCommand: config.dotfilesInstallCommand,
        gitCredential: config.pat && username
          ? { apiBase: config.apiBase, pat: config.pat, username, configDir: config.configDir, sessionId: id }
          : undefined,
      });

      const updatedSession = await store.update(id, {
        state: 'RUNNING',
        containerId: containerInfo.containerId,
        containerName: containerInfo.containerName,
      });

      const response: ApiResponse<{ session: Session }> = {
        success: true,
        data: { session: updatedSession },
      };
      res.json(response);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Session not found: ${id}`,
        };
        res.status(404).json(response);
        return;
      }

      if (error instanceof DockerOperationError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Failed to start container: ${error.stderr}`,
        };
        res.status(500).json(response);
        return;
      }

      if (error instanceof DevcontainerCliError) {
        await store.update(id, { state: 'ERROR' });
        const response: ApiResponse<null> = {
          success: false,
          error: `Devcontainer CLI failed: ${error.message}`,
        };
        res.status(500).json(response);
        return;
      }

      throw error;
    }
  })
);

/**
 * POST /api/sessions/:id/stop
 * Stop the container for a session.
 */
router.post(
  '/:id/stop',
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const store = getSessionStore(getConfig().configDir, getConfig().repoDir);

    try {
      const session = await store.get(id);

      if (!session.containerId) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Session has no container to stop',
        };
        res.status(400).json(response);
        return;
      }

      // Clean up terminal, Claude processes, port forwardings, and tabs for this session
      getTerminalManager().killBySession(id);
      getClaudeManager().killBySession(id);
      getPortForwardingManager().stopAll(id);
      getConnectionManager().clearSessionTabs(id);

      // Check if container is actually running
      const running = await isContainerRunning(session.containerId);
      if (!running) {
        // Already stopped, just update state
        const updatedSession = await store.update(id, { state: 'STOPPED' });
        const response: ApiResponse<{ session: Session }> = {
          success: true,
          data: { session: updatedSession },
        };
        res.json(response);
        return;
      }

      // Stop the container
      await stopContainer(session.containerId);

      const updatedSession = await store.update(id, { state: 'STOPPED' });

      const response: ApiResponse<{ session: Session }> = {
        success: true,
        data: { session: updatedSession },
      };
      res.json(response);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Session not found: ${id}`,
        };
        res.status(404).json(response);
        return;
      }

      if (error instanceof DockerOperationError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Failed to stop container: ${error.stderr}`,
        };
        res.status(500).json(response);
        return;
      }

      throw error;
    }
  })
);

/**
 * GET /api/sessions/:id/diff/stats
 * Get diff statistics for a session.
 */
router.get(
  '/:id/diff/stats',
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const store = getSessionStore(getConfig().configDir, getConfig().repoDir);

    try {
      const session = await store.get(id);

      const stats = await getDiffStats(session.workspacePath);

      const response: ApiResponse<DiffStatsResponse> = {
        success: true,
        data: { stats },
      };
      res.json(response);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Session not found: ${id}`,
        };
        res.status(404).json(response);
        return;
      }
      throw error;
    }
  })
);

/**
 * GET /api/sessions/:id/diff
 * Get detailed diff for a session.
 */
router.get(
  '/:id/diff',
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const store = getSessionStore(getConfig().configDir, getConfig().repoDir);

    try {
      const session = await store.get(id);

      const { files, stats } = await getDiffDetail(session.workspacePath);

      const response: ApiResponse<DiffDetailResponse> = {
        success: true,
        data: { files, stats },
      };
      res.json(response);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Session not found: ${id}`,
        };
        res.status(404).json(response);
        return;
      }
      throw error;
    }
  })
);

/**
 * GET /api/sessions/:id/ports
 * List port forwardings for a session.
 */
router.get(
  '/:id/ports',
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const store = getSessionStore(getConfig().configDir, getConfig().repoDir);

    try {
      // Verify session exists
      await store.get(id);

      const portForwardings = getPortForwardingManager().list(id);

      const response: ApiResponse<PortForwardingListResponse> = {
        success: true,
        data: { portForwardings },
      };
      res.json(response);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Session not found: ${id}`,
        };
        res.status(404).json(response);
        return;
      }
      throw error;
    }
  })
);

/**
 * POST /api/sessions/:id/ports
 * Add a new port forwarding for a session.
 */
router.post(
  '/:id/ports',
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const body = req.body as AddPortForwardingRequest;
    const store = getSessionStore(getConfig().configDir, getConfig().repoDir);

    // Validate request
    if (!body.hostPort || !body.containerPort) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing required fields: hostPort, containerPort',
      };
      res.status(400).json(response);
      return;
    }

    try {
      const session = await store.get(id);

      if (session.state !== 'RUNNING' || !session.containerId) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Session must be running to add port forwarding',
        };
        res.status(400).json(response);
        return;
      }

      // Start port forwarding
      const portForwarding = await getPortForwardingManager().start(
        id,
        session.containerId,
        body.hostPort,
        body.containerPort,
        body.label
      );

      // Update session with new port forwarding
      const currentForwardings = getPortForwardingManager().list(id);
      await store.update(id, { portForwardings: currentForwardings });

      const response: ApiResponse<{ portForwarding: PortForwarding }> = {
        success: true,
        data: { portForwarding },
      };
      res.status(201).json(response);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Session not found: ${id}`,
        };
        res.status(404).json(response);
        return;
      }

      if (error instanceof PortInUseError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Port ${error.port} is already in use`,
        };
        res.status(409).json(response);
        return;
      }

      if (error instanceof PortForwardingError) {
        const response: ApiResponse<null> = {
          success: false,
          error: error.message,
        };
        res.status(400).json(response);
        return;
      }

      throw error;
    }
  })
);

/**
 * DELETE /api/sessions/:id/ports/:portId
 * Remove a port forwarding from a session.
 */
router.delete(
  '/:id/ports/:portId',
  asyncHandler(async (req: Request<{ id: string; portId: string }>, res: Response) => {
    const { id, portId } = req.params;
    const store = getSessionStore(getConfig().configDir, getConfig().repoDir);

    try {
      // Verify session exists
      await store.get(id);

      // Stop port forwarding
      getPortForwardingManager().stop(id, portId);

      // Update session with remaining port forwardings
      const currentForwardings = getPortForwardingManager().list(id);
      await store.update(id, { portForwardings: currentForwardings });

      const response: ApiResponse<null> = {
        success: true,
      };
      res.json(response);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Session not found: ${id}`,
        };
        res.status(404).json(response);
        return;
      }

      if (error instanceof PortForwardingNotFoundError) {
        const response: ApiResponse<null> = {
          success: false,
          error: `Port forwarding not found: ${portId}`,
        };
        res.status(404).json(response);
        return;
      }

      throw error;
    }
  })
);

// Re-export resetSessionStore for testing
export { resetSessionStore };

export default router;

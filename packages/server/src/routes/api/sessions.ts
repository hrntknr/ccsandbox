import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { rm } from 'node:fs/promises';
import type { CreateSessionRequest, ApiResponse, Session } from '@ccsandbox/shared';
import { getConfig } from '../../config.js';
import {
  getSessionStore,
  resetSessionStore,
  SessionNotFoundError,
  WorkspaceExistsError,
} from '../../persistence/session-store.js';
import { cloneRepository, GitOperationError } from '../../services/git.service.js';
import {
  hasDevcontainerConfig,
  startDevcontainer,
  removeContainer,
  isContainerRunning,
  DevcontainerConfigNotFoundError,
  DevcontainerCliError,
  DockerOperationError,
} from '../../services/devcontainer.service.js';

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
    const store = getSessionStore(getConfig().repoDir);

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

      // Step 4: Start devcontainer
      try {
        const containerInfo = await startDevcontainer({
          workspacePath: session.workspacePath,
          devcontainerCliPath: config.devcontainerCli,
          dotfilesRepository: config.dotfilesRepository,
          dotfilesTargetPath: config.dotfilesTargetPath,
          dotfilesInstallCommand: config.dotfilesInstallCommand,
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
    const store = getSessionStore(getConfig().repoDir);
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
    const store = getSessionStore(getConfig().repoDir);

    try {
      const session = await store.get(id);

      // Check actual container status if containerId exists
      if (session.containerId) {
        const running = await isContainerRunning(session.containerId);
        if (running && session.state !== 'RUNNING') {
          await store.update(id, { state: 'RUNNING' });
          session.state = 'RUNNING';
        } else if (!running && session.state === 'RUNNING') {
          await store.update(id, { state: 'READY' });
          session.state = 'READY';
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
    const store = getSessionStore(getConfig().repoDir);

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
    const store = getSessionStore(getConfig().repoDir);
    const config = getConfig();

    try {
      const session = await store.get(id);

      // devcontainer up is idempotent - it starts stopped containers or reuses running ones
      const containerInfo = await startDevcontainer({
        workspacePath: session.workspacePath,
        devcontainerCliPath: config.devcontainerCli,
        dotfilesRepository: config.dotfilesRepository,
        dotfilesTargetPath: config.dotfilesTargetPath,
        dotfilesInstallCommand: config.dotfilesInstallCommand,
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

// Re-export resetSessionStore for testing
export { resetSessionStore };

export default router;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sessionsRouter, { resetSessionStore } from '../routes/api/sessions.js';
import { setConfig, type ServerConfig } from '../config.js';
import * as gitService from '../services/git.service.js';
import * as devcontainerService from '../services/devcontainer.service.js';

// Mock git, github, and devcontainer services
vi.mock('../services/git.service.js', () => ({
  cloneRepository: vi.fn(),
  getGitStatus: vi.fn(),
  GitOperationError: class GitOperationError extends Error {
    constructor(
      public operation: string,
      public exitCode: number | null,
      public stderr: string
    ) {
      super(`Git ${operation} failed: ${stderr}`);
      this.name = 'GitOperationError';
    }
  },
}));

vi.mock('../services/github.service.js', () => ({
  getAuthenticatedUsername: vi.fn().mockResolvedValue('test-user'),
}));

vi.mock('../services/devcontainer.service.js', async () => {
  const actual = await vi.importActual('../services/devcontainer.service.js');
  return {
    ...(actual as object),
    hasDevcontainerConfig: vi.fn(),
    startDevcontainer: vi.fn(),
    removeContainer: vi.fn(),
    isContainerRunning: vi.fn(),
    waitForContainerReady: vi.fn(),
  };
});

describe('sessions routes', () => {
  let app: Express;
  let testDir: string;
  let config: ServerConfig;

  beforeEach(async () => {
    // Create temp directory for tests
    testDir = join(
      tmpdir(),
      `sessions-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });

    // Set up config
    config = {
      pat: 'test-pat',
      apiBase: 'https://api.github.com',
      configDir: testDir,
      repoDir: testDir,
      listen: '127.0.0.1',
      port: 3000,
      devcontainerCli: 'devcontainer',
    };
    setConfig(config);

    // Reset session store to use new config
    resetSessionStore();

    // Set up express app
    app = express();
    app.use(express.json());
    app.use('/api/sessions', sessionsRouter);

    // Reset mocks
    vi.resetAllMocks();
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.resetAllMocks();
  });

  describe('POST /api/sessions', () => {
    it('creates a new session successfully', async () => {
      const createRequest = {
        title: 'Test Session',
        repo: 'owner/repo',
        baseBranch: 'main',
        workBranch: 'feature/test',
      };

      // Mock git clone to create the workspace directory
      vi.mocked(gitService.cloneRepository).mockImplementation(async (options) => {
        await mkdir(options.workspacePath, { recursive: true });
        await mkdir(join(options.workspacePath, '.devcontainer'));
        await writeFile(
          join(options.workspacePath, '.devcontainer', 'devcontainer.json'),
          '{}'
        );
      });

      vi.mocked(devcontainerService.hasDevcontainerConfig).mockResolvedValue(true);
      vi.mocked(devcontainerService.startDevcontainer).mockResolvedValue({
        containerId: 'container123',
        containerName: 'test-container',
        remoteUser: 'vscode',
      });

      const response = await request(app)
        .post('/api/sessions')
        .send(createRequest)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.session).toMatchObject({
        title: 'Test Session',
        repo: 'owner/repo',
        baseBranch: 'main',
        workBranch: 'feature/test',
        state: 'RUNNING',
        containerId: 'container123',
        containerName: 'test-container',
      });
      expect(response.body.data.session.sessionId).toBeDefined();
    });

    it('returns 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/api/sessions')
        .send({ title: 'Test' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });

    it('returns 400 when devcontainer config is not found', async () => {
      const createRequest = {
        title: 'Test Session',
        repo: 'owner/repo',
        baseBranch: 'main',
        workBranch: 'feature/no-devcontainer',
      };

      vi.mocked(gitService.cloneRepository).mockImplementation(async (options) => {
        await mkdir(options.workspacePath, { recursive: true });
      });

      vi.mocked(devcontainerService.hasDevcontainerConfig).mockResolvedValue(false);

      const response = await request(app)
        .post('/api/sessions')
        .send(createRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('devcontainer configuration');
    });

    it('returns 500 when git clone fails', async () => {
      const createRequest = {
        title: 'Test Session',
        repo: 'owner/repo',
        baseBranch: 'main',
        workBranch: 'feature/clone-fail',
      };

      vi.mocked(gitService.cloneRepository).mockRejectedValue(
        new gitService.GitOperationError('clone', 128, 'Authentication failed')
      );

      const response = await request(app)
        .post('/api/sessions')
        .send(createRequest)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Git operation failed');
    });
  });

  describe('GET /api/sessions', () => {
    it('returns empty list when no sessions exist', async () => {
      const response = await request(app).get('/api/sessions').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessions).toEqual([]);
    });

    it('returns list of sessions', async () => {
      // Create a session first
      const createRequest = {
        title: 'Test Session',
        repo: 'owner/repo',
        baseBranch: 'main',
        workBranch: 'feature/list-test',
      };

      vi.mocked(gitService.cloneRepository).mockImplementation(async (options) => {
        await mkdir(options.workspacePath, { recursive: true });
      });
      vi.mocked(devcontainerService.hasDevcontainerConfig).mockResolvedValue(true);
      vi.mocked(devcontainerService.startDevcontainer).mockResolvedValue({
        containerId: 'container123',
      });

      await request(app).post('/api/sessions').send(createRequest).expect(201);

      const response = await request(app).get('/api/sessions').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessions).toHaveLength(1);
      expect(response.body.data.sessions[0].title).toBe('Test Session');
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('returns session by ID', async () => {
      // Create a session first
      const createRequest = {
        title: 'Test Session',
        repo: 'owner/repo',
        baseBranch: 'main',
        workBranch: 'feature/get-test',
      };

      vi.mocked(gitService.cloneRepository).mockImplementation(async (options) => {
        await mkdir(options.workspacePath, { recursive: true });
      });
      vi.mocked(devcontainerService.hasDevcontainerConfig).mockResolvedValue(true);
      vi.mocked(devcontainerService.startDevcontainer).mockResolvedValue({
        containerId: 'container123',
      });
      vi.mocked(devcontainerService.isContainerRunning).mockResolvedValue(true);

      const createResponse = await request(app)
        .post('/api/sessions')
        .send(createRequest)
        .expect(201);

      const sessionId = createResponse.body.data.session.sessionId;

      const response = await request(app)
        .get(`/api/sessions/${sessionId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.session.sessionId).toBe(sessionId);
    });

    it('returns 404 when session not found', async () => {
      const response = await request(app)
        .get('/api/sessions/nonexistent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Session not found');
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('deletes session and workspace directory successfully', async () => {
      // Create a session first
      const createRequest = {
        title: 'Test Session',
        repo: 'owner/repo',
        baseBranch: 'main',
        workBranch: 'feature/delete-test',
      };

      let workspacePath: string = '';
      vi.mocked(gitService.cloneRepository).mockImplementation(async (options) => {
        workspacePath = options.workspacePath;
        await mkdir(options.workspacePath, { recursive: true });
      });
      vi.mocked(devcontainerService.hasDevcontainerConfig).mockResolvedValue(true);
      vi.mocked(devcontainerService.startDevcontainer).mockResolvedValue({
        containerId: 'container123',
      });
      vi.mocked(devcontainerService.removeContainer).mockResolvedValue(undefined);

      const createResponse = await request(app)
        .post('/api/sessions')
        .send(createRequest)
        .expect(201);

      const sessionId = createResponse.body.data.session.sessionId;

      // Verify workspace directory exists before deletion
      await expect(stat(workspacePath)).resolves.toBeDefined();

      const response = await request(app)
        .delete(`/api/sessions/${sessionId}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify session is deleted
      await request(app).get(`/api/sessions/${sessionId}`).expect(404);

      // Verify workspace directory is deleted
      await expect(stat(workspacePath)).rejects.toThrow('ENOENT');
    });

    it('returns 404 when session not found', async () => {
      const response = await request(app)
        .delete('/api/sessions/nonexistent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/sessions/:id/start', () => {
    it('starts container successfully', async () => {
      const createRequest = {
        title: 'Test Session',
        repo: 'owner/repo',
        baseBranch: 'main',
        workBranch: 'feature/start-test',
      };

      vi.mocked(gitService.cloneRepository).mockImplementation(async (options) => {
        await mkdir(options.workspacePath, { recursive: true });
      });
      vi.mocked(devcontainerService.hasDevcontainerConfig).mockResolvedValue(true);
      vi.mocked(devcontainerService.startDevcontainer).mockResolvedValue({
        containerId: 'container123',
      });

      const createResponse = await request(app)
        .post('/api/sessions')
        .send(createRequest)
        .expect(201);

      const sessionId = createResponse.body.data.session.sessionId;

      // Start endpoint is idempotent - can call on already running session
      const response = await request(app)
        .post(`/api/sessions/${sessionId}/start`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.session.state).toBe('RUNNING');
    });

    it('returns 404 when session not found', async () => {
      const response = await request(app)
        .post('/api/sessions/nonexistent-id/start')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/sessions/:id/git-status', () => {
    it('returns git status with uncommitted changes', async () => {
      // Create a session first
      const createRequest = {
        title: 'Test Session',
        repo: 'owner/repo',
        baseBranch: 'main',
        workBranch: 'feature/git-status-test',
      };

      vi.mocked(gitService.cloneRepository).mockImplementation(async (options) => {
        await mkdir(options.workspacePath, { recursive: true });
      });
      vi.mocked(devcontainerService.hasDevcontainerConfig).mockResolvedValue(true);
      vi.mocked(devcontainerService.startDevcontainer).mockResolvedValue({
        containerId: 'container123',
      });
      vi.mocked(gitService.getGitStatus).mockResolvedValue({
        hasUncommittedChanges: true,
        hasUnpushedCommits: true,
        uncommittedFileCount: 3,
        unpushedCommitCount: 2,
        currentBranch: 'feature/git-status-test',
      });

      const createResponse = await request(app)
        .post('/api/sessions')
        .send(createRequest)
        .expect(201);

      const sessionId = createResponse.body.data.session.sessionId;

      const response = await request(app)
        .get(`/api/sessions/${sessionId}/git-status`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toEqual({
        hasUncommittedChanges: true,
        hasUnpushedCommits: true,
        uncommittedFileCount: 3,
        unpushedCommitCount: 2,
        currentBranch: 'feature/git-status-test',
      });
    });

    it('returns git status with no changes', async () => {
      const createRequest = {
        title: 'Clean Session',
        repo: 'owner/repo',
        baseBranch: 'main',
        workBranch: 'feature/clean-status',
      };

      vi.mocked(gitService.cloneRepository).mockImplementation(async (options) => {
        await mkdir(options.workspacePath, { recursive: true });
      });
      vi.mocked(devcontainerService.hasDevcontainerConfig).mockResolvedValue(true);
      vi.mocked(devcontainerService.startDevcontainer).mockResolvedValue({
        containerId: 'container456',
      });
      vi.mocked(gitService.getGitStatus).mockResolvedValue({
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
        uncommittedFileCount: 0,
        unpushedCommitCount: 0,
        currentBranch: 'feature/clean-status',
      });

      const createResponse = await request(app)
        .post('/api/sessions')
        .send(createRequest)
        .expect(201);

      const sessionId = createResponse.body.data.session.sessionId;

      const response = await request(app)
        .get(`/api/sessions/${sessionId}/git-status`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status.hasUncommittedChanges).toBe(false);
      expect(response.body.data.status.hasUnpushedCommits).toBe(false);
    });

    it('returns 404 when session not found', async () => {
      const response = await request(app)
        .get('/api/sessions/nonexistent-id/git-status')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Session not found');
    });
  });
});

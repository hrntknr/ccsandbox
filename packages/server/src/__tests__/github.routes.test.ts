import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { setConfig } from '../config.js';
import http from 'node:http';

// Mock the github service
vi.mock('../services/github.service.js', () => ({
  listRepositories: vi.fn(),
  getRepository: vi.fn(),
  refreshRepositoriesCache: vi.fn(),
  GitHubApiError: class GitHubApiError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
      public readonly statusText: string
    ) {
      super(message);
      this.name = 'GitHubApiError';
    }
  },
}));

import {
  listRepositories,
  getRepository,
  refreshRepositoriesCache,
  GitHubApiError,
} from '../services/github.service.js';

describe('GitHub API routes', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    // Set up config
    setConfig({
      pat: 'test-pat',
      apiBase: 'https://api.github.com',
      configDir: '/tmp/test',
      repoDir: '/tmp/test/repo',
      listen: '127.0.0.1',
      port: 0,
    });

    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 3000;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe('GET /api/github/repos', () => {
    it('should return list of repositories', async () => {
      const mockRepos = [
        {
          fullName: 'owner/repo1',
          owner: 'owner',
          name: 'repo1',
          defaultBranch: 'main',
          isPrivate: false,
          description: 'Test repo',
          cloneUrl: 'https://github.com/owner/repo1.git',
        },
      ];

      vi.mocked(listRepositories).mockResolvedValueOnce(mockRepos);

      const response = await fetch(`${baseUrl}/api/github/repos`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        data: mockRepos,
      });
      expect(listRepositories).toHaveBeenCalledWith(
        'test-pat',
        'https://api.github.com'
      );
    });

    it('should return 401 on authentication error', async () => {
      vi.mocked(listRepositories).mockRejectedValueOnce(
        new GitHubApiError('Bad credentials', 401, 'Unauthorized')
      );

      const response = await fetch(`${baseUrl}/api/github/repos`);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toEqual({
        success: false,
        error: 'Authentication failed. Please check your GitHub PAT.',
      });
    });

    it('should return 403 on forbidden error', async () => {
      vi.mocked(listRepositories).mockRejectedValueOnce(
        new GitHubApiError('API rate limit exceeded', 403, 'Forbidden')
      );

      const response = await fetch(`${baseUrl}/api/github/repos`);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data).toEqual({
        success: false,
        error:
          'Access forbidden. This may be due to rate limiting or insufficient permissions.',
      });
    });
  });

  describe('POST /api/github/repos/refresh', () => {
    it('should refresh and return list of repositories', async () => {
      const mockRepos = [
        {
          fullName: 'owner/repo1',
          owner: 'owner',
          name: 'repo1',
          defaultBranch: 'main',
          isPrivate: false,
          description: 'Test repo',
          cloneUrl: 'https://github.com/owner/repo1.git',
        },
      ];

      vi.mocked(refreshRepositoriesCache).mockResolvedValueOnce(mockRepos);

      const response = await fetch(`${baseUrl}/api/github/repos/refresh`, {
        method: 'POST',
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        data: mockRepos,
      });
      expect(refreshRepositoriesCache).toHaveBeenCalledWith(
        'test-pat',
        'https://api.github.com'
      );
    });

    it('should return 401 on authentication error', async () => {
      vi.mocked(refreshRepositoriesCache).mockRejectedValueOnce(
        new GitHubApiError('Bad credentials', 401, 'Unauthorized')
      );

      const response = await fetch(`${baseUrl}/api/github/repos/refresh`, {
        method: 'POST',
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toEqual({
        success: false,
        error: 'Authentication failed. Please check your GitHub PAT.',
      });
    });
  });

  describe('GET /api/github/repos/:owner/:repo', () => {
    it('should return a specific repository', async () => {
      const mockRepo = {
        fullName: 'owner/repo',
        owner: 'owner',
        name: 'repo',
        defaultBranch: 'main',
        isPrivate: false,
        description: 'Test repo',
        cloneUrl: 'https://github.com/owner/repo.git',
      };

      vi.mocked(getRepository).mockResolvedValueOnce(mockRepo);

      const response = await fetch(`${baseUrl}/api/github/repos/owner/repo`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        data: mockRepo,
      });
      expect(getRepository).toHaveBeenCalledWith(
        'test-pat',
        'https://api.github.com',
        'owner',
        'repo'
      );
    });

    it('should return 404 when repository not found', async () => {
      vi.mocked(getRepository).mockRejectedValueOnce(
        new GitHubApiError('Not Found', 404, 'Not Found')
      );

      const response = await fetch(
        `${baseUrl}/api/github/repos/owner/nonexistent`
      );
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({
        success: false,
        error: 'Repository not found.',
      });
    });

    it('should return 500 on unknown error', async () => {
      vi.mocked(getRepository).mockRejectedValueOnce(new Error('Network error'));

      const response = await fetch(`${baseUrl}/api/github/repos/owner/repo`);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        success: false,
        error: 'Network error',
      });
    });
  });
});

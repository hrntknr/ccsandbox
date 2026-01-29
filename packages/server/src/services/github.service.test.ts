import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listRepositories,
  getRepository,
  getDefaultBranch,
  GitHubApiError,
} from './github.service.js';

describe('github.service', () => {
  const mockPat = 'test-pat-token';
  const mockApiBase = 'https://api.github.com';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('listRepositories', () => {
    it('should return a list of repositories', async () => {
      const mockResponse = [
        {
          full_name: 'owner/repo1',
          owner: { login: 'owner' },
          name: 'repo1',
          default_branch: 'main',
          private: false,
          description: 'Test repo 1',
          clone_url: 'https://github.com/owner/repo1.git',
        },
        {
          full_name: 'owner/repo2',
          owner: { login: 'owner' },
          name: 'repo2',
          default_branch: 'master',
          private: true,
          description: null,
          clone_url: 'https://github.com/owner/repo2.git',
        },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const repos = await listRepositories(mockPat, mockApiBase);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/user/repos?per_page=100&page=1&sort=updated',
        {
          headers: {
            Authorization: 'Bearer test-pat-token',
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      expect(repos).toHaveLength(2);
      expect(repos[0]).toEqual({
        fullName: 'owner/repo1',
        owner: 'owner',
        name: 'repo1',
        defaultBranch: 'main',
        isPrivate: false,
        description: 'Test repo 1',
        cloneUrl: 'https://github.com/owner/repo1.git',
      });
      expect(repos[1]).toEqual({
        fullName: 'owner/repo2',
        owner: 'owner',
        name: 'repo2',
        defaultBranch: 'master',
        isPrivate: true,
        description: null,
        cloneUrl: 'https://github.com/owner/repo2.git',
      });
    });

    it('should handle pagination', async () => {
      // Create 100 repos for page 1
      const page1Repos = Array.from({ length: 100 }, (_, i) => ({
        full_name: `owner/repo${i}`,
        owner: { login: 'owner' },
        name: `repo${i}`,
        default_branch: 'main',
        private: false,
        description: null,
        clone_url: `https://github.com/owner/repo${i}.git`,
      }));

      // Create 50 repos for page 2
      const page2Repos = Array.from({ length: 50 }, (_, i) => ({
        full_name: `owner/repo${100 + i}`,
        owner: { login: 'owner' },
        name: `repo${100 + i}`,
        default_branch: 'main',
        private: false,
        description: null,
        clone_url: `https://github.com/owner/repo${100 + i}.git`,
      }));

      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page1Repos),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page2Repos),
        } as Response);

      const repos = await listRepositories(mockPat, mockApiBase);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(repos).toHaveLength(150);
    });

    it('should throw GitHubApiError on 401 unauthorized', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ message: 'Bad credentials' }),
      } as Response);

      try {
        await listRepositories(mockPat, mockApiBase);
        expect.fail('Expected GitHubApiError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GitHubApiError);
        const apiError = error as GitHubApiError;
        expect(apiError.statusCode).toBe(401);
        expect(apiError.message).toBe('Bad credentials');
      }
    });

    it('should throw GitHubApiError on 403 forbidden (rate limit)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () =>
          Promise.resolve({ message: 'API rate limit exceeded' }),
      } as Response);

      await expect(listRepositories(mockPat, mockApiBase)).rejects.toThrow(
        GitHubApiError
      );
    });
  });

  describe('getRepository', () => {
    it('should return a specific repository', async () => {
      const mockResponse = {
        full_name: 'owner/repo',
        owner: { login: 'owner' },
        name: 'repo',
        default_branch: 'main',
        private: false,
        description: 'Test repository',
        clone_url: 'https://github.com/owner/repo.git',
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const repo = await getRepository(mockPat, mockApiBase, 'owner', 'repo');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo',
        {
          headers: {
            Authorization: 'Bearer test-pat-token',
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      expect(repo).toEqual({
        fullName: 'owner/repo',
        owner: 'owner',
        name: 'repo',
        defaultBranch: 'main',
        isPrivate: false,
        description: 'Test repository',
        cloneUrl: 'https://github.com/owner/repo.git',
      });
    });

    it('should throw GitHubApiError on 404 not found', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ message: 'Not Found' }),
      } as Response);

      try {
        await getRepository(mockPat, mockApiBase, 'owner', 'nonexistent');
        expect.fail('Expected GitHubApiError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GitHubApiError);
        const apiError = error as GitHubApiError;
        expect(apiError.statusCode).toBe(404);
      }
    });
  });

  describe('getDefaultBranch', () => {
    it('should return the default branch name', async () => {
      const mockResponse = {
        full_name: 'owner/repo',
        owner: { login: 'owner' },
        name: 'repo',
        default_branch: 'develop',
        private: false,
        description: null,
        clone_url: 'https://github.com/owner/repo.git',
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const branch = await getDefaultBranch(
        mockPat,
        mockApiBase,
        'owner',
        'repo'
      );

      expect(branch).toBe('develop');
    });
  });

  describe('GitHubApiError', () => {
    it('should have correct properties', () => {
      const error = new GitHubApiError('Test message', 404, 'Not Found');

      expect(error.name).toBe('GitHubApiError');
      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(404);
      expect(error.statusText).toBe('Not Found');
      expect(error).toBeInstanceOf(Error);
    });
  });
});

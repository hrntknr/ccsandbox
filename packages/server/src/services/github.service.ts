import type { Repository } from '@ccsandbox/shared';

/**
 * Cache for repository list.
 * Stores repositories with a timestamp for cache invalidation.
 */
interface RepositoryCache {
  repositories: Repository[];
  timestamp: number;
}

/** Cache TTL: 1 hour in milliseconds */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** In-memory cache keyed by `${pat}:${apiBase}` */
const repositoryCache = new Map<string, RepositoryCache>();

/** Background refresh timer */
let refreshTimer: ReturnType<typeof setInterval> | null = null;

/** Credentials for background refresh */
let backgroundRefreshCredentials: { pat: string; apiBase: string } | null = null;

/**
 * Get cache key for a given PAT and API base.
 */
function getCacheKey(pat: string, apiBase: string): string {
  return `${pat}:${apiBase}`;
}

/**
 * Clear all repository caches.
 * Primarily used for testing.
 */
export function clearRepositoryCache(): void {
  repositoryCache.clear();
}

/**
 * Start background cache refresh.
 * Refreshes the cache every hour automatically.
 */
export function startBackgroundRefresh(pat: string, apiBase: string): void {
  // Store credentials for refresh
  backgroundRefreshCredentials = { pat, apiBase };

  // Clear existing timer if any
  stopBackgroundRefresh();

  // Initial fetch
  fetchRepositoriesFromApi(pat, apiBase)
    .then((repos) => {
      const cacheKey = getCacheKey(pat, apiBase);
      repositoryCache.set(cacheKey, {
        repositories: repos,
        timestamp: Date.now(),
      });
      console.log(`[github] Initial cache loaded: ${repos.length} repositories`);
    })
    .catch((err) => {
      console.error('[github] Failed to load initial cache:', err);
    });

  // Set up periodic refresh
  refreshTimer = setInterval(async () => {
    if (!backgroundRefreshCredentials) return;

    try {
      const { pat: p, apiBase: a } = backgroundRefreshCredentials;
      const repos = await fetchRepositoriesFromApi(p, a);
      const cacheKey = getCacheKey(p, a);
      repositoryCache.set(cacheKey, {
        repositories: repos,
        timestamp: Date.now(),
      });
      console.log(`[github] Cache refreshed: ${repos.length} repositories`);
    } catch (err) {
      console.error('[github] Background refresh failed:', err);
    }
  }, CACHE_TTL_MS);
}

/**
 * Stop background cache refresh.
 */
export function stopBackgroundRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  backgroundRefreshCredentials = null;
}

/**
 * GitHub API error with status code.
 */
export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly statusText: string
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

/**
 * Raw repository response from GitHub API.
 */
interface GitHubRepoResponse {
  full_name: string;
  owner: {
    login: string;
  };
  name: string;
  default_branch: string;
  private: boolean;
  description: string | null;
  clone_url: string;
}

/**
 * Convert GitHub API response to Repository type.
 */
function toRepository(raw: GitHubRepoResponse): Repository {
  return {
    fullName: raw.full_name,
    owner: raw.owner.login,
    name: raw.name,
    defaultBranch: raw.default_branch,
    isPrivate: raw.private,
    description: raw.description,
    cloneUrl: raw.clone_url,
  };
}

/**
 * Make an authenticated request to the GitHub API.
 */
async function githubFetch<T>(
  pat: string,
  apiBase: string,
  path: string
): Promise<T> {
  const url = `${apiBase}${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const message = await getErrorMessage(response);
    throw new GitHubApiError(message, response.status, response.statusText);
  }

  return response.json() as Promise<T>;
}

/**
 * Extract error message from GitHub API error response.
 */
async function getErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) {
      return body.message;
    }
  } catch {
    // Ignore JSON parse errors
  }
  return response.statusText;
}

/**
 * Fetch repositories from GitHub API (bypasses cache).
 */
async function fetchRepositoriesFromApi(
  pat: string,
  apiBase: string
): Promise<Repository[]> {
  const repos: Repository[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const rawRepos = await githubFetch<GitHubRepoResponse[]>(
      pat,
      apiBase,
      `/user/repos?per_page=${perPage}&page=${page}&sort=updated`
    );

    repos.push(...rawRepos.map(toRepository));

    if (rawRepos.length < perPage) {
      break;
    }
    page++;
  }

  return repos;
}

/**
 * List repositories accessible to the authenticated user.
 * Uses cached data if available and not expired (1 hour TTL).
 */
export async function listRepositories(
  pat: string,
  apiBase: string
): Promise<Repository[]> {
  const cacheKey = getCacheKey(pat, apiBase);
  const cached = repositoryCache.get(cacheKey);

  // Return cached data if valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.repositories;
  }

  // Fetch fresh data
  const repos = await fetchRepositoriesFromApi(pat, apiBase);

  // Update cache
  repositoryCache.set(cacheKey, {
    repositories: repos,
    timestamp: Date.now(),
  });

  return repos;
}

/**
 * Force refresh the repository cache.
 * Returns the fresh repository list.
 */
export async function refreshRepositoriesCache(
  pat: string,
  apiBase: string
): Promise<Repository[]> {
  const cacheKey = getCacheKey(pat, apiBase);

  // Fetch fresh data
  const repos = await fetchRepositoriesFromApi(pat, apiBase);

  // Update cache
  repositoryCache.set(cacheKey, {
    repositories: repos,
    timestamp: Date.now(),
  });

  return repos;
}

/**
 * Get a specific repository by owner and name.
 */
export async function getRepository(
  pat: string,
  apiBase: string,
  owner: string,
  repo: string
): Promise<Repository> {
  const rawRepo = await githubFetch<GitHubRepoResponse>(
    pat,
    apiBase,
    `/repos/${owner}/${repo}`
  );
  return toRepository(rawRepo);
}

/**
 * Get the default branch of a repository.
 */
export async function getDefaultBranch(
  pat: string,
  apiBase: string,
  owner: string,
  repo: string
): Promise<string> {
  const repository = await getRepository(pat, apiBase, owner, repo);
  return repository.defaultBranch;
}

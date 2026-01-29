import type { Repository } from '@ccsandbox/shared';

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
 * List repositories accessible to the authenticated user.
 */
export async function listRepositories(
  pat: string,
  apiBase: string
): Promise<Repository[]> {
  // Fetch all repositories with pagination
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

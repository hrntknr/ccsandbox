/**
 * GitHub API error with status code.
 */
export class GitHubApiError extends Error {
    statusCode;
    statusText;
    constructor(message, statusCode, statusText) {
        super(message);
        this.statusCode = statusCode;
        this.statusText = statusText;
        this.name = 'GitHubApiError';
    }
}
/**
 * Convert GitHub API response to Repository type.
 */
function toRepository(raw) {
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
async function githubFetch(pat, apiBase, path) {
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
    return response.json();
}
/**
 * Extract error message from GitHub API error response.
 */
async function getErrorMessage(response) {
    try {
        const body = (await response.json());
        if (body.message) {
            return body.message;
        }
    }
    catch {
        // Ignore JSON parse errors
    }
    return response.statusText;
}
/**
 * List repositories accessible to the authenticated user.
 */
export async function listRepositories(pat, apiBase) {
    // Fetch all repositories with pagination
    const repos = [];
    let page = 1;
    const perPage = 100;
    while (true) {
        const rawRepos = await githubFetch(pat, apiBase, `/user/repos?per_page=${perPage}&page=${page}&sort=updated`);
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
export async function getRepository(pat, apiBase, owner, repo) {
    const rawRepo = await githubFetch(pat, apiBase, `/repos/${owner}/${repo}`);
    return toRepository(rawRepo);
}
/**
 * Get the default branch of a repository.
 */
export async function getDefaultBranch(pat, apiBase, owner, repo) {
    const repository = await getRepository(pat, apiBase, owner, repo);
    return repository.defaultBranch;
}
//# sourceMappingURL=github.service.js.map
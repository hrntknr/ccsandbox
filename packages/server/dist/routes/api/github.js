import { Router } from 'express';
import { getConfig } from '../../config.js';
import { listRepositories, getRepository, GitHubApiError, } from '../../services/github.service.js';
const router = Router();
/**
 * GET /api/github/repos
 * List repositories accessible to the authenticated user.
 */
router.get('/repos', async (_req, res) => {
    try {
        const { pat, apiBase } = getConfig();
        const repos = await listRepositories(pat, apiBase);
        const response = {
            success: true,
            data: repos,
        };
        res.json(response);
    }
    catch (error) {
        const response = {
            success: false,
            error: formatError(error),
        };
        res.status(getStatusCode(error)).json(response);
    }
});
/**
 * GET /api/github/repos/:owner/:repo
 * Get a specific repository by owner and name.
 */
router.get('/repos/:owner/:repo', async (req, res) => {
    try {
        const { pat, apiBase } = getConfig();
        const { owner, repo } = req.params;
        const repository = await getRepository(pat, apiBase, owner, repo);
        const response = {
            success: true,
            data: repository,
        };
        res.json(response);
    }
    catch (error) {
        const response = {
            success: false,
            error: formatError(error),
        };
        res.status(getStatusCode(error)).json(response);
    }
});
/**
 * Format error message for API response.
 * Ensures sensitive information (like PAT) is not exposed.
 */
function formatError(error) {
    if (error instanceof GitHubApiError) {
        if (error.statusCode === 401) {
            return 'Authentication failed. Please check your GitHub PAT.';
        }
        if (error.statusCode === 403) {
            return 'Access forbidden. This may be due to rate limiting or insufficient permissions.';
        }
        if (error.statusCode === 404) {
            return 'Repository not found.';
        }
        return `GitHub API error: ${error.message}`;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return 'Unknown error occurred';
}
/**
 * Get HTTP status code from error.
 */
function getStatusCode(error) {
    if (error instanceof GitHubApiError) {
        return error.statusCode;
    }
    return 500;
}
export default router;
//# sourceMappingURL=github.js.map
import type { Repository } from '@ccsandbox/shared';
/**
 * GitHub API error with status code.
 */
export declare class GitHubApiError extends Error {
    readonly statusCode: number;
    readonly statusText: string;
    constructor(message: string, statusCode: number, statusText: string);
}
/**
 * List repositories accessible to the authenticated user.
 */
export declare function listRepositories(pat: string, apiBase: string): Promise<Repository[]>;
/**
 * Get a specific repository by owner and name.
 */
export declare function getRepository(pat: string, apiBase: string, owner: string, repo: string): Promise<Repository>;
/**
 * Get the default branch of a repository.
 */
export declare function getDefaultBranch(pat: string, apiBase: string, owner: string, repo: string): Promise<string>;
//# sourceMappingURL=github.service.d.ts.map
/**
 * Options for cloning a repository.
 */
export interface CloneRepositoryOptions {
    /** GitHub API Base URL (e.g., https://api.github.com or https://ghe.example.com/api/v3) */
    apiBase: string;
    /** Repository in owner/repo format */
    repo: string;
    /** Personal Access Token */
    pat: string;
    /** Target directory for clone */
    workspacePath: string;
    /** Base branch to clone from */
    baseBranch: string;
    /** Work branch to create and checkout */
    workBranch: string;
    /** Callback for streaming log output */
    onLog?: (data: string) => void;
}
/**
 * Error thrown when git operations fail.
 */
export declare class GitOperationError extends Error {
    readonly operation: string;
    readonly exitCode: number | null;
    readonly stderr: string;
    constructor(operation: string, exitCode: number | null, stderr: string);
}
/**
 * Derives the git host from the API base URL.
 *
 * @param apiBase - GitHub API Base URL
 * @returns The hostname for git operations
 *
 * Examples:
 * - https://api.github.com -> github.com
 * - https://ghe.example.com/api/v3 -> ghe.example.com
 */
export declare function deriveGitHost(apiBase: string): string;
/**
 * Derives the clone URL from the API base URL and repository.
 *
 * @param apiBase - GitHub API Base URL
 * @param repo - Repository in owner/repo format
 * @returns The HTTPS clone URL
 *
 * Examples:
 * - (https://api.github.com, owner/repo) -> https://github.com/owner/repo.git
 * - (https://ghe.example.com/api/v3, owner/repo) -> https://ghe.example.com/owner/repo.git
 */
export declare function deriveCloneUrl(apiBase: string, repo: string): string;
/**
 * Sets up the credential helper by registering PAT with git credential approve.
 *
 * This uses stdin to pass credentials, avoiding exposure in process arguments or logs.
 *
 * @param apiBase - GitHub API Base URL
 * @param pat - Personal Access Token
 */
export declare function setupCredentialHelper(apiBase: string, pat: string): Promise<void>;
/**
 * Clones a repository and creates a work branch.
 *
 * This function:
 * 1. Sets up credential helper with PAT (via stdin, not in args)
 * 2. Clones the repository
 * 3. Creates and checks out the work branch from base branch
 *
 * @param options - Clone options
 * @throws GitOperationError if any git operation fails
 */
export declare function cloneRepository(options: CloneRepositoryOptions): Promise<void>;
//# sourceMappingURL=git.service.d.ts.map
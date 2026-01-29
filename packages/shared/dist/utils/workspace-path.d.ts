/**
 * Extracts the repository name from a full repository identifier.
 *
 * @param repo - Repository in "owner/name" format
 * @returns The name portion of the repository
 */
export declare function extractRepoName(repo: string): string;
/**
 * Generates a workspace directory name from repository and branch.
 *
 * Format: {repoName}.{workBranchEscaped}
 *
 * @param repo - Repository in "owner/name" format
 * @param workBranch - Work branch name
 * @returns Directory name for the workspace
 */
export declare function generateWorkspaceDirName(repo: string, workBranch: string): string;
/**
 * Generates the full workspace path.
 *
 * @param repoDir - Base directory for repositories
 * @param repo - Repository in "owner/name" format
 * @param workBranch - Work branch name
 * @returns Full path to the workspace directory
 */
export declare function generateWorkspacePath(repoDir: string, repo: string, workBranch: string): string;
//# sourceMappingURL=workspace-path.d.ts.map
import { join } from 'node:path';
import { escapeBranchName } from './branch-escape.js';
/**
 * Extracts the repository name from a full repository identifier.
 *
 * @param repo - Repository in "owner/name" format
 * @returns The name portion of the repository
 */
export function extractRepoName(repo) {
    const parts = repo.split('/');
    const name = parts[parts.length - 1];
    if (!name) {
        throw new Error(`Invalid repository format: ${repo}`);
    }
    return name;
}
/**
 * Generates a workspace directory name from repository and branch.
 *
 * Format: {repoName}.{workBranchEscaped}
 *
 * @param repo - Repository in "owner/name" format
 * @param workBranch - Work branch name
 * @returns Directory name for the workspace
 */
export function generateWorkspaceDirName(repo, workBranch) {
    const repoName = extractRepoName(repo);
    const escapedBranch = escapeBranchName(workBranch);
    return `${repoName}.${escapedBranch}`;
}
/**
 * Generates the full workspace path.
 *
 * @param repoDir - Base directory for repositories
 * @param repo - Repository in "owner/name" format
 * @param workBranch - Work branch name
 * @returns Full path to the workspace directory
 */
export function generateWorkspacePath(repoDir, repo, workBranch) {
    const dirName = generateWorkspaceDirName(repo, workBranch);
    return join(repoDir, dirName);
}
//# sourceMappingURL=workspace-path.js.map
import { join } from 'node:path';
import { escapeBranchName } from './branch-escape.js';

/**
 * Extracts the repository name from a full repository identifier.
 *
 * @param repo - Repository in "owner/name" format
 * @returns The name portion of the repository
 */
export function extractRepoName(repo: string): string {
  const parts = repo.split('/');
  const name = parts[parts.length - 1];
  if (!name) {
    throw new Error(`Invalid repository format: ${repo}`);
  }
  return name;
}

/**
 * Generates a random alphanumeric suffix.
 */
function generateRandomSuffix(length = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generates a workspace directory name from repository and branch.
 *
 * Format: {repoName}.{workBranchEscaped}.{randomSuffix}
 *
 * A random suffix is always appended to allow multiple sessions
 * on the same branch to coexist.
 *
 * @param repo - Repository in "owner/name" format
 * @param workBranch - Work branch name
 * @returns Directory name for the workspace
 */
export function generateWorkspaceDirName(
  repo: string,
  workBranch: string
): string {
  const repoName = extractRepoName(repo);
  const escapedBranch = escapeBranchName(workBranch);
  const suffix = generateRandomSuffix();
  return `${repoName}.${escapedBranch}.${suffix}`;
}

/**
 * Generates the full workspace path.
 *
 * @param repoDir - Base directory for repositories
 * @param repo - Repository in "owner/name" format
 * @param workBranch - Work branch name
 * @returns Full path to the workspace directory
 */
export function generateWorkspacePath(
  repoDir: string,
  repo: string,
  workBranch: string
): string {
  const dirName = generateWorkspaceDirName(repo, workBranch);
  return join(repoDir, dirName);
}

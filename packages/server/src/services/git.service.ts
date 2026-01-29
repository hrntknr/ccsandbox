import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

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
export class GitOperationError extends Error {
  constructor(
    public readonly operation: string,
    public readonly exitCode: number | null,
    public readonly stderr: string
  ) {
    super(`Git ${operation} failed (exit code: ${exitCode}): ${stderr}`);
    this.name = 'GitOperationError';
  }
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
export function deriveGitHost(apiBase: string): string {
  const url = new URL(apiBase);
  if (url.hostname === 'api.github.com') {
    return 'github.com';
  }
  return url.hostname;
}

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
export function deriveCloneUrl(apiBase: string, repo: string): string {
  const host = deriveGitHost(apiBase);
  return `https://${host}/${repo}.git`;
}

/**
 * Executes a command using spawn and returns a promise.
 */
function execCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    stdin?: string;
    onLog?: (data: string) => void;
    env?: Record<string, string>;
  } = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: options.env ? { ...process.env, ...options.env } : undefined,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      const str = data.toString();
      stdout += str;
      options.onLog?.(str);
    });

    proc.stderr.on('data', (data: Buffer) => {
      const str = data.toString();
      stderr += str;
      options.onLog?.(str);
    });

    if (options.stdin !== undefined) {
      proc.stdin.write(options.stdin);
      proc.stdin.end();
    }

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new GitOperationError('command', code, stderr));
      }
    });

    proc.on('error', (err) => {
      reject(new GitOperationError('command', null, err.message));
    });
  });
}

/**
 * Creates a temporary askpass script that outputs the PAT.
 *
 * This avoids exposing the PAT in process arguments or logs.
 * The script reads the password from an environment variable.
 *
 * @returns Path to the temporary askpass script
 */
export async function createAskpassScript(): Promise<string> {
  const scriptPath = join(tmpdir(), `git-askpass-${randomBytes(8).toString('hex')}.sh`);

  // Script reads password from environment variable (set at spawn time)
  const scriptContent = `#!/bin/sh
echo "$GIT_ASKPASS_PASSWORD"
`;

  await writeFile(scriptPath, scriptContent, { mode: 0o700 });
  return scriptPath;
}

/**
 * Cleans up the askpass script.
 *
 * @param scriptPath - Path to the askpass script to remove
 */
export async function cleanupAskpassScript(scriptPath: string): Promise<void> {
  try {
    await unlink(scriptPath);
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Clones a repository and creates a work branch.
 *
 * This function:
 * 1. Creates a temporary askpass script for authentication
 * 2. Clones the repository using GIT_ASKPASS
 * 3. Creates and checks out the work branch from base branch
 * 4. Cleans up the temporary askpass script
 *
 * @param options - Clone options
 * @throws GitOperationError if any git operation fails
 */
export async function cloneRepository(
  options: CloneRepositoryOptions
): Promise<void> {
  const { apiBase, repo, pat, workspacePath, baseBranch, workBranch, onLog } = options;

  // Step 1: Create askpass script for authentication
  onLog?.(`Setting up credentials for ${apiBase}\n`);
  const askpassScript = await createAskpassScript();

  try {
    // Step 2: Derive clone URL and execute clone with GIT_ASKPASS
    const cloneUrl = deriveCloneUrl(apiBase, repo);
    onLog?.(`Cloning ${repo} from ${cloneUrl}\n`);

    try {
      await execCommand('git', ['clone', '--branch', baseBranch, '--progress', cloneUrl, workspacePath], {
        onLog,
        env: {
          GIT_ASKPASS: askpassScript,
          GIT_ASKPASS_PASSWORD: pat,
          GIT_TERMINAL_PROMPT: '0',
        },
      });
    } catch (error) {
      if (error instanceof GitOperationError) {
        throw new GitOperationError('clone', error.exitCode, error.stderr);
      }
      throw error;
    }

    // Step 3: Create and checkout work branch
    onLog?.(`Creating work branch: ${workBranch} from ${baseBranch}\n`);
    try {
      await execCommand('git', ['checkout', '-b', workBranch, baseBranch], {
        cwd: workspacePath,
        onLog,
      });
    } catch (error) {
      if (error instanceof GitOperationError) {
        throw new GitOperationError('checkout', error.exitCode, error.stderr);
      }
      throw error;
    }
    onLog?.(`Git clone completed successfully\n`);
  } finally {
    // Step 4: Clean up askpass script
    await cleanupAskpassScript(askpassScript);
  }
}

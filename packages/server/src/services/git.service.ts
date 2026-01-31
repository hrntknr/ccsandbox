import { spawn } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { DiffStats, FileDiff, DiffHunk, DiffLine } from '@ccsandbox/shared';

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

/**
 * Gets a list of untracked files in the repository.
 *
 * @param workspacePath - Path to the git repository
 * @returns Array of untracked file paths
 */
async function getUntrackedFiles(workspacePath: string): Promise<string[]> {
  try {
    const { stdout } = await execCommand(
      'git',
      ['ls-files', '--others', '--exclude-standard'],
      { cwd: workspacePath }
    );
    return stdout.trim().split('\n').filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

/**
 * Creates a FileDiff for an untracked (new) file.
 *
 * @param workspacePath - Path to the git repository
 * @param filePath - Relative path to the file
 * @returns FileDiff object or null if file cannot be read
 */
async function createUntrackedFileDiff(
  workspacePath: string,
  filePath: string
): Promise<FileDiff | null> {
  try {
    const fullPath = join(workspacePath, filePath);
    const content = await readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    // Remove trailing empty line if file ends with newline
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    const diffLines: DiffLine[] = lines.map((line) => ({
      type: 'add' as const,
      content: line,
    }));

    return {
      path: filePath,
      status: 'added',
      insertions: lines.length,
      deletions: 0,
      hunks: [
        {
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: lines.length,
          lines: diffLines,
        },
      ],
    };
  } catch {
    // Binary file or read error
    return null;
  }
}

/**
 * Gets diff statistics between the work branch and base branch.
 * Includes untracked files.
 *
 * @param workspacePath - Path to the git repository
 * @param baseBranch - Base branch to compare against
 * @returns Diff statistics (insertions, deletions, filesChanged)
 */
export async function getDiffStats(
  workspacePath: string,
  baseBranch: string
): Promise<DiffStats> {
  try {
    // Get tracked file changes
    const { stdout } = await execCommand('git', ['diff', '--numstat', baseBranch], {
      cwd: workspacePath,
    });

    let insertions = 0;
    let deletions = 0;
    let filesChanged = 0;

    const lines = stdout.trim().split('\n').filter((line) => line.length > 0);
    for (const line of lines) {
      const parts = line.split('\t');
      const added = parts[0];
      const deleted = parts[1];
      if (added !== undefined && deleted !== undefined) {
        // Binary files show '-' for insertions/deletions
        if (added !== '-' && deleted !== '-') {
          insertions += parseInt(added, 10) || 0;
          deletions += parseInt(deleted, 10) || 0;
        }
        filesChanged++;
      }
    }

    // Get untracked files
    const untrackedFiles = await getUntrackedFiles(workspacePath);
    for (const filePath of untrackedFiles) {
      const fileDiff = await createUntrackedFileDiff(workspacePath, filePath);
      if (fileDiff) {
        insertions += fileDiff.insertions;
        filesChanged++;
      }
    }

    return { insertions, deletions, filesChanged };
  } catch {
    // Return empty stats if git command fails (e.g., no commits yet)
    return { insertions: 0, deletions: 0, filesChanged: 0 };
  }
}

/**
 * Parses a unified diff hunk header.
 *
 * @param header - Hunk header line (e.g., "@@ -1,3 +1,4 @@")
 * @returns Parsed hunk info or null if invalid
 */
function parseHunkHeader(header: string): { oldStart: number; oldLines: number; newStart: number; newLines: number } | null {
  const match = header.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) return null;

  return {
    oldStart: parseInt(match[1]!, 10),
    oldLines: parseInt(match[2] ?? '1', 10),
    newStart: parseInt(match[3]!, 10),
    newLines: parseInt(match[4] ?? '1', 10),
  };
}

/**
 * Parses the output of git diff to extract file diffs with hunks.
 *
 * @param diffOutput - Raw output from git diff
 * @returns Array of file diffs
 */
function parseDiffOutput(diffOutput: string): FileDiff[] {
  const files: FileDiff[] = [];
  const filePattern = /^diff --git a\/(.*) b\/(.*)$/;
  const lines = diffOutput.split('\n');

  let currentFile: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Check for new file diff
    const fileMatch = line.match(filePattern);
    if (fileMatch) {
      if (currentFile) {
        if (currentHunk) {
          currentFile.hunks.push(currentHunk);
        }
        files.push(currentFile);
      }
      currentFile = {
        path: fileMatch[2]!,
        status: 'modified',
        insertions: 0,
        deletions: 0,
        hunks: [],
      };
      currentHunk = null;
      continue;
    }

    if (!currentFile) continue;

    // Check for file status
    if (line.startsWith('new file mode')) {
      currentFile.status = 'added';
    } else if (line.startsWith('deleted file mode')) {
      currentFile.status = 'deleted';
    } else if (line.startsWith('rename from')) {
      currentFile.status = 'renamed';
    } else if (line.startsWith('@@')) {
      // Start new hunk
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      const hunkInfo = parseHunkHeader(line);
      if (hunkInfo) {
        currentHunk = {
          ...hunkInfo,
          lines: [],
        };
      }
    } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
      // Content line
      let type: DiffLine['type'];
      if (line.startsWith('+')) {
        type = 'add';
        currentFile.insertions++;
      } else if (line.startsWith('-')) {
        type = 'delete';
        currentFile.deletions++;
      } else {
        type = 'context';
      }
      currentHunk.lines.push({
        type,
        content: line.substring(1),
      });
    }
  }

  // Push last file and hunk
  if (currentFile) {
    if (currentHunk) {
      currentFile.hunks.push(currentHunk);
    }
    files.push(currentFile);
  }

  return files;
}

/**
 * Gets detailed diff between the work branch and base branch.
 * Includes untracked files as new files.
 *
 * @param workspacePath - Path to the git repository
 * @param baseBranch - Base branch to compare against
 * @returns Detailed diff with file-by-file changes and statistics
 */
export async function getDiffDetail(
  workspacePath: string,
  baseBranch: string
): Promise<{ files: FileDiff[]; stats: DiffStats }> {
  try {
    // Get tracked file changes
    const { stdout } = await execCommand('git', ['diff', '-U3', '--no-color', baseBranch], {
      cwd: workspacePath,
    });

    const files = parseDiffOutput(stdout);

    // Get untracked files and add them
    const untrackedFiles = await getUntrackedFiles(workspacePath);
    for (const filePath of untrackedFiles) {
      const fileDiff = await createUntrackedFileDiff(workspacePath, filePath);
      if (fileDiff) {
        files.push(fileDiff);
      }
    }

    // Calculate overall stats
    let insertions = 0;
    let deletions = 0;
    for (const file of files) {
      insertions += file.insertions;
      deletions += file.deletions;
    }

    return {
      files,
      stats: {
        insertions,
        deletions,
        filesChanged: files.length,
      },
    };
  } catch {
    // Return empty result if git command fails
    return {
      files: [],
      stats: { insertions: 0, deletions: 0, filesChanged: 0 },
    };
  }
}

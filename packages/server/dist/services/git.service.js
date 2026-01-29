import { spawn } from 'node:child_process';
/**
 * Error thrown when git operations fail.
 */
export class GitOperationError extends Error {
    operation;
    exitCode;
    stderr;
    constructor(operation, exitCode, stderr) {
        super(`Git ${operation} failed (exit code: ${exitCode}): ${stderr}`);
        this.operation = operation;
        this.exitCode = exitCode;
        this.stderr = stderr;
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
export function deriveGitHost(apiBase) {
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
export function deriveCloneUrl(apiBase, repo) {
    const host = deriveGitHost(apiBase);
    return `https://${host}/${repo}.git`;
}
/**
 * Executes a command using spawn and returns a promise.
 */
function execCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            cwd: options.cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (data) => {
            const str = data.toString();
            stdout += str;
            options.onLog?.(str);
        });
        proc.stderr.on('data', (data) => {
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
            }
            else {
                reject(new GitOperationError('command', code, stderr));
            }
        });
        proc.on('error', (err) => {
            reject(new GitOperationError('command', null, err.message));
        });
    });
}
/**
 * Sets up the credential helper by registering PAT with git credential approve.
 *
 * This uses stdin to pass credentials, avoiding exposure in process arguments or logs.
 *
 * @param apiBase - GitHub API Base URL
 * @param pat - Personal Access Token
 */
export async function setupCredentialHelper(apiBase, pat) {
    const host = deriveGitHost(apiBase);
    // Format for git credential approve
    // See: https://git-scm.com/docs/git-credential
    const credentialInput = [
        'protocol=https',
        `host=${host}`,
        'username=x-access-token',
        `password=${pat}`,
        '', // Empty line to terminate
    ].join('\n');
    try {
        await execCommand('git', ['credential', 'approve'], {
            stdin: credentialInput,
        });
    }
    catch (error) {
        if (error instanceof GitOperationError) {
            throw new GitOperationError('credential approve', error.exitCode, error.stderr);
        }
        throw error;
    }
}
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
export async function cloneRepository(options) {
    const { apiBase, repo, pat, workspacePath, baseBranch, workBranch, onLog } = options;
    // Step 1: Set up credential helper
    onLog?.(`Setting up credentials for ${apiBase}\n`);
    await setupCredentialHelper(apiBase, pat);
    // Step 2: Derive clone URL and execute clone
    const cloneUrl = deriveCloneUrl(apiBase, repo);
    onLog?.(`Cloning ${repo} from ${cloneUrl}\n`);
    try {
        await execCommand('git', ['clone', '--branch', baseBranch, '--progress', cloneUrl, workspacePath], { onLog });
    }
    catch (error) {
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
    }
    catch (error) {
        if (error instanceof GitOperationError) {
            throw new GitOperationError('checkout', error.exitCode, error.stderr);
        }
        throw error;
    }
    onLog?.(`Git clone completed successfully\n`);
}
//# sourceMappingURL=git.service.js.map
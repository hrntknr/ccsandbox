import { spawn } from 'node:child_process';
import { stat, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { deriveGitHost } from './git.service.js';
import type { ContainerInfo, DevcontainerUpResult } from '../shared/index.js';

/**
 * Error thrown when devcontainer config is not found.
 */
export class DevcontainerConfigNotFoundError extends Error {
  constructor(public readonly workspacePath: string) {
    super(`No .devcontainer configuration found in: ${workspacePath}`);
    this.name = 'DevcontainerConfigNotFoundError';
  }
}

/**
 * Error thrown when devcontainer CLI operations fail.
 */
export class DevcontainerCliError extends Error {
  constructor(
    public readonly operation: string,
    public readonly exitCode: number | null,
    public readonly stderr: string
  ) {
    super(`Devcontainer ${operation} failed (exit code: ${exitCode}): ${stderr}`);
    this.name = 'DevcontainerCliError';
  }
}

/**
 * Error thrown when Docker operations fail.
 */
export class DockerOperationError extends Error {
  constructor(
    public readonly operation: string,
    public readonly exitCode: number | null,
    public readonly stderr: string
  ) {
    super(`Docker ${operation} failed (exit code: ${exitCode}): ${stderr}`);
    this.name = 'DockerOperationError';
  }
}

/**
 * Error thrown when an invalid container ID is provided.
 */
export class InvalidContainerIdError extends Error {
  constructor(public readonly containerId: string) {
    super(`Invalid container ID: ${containerId}`);
    this.name = 'InvalidContainerIdError';
  }
}

/**
 * Validates a Docker container ID or name.
 *
 * Valid formats:
 * - 64-character hexadecimal string (full container ID)
 * - 12-character hexadecimal string (short container ID)
 * - Container name: starts with alphanumeric, followed by alphanumeric, underscore, dot, or hyphen
 *
 * @param id - Container ID or name to validate
 * @returns true if valid
 */
export function isValidContainerId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }

  // 64-character hex (full container ID)
  if (/^[a-fA-F0-9]{64}$/.test(id)) {
    return true;
  }

  // 12-character hex (short container ID)
  if (/^[a-fA-F0-9]{12}$/.test(id)) {
    return true;
  }

  // Container name: starts with alphanumeric, followed by alphanumeric, underscore, dot, or hyphen
  // Docker container names must be at least 1 character and match [a-zA-Z0-9][a-zA-Z0-9_.-]*
  if (/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(id)) {
    return true;
  }

  return false;
}

/**
 * Executes a command and returns the result.
 */
function execCommand(
  command: string,
  args: string[],
  options: { cwd?: string; onLog?: (data: string) => void } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
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

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Checks if a path exists.
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false;
    }
    throw error;
  }
}


/**
 * Checks if a workspace has a .devcontainer configuration.
 *
 * Valid configurations:
 * - .devcontainer/devcontainer.json
 * - .devcontainer.json
 * - .devcontainer/<subfolder>/devcontainer.json
 *
 * @param workspacePath - Path to the workspace
 * @returns true if devcontainer config exists
 */
export async function hasDevcontainerConfig(workspacePath: string): Promise<boolean> {
  // Check for .devcontainer.json in root
  if (await pathExists(join(workspacePath, '.devcontainer.json'))) {
    return true;
  }

  // Check for .devcontainer directory
  const devcontainerDir = join(workspacePath, '.devcontainer');
  if (!(await pathExists(devcontainerDir))) {
    return false;
  }

  // Check for devcontainer.json in .devcontainer directory
  if (await pathExists(join(devcontainerDir, 'devcontainer.json'))) {
    return true;
  }

  // Check for subfolders with devcontainer.json
  try {
    const entries = await readdir(devcontainerDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subfolderConfig = join(devcontainerDir, entry.name, 'devcontainer.json');
        if (await pathExists(subfolderConfig)) {
          return true;
        }
      }
    }
  } catch {
    // Ignore errors reading directory
  }

  return false;
}

/**
 * Git credential configuration for devcontainer.
 */
export interface GitCredentialConfig {
  /** GitHub API base URL (e.g., https://api.github.com) */
  apiBase: string;
  /** Personal Access Token */
  pat: string;
  /** GitHub username */
  username: string;
  /** Config directory for storing gitconfig files (e.g., ~/.ccsandbox) */
  configDir: string;
  /** Session ID for organizing files under sessions/<sessionId>/ */
  sessionId: string;
}

/** Path inside container where gitconfig will be copied */
const CONTAINER_GITCONFIG_PATH = '/etc/ccsandbox/gitconfig';

/**
 * Get the session directory path.
 */
export function getSessionDir(configDir: string, sessionId: string): string {
  return join(configDir, 'sessions', sessionId);
}

/**
 * Creates a gitconfig file with credential settings for the specified host.
 *
 * @param configDir - Base config directory (e.g., ~/.ccsandbox)
 * @param sessionId - Session ID
 * @param apiBase - GitHub API base URL
 * @param username - GitHub username
 * @returns Path to the created gitconfig file
 */
async function createGitConfigFile(
  configDir: string,
  sessionId: string,
  apiBase: string,
  username: string
): Promise<string> {
  const gitHost = deriveGitHost(apiBase);

  // gitconfig with username and credential helper (reads from GITHUB_TOKEN env var)
  const gitconfigContent = `[credential "https://${gitHost}"]
\tusername = ${username}
\thelper = "!f() { echo password=$GITHUB_TOKEN; }; f"
`;

  const sessionDir = getSessionDir(configDir, sessionId);

  // Ensure the session directory exists
  await mkdir(sessionDir, { recursive: true, mode: 0o700 });

  const gitconfigPath = join(sessionDir, 'gitconfig');

  await writeFile(gitconfigPath, gitconfigContent, { mode: 0o600 });

  return gitconfigPath;
}

/**
 * Options for starting a devcontainer.
 */
export interface StartDevcontainerOptions {
  /** Path to the workspace */
  workspacePath: string;
  /** Path to devcontainer CLI (default: 'devcontainer') */
  devcontainerCliPath?: string;
  /** Callback for streaming log output */
  onLog?: (data: string) => void;
  /** Dotfiles repository URL */
  dotfilesRepository?: string;
  /** Dotfiles target path */
  dotfilesTargetPath?: string;
  /** Dotfiles install command */
  dotfilesInstallCommand?: string;
  /** Git credential configuration to inject into container */
  gitCredential?: GitCredentialConfig;
  /** External devcontainer config path (for templates) */
  configPath?: string;
}

/**
 * Starts a devcontainer for the given workspace.
 *
 * @param workspacePathOrOptions - Path to the workspace or options object
 * @param devcontainerCliPath - Path to devcontainer CLI (default: 'devcontainer') - deprecated, use options
 * @returns Container information
 * @throws DevcontainerConfigNotFoundError if no config is found
 * @throws DevcontainerCliError if devcontainer CLI fails
 */
export async function startDevcontainer(
  workspacePathOrOptions: string | StartDevcontainerOptions,
  devcontainerCliPath?: string
): Promise<ContainerInfo> {
  // Handle both old signature and new options signature
  const options: StartDevcontainerOptions = typeof workspacePathOrOptions === 'string'
    ? { workspacePath: workspacePathOrOptions, devcontainerCliPath }
    : workspacePathOrOptions;

  const {
    workspacePath,
    devcontainerCliPath: cliPathOpt,
    onLog,
    dotfilesRepository,
    dotfilesTargetPath,
    dotfilesInstallCommand,
    gitCredential,
    configPath,
  } = options;

  // Verify devcontainer config exists (skip if external configPath is provided)
  if (!configPath && !(await hasDevcontainerConfig(workspacePath))) {
    throw new DevcontainerConfigNotFoundError(workspacePath);
  }

  const cliPath = cliPathOpt ?? 'devcontainer';

  onLog?.(`Starting devcontainer for ${workspacePath}\n`);

  // Create gitconfig file before devcontainer up if credential is provided
  let gitconfigPath: string | undefined;
  if (gitCredential) {
    gitconfigPath = await createGitConfigFile(
      gitCredential.configDir,
      gitCredential.sessionId,
      gitCredential.apiBase,
      gitCredential.username
    );
    onLog?.(`Created gitconfig for credential injection\n`);
  }

  // Build devcontainer up arguments
  const args = ['up', '--workspace-folder', workspacePath];
  if (configPath) {
    args.push('--config', configPath);
  }
  if (dotfilesRepository) {
    args.push('--dotfiles-repository', dotfilesRepository);
  }
  if (dotfilesTargetPath) {
    args.push('--dotfiles-target-path', dotfilesTargetPath);
  }
  if (dotfilesInstallCommand) {
    args.push('--dotfiles-install-command', dotfilesInstallCommand);
  }

  // Add git credential options
  if (gitCredential && gitconfigPath) {
    args.push('--remote-env', `GITHUB_TOKEN=${gitCredential.pat}`);
    args.push(
      '--mount',
      `type=bind,source=${gitconfigPath},target=${CONTAINER_GITCONFIG_PATH}`
    );
  }

  // Run devcontainer up
  const result = await execCommand(cliPath, args, { onLog });

  if (result.exitCode !== 0) {
    throw new DevcontainerCliError('up', result.exitCode, result.stderr);
  }

  // Parse JSON output
  let parsedResult: DevcontainerUpResult;
  try {
    // devcontainer up outputs JSON to stdout
    parsedResult = JSON.parse(result.stdout) as DevcontainerUpResult;
  } catch {
    throw new DevcontainerCliError(
      'up',
      result.exitCode,
      `Failed to parse devcontainer output: ${result.stdout}`
    );
  }

  if (parsedResult.outcome !== 'success') {
    throw new DevcontainerCliError(
      'up',
      result.exitCode,
      parsedResult.message ?? 'Unknown error'
    );
  }

  if (!parsedResult.containerId) {
    throw new DevcontainerCliError(
      'up',
      result.exitCode,
      'No containerId in devcontainer output'
    );
  }

  // Configure git to include our credential config (mounted via --mount)
  if (gitCredential) {
    onLog?.(`Configuring git include.path in container\n`);
    const execResult = await execCommand(cliPath, [
      'exec',
      '--workspace-folder',
      workspacePath,
      'git',
      'config',
      '--global',
      'include.path',
      CONTAINER_GITCONFIG_PATH,
    ]);

    if (execResult.exitCode !== 0) {
      onLog?.(
        `Warning: Failed to configure git include.path: ${execResult.stderr}\n`
      );
    }
  }

  onLog?.(
    `Devcontainer started successfully (container: ${parsedResult.containerId.substring(0, 12)})\n`
  );

  return {
    containerId: parsedResult.containerId,
    containerName: parsedResult.containerName,
    remoteUser: parsedResult.remoteUser,
  };
}

/**
 * Gets container information for a workspace using devcontainer CLI.
 *
 * @param workspacePath - Path to the workspace
 * @param devcontainerCliPath - Path to devcontainer CLI (default: 'devcontainer')
 * @returns Container information or null if no container is running
 */
export async function getContainerInfo(
  workspacePath: string,
  devcontainerCliPath?: string
): Promise<ContainerInfo | null> {
  const cliPath = devcontainerCliPath ?? 'devcontainer';

  // Use devcontainer read-configuration to get container info
  const result = await execCommand(cliPath, [
    'up',
    '--workspace-folder',
    workspacePath,
    '--skip-build-check',
  ]);

  if (result.exitCode !== 0) {
    return null;
  }

  try {
    const parsedResult = JSON.parse(result.stdout) as DevcontainerUpResult;
    if (parsedResult.outcome !== 'success' || !parsedResult.containerId) {
      return null;
    }

    return {
      containerId: parsedResult.containerId,
      containerName: parsedResult.containerName,
      remoteUser: parsedResult.remoteUser,
    };
  } catch {
    return null;
  }
}

/**
 * Stops a Docker container.
 *
 * @param containerId - Container ID or name
 * @throws InvalidContainerIdError if container ID is invalid
 * @throws DockerOperationError if stop fails
 */
export async function stopContainer(containerId: string): Promise<void> {
  if (!isValidContainerId(containerId)) {
    throw new InvalidContainerIdError(containerId);
  }

  const result = await execCommand('docker', ['stop', containerId]);

  if (result.exitCode !== 0) {
    throw new DockerOperationError('stop', result.exitCode, result.stderr);
  }
}

/**
 * Removes a Docker container.
 *
 * @param containerId - Container ID or name
 * @param force - Force removal of running container
 * @throws InvalidContainerIdError if container ID is invalid
 * @throws DockerOperationError if remove fails
 */
export async function removeContainer(containerId: string, force = false): Promise<void> {
  if (!isValidContainerId(containerId)) {
    throw new InvalidContainerIdError(containerId);
  }

  const args = ['rm'];
  if (force) {
    args.push('-f');
  }
  args.push(containerId);

  const result = await execCommand('docker', args);

  if (result.exitCode !== 0) {
    throw new DockerOperationError('rm', result.exitCode, result.stderr);
  }
}

/**
 * Waits for a Docker container to be ready to accept commands.
 *
 * @param containerId - Container ID or name
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @throws InvalidContainerIdError if container ID is invalid
 * @throws DockerOperationError if container does not become ready within timeout
 */
export async function waitForContainerReady(
  containerId: string,
  timeoutMs = 10000
): Promise<void> {
  if (!isValidContainerId(containerId)) {
    throw new InvalidContainerIdError(containerId);
  }

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const result = await execCommand('docker', ['exec', containerId, 'true']);
    if (result.exitCode === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new DockerOperationError(
    'wait-ready',
    null,
    `Container did not become ready within ${timeoutMs}ms`
  );
}

/**
 * Checks if a Docker container is running.
 *
 * @param containerId - Container ID or name
 * @returns true if container is running
 * @throws InvalidContainerIdError if container ID is invalid
 */
export async function isContainerRunning(containerId: string): Promise<boolean> {
  if (!isValidContainerId(containerId)) {
    throw new InvalidContainerIdError(containerId);
  }

  const result = await execCommand('docker', [
    'inspect',
    '--format',
    '{{.State.Running}}',
    containerId,
  ]);

  if (result.exitCode !== 0) {
    return false;
  }

  return result.stdout.trim() === 'true';
}

/**
 * Gets the container ID from container name or ID.
 * Useful for validating that a container exists.
 *
 * @param containerIdOrName - Container ID or name
 * @returns Full container ID or null if not found
 * @throws InvalidContainerIdError if container ID is invalid
 */
export async function getContainerId(containerIdOrName: string): Promise<string | null> {
  if (!isValidContainerId(containerIdOrName)) {
    throw new InvalidContainerIdError(containerIdOrName);
  }

  const result = await execCommand('docker', [
    'inspect',
    '--format',
    '{{.Id}}',
    containerIdOrName,
  ]);

  if (result.exitCode !== 0) {
    return null;
  }

  return result.stdout.trim() || null;
}

import { spawn } from 'node:child_process';
import { stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
/**
 * Error thrown when devcontainer config is not found.
 */
export class DevcontainerConfigNotFoundError extends Error {
    workspacePath;
    constructor(workspacePath) {
        super(`No .devcontainer configuration found in: ${workspacePath}`);
        this.workspacePath = workspacePath;
        this.name = 'DevcontainerConfigNotFoundError';
    }
}
/**
 * Error thrown when devcontainer CLI operations fail.
 */
export class DevcontainerCliError extends Error {
    operation;
    exitCode;
    stderr;
    constructor(operation, exitCode, stderr) {
        super(`Devcontainer ${operation} failed (exit code: ${exitCode}): ${stderr}`);
        this.operation = operation;
        this.exitCode = exitCode;
        this.stderr = stderr;
        this.name = 'DevcontainerCliError';
    }
}
/**
 * Error thrown when Docker operations fail.
 */
export class DockerOperationError extends Error {
    operation;
    exitCode;
    stderr;
    constructor(operation, exitCode, stderr) {
        super(`Docker ${operation} failed (exit code: ${exitCode}): ${stderr}`);
        this.operation = operation;
        this.exitCode = exitCode;
        this.stderr = stderr;
        this.name = 'DockerOperationError';
    }
}
/**
 * Error thrown when an invalid container ID is provided.
 */
export class InvalidContainerIdError extends Error {
    containerId;
    constructor(containerId) {
        super(`Invalid container ID: ${containerId}`);
        this.containerId = containerId;
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
export function isValidContainerId(id) {
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
async function pathExists(path) {
    try {
        await stat(path);
        return true;
    }
    catch (error) {
        if (error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT') {
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
export async function hasDevcontainerConfig(workspacePath) {
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
    }
    catch {
        // Ignore errors reading directory
    }
    return false;
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
export async function startDevcontainer(workspacePathOrOptions, devcontainerCliPath) {
    // Handle both old signature and new options signature
    const options = typeof workspacePathOrOptions === 'string'
        ? { workspacePath: workspacePathOrOptions, devcontainerCliPath }
        : workspacePathOrOptions;
    const { workspacePath, devcontainerCliPath: cliPathOpt, onLog } = options;
    // Verify devcontainer config exists
    if (!(await hasDevcontainerConfig(workspacePath))) {
        throw new DevcontainerConfigNotFoundError(workspacePath);
    }
    const cliPath = cliPathOpt ?? 'devcontainer';
    onLog?.(`Starting devcontainer for ${workspacePath}\n`);
    // Run devcontainer up
    const result = await execCommand(cliPath, ['up', '--workspace-folder', workspacePath], { onLog });
    if (result.exitCode !== 0) {
        throw new DevcontainerCliError('up', result.exitCode, result.stderr);
    }
    // Parse JSON output
    let parsedResult;
    try {
        // devcontainer up outputs JSON to stdout
        parsedResult = JSON.parse(result.stdout);
    }
    catch {
        throw new DevcontainerCliError('up', result.exitCode, `Failed to parse devcontainer output: ${result.stdout}`);
    }
    if (parsedResult.outcome !== 'success') {
        throw new DevcontainerCliError('up', result.exitCode, parsedResult.message ?? 'Unknown error');
    }
    if (!parsedResult.containerId) {
        throw new DevcontainerCliError('up', result.exitCode, 'No containerId in devcontainer output');
    }
    onLog?.(`Devcontainer started successfully (container: ${parsedResult.containerId.substring(0, 12)})\n`);
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
export async function getContainerInfo(workspacePath, devcontainerCliPath) {
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
        const parsedResult = JSON.parse(result.stdout);
        if (parsedResult.outcome !== 'success' || !parsedResult.containerId) {
            return null;
        }
        return {
            containerId: parsedResult.containerId,
            containerName: parsedResult.containerName,
            remoteUser: parsedResult.remoteUser,
        };
    }
    catch {
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
export async function stopContainer(containerId) {
    if (!isValidContainerId(containerId)) {
        throw new InvalidContainerIdError(containerId);
    }
    const result = await execCommand('docker', ['stop', containerId]);
    if (result.exitCode !== 0) {
        throw new DockerOperationError('stop', result.exitCode, result.stderr);
    }
}
/**
 * Starts a stopped Docker container.
 *
 * @param containerId - Container ID or name
 * @throws InvalidContainerIdError if container ID is invalid
 * @throws DockerOperationError if start fails
 */
export async function startContainer(containerId) {
    if (!isValidContainerId(containerId)) {
        throw new InvalidContainerIdError(containerId);
    }
    const result = await execCommand('docker', ['start', containerId]);
    if (result.exitCode !== 0) {
        throw new DockerOperationError('start', result.exitCode, result.stderr);
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
export async function removeContainer(containerId, force = false) {
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
 * Checks if a Docker container is running.
 *
 * @param containerId - Container ID or name
 * @returns true if container is running
 * @throws InvalidContainerIdError if container ID is invalid
 */
export async function isContainerRunning(containerId) {
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
export async function getContainerId(containerIdOrName) {
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
//# sourceMappingURL=devcontainer.service.js.map
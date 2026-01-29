import type { ContainerInfo } from '@ccsandbox/shared';
/**
 * Error thrown when devcontainer config is not found.
 */
export declare class DevcontainerConfigNotFoundError extends Error {
    readonly workspacePath: string;
    constructor(workspacePath: string);
}
/**
 * Error thrown when devcontainer CLI operations fail.
 */
export declare class DevcontainerCliError extends Error {
    readonly operation: string;
    readonly exitCode: number | null;
    readonly stderr: string;
    constructor(operation: string, exitCode: number | null, stderr: string);
}
/**
 * Error thrown when Docker operations fail.
 */
export declare class DockerOperationError extends Error {
    readonly operation: string;
    readonly exitCode: number | null;
    readonly stderr: string;
    constructor(operation: string, exitCode: number | null, stderr: string);
}
/**
 * Error thrown when an invalid container ID is provided.
 */
export declare class InvalidContainerIdError extends Error {
    readonly containerId: string;
    constructor(containerId: string);
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
export declare function isValidContainerId(id: string): boolean;
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
export declare function hasDevcontainerConfig(workspacePath: string): Promise<boolean>;
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
export declare function startDevcontainer(workspacePathOrOptions: string | StartDevcontainerOptions, devcontainerCliPath?: string): Promise<ContainerInfo>;
/**
 * Gets container information for a workspace using devcontainer CLI.
 *
 * @param workspacePath - Path to the workspace
 * @param devcontainerCliPath - Path to devcontainer CLI (default: 'devcontainer')
 * @returns Container information or null if no container is running
 */
export declare function getContainerInfo(workspacePath: string, devcontainerCliPath?: string): Promise<ContainerInfo | null>;
/**
 * Stops a Docker container.
 *
 * @param containerId - Container ID or name
 * @throws InvalidContainerIdError if container ID is invalid
 * @throws DockerOperationError if stop fails
 */
export declare function stopContainer(containerId: string): Promise<void>;
/**
 * Starts a stopped Docker container.
 *
 * @param containerId - Container ID or name
 * @throws InvalidContainerIdError if container ID is invalid
 * @throws DockerOperationError if start fails
 */
export declare function startContainer(containerId: string): Promise<void>;
/**
 * Removes a Docker container.
 *
 * @param containerId - Container ID or name
 * @param force - Force removal of running container
 * @throws InvalidContainerIdError if container ID is invalid
 * @throws DockerOperationError if remove fails
 */
export declare function removeContainer(containerId: string, force?: boolean): Promise<void>;
/**
 * Checks if a Docker container is running.
 *
 * @param containerId - Container ID or name
 * @returns true if container is running
 * @throws InvalidContainerIdError if container ID is invalid
 */
export declare function isContainerRunning(containerId: string): Promise<boolean>;
/**
 * Gets the container ID from container name or ID.
 * Useful for validating that a container exists.
 *
 * @param containerIdOrName - Container ID or name
 * @returns Full container ID or null if not found
 * @throws InvalidContainerIdError if container ID is invalid
 */
export declare function getContainerId(containerIdOrName: string): Promise<string | null>;
//# sourceMappingURL=devcontainer.service.d.ts.map
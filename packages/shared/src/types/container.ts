/**
 * Container information returned from devcontainer up.
 */
export interface ContainerInfo {
  /** Docker container ID */
  containerId: string;
  /** Docker container name (optional) */
  containerName?: string;
  /** Remote user inside the container */
  remoteUser?: string;
}

/**
 * Result of devcontainer up command.
 */
export interface DevcontainerUpResult {
  /** Outcome of the operation */
  outcome: 'success' | 'error';
  /** Container info if successful */
  containerId?: string;
  /** Container name if available */
  containerName?: string;
  /** Remote user */
  remoteUser?: string;
  /** Error message if failed */
  message?: string;
}

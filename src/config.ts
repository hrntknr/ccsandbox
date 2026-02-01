/**
 * Server configuration management.
 * Holds CLI options passed to the server.
 */

export interface ServerConfig {
  /** GitHub Personal Access Token (optional, can be set via Web UI) */
  pat?: string;
  /** GitHub API Base URL */
  apiBase: string;
  /** Configuration directory (sessions.json, config.json) */
  configDir: string;
  /** Workspace root directory for cloned repositories */
  repoDir: string;
  /** Bind host */
  listen: string;
  /** Listen port */
  port: number;
  /** Path to devcontainer CLI (optional) */
  devcontainerCli?: string;
  /** Dotfiles repository URL (optional) */
  dotfilesRepository?: string;
  /** Dotfiles target path (optional) */
  dotfilesTargetPath?: string;
  /** Dotfiles install command (optional) */
  dotfilesInstallCommand?: string;
  /** Default shell for new sessions (optional) */
  defaultShell?: string;
  /** Authentication token (random, stored as plaintext) */
  authToken?: string;
  /** Authentication password hash (bcrypt) */
  authPasswordHash?: string;
  /** Maximum thinking tokens for Claude extended thinking (0 to disable) */
  maxThinkingTokens?: number;
}

let config: ServerConfig | null = null;

/**
 * Set the server configuration.
 * Should be called once at server startup.
 */
export function setConfig(newConfig: ServerConfig): void {
  config = newConfig;
}

/**
 * Get the current server configuration.
 * Throws if config has not been set.
 */
export function getConfig(): ServerConfig {
  if (!config) {
    throw new Error('Server configuration has not been initialized');
  }
  return config;
}

/**
 * Check if configuration has been set.
 */
export function hasConfig(): boolean {
  return config !== null;
}

/**
 * Update the server configuration.
 * Merges provided updates with existing configuration.
 */
export function updateConfig(updates: Partial<ServerConfig>): void {
  if (!config) {
    throw new Error('Server configuration has not been initialized');
  }
  Object.assign(config, updates);
}

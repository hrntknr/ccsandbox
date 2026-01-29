/**
 * Server configuration management.
 * Holds CLI options passed to the server.
 */
export interface ServerConfig {
    /** GitHub Personal Access Token */
    pat: string;
    /** GitHub API Base URL */
    apiBase: string;
    /** Workspace root directory */
    repoDir: string;
    /** Bind host */
    listen: string;
    /** Listen port */
    port: number;
    /** Path to devcontainer CLI (optional) */
    devcontainerCli?: string;
}
/**
 * Set the server configuration.
 * Should be called once at server startup.
 */
export declare function setConfig(newConfig: ServerConfig): void;
/**
 * Get the current server configuration.
 * Throws if config has not been set.
 */
export declare function getConfig(): ServerConfig;
/**
 * Check if configuration has been set.
 */
export declare function hasConfig(): boolean;
//# sourceMappingURL=config.d.ts.map
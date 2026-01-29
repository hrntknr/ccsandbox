/**
 * Server configuration management.
 * Holds CLI options passed to the server.
 */
let config = null;
/**
 * Set the server configuration.
 * Should be called once at server startup.
 */
export function setConfig(newConfig) {
    config = newConfig;
}
/**
 * Get the current server configuration.
 * Throws if config has not been set.
 */
export function getConfig() {
    if (!config) {
        throw new Error('Server configuration has not been initialized');
    }
    return config;
}
/**
 * Check if configuration has been set.
 */
export function hasConfig() {
    return config !== null;
}
//# sourceMappingURL=config.js.map
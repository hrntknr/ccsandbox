import { Router } from 'express';
import type { ApiResponse, ClientConfig, UpdateConfigRequest, DevcontainerTemplate } from '../../shared/index.js';
import { getConfig, updateConfig } from '../../config.js';
import { getConfigStore } from '../../persistence/config-store.js';
import { startBackgroundRefresh, stopBackgroundRefresh } from '../../services/github.service.js';
import { hashPassword } from '../../utils/auth.js';
import { listTemplates } from '../../services/template.service.js';

// Cache for templates (loaded once at startup, refreshed on demand)
let templatesCache: DevcontainerTemplate[] | null = null;

const router = Router();

/**
 * Get cached templates or load them.
 */
async function getTemplates(): Promise<DevcontainerTemplate[]> {
  if (!templatesCache) {
    templatesCache = await listTemplates();
  }
  return templatesCache;
}

/**
 * Build ClientConfig from server config (PAT is exposed only as hasPat boolean)
 */
async function buildClientConfig(): Promise<ClientConfig> {
  const config = getConfig();
  const configStore = getConfigStore(config.configDir);
  const persisted = await configStore.read();
  const templates = await getTemplates();
  return {
    hasPat: Boolean(config.pat),
    apiBase: config.apiBase,
    dotfilesRepository: config.dotfilesRepository,
    dotfilesTargetPath: config.dotfilesTargetPath,
    dotfilesInstallCommand: config.dotfilesInstallCommand,
    defaultShell: config.defaultShell,
    hasAuthPassword: Boolean(config.authPasswordHash),
    templates,
    maxThinkingTokens: persisted.maxThinkingTokens,
  };
}

/**
 * GET /api/config
 * Returns client-safe configuration options
 */
router.get('/', async (_req, res) => {
  try {
    const clientConfig = await buildClientConfig();
    const response: ApiResponse<{ config: ClientConfig }> = {
      success: true,
      data: { config: clientConfig },
    };
    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get config';
    const response: ApiResponse<never> = {
      success: false,
      error: message,
    };
    res.status(500).json(response);
  }
});

/**
 * PUT /api/config
 * Updates configuration and persists to config.json
 */
router.put('/', async (req, res) => {
  try {
    const updates = req.body as UpdateConfigRequest;
    const config = getConfig();
    const configStore = getConfigStore(config.configDir);

    // Handle password update: hash and store as authPasswordHash
    const persistUpdates: Record<string, unknown> = { ...updates };
    delete persistUpdates['authPassword'];

    if (updates.authPassword !== undefined) {
      if (updates.authPassword === '') {
        // Empty string means remove password
        persistUpdates['authPasswordHash'] = '';
      } else {
        // Hash the password
        persistUpdates['authPasswordHash'] = await hashPassword(updates.authPassword);
      }
    }

    // Persist to config.json
    const persisted = await configStore.write(persistUpdates);

    // Determine the new apiBase (use persisted if available, else current)
    const newApiBase = persisted.apiBase ?? config.apiBase;

    // Update in-memory config
    updateConfig({
      pat: persisted.pat,
      apiBase: newApiBase,
      dotfilesRepository: persisted.dotfilesRepository,
      dotfilesTargetPath: persisted.dotfilesTargetPath,
      dotfilesInstallCommand: persisted.dotfilesInstallCommand,
      defaultShell: persisted.defaultShell,
      authPasswordHash: persisted.authPasswordHash,
    });

    // Restart background refresh if PAT or apiBase changed
    if (updates.pat !== undefined || updates.apiBase !== undefined) {
      stopBackgroundRefresh();
      const currentConfig = getConfig();
      if (currentConfig.pat) {
        startBackgroundRefresh(currentConfig.pat, currentConfig.apiBase);
      }
    }

    const clientConfig = await buildClientConfig();
    const response: ApiResponse<{ config: ClientConfig }> = {
      success: true,
      data: { config: clientConfig },
    };
    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update config';
    const response: ApiResponse<never> = {
      success: false,
      error: message,
    };
    res.status(500).json(response);
  }
});

export default router;

import { Router } from 'express';
import type { ApiResponse, ClientConfig } from '@ccsandbox/shared';
import { getConfig } from '../../config.js';

const router = Router();

/**
 * GET /api/config
 * Returns client-safe configuration options
 */
router.get('/', (_req, res) => {
  const config = getConfig();
  const clientConfig: ClientConfig = {
    defaultShell: config.defaultShell,
  };
  const response: ApiResponse<{ config: ClientConfig }> = {
    success: true,
    data: { config: clientConfig },
  };
  res.json(response);
});

export default router;

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setConfig, getConfig, hasConfig } from '../config.js';

describe('config', () => {
  beforeEach(() => {
    // Reset the module state by importing a fresh instance is complex,
    // so we'll test the actual behavior with state persistence
    vi.resetModules();
  });

  describe('setConfig and getConfig', () => {
    it('should store and retrieve configuration', async () => {
      // Use dynamic import to get fresh module state
      const config = await import('../config.js?fresh1');

      const testConfig = {
        pat: 'test-pat',
        apiBase: 'https://api.github.com',
        repoDir: '/home/user/.ccsandbox',
        listen: '127.0.0.1',
        port: 3000,
        devcontainerCli: '/usr/local/bin/devcontainer',
      };

      config.setConfig(testConfig);
      const result = config.getConfig();

      expect(result).toEqual(testConfig);
    });
  });

  describe('hasConfig', () => {
    it('should return true after config is set', async () => {
      const config = await import('../config.js?fresh2');

      config.setConfig({
        pat: 'test',
        apiBase: 'https://api.github.com',
        repoDir: '/home/user/.ccsandbox',
        listen: '127.0.0.1',
        port: 3000,
      });

      expect(config.hasConfig()).toBe(true);
    });
  });
});

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer, type ServerInstance } from '../index.js';
import { getConfigStore, resetConfigStore } from '../persistence/config-store.js';
import { resetSessionStore } from '../persistence/session-store.js';

describe('startServer', () => {
  let serverInstance: ServerInstance | null = null;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `ccsandbox-server-test-${Date.now()}-${Math.random()}`);
    await mkdir(testDir, { recursive: true });
    resetConfigStore();
    resetSessionStore();
  });

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.close();
      serverInstance = null;
    }
    resetConfigStore();
    resetSessionStore();
    await rm(testDir, { recursive: true, force: true });
  });

  it('should start server on specified port', async () => {
    serverInstance = await startServer({
      configDir: testDir,
      repoDir: join(testDir, 'repo'),
      listen: '127.0.0.1',
      port: 0, // Use any available port
    });

    expect(serverInstance.server).toBeDefined();
    expect(serverInstance.port).toBeGreaterThan(0);
    expect(typeof serverInstance.close).toBe('function');
  });

  it('should respond to health check after start', async () => {
    serverInstance = await startServer({
      configDir: testDir,
      repoDir: join(testDir, 'repo'),
      listen: '127.0.0.1',
      port: 0,
    });

    // Get auth token from config store
    const configStore = getConfigStore(testDir);
    const config = await configStore.read();
    const authToken = config.authToken;

    // Use Cookie header with the auth token to authenticate
    const response = await fetch(
      `http://127.0.0.1:${serverInstance.port}/api/health`,
      {
        headers: {
          Cookie: `ccsandbox_auth=${authToken}`,
        },
      },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: 'ok' });
  });

  it('should close server gracefully', async () => {
    serverInstance = await startServer({
      configDir: testDir,
      repoDir: join(testDir, 'repo'),
      listen: '127.0.0.1',
      port: 0,
    });

    const port = serverInstance.port;
    await serverInstance.close();
    serverInstance = null;

    // Server should no longer respond
    try {
      await fetch(`http://127.0.0.1:${port}/api/health`);
      expect.fail('Should have thrown connection error');
    } catch {
      // Expected
    }
  });
});

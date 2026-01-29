import { describe, it, expect, afterEach } from 'vitest';
import { startServer, type ServerInstance } from '../index.js';

describe('startServer', () => {
  let serverInstance: ServerInstance | null = null;

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.close();
      serverInstance = null;
    }
  });

  it('should start server on specified port', async () => {
    serverInstance = await startServer({
      pat: 'test-pat',
      apiBase: 'https://api.github.com',
      repoDir: '/tmp/.ccsandbox',
      listen: '127.0.0.1',
      port: 0, // Use any available port
    });

    expect(serverInstance.server).toBeDefined();
    expect(serverInstance.port).toBeGreaterThan(0);
    expect(typeof serverInstance.close).toBe('function');
  });

  it('should respond to health check after start', async () => {
    serverInstance = await startServer({
      pat: 'test-pat',
      apiBase: 'https://api.github.com',
      repoDir: '/tmp/.ccsandbox',
      listen: '127.0.0.1',
      port: 0,
    });

    const response = await fetch(`http://127.0.0.1:${serverInstance.port}/api/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: 'ok' });
  });

  it('should close server gracefully', async () => {
    serverInstance = await startServer({
      pat: 'test-pat',
      apiBase: 'https://api.github.com',
      repoDir: '/tmp/.ccsandbox',
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

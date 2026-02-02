import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../app.js';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

describe('createApp', () => {
  describe('API routes', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeEach(async () => {
      const app = createApp();
      server = http.createServer(app);
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          const port = typeof address === 'object' && address ? address.port : 3000;
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    it('should respond to /api/health', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ status: 'ok' });
    });

    it('should return 404 for unknown API routes', async () => {
      const response = await fetch(`${baseUrl}/api/unknown`);
      expect(response.status).toBe(404);
    });
  });

  describe('JSON middleware', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeEach(async () => {
      const app = createApp();
      // Add a test route to verify JSON parsing
      app.post('/api/test-json', (req, res) => {
        res.json({ received: req.body });
      });
      server = http.createServer(app);
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          const port = typeof address === 'object' && address ? address.port : 3000;
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    it('should parse JSON request bodies', async () => {
      const testData = { foo: 'bar', num: 123 };
      const response = await fetch(`${baseUrl}/api/test-json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ received: testData });
    });
  });

  describe('Static file serving', () => {
    let server: http.Server;
    let baseUrl: string;
    let tempDir: string;

    beforeEach(async () => {
      // Create a temporary web/dist directory with index.html
      tempDir = fs.mkdtempSync(path.join(process.cwd(), 'test-web-dist-'));
      fs.writeFileSync(path.join(tempDir, 'index.html'), '<html><body>Test</body></html>');

      // Mock import.meta.dirname to point to our temp directory's parent
      const originalDirname = import.meta.dirname;
      vi.spyOn(path, 'resolve').mockImplementation((...args) => {
        if (args[1] === '../web/dist') {
          return tempDir;
        }
        return path.join(...args);
      });

      const app = createApp({ serveStatic: true });

      // Restore mock after app creation
      vi.mocked(path.resolve).mockRestore();

      server = http.createServer(app);
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          const port = typeof address === 'object' && address ? address.port : 3000;
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true });
    });

    it('should return 404 for missing asset files instead of index.html', async () => {
      // Request a non-existent asset file
      const response = await fetch(`${baseUrl}/assets/non-existent-file.js`);

      // Should return 404, not 200 with HTML content
      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe('Not found');
    });

    it('should serve index.html for non-asset routes (SPA fallback)', async () => {
      const response = await fetch(`${baseUrl}/some-spa-route`);

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('<html>');
    });
  });
});

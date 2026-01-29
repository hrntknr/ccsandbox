import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from '../app.js';
import http from 'node:http';
describe('createApp', () => {
    describe('API routes', () => {
        let server;
        let baseUrl;
        beforeEach(async () => {
            const app = createApp();
            server = http.createServer(app);
            await new Promise((resolve) => {
                server.listen(0, '127.0.0.1', () => {
                    const address = server.address();
                    const port = typeof address === 'object' && address ? address.port : 3000;
                    baseUrl = `http://127.0.0.1:${port}`;
                    resolve();
                });
            });
        });
        afterEach(async () => {
            await new Promise((resolve, reject) => {
                server.close((err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
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
        let server;
        let baseUrl;
        beforeEach(async () => {
            const app = createApp();
            // Add a test route to verify JSON parsing
            app.post('/api/test-json', (req, res) => {
                res.json({ received: req.body });
            });
            server = http.createServer(app);
            await new Promise((resolve) => {
                server.listen(0, '127.0.0.1', () => {
                    const address = server.address();
                    const port = typeof address === 'object' && address ? address.port : 3000;
                    baseUrl = `http://127.0.0.1:${port}`;
                    resolve();
                });
            });
        });
        afterEach(async () => {
            await new Promise((resolve, reject) => {
                server.close((err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
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
});
//# sourceMappingURL=app.test.js.map
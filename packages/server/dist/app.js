import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRouter from './routes/api/index.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * Create and configure the Express application.
 */
export function createApp(options = {}) {
    const app = express();
    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    // API routes
    app.use('/api', apiRouter);
    // Static file serving for production mode
    if (options.serveStatic) {
        // Serve the web package's dist folder
        const webDistPath = path.resolve(__dirname, '../../web/dist');
        app.use(express.static(webDistPath));
        // SPA fallback - serve index.html for non-API routes
        app.get('*', (req, res, next) => {
            // Skip API routes
            if (req.path.startsWith('/api')) {
                return next();
            }
            res.sendFile(path.join(webDistPath, 'index.html'));
        });
    }
    // Error handling middleware
    app.use((err, _req, res, _next) => {
        console.error('Server error:', err.message);
        res.status(500).json({
            success: false,
            error: process.env['NODE_ENV'] === 'production'
                ? 'Internal server error'
                : err.message,
        });
    });
    return app;
}
//# sourceMappingURL=app.js.map
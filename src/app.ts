import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import apiRouter from './routes/api/index.js';
import { authMiddleware } from './middleware/auth.js';

export interface CreateAppOptions {
  /** Enable static file serving for production mode */
  serveStatic?: boolean;
}

/**
 * Create and configure the Express application.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Authentication middleware
  app.use(authMiddleware);

  // API routes
  app.use('/api', apiRouter);

  // Static file serving for production mode
  if (options.serveStatic) {
    // Serve the web package's dist folder
    const webDistPath = path.resolve(import.meta.dirname, '../web/dist');
    app.use(express.static(webDistPath));

    // SPA fallback - serve index.html for non-API routes
    app.get('/{*path}', (req, res, next) => {
      // Skip API routes
      if (req.path.startsWith('/api')) {
        return next();
      }
      // Skip asset requests - these should 404 if not found by express.static
      // This prevents returning HTML for missing JS/CSS files (e.g., after rebuild with new hashes)
      if (req.path.startsWith('/assets/')) {
        return res.status(404).send('Not found');
      }
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
  }

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    // Skip logging for common non-critical errors
    if (err.message !== 'Not Found') {
      console.error('Server error:', err.message);
    }
    res.status(500).json({
      success: false,
      error: process.env['NODE_ENV'] === 'production'
        ? 'Internal server error'
        : err.message,
    });
  });

  return app;
}

import { type Express } from 'express';
export interface CreateAppOptions {
    /** Enable static file serving for production mode */
    serveStatic?: boolean;
}
/**
 * Create and configure the Express application.
 */
export declare function createApp(options?: CreateAppOptions): Express;
//# sourceMappingURL=app.d.ts.map
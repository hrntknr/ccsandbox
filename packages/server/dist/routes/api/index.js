import { Router } from 'express';
import githubRouter from './github.js';
import sessionsRouter from './sessions.js';
const router = Router();
// Health check endpoint
router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
// GitHub routes
router.use('/github', githubRouter);
// Session routes
router.use('/sessions', sessionsRouter);
export default router;
//# sourceMappingURL=index.js.map
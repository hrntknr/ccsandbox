import { WebSocket } from 'ws';
import type { SessionCreateClientMessage } from '@ccsandbox/shared';
/**
 * Session creation WebSocket handler for a single connection
 */
export interface SessionCreateHandler {
    handleMessage: (message: SessionCreateClientMessage) => void;
    cleanup: () => void;
}
/**
 * Create a session creation handler for a WebSocket connection
 */
export declare function createSessionCreateHandler(ws: WebSocket): SessionCreateHandler;
//# sourceMappingURL=session-create.handler.d.ts.map
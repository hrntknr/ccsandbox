import { WebSocket } from 'ws';
import type { TerminalClientMessage } from '@ccsandbox/shared';
/**
 * Terminal WebSocket handler for a single connection
 */
export interface TerminalHandler {
    handleMessage: (message: TerminalClientMessage) => void;
    cleanup: () => void;
}
/**
 * Create a terminal handler for a WebSocket connection
 */
export declare function createTerminalHandler(ws: WebSocket): TerminalHandler;
//# sourceMappingURL=terminal.handler.d.ts.map
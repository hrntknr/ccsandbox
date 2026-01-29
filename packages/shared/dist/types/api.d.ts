import type { Session } from './session.js';
export interface CreateSessionRequest {
    title: string;
    repo: string;
    baseBranch: string;
    workBranch: string;
}
export interface UpdateSessionRequest {
    title?: string;
    state?: Session['state'];
}
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}
export interface SessionResponse {
    session: Session;
}
export interface SessionListResponse {
    sessions: Session[];
}
export type WebSocketMessageType = 'terminal:input' | 'terminal:output' | 'terminal:resize' | 'session:state' | 'error';
export interface WebSocketMessage<T = unknown> {
    type: WebSocketMessageType;
    payload: T;
}
export interface TerminalInputPayload {
    tabId: string;
    data: string;
}
export interface TerminalOutputPayload {
    tabId: string;
    data: string;
}
export interface TerminalResizePayload {
    tabId: string;
    cols: number;
    rows: number;
}
export interface SessionStatePayload {
    sessionId: string;
    state: Session['state'];
}
export interface ErrorPayload {
    message: string;
    code?: string;
}
//# sourceMappingURL=api.d.ts.map
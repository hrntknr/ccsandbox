export type SessionState = 'READY' | 'RUNNING' | 'ERROR';
export interface TerminalTab {
    tabId: string;
    title: string;
    shell: string;
}
export interface Session {
    sessionId: string;
    title: string;
    repo: string;
    apiBase: string;
    baseBranch: string;
    workBranch: string;
    workspacePath: string;
    state: SessionState;
    createdAt: string;
    containerId?: string;
    containerName?: string;
    tabs?: TerminalTab[];
}
//# sourceMappingURL=session.d.ts.map
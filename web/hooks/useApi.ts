import { useState, useCallback } from 'react';
import type {
  Session,
  Repository,
  Branch,
  ApiResponse,
  SessionListResponse,
  SessionResponse,
  CreateSessionRequest,
  ClientConfig,
  UpdateConfigRequest,
  DiffStats,
  DiffStatsResponse,
  DiffDetailResponse,
  FileDiff,
  GitStatus,
  GitStatusResponse,
  PortForwarding,
  AddPortForwardingRequest,
  PortForwardingListResponse,
} from '@shared/index.js';


interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseApiReturn<T> extends UseApiState<T> {
  execute: () => Promise<T | null>;
  reset: () => void;
}

interface UseRepositoriesReturn extends UseApiState<Repository[]> {
  execute: () => Promise<Repository[] | null>;
  refresh: () => Promise<Repository[] | null>;
  refreshing: boolean;
  reset: () => void;
}

const API_BASE_URL = '/api';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  // Server returns ApiResponse format directly
  const data: ApiResponse<T> = await response.json().catch(() => ({
    success: false,
    error: `HTTP ${response.status}: ${response.statusText}`,
  }));

  return data;
}

export function useSessions(): UseApiReturn<Session[]> {
  const [state, setState] = useState<UseApiState<Session[]>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (): Promise<Session[] | null> => {
    setState({ data: null, loading: true, error: null });

    const response = await fetchApi<SessionListResponse>('/sessions');

    if (response.success && response.data) {
      setState({ data: response.data.sessions, loading: false, error: null });
      return response.data.sessions;
    } else {
      setState({ data: null, loading: false, error: response.error || 'Unknown error' });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}

export function useCreateSession(): {
  create: (request: CreateSessionRequest) => Promise<Session | null>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (request: CreateSessionRequest): Promise<Session | null> => {
    setLoading(true);
    setError(null);

    const response = await fetchApi<SessionResponse>('/sessions', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    setLoading(false);

    if (response.success && response.data) {
      return response.data.session;
    } else {
      setError(response.error || 'Failed to create session');
      return null;
    }
  }, []);

  return { create, loading, error };
}

export function useDeleteSession(): {
  deleteSession: (sessionId: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteSession = useCallback(async (sessionId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    const response = await fetchApi<void>(`/sessions/${sessionId}`, {
      method: 'DELETE',
    });

    setLoading(false);

    if (response.success) {
      return true;
    } else {
      setError(response.error || 'Failed to delete session');
      return false;
    }
  }, []);

  return { deleteSession, loading, error };
}

export function useStartSession(): {
  startSession: (sessionId: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback(async (sessionId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    const response = await fetchApi<SessionResponse>(`/sessions/${sessionId}/start`, {
      method: 'POST',
    });

    setLoading(false);

    if (response.success) {
      return true;
    } else {
      setError(response.error || 'Failed to start session');
      return false;
    }
  }, []);

  return { startSession, loading, error };
}

export function useStopSession(): {
  stopSession: (sessionId: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopSession = useCallback(async (sessionId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    const response = await fetchApi<SessionResponse>(`/sessions/${sessionId}/stop`, {
      method: 'POST',
    });

    setLoading(false);

    if (response.success) {
      return true;
    } else {
      setError(response.error || 'Failed to stop session');
      return false;
    }
  }, []);

  return { stopSession, loading, error };
}

export function useRepositories(): UseRepositoriesReturn {
  const [state, setState] = useState<UseApiState<Repository[]>>({
    data: null,
    loading: false,
    error: null,
  });
  const [refreshing, setRefreshing] = useState(false);

  const execute = useCallback(async (): Promise<Repository[] | null> => {
    setState({ data: null, loading: true, error: null });

    const response = await fetchApi<Repository[]>('/github/repos');

    if (response.success && response.data) {
      setState({ data: response.data, loading: false, error: null });
      return response.data;
    } else {
      setState({ data: null, loading: false, error: response.error || 'Unknown error' });
      return null;
    }
  }, []);

  const refresh = useCallback(async (): Promise<Repository[] | null> => {
    setRefreshing(true);

    const response = await fetchApi<Repository[]>('/github/repos/refresh', {
      method: 'POST',
    });

    setRefreshing(false);

    if (response.success && response.data) {
      setState({ data: response.data, loading: false, error: null });
      return response.data;
    } else {
      setState((prev) => ({ ...prev, error: response.error || 'Failed to refresh' }));
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, execute, refresh, refreshing, reset };
}

export function useClientConfig(): UseApiReturn<ClientConfig> {
  const [state, setState] = useState<UseApiState<ClientConfig>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (): Promise<ClientConfig | null> => {
    setState({ data: null, loading: true, error: null });

    const response = await fetchApi<{ config: ClientConfig }>('/config');

    if (response.success && response.data) {
      setState({ data: response.data.config, loading: false, error: null });
      return response.data.config;
    } else {
      setState({ data: null, loading: false, error: response.error || 'Unknown error' });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}

export function useUpdateConfig(): {
  updateConfig: (request: UpdateConfigRequest) => Promise<ClientConfig | null>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateConfig = useCallback(async (request: UpdateConfigRequest): Promise<ClientConfig | null> => {
    setLoading(true);
    setError(null);

    const response = await fetchApi<{ config: ClientConfig }>('/config', {
      method: 'PUT',
      body: JSON.stringify(request),
    });

    setLoading(false);

    if (response.success && response.data) {
      return response.data.config;
    } else {
      setError(response.error || 'Failed to update config');
      return null;
    }
  }, []);

  return { updateConfig, loading, error };
}

export function useDiffStats(sessionId: string | null): UseApiReturn<DiffStats> {
  const [state, setState] = useState<UseApiState<DiffStats>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (): Promise<DiffStats | null> => {
    if (!sessionId) {
      setState({ data: null, loading: false, error: null });
      return null;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const response = await fetchApi<DiffStatsResponse>(`/sessions/${sessionId}/diff/stats`);

    if (response.success && response.data) {
      setState({ data: response.data.stats, loading: false, error: null });
      return response.data.stats;
    } else {
      setState({ data: null, loading: false, error: response.error || 'Unknown error' });
      return null;
    }
  }, [sessionId]);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}

export function useDiffDetail(sessionId: string | null): UseApiReturn<{ files: FileDiff[]; stats: DiffStats }> {
  const [state, setState] = useState<UseApiState<{ files: FileDiff[]; stats: DiffStats }>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (): Promise<{ files: FileDiff[]; stats: DiffStats } | null> => {
    if (!sessionId) {
      setState({ data: null, loading: false, error: null });
      return null;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const response = await fetchApi<DiffDetailResponse>(`/sessions/${sessionId}/diff`);

    if (response.success && response.data) {
      const result = { files: response.data.files, stats: response.data.stats };
      setState({ data: result, loading: false, error: null });
      return result;
    } else {
      setState({ data: null, loading: false, error: response.error || 'Unknown error' });
      return null;
    }
  }, [sessionId]);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}

export interface UsePortForwardingReturn {
  ports: PortForwarding[];
  loading: boolean;
  error: string | null;
  listPorts: () => Promise<PortForwarding[]>;
  addPort: (request: AddPortForwardingRequest) => Promise<PortForwarding | null>;
  removePort: (portId: string) => Promise<boolean>;
}

export function usePortForwarding(sessionId: string | null): UsePortForwardingReturn {
  const [ports, setPorts] = useState<PortForwarding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listPorts = useCallback(async (): Promise<PortForwarding[]> => {
    if (!sessionId) {
      setPorts([]);
      return [];
    }

    setLoading(true);
    setError(null);

    const response = await fetchApi<PortForwardingListResponse>(`/sessions/${sessionId}/ports`);

    setLoading(false);

    if (response.success && response.data) {
      setPorts(response.data.portForwardings);
      return response.data.portForwardings;
    } else {
      setError(response.error || 'Failed to list ports');
      return [];
    }
  }, [sessionId]);

  const addPort = useCallback(async (request: AddPortForwardingRequest): Promise<PortForwarding | null> => {
    if (!sessionId) {
      setError('No session selected');
      return null;
    }

    setLoading(true);
    setError(null);

    const response = await fetchApi<{ portForwarding: PortForwarding }>(`/sessions/${sessionId}/ports`, {
      method: 'POST',
      body: JSON.stringify(request),
    });

    setLoading(false);

    if (response.success && response.data) {
      // Refresh the list
      await listPorts();
      return response.data.portForwarding;
    } else {
      setError(response.error || 'Failed to add port');
      return null;
    }
  }, [sessionId, listPorts]);

  const removePort = useCallback(async (portId: string): Promise<boolean> => {
    if (!sessionId) {
      setError('No session selected');
      return false;
    }

    setLoading(true);
    setError(null);

    const response = await fetchApi<null>(`/sessions/${sessionId}/ports/${portId}`, {
      method: 'DELETE',
    });

    setLoading(false);

    if (response.success) {
      // Refresh the list
      await listPorts();
      return true;
    } else {
      setError(response.error || 'Failed to remove port');
      return false;
    }
  }, [sessionId, listPorts]);

  return { ports, loading, error, listPorts, addPort, removePort };
}

export function useGitStatus(): {
  fetchGitStatus: (sessionId: string) => Promise<GitStatus | null>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGitStatus = useCallback(async (sessionId: string): Promise<GitStatus | null> => {
    setLoading(true);
    setError(null);

    const response = await fetchApi<GitStatusResponse>(`/sessions/${sessionId}/git-status`);

    setLoading(false);

    if (response.success && response.data) {
      return response.data.status;
    } else {
      setError(response.error || 'Failed to fetch git status');
      return null;
    }
  }, []);

  return { fetchGitStatus, loading, error };
}

export interface UseBranchesReturn {
  branches: Branch[];
  loading: boolean;
  error: string | null;
  fetchBranches: (owner: string, repo: string) => Promise<Branch[]>;
  reset: () => void;
}

export function useBranches(): UseBranchesReturn {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBranches = useCallback(async (owner: string, repo: string): Promise<Branch[]> => {
    setLoading(true);
    setError(null);

    const response = await fetchApi<Branch[]>(`/github/repos/${owner}/${repo}/branches`);

    setLoading(false);

    if (response.success && response.data) {
      setBranches(response.data);
      return response.data;
    } else {
      setError(response.error || 'Failed to fetch branches');
      setBranches([]);
      return [];
    }
  }, []);

  const reset = useCallback(() => {
    setBranches([]);
    setLoading(false);
    setError(null);
  }, []);

  return { branches, loading, error, fetchBranches, reset };
}

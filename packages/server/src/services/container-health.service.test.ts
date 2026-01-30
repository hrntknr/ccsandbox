import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startContainerHealthCheck,
  stopContainerHealthCheck,
  isHealthCheckRunning,
  runHealthCheckOnce,
} from './container-health.service.js';

// Mock dependencies
vi.mock('../persistence/session-store.js', () => ({
  getSessionStore: vi.fn(),
}));

vi.mock('./devcontainer.service.js', () => ({
  isContainerRunning: vi.fn(),
}));

import { getSessionStore } from '../persistence/session-store.js';
import { isContainerRunning } from './devcontainer.service.js';

describe('container-health.service', () => {
  const mockSessionStore = {
    list: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getSessionStore).mockReturnValue(mockSessionStore as never);
    mockSessionStore.list.mockResolvedValue([]);
    mockSessionStore.update.mockResolvedValue({});
  });

  afterEach(() => {
    stopContainerHealthCheck();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('startContainerHealthCheck', () => {
    it('should start the health check timer', () => {
      expect(isHealthCheckRunning()).toBe(false);

      startContainerHealthCheck();

      expect(isHealthCheckRunning()).toBe(true);
    });

    it('should stop existing timer when called again', () => {
      startContainerHealthCheck();
      const firstRunning = isHealthCheckRunning();

      startContainerHealthCheck();
      const secondRunning = isHealthCheckRunning();

      expect(firstRunning).toBe(true);
      expect(secondRunning).toBe(true);
    });
  });

  describe('stopContainerHealthCheck', () => {
    it('should stop the health check timer', () => {
      startContainerHealthCheck();
      expect(isHealthCheckRunning()).toBe(true);

      stopContainerHealthCheck();

      expect(isHealthCheckRunning()).toBe(false);
    });

    it('should handle being called when timer is not running', () => {
      expect(isHealthCheckRunning()).toBe(false);

      stopContainerHealthCheck();

      expect(isHealthCheckRunning()).toBe(false);
    });
  });

  describe('runHealthCheckOnce', () => {
    it('should update state from RUNNING to READY when container is stopped', async () => {
      const session = {
        sessionId: 'session-1',
        containerId: 'container123456',
        state: 'RUNNING' as const,
      };
      mockSessionStore.list.mockResolvedValue([session]);
      vi.mocked(isContainerRunning).mockResolvedValue(false);

      await runHealthCheckOnce();

      expect(isContainerRunning).toHaveBeenCalledWith('container123456');
      expect(mockSessionStore.update).toHaveBeenCalledWith('session-1', {
        state: 'STOPPED',
      });
    });

    it('should update state from READY to RUNNING when container is running', async () => {
      const session = {
        sessionId: 'session-2',
        containerId: 'container789012',
        state: 'STOPPED' as const,
      };
      mockSessionStore.list.mockResolvedValue([session]);
      vi.mocked(isContainerRunning).mockResolvedValue(true);

      await runHealthCheckOnce();

      expect(isContainerRunning).toHaveBeenCalledWith('container789012');
      expect(mockSessionStore.update).toHaveBeenCalledWith('session-2', {
        state: 'RUNNING',
      });
    });

    it('should not update when state matches container status (RUNNING)', async () => {
      const session = {
        sessionId: 'session-3',
        containerId: 'container345678',
        state: 'RUNNING' as const,
      };
      mockSessionStore.list.mockResolvedValue([session]);
      vi.mocked(isContainerRunning).mockResolvedValue(true);

      await runHealthCheckOnce();

      expect(isContainerRunning).toHaveBeenCalledWith('container345678');
      expect(mockSessionStore.update).not.toHaveBeenCalled();
    });

    it('should not update when state matches container status (READY)', async () => {
      const session = {
        sessionId: 'session-4',
        containerId: 'container901234',
        state: 'STOPPED' as const,
      };
      mockSessionStore.list.mockResolvedValue([session]);
      vi.mocked(isContainerRunning).mockResolvedValue(false);

      await runHealthCheckOnce();

      expect(isContainerRunning).toHaveBeenCalledWith('container901234');
      expect(mockSessionStore.update).not.toHaveBeenCalled();
    });

    it('should skip sessions without containerId', async () => {
      const session = {
        sessionId: 'session-5',
        state: 'STOPPED' as const,
      };
      mockSessionStore.list.mockResolvedValue([session]);

      await runHealthCheckOnce();

      expect(isContainerRunning).not.toHaveBeenCalled();
      expect(mockSessionStore.update).not.toHaveBeenCalled();
    });

    it('should skip sessions in ERROR state', async () => {
      const session = {
        sessionId: 'session-6',
        containerId: 'container567890',
        state: 'ERROR' as const,
      };
      mockSessionStore.list.mockResolvedValue([session]);

      await runHealthCheckOnce();

      expect(isContainerRunning).not.toHaveBeenCalled();
      expect(mockSessionStore.update).not.toHaveBeenCalled();
    });

    it('should process multiple sessions', async () => {
      const sessions = [
        { sessionId: 's1', containerId: 'c1', state: 'RUNNING' as const },
        { sessionId: 's2', containerId: 'c2', state: 'STOPPED' as const },
        { sessionId: 's3', state: 'STOPPED' as const }, // No containerId
        { sessionId: 's4', containerId: 'c4', state: 'ERROR' as const },
      ];
      mockSessionStore.list.mockResolvedValue(sessions);
      vi.mocked(isContainerRunning)
        .mockResolvedValueOnce(false) // c1 stopped
        .mockResolvedValueOnce(true); // c2 running

      await runHealthCheckOnce();

      expect(isContainerRunning).toHaveBeenCalledTimes(2);
      expect(isContainerRunning).toHaveBeenCalledWith('c1');
      expect(isContainerRunning).toHaveBeenCalledWith('c2');
      expect(mockSessionStore.update).toHaveBeenCalledTimes(2);
      expect(mockSessionStore.update).toHaveBeenCalledWith('s1', { state: 'STOPPED' });
      expect(mockSessionStore.update).toHaveBeenCalledWith('s2', { state: 'RUNNING' });
    });

    it('should continue checking other sessions when one fails', async () => {
      const sessions = [
        { sessionId: 's1', containerId: 'c1', state: 'RUNNING' as const },
        { sessionId: 's2', containerId: 'c2', state: 'RUNNING' as const },
      ];
      mockSessionStore.list.mockResolvedValue(sessions);
      vi.mocked(isContainerRunning)
        .mockRejectedValueOnce(new Error('Docker error'))
        .mockResolvedValueOnce(false);

      // Should not throw
      await runHealthCheckOnce();

      expect(isContainerRunning).toHaveBeenCalledTimes(2);
      expect(mockSessionStore.update).toHaveBeenCalledTimes(1);
      expect(mockSessionStore.update).toHaveBeenCalledWith('s2', { state: 'STOPPED' });
    });
  });

  describe('periodic health check', () => {
    it('should run health check immediately on start', async () => {
      const session = {
        sessionId: 'session-1',
        containerId: 'container123456',
        state: 'RUNNING' as const,
      };
      mockSessionStore.list.mockResolvedValue([session]);
      vi.mocked(isContainerRunning).mockResolvedValue(true);

      startContainerHealthCheck();

      // Initial check runs immediately (async)
      await vi.advanceTimersByTimeAsync(0);
      expect(mockSessionStore.list).toHaveBeenCalledTimes(1);
    });

    it('should run health check every 15 seconds after initial check', async () => {
      const session = {
        sessionId: 'session-1',
        containerId: 'container123456',
        state: 'RUNNING' as const,
      };
      mockSessionStore.list.mockResolvedValue([session]);
      vi.mocked(isContainerRunning).mockResolvedValue(true);

      startContainerHealthCheck();

      // Initial check runs immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(mockSessionStore.list).toHaveBeenCalledTimes(1);

      // After 15 seconds
      await vi.advanceTimersByTimeAsync(15000);
      expect(mockSessionStore.list).toHaveBeenCalledTimes(2);

      // After another 15 seconds (total 30s)
      await vi.advanceTimersByTimeAsync(15000);
      expect(mockSessionStore.list).toHaveBeenCalledTimes(3);
    });
  });
});

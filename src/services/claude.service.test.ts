import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeManager } from './claude.service.js';
import type { ClaudeInstance } from './claude.service.js';
import { EventEmitter } from 'node:events';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('ClaudeManager', () => {
  let manager: ClaudeManager;

  beforeEach(() => {
    manager = new ClaudeManager();
  });

  afterEach(() => {
    manager.killAll();
  });

  describe('setPermissionMode', () => {
    it('should return false if instance does not exist', async () => {
      const result = await manager.setPermissionMode('non-existent', 'acceptEdits');
      expect(result).toBe(false);
    });

    it('should return true if mode is already set', async () => {
      // Create a mock instance
      const instance: ClaudeInstance = {
        tabId: 'test-tab',
        sessionId: 'test-session',
        workspacePath: '/test/path',
        claudeSessionId: 'claude-session-id',
        process: null,
        messages: [],
        pendingPermissions: new Map(),
        pendingControlRequests: new Map(),
        isProcessing: false,
        currentStreamingMessage: null,
        permissionMode: 'acceptEdits',
        devcontainerCliPath: 'devcontainer',
        todos: [],
      };

      // Access private instances map through casting
      (manager as unknown as { instances: Map<string, ClaudeInstance> }).instances.set(
        'test-tab',
        instance
      );

      const result = await manager.setPermissionMode('test-tab', 'acceptEdits');
      expect(result).toBe(true);
      expect(instance.permissionMode).toBe('acceptEdits');
    });

    it('should update mode locally if process is not running', async () => {
      const instance: ClaudeInstance = {
        tabId: 'test-tab',
        sessionId: 'test-session',
        workspacePath: '/test/path',
        claudeSessionId: 'claude-session-id',
        process: null,
        messages: [],
        pendingPermissions: new Map(),
        pendingControlRequests: new Map(),
        isProcessing: false,
        currentStreamingMessage: null,
        permissionMode: 'default',
        devcontainerCliPath: 'devcontainer',
        todos: [],
      };

      (manager as unknown as { instances: Map<string, ClaudeInstance> }).instances.set(
        'test-tab',
        instance
      );

      const result = await manager.setPermissionMode('test-tab', 'acceptEdits');
      expect(result).toBe(true);
      expect(instance.permissionMode).toBe('acceptEdits');
    });

    it('should send control_request when process is running', async () => {
      const mockStdin = {
        writable: true,
        write: vi.fn(),
      };

      const mockProcess = {
        stdin: mockStdin,
        kill: vi.fn(),
      };

      const instance: ClaudeInstance = {
        tabId: 'test-tab',
        sessionId: 'test-session',
        workspacePath: '/test/path',
        claudeSessionId: 'claude-session-id',
        process: mockProcess as unknown as ClaudeInstance['process'],
        messages: [],
        pendingPermissions: new Map(),
        pendingControlRequests: new Map(),
        isProcessing: false,
        currentStreamingMessage: null,
        permissionMode: 'default',
        devcontainerCliPath: 'devcontainer',
        todos: [],
      };

      (manager as unknown as { instances: Map<string, ClaudeInstance> }).instances.set(
        'test-tab',
        instance
      );

      // Start the setPermissionMode call (will wait for response)
      const resultPromise = manager.setPermissionMode('test-tab', 'acceptEdits');

      // Wait for the write to be called
      await vi.waitFor(() => {
        expect(mockStdin.write).toHaveBeenCalled();
      });

      // Parse the written control_request
      const writtenData = mockStdin.write.mock.calls[0]?.[0] as string;
      const controlRequest = JSON.parse(writtenData.trim());

      expect(controlRequest.type).toBe('control_request');
      expect(controlRequest.request.subtype).toBe('set_permission_mode');
      expect(controlRequest.request.mode).toBe('acceptEdits');

      // Simulate control_response from CLI
      const pendingRequest = instance.pendingControlRequests.get(controlRequest.request_id);
      expect(pendingRequest).toBeDefined();

      pendingRequest?.resolve({
        subtype: 'success',
        request_id: controlRequest.request_id,
        response: { mode: 'acceptEdits' },
      });

      const result = await resultPromise;
      expect(result).toBe(true);
      expect(instance.permissionMode).toBe('acceptEdits');
    });

    it('should return false on control_request error', async () => {
      const mockStdin = {
        writable: true,
        write: vi.fn(),
      };

      const mockProcess = {
        stdin: mockStdin,
        kill: vi.fn(),
      };

      const instance: ClaudeInstance = {
        tabId: 'test-tab',
        sessionId: 'test-session',
        workspacePath: '/test/path',
        claudeSessionId: 'claude-session-id',
        process: mockProcess as unknown as ClaudeInstance['process'],
        messages: [],
        pendingPermissions: new Map(),
        pendingControlRequests: new Map(),
        isProcessing: false,
        currentStreamingMessage: null,
        permissionMode: 'default',
        devcontainerCliPath: 'devcontainer',
        todos: [],
      };

      (manager as unknown as { instances: Map<string, ClaudeInstance> }).instances.set(
        'test-tab',
        instance
      );

      const resultPromise = manager.setPermissionMode('test-tab', 'acceptEdits');

      await vi.waitFor(() => {
        expect(mockStdin.write).toHaveBeenCalled();
      });

      const writtenData = mockStdin.write.mock.calls[0]?.[0] as string;
      const controlRequest = JSON.parse(writtenData.trim());

      // Simulate error response
      const pendingRequest = instance.pendingControlRequests.get(controlRequest.request_id);
      pendingRequest?.reject(new Error('Mode change failed'));

      const result = await resultPromise;
      expect(result).toBe(false);
      // Mode should not be updated on error
      expect(instance.permissionMode).toBe('default');
    });
  });

  describe('handleEvent - control_response', () => {
    it('should resolve pending control request on success', () => {
      const instance: ClaudeInstance = {
        tabId: 'test-tab',
        sessionId: 'test-session',
        workspacePath: '/test/path',
        claudeSessionId: 'claude-session-id',
        process: null,
        messages: [],
        pendingPermissions: new Map(),
        pendingControlRequests: new Map(),
        isProcessing: false,
        currentStreamingMessage: null,
        permissionMode: 'default',
        devcontainerCliPath: 'devcontainer',
        todos: [],
      };

      const resolveCallback = vi.fn();
      const rejectCallback = vi.fn();

      instance.pendingControlRequests.set('req-123', {
        resolve: resolveCallback,
        reject: rejectCallback,
      });

      (manager as unknown as { instances: Map<string, ClaudeInstance> }).instances.set(
        'test-tab',
        instance
      );

      // Call handleEvent with control_response
      const handleEvent = (
        manager as unknown as {
          handleEvent: (instance: ClaudeInstance, event: unknown) => void;
        }
      ).handleEvent.bind(manager);

      handleEvent(instance, {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: 'req-123',
          response: { mode: 'acceptEdits' },
        },
      });

      expect(resolveCallback).toHaveBeenCalledWith({
        subtype: 'success',
        request_id: 'req-123',
        response: { mode: 'acceptEdits' },
      });
      expect(rejectCallback).not.toHaveBeenCalled();
      expect(instance.pendingControlRequests.has('req-123')).toBe(false);
    });

    it('should reject pending control request on error', () => {
      const instance: ClaudeInstance = {
        tabId: 'test-tab',
        sessionId: 'test-session',
        workspacePath: '/test/path',
        claudeSessionId: 'claude-session-id',
        process: null,
        messages: [],
        pendingPermissions: new Map(),
        pendingControlRequests: new Map(),
        isProcessing: false,
        currentStreamingMessage: null,
        permissionMode: 'default',
        devcontainerCliPath: 'devcontainer',
        todos: [],
      };

      const resolveCallback = vi.fn();
      const rejectCallback = vi.fn();

      instance.pendingControlRequests.set('req-456', {
        resolve: resolveCallback,
        reject: rejectCallback,
      });

      (manager as unknown as { instances: Map<string, ClaudeInstance> }).instances.set(
        'test-tab',
        instance
      );

      const handleEvent = (
        manager as unknown as {
          handleEvent: (instance: ClaudeInstance, event: unknown) => void;
        }
      ).handleEvent.bind(manager);

      handleEvent(instance, {
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id: 'req-456',
          error: 'Something went wrong',
        },
      });

      expect(rejectCallback).toHaveBeenCalled();
      expect(resolveCallback).not.toHaveBeenCalled();
      expect(instance.pendingControlRequests.has('req-456')).toBe(false);
    });

    it('should not emit event to clients for control_response', () => {
      const instance: ClaudeInstance = {
        tabId: 'test-tab',
        sessionId: 'test-session',
        workspacePath: '/test/path',
        claudeSessionId: 'claude-session-id',
        process: null,
        messages: [],
        pendingPermissions: new Map(),
        pendingControlRequests: new Map(),
        isProcessing: false,
        currentStreamingMessage: null,
        permissionMode: 'default',
        devcontainerCliPath: 'devcontainer',
        todos: [],
      };

      (manager as unknown as { instances: Map<string, ClaudeInstance> }).instances.set(
        'test-tab',
        instance
      );

      const eventSpy = vi.fn();
      manager.on('event', eventSpy);

      const handleEvent = (
        manager as unknown as {
          handleEvent: (instance: ClaudeInstance, event: unknown) => void;
        }
      ).handleEvent.bind(manager);

      handleEvent(instance, {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: 'unknown-req',
        },
      });

      // Should not emit event for control_response
      expect(eventSpy).not.toHaveBeenCalled();
    });
  });
});

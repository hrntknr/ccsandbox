import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  SessionStore,
  WorkspaceExistsError,
  SessionNotFoundError,
} from './session-store.js';

describe('SessionStore', () => {
  let testDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `ccsandbox-test-${Date.now()}-${Math.random()}`);
    await mkdir(testDir, { recursive: true });
    store = new SessionStore(testDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe('getRepoDir', () => {
    it('returns the configured repo directory', () => {
      expect(store.getRepoDir()).toBe(testDir);
    });
  });

  describe('list', () => {
    it('returns empty array when no sessions exist', async () => {
      const sessions = await store.list();
      expect(sessions).toEqual([]);
    });

    it('returns all sessions', async () => {
      await store.create({
        title: 'Test 1',
        repo: 'owner/repo1',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'feature/test1',
      });
      await store.create({
        title: 'Test 2',
        repo: 'owner/repo2',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'feature/test2',
      });

      const sessions = await store.list();
      expect(sessions).toHaveLength(2);
      expect(sessions[0]?.title).toBe('Test 1');
      expect(sessions[1]?.title).toBe('Test 2');
    });
  });

  describe('create', () => {
    it('creates a new session with all required fields', async () => {
      const session = await store.create({
        title: 'My Session',
        repo: 'owner/myrepo',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'feature/test',
      });

      expect(session.sessionId).toBeDefined();
      expect(session.title).toBe('My Session');
      expect(session.repo).toBe('owner/myrepo');
      expect(session.apiBase).toBe('https://api.github.com');
      expect(session.baseBranch).toBe('main');
      expect(session.workBranch).toBe('feature/test');
      expect(session.workspacePath).toBe(join(testDir, 'myrepo.feature_test'));
      expect(session.state).toBe('READY');
      expect(session.createdAt).toBeDefined();
    });

    it('generates valid UUID for sessionId', async () => {
      const session = await store.create({
        title: 'Test',
        repo: 'owner/repo',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'test',
      });

      // UUID v4 format
      expect(session.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('generates ISO 8601 timestamp for createdAt', async () => {
      const beforeCreate = new Date();
      const session = await store.create({
        title: 'Test',
        repo: 'owner/repo',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'test',
      });
      const afterCreate = new Date();

      const createdAt = new Date(session.createdAt);
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });

    it('throws WorkspaceExistsError when workspace path exists', async () => {
      // Create a directory that would conflict
      const conflictPath = join(testDir, 'myrepo.feature_test');
      await mkdir(conflictPath, { recursive: true });

      await expect(
        store.create({
          title: 'Test',
          repo: 'owner/myrepo',
          apiBase: 'https://api.github.com',
          baseBranch: 'main',
          workBranch: 'feature/test',
        })
      ).rejects.toThrow(WorkspaceExistsError);
    });

    it('persists session to JSON file', async () => {
      await store.create({
        title: 'Persisted',
        repo: 'owner/repo',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'test',
      });

      const filePath = join(testDir, '.ccsandbox', 'sessions.json');
      const content = await readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as { sessions: unknown[] };
      expect(data.sessions).toHaveLength(1);
    });
  });

  describe('get', () => {
    it('returns session by ID', async () => {
      const created = await store.create({
        title: 'To Find',
        repo: 'owner/repo',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'test',
      });

      const found = await store.get(created.sessionId);
      expect(found.sessionId).toBe(created.sessionId);
      expect(found.title).toBe('To Find');
    });

    it('throws SessionNotFoundError for non-existent ID', async () => {
      await expect(store.get('non-existent-id')).rejects.toThrow(
        SessionNotFoundError
      );
    });
  });

  describe('update', () => {
    it('updates session title', async () => {
      const created = await store.create({
        title: 'Original',
        repo: 'owner/repo',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'test',
      });

      const updated = await store.update(created.sessionId, {
        title: 'Updated',
      });

      expect(updated.title).toBe('Updated');

      // Verify persistence
      const fetched = await store.get(created.sessionId);
      expect(fetched.title).toBe('Updated');
    });

    it('updates session state', async () => {
      const created = await store.create({
        title: 'Test',
        repo: 'owner/repo',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'test',
      });

      const updated = await store.update(created.sessionId, {
        state: 'RUNNING',
      });

      expect(updated.state).toBe('RUNNING');
    });

    it('updates containerId', async () => {
      const created = await store.create({
        title: 'Test',
        repo: 'owner/repo',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'test',
      });

      const updated = await store.update(created.sessionId, {
        containerId: 'abc123',
      });

      expect(updated.containerId).toBe('abc123');
    });

    it('removes containerId when set to null', async () => {
      const created = await store.create({
        title: 'Test',
        repo: 'owner/repo',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'test',
      });

      await store.update(created.sessionId, { containerId: 'abc123' });
      const updated = await store.update(created.sessionId, {
        containerId: null,
      });

      expect(updated.containerId).toBeUndefined();
    });

    it('throws SessionNotFoundError for non-existent ID', async () => {
      await expect(
        store.update('non-existent-id', { title: 'Test' })
      ).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe('delete', () => {
    it('removes session from store', async () => {
      const created = await store.create({
        title: 'To Delete',
        repo: 'owner/repo',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'test',
      });

      await store.delete(created.sessionId);

      const sessions = await store.list();
      expect(sessions).toHaveLength(0);
    });

    it('throws SessionNotFoundError for non-existent ID', async () => {
      await expect(store.delete('non-existent-id')).rejects.toThrow(
        SessionNotFoundError
      );
    });
  });

  describe('concurrent access', () => {
    it('handles concurrent creates without data loss', async () => {
      // Create 10 sessions concurrently
      const createPromises = Array.from({ length: 10 }, (_, i) =>
        store.create({
          title: `Session ${i}`,
          repo: `owner/repo${i}`,
          apiBase: 'https://api.github.com',
          baseBranch: 'main',
          workBranch: `branch${i}`,
        })
      );

      await Promise.all(createPromises);

      const sessions = await store.list();
      expect(sessions).toHaveLength(10);
    });

    it('handles concurrent updates without data loss', async () => {
      // Create a session first
      const session = await store.create({
        title: 'Original',
        repo: 'owner/repo',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'test',
      });

      // Update title 10 times concurrently
      const updatePromises = Array.from({ length: 10 }, (_, i) =>
        store.update(session.sessionId, { title: `Title ${i}` })
      );

      await Promise.all(updatePromises);

      const updated = await store.get(session.sessionId);
      // The final title should be one of the updates (last one to complete wins)
      expect(updated.title).toMatch(/^Title \d$/);
    });

    it('handles mixed concurrent operations', async () => {
      // Create initial sessions
      const session1 = await store.create({
        title: 'Session 1',
        repo: 'owner/repo1',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'branch1',
      });
      const session2 = await store.create({
        title: 'Session 2',
        repo: 'owner/repo2',
        apiBase: 'https://api.github.com',
        baseBranch: 'main',
        workBranch: 'branch2',
      });

      // Mix of operations: create, update, and delete concurrently
      const operations = [
        store.create({
          title: 'Session 3',
          repo: 'owner/repo3',
          apiBase: 'https://api.github.com',
          baseBranch: 'main',
          workBranch: 'branch3',
        }),
        store.update(session1.sessionId, { title: 'Updated 1' }),
        store.delete(session2.sessionId),
      ];

      await Promise.all(operations);

      const sessions = await store.list();
      // Should have 2 sessions: session1 (updated) and session3 (new)
      expect(sessions).toHaveLength(2);
      expect(sessions.find((s) => s.sessionId === session1.sessionId)?.title).toBe(
        'Updated 1'
      );
      expect(sessions.find((s) => s.sessionId === session2.sessionId)).toBeUndefined();
    });
  });
});

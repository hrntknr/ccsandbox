import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  deriveGitHost,
  deriveCloneUrl,
  createAskpassScript,
  cleanupAskpassScript,
  cloneRepository,
  GitOperationError,
  type CloneRepositoryOptions,
} from './git.service.js';

// Mock child_process.spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

describe('git.service', () => {
  describe('deriveGitHost', () => {
    it('returns github.com for api.github.com', () => {
      expect(deriveGitHost('https://api.github.com')).toBe('github.com');
    });

    it('returns hostname for GHE API URL', () => {
      expect(deriveGitHost('https://ghe.example.com/api/v3')).toBe(
        'ghe.example.com'
      );
    });

    it('handles GHE URL without path', () => {
      expect(deriveGitHost('https://github.mycompany.com')).toBe(
        'github.mycompany.com'
      );
    });

    it('handles URL with port', () => {
      expect(deriveGitHost('https://github.local:8443/api/v3')).toBe(
        'github.local'
      );
    });
  });

  describe('deriveCloneUrl', () => {
    it('derives github.com clone URL from api.github.com', () => {
      expect(deriveCloneUrl('https://api.github.com', 'owner/repo')).toBe(
        'https://github.com/owner/repo.git'
      );
    });

    it('derives GHE clone URL from GHE API URL', () => {
      expect(
        deriveCloneUrl('https://ghe.example.com/api/v3', 'owner/repo')
      ).toBe('https://ghe.example.com/owner/repo.git');
    });

    it('handles repo with nested owner', () => {
      expect(deriveCloneUrl('https://api.github.com', 'org/team/repo')).toBe(
        'https://github.com/org/team/repo.git'
      );
    });
  });

  describe('createAskpassScript', () => {
    it('creates an executable script file', async () => {
      const scriptPath = await createAskpassScript();

      try {
        // Check file exists and is readable
        const content = await readFile(scriptPath, 'utf-8');
        expect(content).toContain('#!/bin/sh');
        expect(content).toContain('echo "$GIT_ASKPASS_PASSWORD"');
      } finally {
        await cleanupAskpassScript(scriptPath);
      }
    });

    it('creates unique script paths', async () => {
      const path1 = await createAskpassScript();
      const path2 = await createAskpassScript();

      try {
        expect(path1).not.toBe(path2);
      } finally {
        await cleanupAskpassScript(path1);
        await cleanupAskpassScript(path2);
      }
    });
  });

  describe('cleanupAskpassScript', () => {
    it('removes the script file', async () => {
      const scriptPath = await createAskpassScript();

      // File should exist before cleanup
      await expect(access(scriptPath)).resolves.toBeUndefined();

      await cleanupAskpassScript(scriptPath);

      // File should not exist after cleanup
      await expect(access(scriptPath)).rejects.toThrow();
    });

    it('does not throw on non-existent file', async () => {
      await expect(
        cleanupAskpassScript('/nonexistent/path/script.sh')
      ).resolves.toBeUndefined();
    });
  });

  describe('cloneRepository', () => {
    let spawnCallCount: number;
    let spawnCalls: Array<{ command: string; args: string[]; options: { env?: Record<string, string>; cwd?: string } }>;

    beforeEach(() => {
      spawnCallCount = 0;
      spawnCalls = [];

      mockSpawn.mockImplementation((command, args, options) => {
        spawnCalls.push({
          command: command as string,
          args: args as string[],
          options: options as { env?: Record<string, string>; cwd?: string },
        });
        spawnCallCount++;

        const mockProcess: Partial<ChildProcess> = {
          stdin: {
            write: vi.fn(() => true),
            end: vi.fn(),
          } as unknown as NodeJS.WritableStream,
          stdout: {
            on: vi.fn(),
          } as unknown as NodeJS.ReadableStream,
          stderr: {
            on: vi.fn(),
          } as unknown as NodeJS.ReadableStream,
          on: vi.fn((event: string, handler: (code: number | null) => void) => {
            if (event === 'close') {
              setTimeout(() => handler(0), 0);
            }
          }),
        };

        return mockProcess as ChildProcess;
      });
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('clones repository with correct URL and GIT_ASKPASS', async () => {
      const options: CloneRepositoryOptions = {
        apiBase: 'https://api.github.com',
        repo: 'owner/repo',
        pat: 'test-token',
        workspacePath: '/tmp/workspace',
        baseBranch: 'main',
        workBranch: 'feature/test',
      };

      await cloneRepository(options);

      // First call should be git clone
      expect(spawnCalls[0]?.command).toBe('git');
      expect(spawnCalls[0]?.args).toEqual([
        'clone',
        '--branch',
        'main',
        '--progress',
        'https://github.com/owner/repo.git',
        '/tmp/workspace',
      ]);

      // Check environment variables are set
      const cloneEnv = spawnCalls[0]?.options?.env;
      expect(cloneEnv?.GIT_ASKPASS).toMatch(/git-askpass-.*\.sh$/);
      expect(cloneEnv?.GIT_ASKPASS_PASSWORD).toBe('test-token');
      expect(cloneEnv?.GIT_TERMINAL_PROMPT).toBe('0');
    });

    it('creates work branch after cloning', async () => {
      const options: CloneRepositoryOptions = {
        apiBase: 'https://api.github.com',
        repo: 'owner/repo',
        pat: 'test-token',
        workspacePath: '/tmp/workspace',
        baseBranch: 'main',
        workBranch: 'feature/test',
      };

      await cloneRepository(options);

      // Second call should be checkout -b
      expect(spawnCalls[1]?.command).toBe('git');
      expect(spawnCalls[1]?.args).toEqual([
        'checkout',
        '-b',
        'feature/test',
        'main',
      ]);
      expect(spawnCalls[1]?.options?.cwd).toBe('/tmp/workspace');
    });

    it('does not expose PAT in clone command arguments', async () => {
      const secretToken = 'ghp_supersecrettoken123';
      const options: CloneRepositoryOptions = {
        apiBase: 'https://api.github.com',
        repo: 'owner/repo',
        pat: secretToken,
        workspacePath: '/tmp/workspace',
        baseBranch: 'main',
        workBranch: 'feature/test',
      };

      await cloneRepository(options);

      // Check that token is not in any spawn arguments
      for (const call of spawnCalls) {
        const argsString = call.args.join(' ');
        expect(argsString).not.toContain(secretToken);
      }

      // Token should be in environment variable, not command line
      expect(spawnCalls[0]?.options?.env?.GIT_ASKPASS_PASSWORD).toBe(secretToken);
    });

    it('handles GHE URLs correctly', async () => {
      const options: CloneRepositoryOptions = {
        apiBase: 'https://ghe.example.com/api/v3',
        repo: 'org/project',
        pat: 'ghe-token',
        workspacePath: '/tmp/ghe-workspace',
        baseBranch: 'develop',
        workBranch: 'feature/ghe-test',
      };

      await cloneRepository(options);

      // Check clone URL uses GHE host
      expect(spawnCalls[0]?.args).toContain(
        'https://ghe.example.com/org/project.git'
      );
    });

    it('throws GitOperationError when clone fails', async () => {
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        const currentCall = callCount;
        const mockProcess: Partial<ChildProcess> = {
          stdin: {
            write: vi.fn(() => true),
            end: vi.fn(),
          } as unknown as NodeJS.WritableStream,
          stdout: {
            on: vi.fn(),
          } as unknown as NodeJS.ReadableStream,
          stderr: {
            on: vi.fn((event: string, handler: (data: Buffer) => void) => {
              if (event === 'data' && currentCall === 1) {
                handler(Buffer.from('fatal: repository not found'));
              }
            }),
          } as unknown as NodeJS.ReadableStream,
          on: vi.fn(
            (event: string, handler: (code: number | null) => void) => {
              if (event === 'close') {
                // First call (clone) fails
                setTimeout(() => handler(currentCall === 1 ? 128 : 0), 0);
              }
            }
          ),
        };
        return mockProcess as ChildProcess;
      });

      const options: CloneRepositoryOptions = {
        apiBase: 'https://api.github.com',
        repo: 'owner/nonexistent',
        pat: 'test-token',
        workspacePath: '/tmp/workspace',
        baseBranch: 'main',
        workBranch: 'feature/test',
      };

      try {
        await cloneRepository(options);
        expect.fail('Expected GitOperationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GitOperationError);
        expect((error as GitOperationError).operation).toBe('clone');
      }
    });

    it('throws GitOperationError when checkout fails', async () => {
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        const currentCall = callCount;
        const mockProcess: Partial<ChildProcess> = {
          stdin: {
            write: vi.fn(() => true),
            end: vi.fn(),
          } as unknown as NodeJS.WritableStream,
          stdout: {
            on: vi.fn(),
          } as unknown as NodeJS.ReadableStream,
          stderr: {
            on: vi.fn((event: string, handler: (data: Buffer) => void) => {
              if (event === 'data' && currentCall === 2) {
                handler(Buffer.from('error: branch already exists'));
              }
            }),
          } as unknown as NodeJS.ReadableStream,
          on: vi.fn(
            (event: string, handler: (code: number | null) => void) => {
              if (event === 'close') {
                // First call (clone) succeeds, second call (checkout) fails
                setTimeout(() => handler(currentCall === 2 ? 1 : 0), 0);
              }
            }
          ),
        };
        return mockProcess as ChildProcess;
      });

      const options: CloneRepositoryOptions = {
        apiBase: 'https://api.github.com',
        repo: 'owner/repo',
        pat: 'test-token',
        workspacePath: '/tmp/workspace',
        baseBranch: 'main',
        workBranch: 'existing-branch',
      };

      try {
        await cloneRepository(options);
        expect.fail('Expected GitOperationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GitOperationError);
        expect((error as GitOperationError).operation).toBe('checkout');
      }
    });
  });

  describe('GitOperationError', () => {
    it('includes operation name in message', () => {
      const error = new GitOperationError('clone', 128, 'repository not found');
      expect(error.message).toContain('clone');
      expect(error.operation).toBe('clone');
    });

    it('includes exit code in message', () => {
      const error = new GitOperationError('push', 1, 'failed');
      expect(error.message).toContain('1');
      expect(error.exitCode).toBe(1);
    });

    it('handles null exit code', () => {
      const error = new GitOperationError('fetch', null, 'network error');
      expect(error.message).toContain('null');
      expect(error.exitCode).toBeNull();
    });

    it('includes stderr in message', () => {
      const error = new GitOperationError('pull', 1, 'merge conflict');
      expect(error.message).toContain('merge conflict');
      expect(error.stderr).toBe('merge conflict');
    });

    it('has correct error name', () => {
      const error = new GitOperationError('test', 0, '');
      expect(error.name).toBe('GitOperationError');
    });
  });
});

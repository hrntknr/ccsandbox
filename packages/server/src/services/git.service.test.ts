import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  deriveGitHost,
  deriveCloneUrl,
  setupCredentialHelper,
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

  describe('setupCredentialHelper', () => {
    let stdinData: string;
    let mockProcess: Partial<ChildProcess>;

    beforeEach(() => {
      stdinData = '';
      mockProcess = {
        stdin: {
          write: vi.fn((data: string) => {
            stdinData += data;
            return true;
          }),
          end: vi.fn(),
        } as unknown as NodeJS.WritableStream,
        stdout: {
          on: vi.fn((event: string, handler: (data: Buffer) => void) => {
            // No output
          }),
        } as unknown as NodeJS.ReadableStream,
        stderr: {
          on: vi.fn((event: string, handler: (data: Buffer) => void) => {
            // No output
          }),
        } as unknown as NodeJS.ReadableStream,
        on: vi.fn((event: string, handler: (code: number | null) => void) => {
          if (event === 'close') {
            // Simulate successful exit
            setTimeout(() => handler(0), 0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as ChildProcess);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('calls git credential approve with correct arguments', async () => {
      await setupCredentialHelper('https://api.github.com', 'test-token');

      expect(mockSpawn).toHaveBeenCalledWith('git', ['credential', 'approve'], {
        cwd: undefined,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    });

    it('passes credentials via stdin, not arguments', async () => {
      await setupCredentialHelper('https://api.github.com', 'secret-token');

      // Token should be in stdin, not in spawn arguments
      expect(stdinData).toContain('password=secret-token');
      expect(mockSpawn).toHaveBeenCalledTimes(1);
      const spawnArgs = mockSpawn.mock.calls[0];
      expect(spawnArgs?.[1]).not.toContain('secret-token');
    });

    it('formats credential input correctly for github.com', async () => {
      await setupCredentialHelper('https://api.github.com', 'my-pat');

      expect(stdinData).toBe(
        'protocol=https\nhost=github.com\nusername=x-access-token\npassword=my-pat\n'
      );
    });

    it('formats credential input correctly for GHE', async () => {
      await setupCredentialHelper('https://ghe.example.com/api/v3', 'ghe-pat');

      expect(stdinData).toBe(
        'protocol=https\nhost=ghe.example.com\nusername=x-access-token\npassword=ghe-pat\n'
      );
    });

    it('throws GitOperationError on failure', async () => {
      mockProcess.on = vi.fn(
        (event: string, handler: (codeOrError: number | null | Error) => void) => {
          if (event === 'close') {
            setTimeout(() => handler(1), 0);
          }
        }
      );
      mockProcess.stderr = {
        on: vi.fn((event: string, handler: (data: Buffer) => void) => {
          if (event === 'data') {
            handler(Buffer.from('credential error'));
          }
        }),
      } as unknown as NodeJS.ReadableStream;

      await expect(
        setupCredentialHelper('https://api.github.com', 'test-token')
      ).rejects.toThrow(GitOperationError);
    });
  });

  describe('cloneRepository', () => {
    let stdinData: string;
    let spawnCallCount: number;
    let spawnCalls: Array<{ command: string; args: string[]; options: unknown }>;

    beforeEach(() => {
      stdinData = '';
      spawnCallCount = 0;
      spawnCalls = [];

      mockSpawn.mockImplementation((command, args, options) => {
        spawnCalls.push({
          command: command as string,
          args: args as string[],
          options,
        });
        spawnCallCount++;

        const mockProcess: Partial<ChildProcess> = {
          stdin: {
            write: vi.fn((data: string) => {
              stdinData += data;
              return true;
            }),
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

    it('sets up credential helper before cloning', async () => {
      const options: CloneRepositoryOptions = {
        apiBase: 'https://api.github.com',
        repo: 'owner/repo',
        pat: 'test-token',
        workspacePath: '/tmp/workspace',
        baseBranch: 'main',
        workBranch: 'feature/test',
      };

      await cloneRepository(options);

      // First call should be credential approve
      expect(spawnCalls[0]?.command).toBe('git');
      expect(spawnCalls[0]?.args).toEqual(['credential', 'approve']);
    });

    it('clones repository with correct URL', async () => {
      const options: CloneRepositoryOptions = {
        apiBase: 'https://api.github.com',
        repo: 'owner/repo',
        pat: 'test-token',
        workspacePath: '/tmp/workspace',
        baseBranch: 'main',
        workBranch: 'feature/test',
      };

      await cloneRepository(options);

      // Second call should be git clone
      expect(spawnCalls[1]?.command).toBe('git');
      expect(spawnCalls[1]?.args).toEqual([
        'clone',
        '--branch',
        'main',
        '--progress',
        'https://github.com/owner/repo.git',
        '/tmp/workspace',
      ]);
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

      // Third call should be checkout -b
      expect(spawnCalls[2]?.command).toBe('git');
      expect(spawnCalls[2]?.args).toEqual([
        'checkout',
        '-b',
        'feature/test',
        'main',
      ]);
      expect(spawnCalls[2]?.options).toEqual({
        cwd: '/tmp/workspace',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
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

      // Token should only appear in stdin for credential approve
      expect(stdinData).toContain(secretToken);
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

      // Check credential helper uses GHE host
      expect(stdinData).toContain('host=ghe.example.com');

      // Check clone URL uses GHE host
      expect(spawnCalls[1]?.args).toContain(
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
              if (event === 'data' && currentCall === 2) {
                handler(Buffer.from('fatal: repository not found'));
              }
            }),
          } as unknown as NodeJS.ReadableStream,
          on: vi.fn(
            (event: string, handler: (code: number | null) => void) => {
              if (event === 'close') {
                // First call (credential) succeeds, second call (clone) fails
                setTimeout(() => handler(currentCall === 2 ? 128 : 0), 0);
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
              if (event === 'data' && currentCall === 3) {
                handler(Buffer.from('error: branch already exists'));
              }
            }),
          } as unknown as NodeJS.ReadableStream,
          on: vi.fn(
            (event: string, handler: (code: number | null) => void) => {
              if (event === 'close') {
                // First two calls succeed, third call (checkout) fails
                setTimeout(() => handler(currentCall === 3 ? 1 : 0), 0);
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

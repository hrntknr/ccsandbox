import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as childProcess from 'node:child_process';
import {
  hasDevcontainerConfig,
  startDevcontainer,
  stopContainer,
  removeContainer,
  isContainerRunning,
  getContainerId,
  isValidContainerId,
  DevcontainerConfigNotFoundError,
  DevcontainerCliError,
  DockerOperationError,
  InvalidContainerIdError,
} from './devcontainer.service.js';

// Mock child_process.spawn
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual('node:child_process');
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

describe('devcontainer.service', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `devcontainer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.resetAllMocks();
  });

  describe('hasDevcontainerConfig', () => {
    it('returns true when .devcontainer.json exists in root', async () => {
      await writeFile(join(testDir, '.devcontainer.json'), '{}');

      const result = await hasDevcontainerConfig(testDir);

      expect(result).toBe(true);
    });

    it('returns true when .devcontainer/devcontainer.json exists', async () => {
      await mkdir(join(testDir, '.devcontainer'));
      await writeFile(join(testDir, '.devcontainer', 'devcontainer.json'), '{}');

      const result = await hasDevcontainerConfig(testDir);

      expect(result).toBe(true);
    });

    it('returns true when .devcontainer/<subfolder>/devcontainer.json exists', async () => {
      await mkdir(join(testDir, '.devcontainer', 'my-config'), { recursive: true });
      await writeFile(
        join(testDir, '.devcontainer', 'my-config', 'devcontainer.json'),
        '{}'
      );

      const result = await hasDevcontainerConfig(testDir);

      expect(result).toBe(true);
    });

    it('returns false when no devcontainer config exists', async () => {
      const result = await hasDevcontainerConfig(testDir);

      expect(result).toBe(false);
    });

    it('returns false when .devcontainer directory exists but has no devcontainer.json', async () => {
      await mkdir(join(testDir, '.devcontainer'));
      await writeFile(join(testDir, '.devcontainer', 'other-file.txt'), 'content');

      const result = await hasDevcontainerConfig(testDir);

      expect(result).toBe(false);
    });
  });

  describe('startDevcontainer', () => {
    function mockSpawn(
      stdout: string,
      stderr: string,
      exitCode: number
    ) {
      const mockProc = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(stdout));
            }
          }),
        },
        stderr: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(stderr));
            }
          }),
        },
        stdin: {
          write: vi.fn(),
          end: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setImmediate(() => callback(exitCode));
          }
        }),
      };

      vi.mocked(childProcess.spawn).mockReturnValue(mockProc as unknown as childProcess.ChildProcess);
      return mockProc;
    }

    it('throws DevcontainerConfigNotFoundError when no config exists', async () => {
      await expect(startDevcontainer(testDir)).rejects.toThrow(
        DevcontainerConfigNotFoundError
      );
    });

    it('starts devcontainer and returns container info on success', async () => {
      // Create devcontainer config
      await mkdir(join(testDir, '.devcontainer'));
      await writeFile(join(testDir, '.devcontainer', 'devcontainer.json'), '{}');

      const devcontainerOutput = JSON.stringify({
        outcome: 'success',
        containerId: 'abc123def456',
        containerName: 'test-container',
        remoteUser: 'vscode',
      });

      mockSpawn(devcontainerOutput, '', 0);

      const result = await startDevcontainer(testDir);

      expect(result).toEqual({
        containerId: 'abc123def456',
        containerName: 'test-container',
        remoteUser: 'vscode',
      });

      expect(childProcess.spawn).toHaveBeenCalledWith(
        'devcontainer',
        ['up', '--workspace-folder', testDir],
        expect.any(Object)
      );
    });

    it('uses custom devcontainer CLI path when provided', async () => {
      await mkdir(join(testDir, '.devcontainer'));
      await writeFile(join(testDir, '.devcontainer', 'devcontainer.json'), '{}');

      const devcontainerOutput = JSON.stringify({
        outcome: 'success',
        containerId: 'abc123',
      });

      mockSpawn(devcontainerOutput, '', 0);

      await startDevcontainer(testDir, '/custom/path/devcontainer');

      expect(childProcess.spawn).toHaveBeenCalledWith(
        '/custom/path/devcontainer',
        ['up', '--workspace-folder', testDir],
        expect.any(Object)
      );
    });

    it('throws DevcontainerCliError when exit code is non-zero', async () => {
      await mkdir(join(testDir, '.devcontainer'));
      await writeFile(join(testDir, '.devcontainer', 'devcontainer.json'), '{}');

      mockSpawn('', 'Error: something went wrong', 1);

      await expect(startDevcontainer(testDir)).rejects.toThrow(DevcontainerCliError);
    });

    it('throws DevcontainerCliError when outcome is error', async () => {
      await mkdir(join(testDir, '.devcontainer'));
      await writeFile(join(testDir, '.devcontainer', 'devcontainer.json'), '{}');

      const devcontainerOutput = JSON.stringify({
        outcome: 'error',
        message: 'Build failed',
      });

      mockSpawn(devcontainerOutput, '', 0);

      await expect(startDevcontainer(testDir)).rejects.toThrow(DevcontainerCliError);
    });

    it('throws DevcontainerCliError when containerId is missing', async () => {
      await mkdir(join(testDir, '.devcontainer'));
      await writeFile(join(testDir, '.devcontainer', 'devcontainer.json'), '{}');

      const devcontainerOutput = JSON.stringify({
        outcome: 'success',
        // No containerId
      });

      mockSpawn(devcontainerOutput, '', 0);

      await expect(startDevcontainer(testDir)).rejects.toThrow(DevcontainerCliError);
    });
  });

  describe('isValidContainerId', () => {
    it('returns true for 64-character hex (full container ID)', () => {
      const fullId = 'a'.repeat(64);
      expect(isValidContainerId(fullId)).toBe(true);
    });

    it('returns true for 64-character hex with mixed case', () => {
      const fullId = 'aAbBcCdDeEfF0123456789'.padEnd(64, '0');
      expect(isValidContainerId(fullId)).toBe(true);
    });

    it('returns true for 12-character hex (short container ID)', () => {
      expect(isValidContainerId('abc123def456')).toBe(true);
    });

    it('returns true for valid container name starting with letter', () => {
      expect(isValidContainerId('my-container')).toBe(true);
    });

    it('returns true for valid container name starting with number', () => {
      expect(isValidContainerId('1container')).toBe(true);
    });

    it('returns true for container name with underscores and dots', () => {
      expect(isValidContainerId('my_container.name-123')).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(isValidContainerId('')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isValidContainerId(null as unknown as string)).toBe(false);
      expect(isValidContainerId(undefined as unknown as string)).toBe(false);
    });

    it('returns false for container name starting with hyphen', () => {
      expect(isValidContainerId('-invalid')).toBe(false);
    });

    it('returns false for container name starting with underscore', () => {
      expect(isValidContainerId('_invalid')).toBe(false);
    });

    it('returns false for container name starting with dot', () => {
      expect(isValidContainerId('.invalid')).toBe(false);
    });

    it('returns false for container name with spaces', () => {
      expect(isValidContainerId('invalid name')).toBe(false);
    });

    it('returns false for container name with special characters', () => {
      expect(isValidContainerId('invalid;rm -rf /')).toBe(false);
      expect(isValidContainerId('invalid$(whoami)')).toBe(false);
      expect(isValidContainerId('invalid`id`')).toBe(false);
    });

    it('returns false for container name with newlines', () => {
      expect(isValidContainerId('invalid\nname')).toBe(false);
    });

    it('returns true for 63-character hex (valid as container name)', () => {
      // 63-character hex is valid as a container name (matches [a-zA-Z0-9][a-zA-Z0-9_.-]*)
      const id = 'a'.repeat(63);
      expect(isValidContainerId(id)).toBe(true);
    });

    it('returns true for 65-character hex (valid as container name)', () => {
      // 65-character hex is valid as a container name (matches [a-zA-Z0-9][a-zA-Z0-9_.-]*)
      const id = 'a'.repeat(65);
      expect(isValidContainerId(id)).toBe(true);
    });

    it('returns true for 11-character hex (valid as container name)', () => {
      // 11-character hex is valid as a container name
      expect(isValidContainerId('abc123def45')).toBe(true);
    });

    it('returns true for 13-character hex (valid as container name)', () => {
      // 13-character hex is valid as a container name
      expect(isValidContainerId('abc123def4567')).toBe(true);
    });
  });

  describe('stopContainer', () => {
    function mockSpawn(exitCode: number, stderr = '') {
      const mockProc = {
        stdout: {
          on: vi.fn(),
        },
        stderr: {
          on: vi.fn((event, callback) => {
            if (event === 'data' && stderr) {
              callback(Buffer.from(stderr));
            }
          }),
        },
        stdin: {
          write: vi.fn(),
          end: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setImmediate(() => callback(exitCode));
          }
        }),
      };

      vi.mocked(childProcess.spawn).mockReturnValue(mockProc as unknown as childProcess.ChildProcess);
    }

    it('stops container successfully', async () => {
      mockSpawn(0);

      await stopContainer('container123');

      expect(childProcess.spawn).toHaveBeenCalledWith(
        'docker',
        ['stop', 'container123'],
        expect.any(Object)
      );
    });

    it('throws DockerOperationError on failure', async () => {
      mockSpawn(1, 'No such container');

      await expect(stopContainer('nonexistent')).rejects.toThrow(DockerOperationError);
    });

    it('throws InvalidContainerIdError for invalid container ID', async () => {
      await expect(stopContainer('invalid;rm -rf /')).rejects.toThrow(InvalidContainerIdError);
      expect(childProcess.spawn).not.toHaveBeenCalled();
    });

    it('throws InvalidContainerIdError for empty container ID', async () => {
      await expect(stopContainer('')).rejects.toThrow(InvalidContainerIdError);
      expect(childProcess.spawn).not.toHaveBeenCalled();
    });
  });

  describe('removeContainer', () => {
    function mockSpawn(exitCode: number, stderr = '') {
      const mockProc = {
        stdout: {
          on: vi.fn(),
        },
        stderr: {
          on: vi.fn((event, callback) => {
            if (event === 'data' && stderr) {
              callback(Buffer.from(stderr));
            }
          }),
        },
        stdin: {
          write: vi.fn(),
          end: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setImmediate(() => callback(exitCode));
          }
        }),
      };

      vi.mocked(childProcess.spawn).mockReturnValue(mockProc as unknown as childProcess.ChildProcess);
    }

    it('removes container successfully', async () => {
      mockSpawn(0);

      await removeContainer('container123');

      expect(childProcess.spawn).toHaveBeenCalledWith(
        'docker',
        ['rm', 'container123'],
        expect.any(Object)
      );
    });

    it('removes container with force flag', async () => {
      mockSpawn(0);

      await removeContainer('container123', true);

      expect(childProcess.spawn).toHaveBeenCalledWith(
        'docker',
        ['rm', '-f', 'container123'],
        expect.any(Object)
      );
    });

    it('throws DockerOperationError on failure', async () => {
      mockSpawn(1, 'No such container');

      await expect(removeContainer('nonexistent')).rejects.toThrow(DockerOperationError);
    });

    it('throws InvalidContainerIdError for invalid container ID', async () => {
      await expect(removeContainer('invalid`id`')).rejects.toThrow(InvalidContainerIdError);
      expect(childProcess.spawn).not.toHaveBeenCalled();
    });

    it('throws InvalidContainerIdError for invalid container ID with force flag', async () => {
      await expect(removeContainer('invalid name', true)).rejects.toThrow(InvalidContainerIdError);
      expect(childProcess.spawn).not.toHaveBeenCalled();
    });
  });

  describe('isContainerRunning', () => {
    function mockSpawn(stdout: string, exitCode: number) {
      const mockProc = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(stdout));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        stdin: {
          write: vi.fn(),
          end: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setImmediate(() => callback(exitCode));
          }
        }),
      };

      vi.mocked(childProcess.spawn).mockReturnValue(mockProc as unknown as childProcess.ChildProcess);
    }

    it('returns true when container is running', async () => {
      mockSpawn('true\n', 0);

      const result = await isContainerRunning('container123');

      expect(result).toBe(true);
    });

    it('returns false when container is not running', async () => {
      mockSpawn('false\n', 0);

      const result = await isContainerRunning('container123');

      expect(result).toBe(false);
    });

    it('returns false when container does not exist', async () => {
      mockSpawn('', 1);

      const result = await isContainerRunning('nonexistent');

      expect(result).toBe(false);
    });

    it('throws InvalidContainerIdError for invalid container ID', async () => {
      await expect(isContainerRunning('invalid;whoami')).rejects.toThrow(InvalidContainerIdError);
      expect(childProcess.spawn).not.toHaveBeenCalled();
    });
  });

  describe('getContainerId', () => {
    function mockSpawn(stdout: string, exitCode: number) {
      const mockProc = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(stdout));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        stdin: {
          write: vi.fn(),
          end: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setImmediate(() => callback(exitCode));
          }
        }),
      };

      vi.mocked(childProcess.spawn).mockReturnValue(mockProc as unknown as childProcess.ChildProcess);
    }

    it('returns container ID when container exists', async () => {
      mockSpawn('sha256:abc123def456\n', 0);

      const result = await getContainerId('container123');

      expect(result).toBe('sha256:abc123def456');
    });

    it('returns null when container does not exist', async () => {
      mockSpawn('', 1);

      const result = await getContainerId('nonexistent');

      expect(result).toBeNull();
    });

    it('throws InvalidContainerIdError for invalid container ID', async () => {
      await expect(getContainerId('invalid\nname')).rejects.toThrow(InvalidContainerIdError);
      expect(childProcess.spawn).not.toHaveBeenCalled();
    });
  });
});

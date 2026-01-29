import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const cliPath = path.resolve(__dirname, '../index.ts');

function runCli(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node --import tsx ${cliPath} ${args}`, {
      encoding: 'utf-8',
      cwd: path.resolve(__dirname, '../../'),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? '',
      exitCode: execError.status ?? 1,
    };
  }
}

describe('CLI', () => {
  describe('--help', () => {
    it('should display help information', () => {
      const result = runCli('--help');
      expect(result.stdout).toContain('ccsandbox');
      expect(result.stdout).toContain('--pat <token>');
      expect(result.stdout).toContain('--api-base <url>');
      expect(result.stdout).toContain('--repo-dir <path>');
      expect(result.stdout).toContain('--listen <host>');
      expect(result.stdout).toContain('--port <port>');
      expect(result.stdout).toContain('--devcontainer-cli <path>');
    });
  });

  describe('--version', () => {
    it('should display version', () => {
      const result = runCli('--version');
      expect(result.stdout.trim()).toBe('0.0.0');
    });
  });

  describe('required options', () => {
    it('should error when --pat is missing', () => {
      const result = runCli('--api-base https://api.github.com --port 0');
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('--pat');
    });

    it('should use default api-base when not specified', () => {
      // --api-base has a default value of https://api.github.com
      // So this should not error for missing api-base
      // We use --help to avoid actually starting a server
      const result = runCli('--help');
      expect(result.stdout).toContain('--api-base');
      expect(result.stdout).toContain('default');
      expect(result.stdout).toContain('api.github.com');
    });
  });
});

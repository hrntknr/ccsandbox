import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const cliPath = path.resolve(__dirname, '../../cli.ts');

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

});

/**
 * Wrapper script generator for running Claude CLI inside devcontainer
 */

import { writeFileSync, chmodSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export interface WrapperOptions {
  workspacePath: string;
  devcontainerCliPath?: string;
  configPath?: string;
  remoteEnv?: string[];
}

/**
 * Create a wrapper script that executes Claude CLI inside devcontainer.
 * The SDK will spawn this wrapper, and the wrapper will forward arguments to
 * `devcontainer exec ... claude "$@"`.
 *
 * @param scratchDir - Directory to store the wrapper script
 * @param tabId - Unique identifier for this Claude tab
 * @param options - Wrapper configuration options
 * @returns Path to the created wrapper script
 */
export function createWrapper(
  scratchDir: string,
  tabId: string,
  options: WrapperOptions
): string {
  // Ensure directory exists
  if (!existsSync(scratchDir)) {
    mkdirSync(scratchDir, { recursive: true });
  }

  const wrapperPath = join(scratchDir, `claude-wrapper-${tabId}.sh`);
  const devcontainerCli = options.devcontainerCliPath ?? 'devcontainer';

  // Build the wrapper script
  const lines: string[] = [
    '#!/bin/bash',
    'set -e',
    '',
    '# Wrapper script to run Claude CLI inside devcontainer',
    `# Generated for tab: ${tabId}`,
    '',
  ];

  // Build devcontainer exec command
  const execArgs: string[] = [
    devcontainerCli,
    'exec',
    '--workspace-folder',
    `"${options.workspacePath}"`,
  ];

  // Add config path for template-based sessions
  if (options.configPath) {
    execArgs.push('--config', `"${options.configPath}"`);
  }

  // Add remote environment variables
  if (options.remoteEnv) {
    for (const env of options.remoteEnv) {
      execArgs.push('--remote-env', `"${env}"`);
    }
  }

  // Add the claude command with all arguments passed through
  execArgs.push('--', 'claude', '"$@"');

  lines.push(`exec ${execArgs.join(' \\\n  ')}`);
  lines.push('');

  const script = lines.join('\n');

  writeFileSync(wrapperPath, script);
  chmodSync(wrapperPath, 0o755);

  return wrapperPath;
}

/**
 * Remove a wrapper script
 */
export function removeWrapper(wrapperPath: string): void {
  try {
    const { unlinkSync } = require('node:fs');
    if (existsSync(wrapperPath)) {
      unlinkSync(wrapperPath);
    }
  } catch {
    // Ignore errors when removing wrapper
  }
}

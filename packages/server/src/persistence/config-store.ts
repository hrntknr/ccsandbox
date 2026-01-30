import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { EditableConfig } from '@ccsandbox/shared';

/**
 * Config store that persists editable configuration to a JSON file.
 * Follows the same pattern as session-store.ts.
 */
export class ConfigStore {
  private readonly configFilePath: string;
  private lockPromise: Promise<void> | null = null;

  /**
   * Creates a new ConfigStore.
   *
   * @param repoDir - Base directory for data (default: $HOME/.ccsandbox)
   */
  constructor(repoDir?: string) {
    const baseDir = repoDir ?? join(process.env['HOME'] ?? homedir(), '.ccsandbox');
    this.configFilePath = join(baseDir, '.ccsandbox', 'config.json');
  }

  /**
   * Executes a function with exclusive lock to prevent race conditions.
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    while (this.lockPromise) {
      await this.lockPromise;
    }

    let resolve: () => void;
    this.lockPromise = new Promise((r) => {
      resolve = r;
    });

    try {
      return await fn();
    } finally {
      this.lockPromise = null;
      resolve!();
    }
  }

  /**
   * Ensures the directory for config.json exists.
   */
  private async ensureDirectory(): Promise<void> {
    const dir = dirname(this.configFilePath);
    await mkdir(dir, { recursive: true });
  }

  /**
   * Reads configuration from the JSON file.
   * Returns empty object if file does not exist.
   */
  async read(): Promise<EditableConfig> {
    try {
      const content = await readFile(this.configFilePath, 'utf-8');
      return JSON.parse(content) as EditableConfig;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return {};
      }
      throw error;
    }
  }

  /**
   * Writes configuration to the JSON file.
   * Merges provided updates with existing configuration.
   */
  async write(updates: Partial<EditableConfig>): Promise<EditableConfig> {
    return this.withLock(async () => {
      const existing = await this.read();
      const merged: EditableConfig = { ...existing };

      // Merge updates, handling undefined values (delete if explicitly set to empty string)
      for (const [key, value] of Object.entries(updates)) {
        if (value === '' || value === undefined) {
          delete merged[key as keyof EditableConfig];
        } else {
          (merged as Record<string, unknown>)[key] = value;
        }
      }

      await this.ensureDirectory();
      await writeFile(this.configFilePath, JSON.stringify(merged, null, 2));

      return merged;
    });
  }
}

// Singleton instance for shared state across the application
let configStoreInstance: ConfigStore | null = null;

/**
 * Gets the singleton ConfigStore instance.
 * Creates the instance on first call using the provided repoDir.
 */
export function getConfigStore(repoDir?: string): ConfigStore {
  if (!configStoreInstance) {
    configStoreInstance = new ConfigStore(repoDir);
  }
  return configStoreInstance;
}

/**
 * Resets the singleton ConfigStore instance (for testing).
 */
export function resetConfigStore(): void {
  configStoreInstance = null;
}

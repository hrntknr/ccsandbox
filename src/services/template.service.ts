import { readdir, readFile, stat, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DevcontainerTemplate } from '../shared/index.js';

/**
 * Error thrown when template is not found.
 */
export class TemplateNotFoundError extends Error {
  constructor(public readonly templateId: string) {
    super(`Template not found: ${templateId}`);
    this.name = 'TemplateNotFoundError';
  }
}

/**
 * Valid template ID pattern: alphanumeric, hyphens, and underscores only.
 */
const TEMPLATE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Check if a template ID is valid.
 */
export function isValidTemplateId(id: string): boolean {
  return TEMPLATE_ID_PATTERN.test(id);
}

/**
 * Check if a path exists.
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Cached builtin templates directory path */
let builtinTemplatesDirCache: string | null = null;

/**
 * Get the builtin templates directory path.
 * In development (tsx), this is src/templates.
 * In production (esbuild bundle), this is dist/templates.
 */
async function getBuiltinTemplatesDir(): Promise<string> {
  if (builtinTemplatesDirCache) {
    return builtinTemplatesDirCache;
  }

  const currentFileDir = dirname(fileURLToPath(import.meta.url));

  // In development (tsx): src/services/template.service.ts
  // currentFileDir = src/services -> ../templates = src/templates
  const devPath = join(currentFileDir, '..', 'templates');

  // In production (esbuild): dist/cli.js
  // currentFileDir = dist -> templates = dist/templates
  const prodPath = join(currentFileDir, 'templates');

  // Try development path first, then production path
  if (await pathExists(devPath)) {
    builtinTemplatesDirCache = devPath;
  } else {
    builtinTemplatesDirCache = prodPath;
  }

  return builtinTemplatesDirCache;
}

/**
 * Copy a directory recursively.
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });

  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

/**
 * Interface for devcontainer.json metadata fields.
 */
interface DevcontainerJson {
  name?: string;
  description?: string;
}

/**
 * List all available devcontainer templates from the builtin templates directory.
 */
export async function listTemplates(): Promise<DevcontainerTemplate[]> {
  const templatesDir = await getBuiltinTemplatesDir();
  const templates: DevcontainerTemplate[] = [];

  try {
    const entries = await readdir(templatesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const templateId = entry.name;

      // Skip invalid template IDs
      if (!isValidTemplateId(templateId)) {
        continue;
      }

      const configPath = join(templatesDir, templateId, 'devcontainer.json');

      try {
        const content = await readFile(configPath, 'utf-8');
        const config = JSON.parse(content) as DevcontainerJson;

        templates.push({
          id: templateId,
          name: config.name ?? templateId,
          description: config.description,
          configPath,
        });
      } catch {
        // Skip directories without valid devcontainer.json
        continue;
      }
    }
  } catch {
    // Return empty array if templates directory doesn't exist
    return [];
  }

  // Sort by id for consistent ordering
  templates.sort((a, b) => a.id.localeCompare(b.id));

  return templates;
}

/**
 * Get a template by ID.
 *
 * @throws TemplateNotFoundError if template does not exist
 */
export async function getTemplateById(templateId: string): Promise<DevcontainerTemplate> {
  if (!isValidTemplateId(templateId)) {
    throw new TemplateNotFoundError(templateId);
  }

  const templates = await listTemplates();
  const template = templates.find((t) => t.id === templateId);

  if (!template) {
    throw new TemplateNotFoundError(templateId);
  }

  return template;
}

/**
 * Copy a template to a session directory.
 * Returns the path to the copied devcontainer.json.
 *
 * @param templateId - Template ID to copy
 * @param configDir - Config directory (e.g., ~/.ccsandbox)
 * @param sessionId - Session ID
 * @returns Path to the copied devcontainer.json in the session directory
 * @throws TemplateNotFoundError if template does not exist
 */
export async function copyTemplateToSession(
  templateId: string,
  configDir: string,
  sessionId: string
): Promise<string> {
  const template = await getTemplateById(templateId);
  const templateDir = dirname(template.configPath);

  // Copy to sessions/<sessionId>/devcontainer/ to avoid mixing with gitconfig etc.
  const destDir = join(configDir, 'sessions', sessionId, 'devcontainer');
  await mkdir(destDir, { recursive: true });

  // Copy entire template directory to session
  const entries = await readdir(templateDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(templateDir, entry.name);
    const destPath = join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }

  return join(destDir, 'devcontainer.json');
}

/**
 * Reset the builtin templates directory cache (for testing).
 */
export function resetTemplatesDir(): void {
  builtinTemplatesDirCache = null;
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import {
  listTemplates,
  getTemplateById,
  isValidTemplateId,
  TemplateNotFoundError,
  resetTemplatesDir,
} from '../services/template.service.js';

// Mock fs/promises
vi.mock('node:fs/promises');

// Helper to create mock Dirent
function mockDirent(name: string, isDir: boolean): Dirent<string> {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
  } as Dirent<string>;
}

describe('template.service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetTemplatesDir();
    // Mock stat to make the builtin templates directory exist
    vi.mocked(fs.stat).mockResolvedValue({} as fs.Stats);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetTemplatesDir();
  });

  describe('isValidTemplateId', () => {
    it('should accept alphanumeric IDs', () => {
      expect(isValidTemplateId('ubuntu')).toBe(true);
      expect(isValidTemplateId('Ubuntu22')).toBe(true);
      expect(isValidTemplateId('node18')).toBe(true);
    });

    it('should accept IDs with hyphens and underscores', () => {
      expect(isValidTemplateId('node-18')).toBe(true);
      expect(isValidTemplateId('node_18')).toBe(true);
      expect(isValidTemplateId('my-template-v2')).toBe(true);
    });

    it('should reject IDs with invalid characters', () => {
      expect(isValidTemplateId('my template')).toBe(false);
      expect(isValidTemplateId('my.template')).toBe(false);
      expect(isValidTemplateId('my/template')).toBe(false);
      expect(isValidTemplateId('../etc/passwd')).toBe(false);
      expect(isValidTemplateId('')).toBe(false);
    });
  });

  describe('listTemplates', () => {
    it('should return empty array if templates directory does not exist', async () => {
      vi.mocked(fs.readdir).mockRejectedValue({ code: 'ENOENT' });

      const templates = await listTemplates();

      expect(templates).toEqual([]);
    });

    it('should return templates from valid directories', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        mockDirent('ubuntu', true),
        mockDirent('node', true),
        mockDirent('README.md', false),
      ]);

      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr.includes('ubuntu')) {
          return JSON.stringify({ name: 'Ubuntu', description: 'Ubuntu base image' });
        }
        if (pathStr.includes('node')) {
          return JSON.stringify({ name: 'Node.js' });
        }
        throw new Error('File not found');
      });

      const templates = await listTemplates();

      expect(templates).toHaveLength(2);
      expect(templates[0]).toMatchObject({
        id: 'node',
        name: 'Node.js',
        description: undefined,
      });
      expect(templates[1]).toMatchObject({
        id: 'ubuntu',
        name: 'Ubuntu',
        description: 'Ubuntu base image',
      });
    });

    it('should skip directories with invalid IDs', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        mockDirent('valid-id', true),
        mockDirent('invalid id', true),
        mockDirent('../escape', true),
      ]);

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ name: 'Valid' }));

      const templates = await listTemplates();

      expect(templates).toHaveLength(1);
      expect(templates[0]?.id).toBe('valid-id');
    });

    it('should skip directories without devcontainer.json', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        mockDirent('with-config', true),
        mockDirent('without-config', true),
      ]);

      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr.includes('with-config')) {
          return JSON.stringify({ name: 'With Config' });
        }
        throw new Error('ENOENT');
      });

      const templates = await listTemplates();

      expect(templates).toHaveLength(1);
      expect(templates[0]?.id).toBe('with-config');
    });

    it('should use folder name if name is not in config', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        mockDirent('my-template', true),
      ]);

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({}));

      const templates = await listTemplates();

      expect(templates).toHaveLength(1);
      expect(templates[0]).toMatchObject({
        id: 'my-template',
        name: 'my-template',
      });
    });
  });

  describe('getTemplateById', () => {
    it('should return template if found', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        mockDirent('ubuntu', true),
      ]);

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ name: 'Ubuntu' }));

      const template = await getTemplateById('ubuntu');

      expect(template).toMatchObject({
        id: 'ubuntu',
        name: 'Ubuntu',
      });
    });

    it('should throw TemplateNotFoundError if template does not exist', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([]);

      await expect(getTemplateById('nonexistent')).rejects.toThrow(TemplateNotFoundError);
    });

    it('should throw TemplateNotFoundError for invalid template ID', async () => {
      await expect(getTemplateById('../etc/passwd')).rejects.toThrow(TemplateNotFoundError);
    });
  });
});

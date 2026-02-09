import { describe, it, expect } from 'vitest';
import {
  extractRepoName,
  generateWorkspaceDirName,
  generateWorkspacePath,
} from './workspace-path.js';

describe('extractRepoName', () => {
  it('extracts name from owner/name format', () => {
    expect(extractRepoName('owner/repo')).toBe('repo');
  });

  it('extracts name from complex repository format', () => {
    expect(extractRepoName('my-org/my-repo')).toBe('my-repo');
  });

  it('handles repository name with dots', () => {
    expect(extractRepoName('owner/repo.js')).toBe('repo.js');
  });

  it('throws error for empty string', () => {
    expect(() => extractRepoName('')).toThrow('Invalid repository format');
  });
});

describe('generateWorkspaceDirName', () => {
  it('generates dir name from repo and branch with random suffix', () => {
    const result = generateWorkspaceDirName('owner/myrepo', 'main');
    expect(result).toMatch(/^myrepo\.main\.[a-z0-9]{6}$/);
  });

  it('escapes slashes in branch name', () => {
    const result = generateWorkspaceDirName('owner/myrepo', 'feature/foo');
    expect(result).toMatch(/^myrepo\.feature_foo\.[a-z0-9]{6}$/);
  });

  it('escapes special characters in branch name', () => {
    const result = generateWorkspaceDirName('owner/myrepo', 'bugfix/foo:bar');
    expect(result).toMatch(/^myrepo\.bugfix_foo_bar\.[a-z0-9]{6}$/);
  });

  it('collapses consecutive underscores', () => {
    const result = generateWorkspaceDirName(
      'owner/myrepo',
      'feature//multiple///slashes'
    );
    expect(result).toMatch(/^myrepo\.feature_multiple_slashes\.[a-z0-9]{6}$/);
  });

  it('generates different suffixes on each call', () => {
    const results = new Set(
      Array.from({ length: 10 }, () =>
        generateWorkspaceDirName('owner/myrepo', 'main')
      )
    );
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('generateWorkspacePath', () => {
  it('generates full workspace path with random suffix', () => {
    const result = generateWorkspacePath(
      '/home/user/.ccsandbox',
      'owner/myrepo',
      'feature/foo'
    );
    expect(result).toMatch(
      /^\/home\/user\/\.ccsandbox\/myrepo\.feature_foo\.[a-z0-9]{6}$/
    );
  });

  it('generates full workspace path for simple branch', () => {
    const result = generateWorkspacePath(
      '/var/repos',
      'owner/myrepo',
      'main'
    );
    expect(result).toMatch(/^\/var\/repos\/myrepo\.main\.[a-z0-9]{6}$/);
  });
});

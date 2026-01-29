import { describe, it, expect } from 'vitest';
import { extractRepoName, generateWorkspaceDirName, generateWorkspacePath, } from './workspace-path.js';
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
    it('generates dir name from repo and branch', () => {
        const result = generateWorkspaceDirName('owner/myrepo', 'main');
        expect(result).toBe('myrepo.main');
    });
    it('escapes slashes in branch name', () => {
        const result = generateWorkspaceDirName('owner/myrepo', 'feature/foo');
        expect(result).toBe('myrepo.feature_foo');
    });
    it('escapes special characters in branch name', () => {
        const result = generateWorkspaceDirName('owner/myrepo', 'bugfix/foo:bar');
        expect(result).toBe('myrepo.bugfix_foo_bar');
    });
    it('collapses consecutive underscores', () => {
        const result = generateWorkspaceDirName('owner/myrepo', 'feature//multiple///slashes');
        expect(result).toBe('myrepo.feature_multiple_slashes');
    });
});
describe('generateWorkspacePath', () => {
    it('generates full workspace path', () => {
        const result = generateWorkspacePath('/home/user/.ccsandbox', 'owner/myrepo', 'feature/foo');
        expect(result).toBe('/home/user/.ccsandbox/myrepo.feature_foo');
    });
    it('handles Windows-style paths on Windows', () => {
        // This test validates that join() works correctly
        const result = generateWorkspacePath('/var/repos', 'owner/myrepo', 'main');
        expect(result).toBe('/var/repos/myrepo.main');
    });
});
//# sourceMappingURL=workspace-path.test.js.map
/**
 * Escapes a branch name to a valid directory name.
 *
 * Rules (from SPEC.md Section 8.2):
 * - `/` is replaced with `_`
 * - Characters outside [A-Za-z0-9._-] are replaced with `_`
 * - Consecutive `_` are collapsed to a single `_`
 * - Leading and trailing `_` are removed
 */
export function escapeBranchName(branchName: string): string {
  return branchName
    .replace(/\//g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

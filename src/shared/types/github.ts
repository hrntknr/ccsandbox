/**
 * GitHub repository information.
 */
export interface Repository {
  /** Full name in owner/name format */
  fullName: string;
  /** Repository owner (user or organization) */
  owner: string;
  /** Repository name */
  name: string;
  /** Default branch name */
  defaultBranch: string;
  /** Whether the repository is private */
  isPrivate: boolean;
  /** Repository description */
  description: string | null;
  /** Clone URL (HTTPS) */
  cloneUrl: string;
}

/**
 * GitHub branch information.
 */
export interface Branch {
  /** Branch name */
  name: string;
  /** Whether the branch is protected */
  isProtected: boolean;
}

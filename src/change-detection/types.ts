/**
 * Types for git change detection
 */

/**
 * Type of change detected for a file
 */
export type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

/**
 * A file change detected from git diff
 */
export interface FileChange {
  /** Relative path to the file (new path for renames) */
  path: string;
  /** Type of change */
  status: ChangeType;
  /** Original path for renamed files */
  oldPath?: string;
}

/**
 * Result of change detection
 */
export interface ChangeDetectionResult {
  /** Current commit hash */
  currentCommit: string;
  /** Commit hash we're comparing from */
  baseCommit: string;
  /** List of changed files */
  changes: FileChange[];
  /** Whether uncommitted changes were included */
  includesUncommitted: boolean;
}

/**
 * Options for change detection
 */
export interface ChangeDetectionOptions {
  /** Include uncommitted (staged and working directory) changes */
  includeUncommitted?: boolean;
}

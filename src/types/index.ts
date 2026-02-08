/**
 * Shared types used across modules
 */

/**
 * Information about an excluded file
 */
export interface ExcludedFile {
  /** Absolute or relative path to the excluded file */
  path: string;
  /** Reason for exclusion (e.g., "gitignore pattern", "binary file", "vendor directory") */
  reason: string;
}

/**
 * Result of the file discovery process
 */
export interface DiscoveryResult {
  /** List of file paths that should be analyzed */
  files: string[];
  /** List of files that were excluded with reasons */
  excluded: ExcludedFile[];
}

/**
 * Statistics about the discovery process
 */
export interface DiscoveryStats {
  /** Total number of files found */
  totalFiles: number;
  /** Number of files included for analysis */
  includedFiles: number;
  /** Number of files excluded */
  excludedFiles: number;
  /** Breakdown of exclusion reasons */
  exclusionReasons: Record<string, number>;
}

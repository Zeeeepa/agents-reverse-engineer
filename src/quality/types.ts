/**
 * Shared types for quality analysis: inconsistency detection and density measurement.
 */

/** Severity level for detected inconsistencies. */
export type InconsistencySeverity = 'info' | 'warning' | 'error';

/**
 * Inconsistency between .sum documentation and source code.
 * Detected by comparing exported symbols against .sum content.
 */
export interface CodeDocInconsistency {
  type: 'code-vs-doc';
  severity: InconsistencySeverity;
  /** Path to the source file */
  filePath: string;
  /** Path to the corresponding .sum file */
  sumPath: string;
  description: string;
  details: {
    /** Symbols exported in source but not mentioned in .sum */
    missingFromDoc: string[];
    /** Symbols mentioned in .sum but not found in source */
    missingFromCode: string[];
    /** Purpose statement that contradicts observable behavior */
    purposeMismatch?: string;
  };
}

/**
 * Inconsistency across multiple source files.
 * Detected by comparing patterns and exports across files.
 */
export interface CodeCodeInconsistency {
  type: 'code-vs-code';
  severity: InconsistencySeverity;
  /** Paths to the conflicting files */
  files: string[];
  description: string;
  /** Pattern that was detected (e.g. 'duplicate-export') */
  pattern: string;
}

/**
 * Path reference in generated documentation that doesn't resolve to a real file/directory.
 */
export interface PhantomPathInconsistency {
  type: 'phantom-path';
  severity: InconsistencySeverity;
  /** Path to the AGENTS.md file containing the phantom reference */
  agentsMdPath: string;
  description: string;
  details: {
    /** The phantom path as written in the document */
    referencedPath: string;
    /** What it was resolved against (project root or AGENTS.md location) */
    resolvedTo: string;
    /** The line of text containing the phantom reference */
    context: string;
  };
}

/** Union of all inconsistency types. */
export type Inconsistency = CodeDocInconsistency | CodeCodeInconsistency | PhantomPathInconsistency;

/** Structured report produced by inconsistency analysis. */
export interface InconsistencyReport {
  /** Run metadata */
  metadata: {
    timestamp: string;
    projectRoot: string;
    filesChecked: number;
    durationMs: number;
  };
  /** All detected inconsistencies */
  issues: Inconsistency[];
  /** Summary counts */
  summary: {
    total: number;
    codeVsDoc: number;
    codeVsCode: number;
    phantomPaths: number;
    errors: number;
    warnings: number;
    info: number;
  };
}

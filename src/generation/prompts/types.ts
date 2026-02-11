/**
 * Context provided when building a prompt.
 */
export interface PromptContext {
  /** Absolute path to the file */
  filePath: string;
  /** File content to analyze */
  content: string;
  /** Related files for additional context */
  contextFiles?: Array<{
    path: string;
    content: string;
  }>;
  /** Project structure listing for bird's-eye context */
  projectPlan?: string;
  /** Existing .sum summary text for incremental updates */
  existingSum?: string;
  /** Source file size in characters for calculating compression target */
  sourceFileSize?: number;
  /** Target compression ratio for .sum files (0.1-1.0, from config) */
  compressionRatio?: number;
}

/**
 * Guidelines for summary generation (from CONTEXT.md).
 */
export const SUMMARY_GUIDELINES = {
  /** Target word count range */
  targetLength: { min: 300, max: 500 },
  /** What to include */
  include: [
    'Purpose and responsibility',
    'Public interface (exports, key functions)',
    'Key patterns and notable algorithms',
    'Dependencies with usage context',
    'Key function signatures as code snippets',
    'Tightly coupled sibling files',
    'Behavioral contracts: verbatim regex patterns, format strings, magic constants, sentinel values, output templates, environment variables',
    'Annex references: for files with large string constants (prompt templates, config arrays, IDE templates), list each constant name with a one-line description in an ## Annex References section',
  ],
  /** What to exclude */
  exclude: [
    'Control flow minutiae (loop structures, variable naming, temporary state)',
    'Generic TODOs/FIXMEs (keep only security/breaking)',
    'Broad architectural relationships (handled by AGENTS.md)',
  ],
} as const;

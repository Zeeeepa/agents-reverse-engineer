/**
 * Types for the documentation generation pipeline
 */

/**
 * Result of file analysis (populated by LLM via host)
 */
export interface AnalysisResult {
  /** Generated summary text */
  summary: string;
  /** Extracted metadata */
  metadata: SummaryMetadata;
}

/**
 * Metadata extracted during analysis
 */
export interface SummaryMetadata {
  /** Primary purpose of the file */
  purpose: string;
  /** Public exports/interface */
  publicInterface: string[];
  /** External dependencies */
  dependencies: string[];
  /** Design patterns used */
  patterns: string[];
  /** Only security/breaking issues */
  criticalTodos?: string[];
  /** Tightly coupled siblings */
  relatedFiles?: string[];
}

/**
 * Options for summary generation
 */
export interface SummaryOptions {
  /** Target length for generated summaries */
  targetLength: 'short' | 'standard' | 'detailed';
  /** Whether to include code snippets in output */
  includeCodeSnippets: boolean;
}


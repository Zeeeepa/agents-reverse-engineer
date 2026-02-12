/**
 * Types for the documentation generation pipeline
 */

/**
 * Metadata extracted during analysis
 */
export interface SummaryMetadata {
  /** Primary purpose of the file */
  purpose: string;
  /** Only security/breaking issues */
  criticalTodos?: string[];
  /** Tightly coupled siblings */
  relatedFiles?: string[];
}


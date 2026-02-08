import type { FileType } from '../types.js';

/**
 * Template for generating file summaries.
 * Each file type has a dedicated template with specific instructions.
 */
export interface PromptTemplate {
  /** File type this template applies to */
  fileType: FileType;
  /** System instructions for the LLM */
  systemPrompt: string;
  /** User prompt template with placeholders */
  userPrompt: string;
  /** Sections to emphasize in analysis */
  focusAreas: string[];
}

/**
 * Context provided when building a prompt.
 */
export interface PromptContext {
  /** Absolute path to the file */
  filePath: string;
  /** File content to analyze */
  content: string;
  /** Detected file type */
  fileType: FileType;
  /** Related files for additional context */
  contextFiles?: Array<{
    path: string;
    content: string;
  }>;
}

/**
 * Guidelines for summary generation (from CONTEXT.md).
 */
export const SUMMARY_GUIDELINES = {
  /** Target word count range */
  targetLength: { min: 200, max: 300 },
  /** What to include */
  include: [
    'Purpose and responsibility',
    'Public interface (exports, key functions)',
    'Key patterns and notable algorithms',
    'Dependencies with usage context',
    'Key function signatures as code snippets',
    'Tightly coupled sibling files',
  ],
  /** What to exclude */
  exclude: [
    'Internal implementation details',
    'Generic TODOs/FIXMEs (keep only security/breaking)',
    'Broad architectural relationships (handled by AGENTS.md)',
  ],
} as const;

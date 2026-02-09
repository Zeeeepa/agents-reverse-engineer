/**
 * Heuristic findability validation for AGENTS.md content.
 *
 * validateFindability checks that key exported symbols from .sum files
 * appear in the parent AGENTS.md content.
 * No LLM calls -- purely string-based symbol matching.
 *
 * NOTE: Previously relied on metadata.publicInterface which has been removed.
 * This module is retained for future structured extraction support.
 */

import type { SumFileContent } from '../../generation/writers/sum.js';

/**
 * Result of findability validation for a single .sum file.
 *
 * score ranges from 0 (no symbols found) to 1 (all symbols found).
 */
export interface FindabilityResult {
  /** Path to the .sum file that was checked */
  filePath: string;
  /** Symbol names that were tested for presence */
  symbolsTested: string[];
  /** Symbol names found in AGENTS.md content */
  symbolsFound: string[];
  /** Symbol names missing from AGENTS.md content */
  symbolsMissing: string[];
  /** Ratio of found to tested (0-1) */
  score: number;
}

/**
 * Check that key symbols from .sum files appear in AGENTS.md content.
 *
 * Currently returns an empty array since structured metadata extraction
 * (publicInterface) has been removed. The function signature is preserved
 * for future re-implementation via post-processing passes.
 *
 * @param _agentsMdContent - Full text content of the AGENTS.md file
 * @param _sumFiles - Map of file path to parsed SumFileContent
 * @returns Empty array (no structured symbols to validate)
 */
export function validateFindability(
  _agentsMdContent: string,
  _sumFiles: Map<string, SumFileContent>,
): FindabilityResult[] {
  return [];
}

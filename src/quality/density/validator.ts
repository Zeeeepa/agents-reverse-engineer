/**
 * Heuristic findability validation for AGENTS.md content.
 *
 * validateFindability checks that key exported symbols listed in .sum file
 * publicInterface metadata appear in the parent AGENTS.md content.
 * No LLM calls -- purely string-based symbol matching.
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
 * Extract the symbol name from a publicInterface entry.
 *
 * Entries may be bare names ("buildAgentsMd") or include signatures
 * ("buildAgentsMd(doc: DirectoryDoc): string"). This extracts just
 * the leading identifier.
 */
function extractSymbolName(entry: string): string {
  const match = entry.match(/^(\w+)/);
  return match ? match[1] : entry.trim();
}

/**
 * Check that key symbols from .sum files appear in AGENTS.md content.
 *
 * For each .sum file, extracts symbol names from metadata.publicInterface
 * and checks whether each name appears (case-sensitive) in the AGENTS.md
 * content string. Files with no publicInterface items are skipped.
 *
 * @param agentsMdContent - Full text content of the AGENTS.md file
 * @param sumFiles - Map of file path to parsed SumFileContent
 * @returns FindabilityResult per .sum file that has publicInterface entries
 */
export function validateFindability(
  agentsMdContent: string,
  sumFiles: Map<string, SumFileContent>,
): FindabilityResult[] {
  const results: FindabilityResult[] = [];

  for (const [filePath, sum] of sumFiles) {
    const publicInterface = sum.metadata.publicInterface;
    if (publicInterface.length === 0) continue;

    const symbolsTested: string[] = [];
    const symbolsFound: string[] = [];
    const symbolsMissing: string[] = [];

    for (const entry of publicInterface) {
      const symbolName = extractSymbolName(entry);
      symbolsTested.push(symbolName);

      if (agentsMdContent.includes(symbolName)) {
        symbolsFound.push(symbolName);
      } else {
        symbolsMissing.push(symbolName);
      }
    }

    results.push({
      filePath,
      symbolsTested,
      symbolsFound,
      symbolsMissing,
      score: symbolsTested.length > 0
        ? symbolsFound.length / symbolsTested.length
        : 0,
    });
  }

  return results;
}

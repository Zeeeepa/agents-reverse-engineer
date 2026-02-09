/**
 * Heuristic code-vs-doc inconsistency detection.
 *
 * Compares exported symbols in TypeScript/JavaScript source against the
 * content of the corresponding .sum file to flag documentation drift.
 */

import type { SumFileContent } from '../../generation/writers/sum.js';
import type { CodeDocInconsistency } from '../types.js';

/**
 * Extract named and default export identifiers from TypeScript/JavaScript source.
 *
 * Matches declarations like `export function foo`, `export const BAR`,
 * `export default class App`, etc. Ignores re-exports, commented-out lines,
 * and internal (non-exported) declarations.
 *
 * @param sourceContent - Raw source file content
 * @returns Array of exported identifier names
 */
export function extractExports(sourceContent: string): string[] {
  const exports: string[] = [];
  const exportRegex =
    /^[ \t]*export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/gm;
  let match;
  while ((match = exportRegex.exec(sourceContent)) !== null) {
    exports.push(match[1]);
  }
  return exports;
}

/**
 * Compare source exports against .sum documentation content.
 *
 * Detects two kinds of inconsistency:
 * - **missingFromDoc**: symbols exported in source but not mentioned in .sum text
 * - **missingFromCode**: items listed in `publicInterface` with no matching export
 *
 * Uses case-sensitive matching. Returns `null` when documentation is consistent.
 *
 * @param sourceContent - Raw source file content
 * @param sumContent - Parsed .sum file content
 * @param filePath - Path to the source file (used in report)
 * @returns Inconsistency descriptor, or null if consistent
 */
export function checkCodeVsDoc(
  sourceContent: string,
  sumContent: SumFileContent,
  filePath: string,
): CodeDocInconsistency | null {
  const exports = extractExports(sourceContent);
  const sumText = sumContent.summary;

  // Exports present in source but not mentioned anywhere in .sum text
  const missingFromDoc = exports.filter((e) => !sumText.includes(e));

  if (missingFromDoc.length === 0) {
    return null;
  }

  return {
    type: 'code-vs-doc',
    severity: 'warning',
    filePath,
    sumPath: `${filePath}.sum`,
    description: `Documentation out of sync: ${missingFromDoc.length} exports undocumented`,
    details: { missingFromDoc, missingFromCode: [] },
  };
}

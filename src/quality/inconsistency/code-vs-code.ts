/**
 * Heuristic cross-file inconsistency detection.
 *
 * Detects duplicate exports: the same symbol name exported from multiple
 * files within a group. The caller is responsible for scoping the file
 * list (typically per-directory) to avoid false positives across
 * unrelated modules.
 */

import { extractExports } from './code-vs-doc.js';
import type { CodeCodeInconsistency } from '../types.js';

/**
 * Detect duplicate exports across a group of files.
 *
 * For each file, extracts exported symbol names via {@link extractExports}
 * and flags any symbol that appears in more than one file.
 *
 * This is a heuristic-only check (no AI calls). The caller should scope
 * the input to per-directory file groups to avoid false positives.
 *
 * @param files - Array of source files with path and content
 * @returns Array of detected cross-file inconsistencies
 */
export function checkCodeVsCode(
  files: Array<{ path: string; content: string }>,
): CodeCodeInconsistency[] {
  // Map: export name -> list of file paths that export it
  const exportMap = new Map<string, string[]>();

  for (const file of files) {
    const exports = extractExports(file.content);
    for (const name of exports) {
      const paths = exportMap.get(name);
      if (paths) {
        paths.push(file.path);
      } else {
        exportMap.set(name, [file.path]);
      }
    }
  }

  const inconsistencies: CodeCodeInconsistency[] = [];

  for (const [name, paths] of exportMap) {
    if (paths.length > 1) {
      inconsistencies.push({
        type: 'code-vs-code',
        severity: 'warning',
        files: paths,
        description: `Symbol "${name}" exported from ${paths.length} files`,
        pattern: 'duplicate-export',
      });
    }
  }

  return inconsistencies;
}

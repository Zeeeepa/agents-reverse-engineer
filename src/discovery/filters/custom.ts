/**
 * Custom pattern filter for file discovery.
 *
 * Allows users to specify additional exclusion patterns in their configuration.
 * Uses the `ignore` library for gitignore-style pattern matching.
 */

import ignore, { type Ignore } from 'ignore';
import path from 'node:path';
import type { FileFilter } from '../types.js';

/**
 * Creates a custom filter that excludes files matching user-provided patterns.
 *
 * Patterns use gitignore syntax and are checked against relative paths from
 * the root directory. If no patterns are provided, the filter passes all files.
 *
 * @param patterns - Array of gitignore-style patterns to exclude
 * @param root - Root directory for converting absolute paths to relative
 * @returns A FileFilter that checks paths against custom patterns
 *
 * @example
 * ```typescript
 * const filter = createCustomFilter(['*.log', 'tmp/**', 'secret.txt'], '/project');
 * filter.shouldExclude('/project/debug.log'); // true
 * filter.shouldExclude('/project/src/app.ts'); // false
 * ```
 */
export function createCustomFilter(patterns: string[], root: string): FileFilter {
  const ig: Ignore = ignore();
  const normalizedRoot = path.resolve(root);

  // Add all patterns to the ignore instance
  if (patterns.length > 0) {
    ig.add(patterns);
  }

  return {
    name: 'custom',

    shouldExclude(absolutePath: string): boolean {
      // If no patterns, nothing to exclude
      if (patterns.length === 0) {
        return false;
      }

      // Convert to relative path (ignore library requires relative paths)
      const relativePath = path.relative(normalizedRoot, absolutePath);

      // If path is outside root (starts with ..) or is empty, don't exclude
      if (!relativePath || relativePath.startsWith('..')) {
        return false;
      }

      return ig.ignores(relativePath);
    },
  };
}

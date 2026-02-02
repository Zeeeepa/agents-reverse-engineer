/**
 * Vendor directory filter for file discovery.
 *
 * Excludes files within common vendor/dependency directories that typically
 * contain third-party code not relevant for documentation purposes.
 */

import path from 'node:path';
import type { FileFilter } from '../types.js';

/**
 * Default vendor directories to exclude.
 * These are common directories containing third-party code, build output,
 * or generated files that should not be analyzed.
 */
export const DEFAULT_VENDOR_DIRS = [
  'node_modules',
  'vendor',
  '.git',
  'dist',
  'build',
  '__pycache__',
  '.next',
  'venv',
  '.venv',
  'target',
] as const;

/**
 * Creates a vendor filter that excludes files within specified directories.
 *
 * Supports two patterns:
 * - Single directory names (e.g., 'node_modules') - matches anywhere in path
 * - Path patterns (e.g., 'apps/vendor' or '.agents/skills') - matches path containing this sequence
 *
 * @param vendorDirs - Array of directory names or path patterns to exclude.
 * @returns A FileFilter that checks if a path is within a vendor directory
 *
 * @example
 * ```typescript
 * const filter = createVendorFilter(['node_modules', '.agents/skills']);
 * filter.shouldExclude('/project/node_modules/lodash/index.js'); // true
 * filter.shouldExclude('/project/apps/foo/.agents/skills/bar.md'); // true
 * filter.shouldExclude('/project/src/utils.js'); // false
 * ```
 */
export function createVendorFilter(vendorDirs: string[]): FileFilter {
  // Separate single segments from path patterns
  const singleSegments = new Set<string>();
  const pathPatterns: string[] = [];

  for (const dir of vendorDirs) {
    // Normalize path separators to current OS
    const normalized = dir.replace(/[\\/]/g, path.sep);
    if (normalized.includes(path.sep)) {
      pathPatterns.push(normalized);
    } else {
      singleSegments.add(dir);
    }
  }

  return {
    name: 'vendor',

    shouldExclude(absolutePath: string): boolean {
      // Check single segment matches
      const segments = absolutePath.split(path.sep);
      for (const segment of segments) {
        if (singleSegments.has(segment)) {
          return true;
        }
      }

      // Check path pattern matches
      for (const pattern of pathPatterns) {
        if (absolutePath.includes(pattern)) {
          return true;
        }
      }

      return false;
    },
  };
}

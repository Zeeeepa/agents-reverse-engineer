/**
 * Filter chain orchestration for file discovery.
 *
 * This module exports all filter creators and provides the applyFilters
 * function that runs files through the filter chain, recording which
 * filter excluded each file.
 */

import type { FileFilter, FilterResult, ExcludedFile } from '../types.js';
import { createGitignoreFilter } from './gitignore.js';
import { createVendorFilter, DEFAULT_VENDOR_DIRS } from './vendor.js';
import { createBinaryFilter, type BinaryFilterOptions } from './binary.js';
import { createCustomFilter } from './custom.js';

// Re-export all filter creators
export { createGitignoreFilter } from './gitignore.js';
export { createVendorFilter, DEFAULT_VENDOR_DIRS } from './vendor.js';
export { createBinaryFilter, BINARY_EXTENSIONS, type BinaryFilterOptions } from './binary.js';
export { createCustomFilter } from './custom.js';

/**
 * Applies a chain of filters to a list of files.
 *
 * Each file is run through filters in order until one excludes it
 * (short-circuit evaluation). Files are processed with bounded concurrency
 * to avoid opening too many file handles simultaneously (important for
 * binary content detection which performs file I/O).
 *
 * @param files - Array of absolute file paths to filter
 * @param filters - Array of filters to apply in order
 * @returns Promise resolving to FilterResult with included and excluded lists
 *
 * @example
 * ```typescript
 * const filters = [
 *   createVendorFilter(['node_modules']),
 *   createBinaryFilter({}),
 * ];
 * const result = await applyFilters(['/a/b.js', '/a/node_modules/c.js'], filters);
 * // result.included: ['/a/b.js']
 * // result.excluded: [{ path: '/a/node_modules/c.js', filter: 'vendor', reason: '...' }]
 * ```
 */
export async function applyFilters(
  files: string[],
  filters: FileFilter[]
): Promise<FilterResult> {
  const included: string[] = [];
  const excluded: ExcludedFile[] = [];

  // Process files with bounded concurrency to avoid exhausting file descriptors.
  // Binary filter calls isBinaryFile() which does file I/O.
  const CONCURRENCY = 30;
  const iterator = files.entries();

  async function worker(
    iter: IterableIterator<[number, string]>,
  ): Promise<Array<{ index: number; file: string; excluded?: ExcludedFile }>> {
    const results: Array<{ index: number; file: string; excluded?: ExcludedFile }> = [];
    for (const [index, file] of iter) {
      let wasExcluded = false;

      // Run through filters in order, stop at first exclusion
      for (const filter of filters) {
        const shouldExclude = await filter.shouldExclude(file);

        if (shouldExclude) {
          results.push({
            index,
            file,
            excluded: {
              path: file,
              reason: `Excluded by ${filter.name} filter`,
              filter: filter.name,
            },
          });
          wasExcluded = true;
          break; // Short-circuit: stop checking other filters
        }
      }

      if (!wasExcluded) {
        results.push({ index, file });
      }
    }
    return results;
  }

  const effectiveConcurrency = Math.min(CONCURRENCY, files.length);
  const workers = Array.from({ length: effectiveConcurrency }, () =>
    worker(iterator),
  );

  const allResults = (await Promise.all(workers)).flat();

  // Sort by original index to preserve order
  allResults.sort((a, b) => a.index - b.index);

  for (const result of allResults) {
    if (result.excluded) {
      excluded.push(result.excluded);
    } else {
      included.push(result.file);
    }
  }

  return { included, excluded };
}

/**
 * Configuration options for creating default filters.
 */
export interface DefaultFilterConfig {
  /**
   * Vendor directories to exclude.
   * Default: DEFAULT_VENDOR_DIRS
   */
  vendorDirs?: string[];

  /**
   * Custom patterns to exclude (gitignore syntax).
   * Default: []
   */
  patterns?: string[];

  /**
   * Maximum file size in bytes before excluding.
   * Default: 1MB (1048576)
   */
  maxFileSize?: number;

  /**
   * Additional binary extensions to recognize.
   * Default: []
   */
  additionalBinaryExtensions?: string[];
}

/**
 * Creates the default filter chain in standard order.
 *
 * Filter order:
 * 1. Gitignore - respects .gitignore patterns
 * 2. Vendor - excludes vendor directories (node_modules, etc.)
 * 3. Binary - excludes binary files by extension and content
 * 4. Custom - excludes user-specified patterns
 *
 * @param root - Root directory for gitignore and custom pattern matching
 * @param config - Optional configuration for the filters
 * @returns Promise resolving to array of filters ready for applyFilters
 *
 * @example
 * ```typescript
 * const filters = await createDefaultFilters('/path/to/project', {
 *   vendorDirs: ['node_modules', 'vendor'],
 *   patterns: ['*.log', 'tmp/**'],
 *   maxFileSize: 500000,
 * });
 * const result = await applyFilters(files, filters);
 * ```
 */
export async function createDefaultFilters(
  root: string,
  config: DefaultFilterConfig = {}
): Promise<FileFilter[]> {
  const {
    vendorDirs = [...DEFAULT_VENDOR_DIRS],
    patterns = [],
    maxFileSize = 1024 * 1024,
    additionalBinaryExtensions = [],
  } = config;

  // Create filters in standard order
  const gitignoreFilter = await createGitignoreFilter(root);
  const vendorFilter = createVendorFilter(vendorDirs);
  const binaryFilter = createBinaryFilter({
    maxFileSize,
    additionalExtensions: additionalBinaryExtensions,
  });
  const customFilter = createCustomFilter(patterns, root);

  return [gitignoreFilter, vendorFilter, binaryFilter, customFilter];
}

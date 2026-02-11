/**
 * Filter chain orchestration for file discovery.
 *
 * This module exports all filter creators and provides the applyFilters
 * function that runs files through the filter chain, recording which
 * filter excluded each file.
 */

import type { FileFilter, FilterResult, ExcludedFile } from '../types.js';
import type { ITraceWriter } from '../../orchestration/trace.js';
import type { Logger } from '../../core/logger.js';
import { nullLogger } from '../../core/logger.js';

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
 * @param options - Optional tracing and debug options
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
  filters: FileFilter[],
  options?: { tracer?: ITraceWriter; debug?: boolean; logger?: Logger }
): Promise<FilterResult> {
  const included: string[] = [];
  const excluded: ExcludedFile[] = [];

  // Track exclusions per filter for trace events
  const filterStats = new Map<string, { matched: number; rejected: number }>();
  for (const filter of filters) {
    filterStats.set(filter.name, { matched: 0, rejected: 0 });
  }

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

  // Collect results and update filter stats
  for (const result of allResults) {
    if (result.excluded) {
      excluded.push(result.excluded);
      const stats = filterStats.get(result.excluded.filter);
      if (stats) {
        stats.rejected++;
      }
    } else {
      included.push(result.file);
      // All filters "matched" (passed through) this file
      for (const filter of filters) {
        const stats = filterStats.get(filter.name);
        if (stats) {
          stats.matched++;
        }
      }
    }
  }

  // Emit trace events for each filter
  for (const filter of filters) {
    const stats = filterStats.get(filter.name);
    if (stats) {
      options?.tracer?.emit({
        type: 'filter:applied',
        filterName: filter.name,
        filesMatched: stats.matched,
        filesRejected: stats.rejected,
      });

      // Debug output
      if (options?.debug && stats.rejected > 0) {
        (options?.logger ?? nullLogger).debug(`[debug] Filter [${filter.name}]: ${stats.rejected} files rejected`);
      }
    }
  }

  return { included, excluded };
}


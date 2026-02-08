/**
 * High-level file discovery pipeline.
 *
 * Combines directory walking and filter application into a single function
 * that all commands can share.
 */

import { walkDirectory } from './walker.js';
import {
  applyFilters,
  createGitignoreFilter,
  createVendorFilter,
  createBinaryFilter,
  createCustomFilter,
} from './filters/index.js';
import type { FilterResult } from './types.js';
import type { ITraceWriter } from '../orchestration/trace.js';

/**
 * Configuration subset needed for file discovery.
 * Structurally compatible with the full Config type from config/schema.ts.
 */
export interface DiscoveryConfig {
  exclude: {
    vendorDirs: string[];
    binaryExtensions: string[];
    patterns: string[];
  };
  options: {
    maxFileSize: number;
    followSymlinks: boolean;
  };
}

/**
 * Options for the discovery pipeline.
 */
export interface DiscoverFilesOptions {
  tracer?: ITraceWriter;
  debug?: boolean;
}

/**
 * Discover files in a directory by walking and applying the standard filter chain.
 *
 * Creates the four standard filters (gitignore, vendor, binary, custom),
 * walks the directory tree, and applies the filters. Returns the full
 * FilterResult so callers can access both included and excluded files
 * with filter attribution.
 *
 * @param root - Absolute path to the directory to scan
 * @param config - Discovery-related configuration (exclude rules and options)
 * @param options - Optional tracing and debug settings
 * @returns FilterResult with included and excluded file lists
 */
export async function discoverFiles(
  root: string,
  config: DiscoveryConfig,
  options?: DiscoverFilesOptions,
): Promise<FilterResult> {
  // Create filters in standard order
  const gitignoreFilter = await createGitignoreFilter(root);
  const vendorFilter = createVendorFilter(config.exclude.vendorDirs);
  const binaryFilter = createBinaryFilter({
    maxFileSize: config.options.maxFileSize,
    additionalExtensions: config.exclude.binaryExtensions,
  });
  const customFilter = createCustomFilter(config.exclude.patterns, root);
  const filters = [gitignoreFilter, vendorFilter, binaryFilter, customFilter];

  // Walk directory
  const files = await walkDirectory({
    cwd: root,
    followSymlinks: config.options.followSymlinks,
  });

  // Apply filters and return
  return applyFilters(files, filters, {
    tracer: options?.tracer,
    debug: options?.debug,
  });
}

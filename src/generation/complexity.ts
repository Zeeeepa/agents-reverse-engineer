import * as path from 'node:path';

/**
 * Metrics about codebase complexity.
 */
export interface ComplexityMetrics {
  /** Total number of source files */
  fileCount: number;
  /** Maximum directory depth */
  directoryDepth: number;
  /** List of source file paths */
  files: string[];
  /** Unique directory paths */
  directories: Set<string>;
}

/**
 * Calculate maximum directory depth from file paths.
 */
function calculateDirectoryDepth(files: string[], projectRoot: string): number {
  let maxDepth = 0;

  for (const file of files) {
    const relativePath = path.relative(projectRoot, file);
    const depth = relativePath.split(path.sep).length - 1; // -1 for the file itself
    maxDepth = Math.max(maxDepth, depth);
  }

  return maxDepth;
}

/**
 * Extract unique directories from file paths.
 */
function extractDirectories(files: string[]): Set<string> {
  const directories = new Set<string>();

  for (const file of files) {
    let dir = path.dirname(file);
    while (dir && dir !== '.') {
      directories.add(dir);
      const parent = path.dirname(dir);
      if (parent === dir) break; // Reached root
      dir = parent;
    }
  }

  return directories;
}

/**
 * Analyze codebase complexity from discovered files.
 *
 * @param files - List of source file paths
 * @param projectRoot - Project root directory
 * @returns Complexity metrics
 */
export function analyzeComplexity(
  files: string[],
  projectRoot: string
): ComplexityMetrics {
  return {
    fileCount: files.length,
    directoryDepth: calculateDirectoryDepth(files, projectRoot),
    files,
    directories: extractDirectories(files),
  };
}


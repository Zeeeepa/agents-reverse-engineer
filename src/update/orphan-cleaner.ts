/**
 * Orphan cleanup for stale .sum and AGENTS.md files
 *
 * Handles:
 * - Deleting .sum files when source files are deleted
 * - Deleting .sum files for renamed files (at old path)
 * - Deleting AGENTS.md from directories with no remaining source files
 */
import { unlink, readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import type { FileChange } from '../change-detection/types.js';
import type { CleanupResult } from './types.js';

/**
 * Files to ignore when checking if a directory has source files.
 * These are generated files, not source files.
 */
const GENERATED_FILES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'ARCHITECTURE.md',
  'STACK.md',
]);

/**
 * Clean up orphaned .sum files and empty AGENTS.md files.
 *
 * @param projectRoot - Absolute path to project root
 * @param changes - List of file changes (deleted and renamed files need cleanup)
 * @param dryRun - If true, don't actually delete files
 * @returns Cleanup result with lists of deleted files
 */
export async function cleanupOrphans(
  projectRoot: string,
  changes: FileChange[],
  dryRun: boolean = false
): Promise<CleanupResult> {
  const result: CleanupResult = {
    deletedSumFiles: [],
    deletedAgentsMd: [],
  };

  // Collect paths that need .sum cleanup
  const pathsToClean: string[] = [];

  for (const change of changes) {
    if (change.status === 'deleted') {
      pathsToClean.push(change.path);
    } else if (change.status === 'renamed' && change.oldPath) {
      // For renames, clean up the old path's .sum
      pathsToClean.push(change.oldPath);
    }
  }

  // Delete .sum files for deleted/renamed source files
  for (const relativePath of pathsToClean) {
    const sumPath = path.join(projectRoot, `${relativePath}.sum`);
    const deleted = await deleteIfExists(sumPath, dryRun);
    if (deleted) {
      result.deletedSumFiles.push(relativePath + '.sum');
    }
  }

  // Collect affected directories for AGENTS.md cleanup
  const affectedDirs = new Set<string>();
  for (const relativePath of pathsToClean) {
    const dir = path.dirname(relativePath);
    if (dir && dir !== '.') {
      affectedDirs.add(dir);
    }
  }

  // Check each affected directory for empty AGENTS.md
  for (const dir of affectedDirs) {
    const dirPath = path.join(projectRoot, dir);
    const cleaned = await cleanupEmptyDirectoryDocs(dirPath, dryRun);
    if (cleaned) {
      result.deletedAgentsMd.push(path.join(dir, 'AGENTS.md'));
    }
  }

  return result;
}

/**
 * Delete a file if it exists.
 *
 * @returns true if file was deleted (or would be in dry run)
 */
async function deleteIfExists(filePath: string, dryRun: boolean): Promise<boolean> {
  try {
    await stat(filePath);
    if (!dryRun) {
      await unlink(filePath);
    }
    return true;
  } catch {
    // File doesn't exist
    return false;
  }
}

/**
 * Check if a directory has any source files remaining.
 * If not, delete its AGENTS.md.
 *
 * @param dirPath - Absolute path to directory
 * @param dryRun - If true, don't actually delete
 * @returns true if AGENTS.md was deleted
 */
export async function cleanupEmptyDirectoryDocs(
  dirPath: string,
  dryRun: boolean = false
): Promise<boolean> {
  try {
    const entries = await readdir(dirPath);

    // Check if directory has any source files
    // Source files are: not .sum files, not generated docs, not hidden files
    const hasSourceFiles = entries.some(entry => {
      // Skip hidden files
      if (entry.startsWith('.')) return false;
      // Skip .sum files
      if (entry.endsWith('.sum')) return false;
      // Skip known generated files
      if (GENERATED_FILES.has(entry)) return false;
      // Everything else counts as a source file
      return true;
    });

    if (!hasSourceFiles) {
      const agentsPath = path.join(dirPath, 'AGENTS.md');
      return await deleteIfExists(agentsPath, dryRun);
    }

    return false;
  } catch {
    // Directory doesn't exist or can't be read
    return false;
  }
}

/**
 * Get list of directories that should have their AGENTS.md regenerated.
 *
 * Includes parent directories of changed files up to project root.
 *
 * @param changes - List of file changes (non-deleted files)
 * @returns Set of relative directory paths
 */
export function getAffectedDirectories(changes: FileChange[]): Set<string> {
  const dirs = new Set<string>();

  for (const change of changes) {
    // Skip deleted files - they don't affect directory docs
    if (change.status === 'deleted') continue;

    // Add all parent directories up to root
    let dir = path.dirname(change.path);
    while (dir && dir !== '.' && !path.isAbsolute(dir)) {
      dirs.add(dir);
      dir = path.dirname(dir);
    }
    // Include root directory
    dirs.add('.');
  }

  return dirs;
}

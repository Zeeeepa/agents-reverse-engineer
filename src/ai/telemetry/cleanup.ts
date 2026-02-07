/**
 * Telemetry log cleanup utility.
 *
 * Removes old run log files from `.agents-reverse-engineer/logs/`,
 * keeping only the N most recent. Files are sorted lexicographically
 * by name, which works correctly because filenames contain ISO timestamps.
 *
 * @module
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** Directory name for telemetry log files (relative to project root) */
const LOGS_DIR = '.agents-reverse-engineer/logs';

/**
 * Remove old telemetry log files, keeping only the most recent ones.
 *
 * Reads the logs directory, filters for files matching `run-*.json`,
 * sorts newest-first (lexicographic sort on ISO timestamp filenames),
 * and deletes everything beyond `keepCount`.
 *
 * If the logs directory does not exist, returns 0 without error.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param keepCount - Number of most recent log files to retain
 * @returns Number of files deleted
 *
 * @example
 * ```typescript
 * const deleted = await cleanupOldLogs('/home/user/project', 10);
 * console.log(`Cleaned up ${deleted} old log files`);
 * ```
 */
export async function cleanupOldLogs(projectRoot: string, keepCount: number): Promise<number> {
  const logsDir = path.join(projectRoot, LOGS_DIR);

  let entries: string[];
  try {
    const allEntries = await fs.readdir(logsDir);
    entries = allEntries.filter(
      (name) => name.startsWith('run-') && name.endsWith('.json'),
    );
  } catch (error) {
    // Directory doesn't exist -- nothing to clean up
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw error;
  }

  // Sort lexicographically (newest first) and find files to delete
  entries.sort();
  entries.reverse();

  const toDelete = entries.slice(keepCount);

  for (const filename of toDelete) {
    await fs.unlink(path.join(logsDir, filename));
  }

  return toDelete.length;
}

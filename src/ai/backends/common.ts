/**
 * Shared utilities for backend implementations.
 *
 * @module
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// PATH detection utility
// ---------------------------------------------------------------------------

/**
 * Check whether a command is available on the system PATH.
 *
 * Splits `process.env.PATH` by the platform delimiter and checks each
 * directory for a file matching the command name. On Windows, also checks
 * each extension from `process.env.PATHEXT` (e.g., `.exe`, `.cmd`, `.bat`).
 *
 * Uses `fs.stat` (not `fs.access` with execute bit) for cross-platform
 * compatibility -- Windows does not have Unix execute permissions.
 *
 * @param command - The bare command name to look for (e.g., "claude")
 * @returns `true` if the command exists as a file in any PATH directory
 *
 * @example
 * ```typescript
 * if (await isCommandOnPath('claude')) {
 *   console.log('Claude CLI is available');
 * }
 * ```
 */
export async function isCommandOnPath(command: string): Promise<boolean> {
  const envPath = process.env.PATH ?? '';
  const pathDirs = envPath
    .replace(/["]+/g, '')
    .split(path.delimiter)
    .filter(Boolean);

  // On Windows, PATHEXT lists executable extensions (e.g., ".EXE;.CMD;.BAT").
  // On other platforms, PATHEXT is unset; check the bare command name only.
  const envExt = process.env.PATHEXT ?? '';
  const extensions = envExt ? envExt.split(';') : [''];

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      try {
        const candidate = path.join(dir, command + ext);
        const stat = await fs.stat(candidate);
        if (stat.isFile()) {
          return true;
        }
      } catch {
        // Not found in this dir/ext combination, continue
      }
    }
  }

  return false;
}

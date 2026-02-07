/**
 * Run log writer for AI telemetry.
 *
 * Writes a completed {@link RunLog} to disk as pretty-printed JSON.
 * Each run produces a single file in `.agents-reverse-engineer/logs/`
 * with a filename derived from the run's start timestamp.
 *
 * @module
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { RunLog } from '../types.js';

/** Directory name for telemetry log files (relative to project root) */
const LOGS_DIR = '.agents-reverse-engineer/logs';

/**
 * Write a completed run log to disk as pretty-printed JSON.
 *
 * Creates the logs directory if it does not exist. The filename is derived
 * from the run's `startTime` field with `:` and `.` replaced by `-` so
 * that it forms a valid filename on all platforms.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param runLog - The completed run log to write
 * @returns Absolute path to the written file
 *
 * @example
 * ```typescript
 * const logPath = await writeRunLog('/home/user/project', runLog);
 * // logPath: /home/user/project/.agents-reverse-engineer/logs/run-2026-02-07T12-00-00-000Z.json
 * ```
 */
export async function writeRunLog(projectRoot: string, runLog: RunLog): Promise<string> {
  const logsDir = path.join(projectRoot, LOGS_DIR);

  // Create the logs directory if it does not exist
  await fs.mkdir(logsDir, { recursive: true });

  // Build filename: replace : and . with - so ISO timestamps become valid filenames
  const safeTimestamp = runLog.startTime.replace(/[:.]/g, '-');
  const filename = `run-${safeTimestamp}.json`;
  const filePath = path.join(logsDir, filename);

  // Write pretty-printed JSON
  await fs.writeFile(filePath, JSON.stringify(runLog, null, 2), 'utf-8');

  return filePath;
}

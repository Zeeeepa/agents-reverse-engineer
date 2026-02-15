/**
 * Run log reader for the dashboard.
 *
 * Reads and parses all `run-*.json` files from the telemetry logs directory.
 * Returns typed {@link RunLog} arrays sorted by start time (newest first).
 *
 * @module
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { RunLog } from '../ai/types.js';

/** Directory name for telemetry log files (relative to project root) */
const LOGS_DIR = '.agents-reverse-engineer/logs';

/** Pattern prefix for run log filenames */
const RUN_LOG_PREFIX = 'run-';

/**
 * Read all run log files from the telemetry logs directory.
 *
 * Parses each `run-*.json` file and returns a typed array sorted by
 * start time descending (newest first). Invalid or unreadable files
 * are silently skipped.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @returns Array of parsed RunLog objects, newest first
 */
export async function readAllRunLogs(projectRoot: string): Promise<RunLog[]> {
  const logsDir = path.join(projectRoot, LOGS_DIR);

  let entries: string[];
  try {
    const allEntries = await fs.readdir(logsDir);
    entries = allEntries.filter(
      (name) => name.startsWith(RUN_LOG_PREFIX) && name.endsWith('.json'),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const logs: RunLog[] = [];

  for (const filename of entries) {
    try {
      const content = await fs.readFile(path.join(logsDir, filename), 'utf-8');
      const parsed = JSON.parse(content) as RunLog;
      // Basic shape validation
      if (parsed.runId && parsed.entries && parsed.summary) {
        logs.push(parsed);
      }
    } catch {
      // Skip invalid files
    }
  }

  // Sort newest first by startTime
  logs.sort((a, b) => b.startTime.localeCompare(a.startTime));

  return logs;
}

/**
 * Read a single run log by matching its run ID prefix.
 *
 * The `runId` parameter can be a partial match (e.g., "2026-02-14" matches
 * any run from that date). Returns the first match sorted by start time.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param runId - Full or partial run ID to match
 * @returns The matching RunLog, or null if not found
 */
export async function readRunLog(projectRoot: string, runId: string): Promise<RunLog | null> {
  const logs = await readAllRunLogs(projectRoot);
  return logs.find((log) => log.runId.includes(runId) || log.startTime.includes(runId)) ?? null;
}

/**
 * Extract a short display ID from a run log filename or runId.
 *
 * Converts "2026-02-14T18:21:08.512Z" to "2026-02-14 18:21".
 */
export function shortRunId(runId: string): string {
  const match = runId.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  return runId.slice(0, 16);
}

/**
 * Persistence layer for implementation comparison results.
 *
 * Reads and writes comparison data to `.agents-reverse-engineer/implementations/<id>/`.
 *
 * @module
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ImplementationComparison } from './types.js';

/** Base directory name for implementation storage */
const IMPLEMENTATIONS_DIR = 'implementations';

/**
 * Get the implementations storage directory path.
 *
 * @param projectRoot - The project root directory
 * @returns Absolute path to `.agents-reverse-engineer/implementations/`
 */
function getImplementationsDir(projectRoot: string): string {
  return path.join(projectRoot, '.agents-reverse-engineer', IMPLEMENTATIONS_DIR);
}

/**
 * Save an implementation comparison to disk.
 *
 * Creates the directory structure and writes:
 * - `comparison.json` - Full comparison data
 * - `implementation-with-docs.log` - AI execution log (with docs)
 * - `implementation-without-docs.log` - AI execution log (without docs)
 *
 * @param projectRoot - The project root directory
 * @param comparison - The comparison data to save
 * @param withDocsLog - AI execution log from "with docs" run
 * @param withoutDocsLog - AI execution log from "without docs" run
 * @returns Path to the saved comparison directory
 */
export async function saveComparison(
  projectRoot: string,
  comparison: ImplementationComparison,
  withDocsLog: string,
  withoutDocsLog: string,
): Promise<string> {
  const compDir = path.join(getImplementationsDir(projectRoot), comparison.id);
  await mkdir(compDir, { recursive: true });

  await Promise.all([
    writeFile(
      path.join(compDir, 'comparison.json'),
      JSON.stringify(comparison, null, 2),
      'utf-8',
    ),
    writeFile(
      path.join(compDir, 'implementation-with-docs.log'),
      withDocsLog,
      'utf-8',
    ),
    writeFile(
      path.join(compDir, 'implementation-without-docs.log'),
      withoutDocsLog,
      'utf-8',
    ),
  ]);

  return compDir;
}

/**
 * Load an implementation comparison from disk.
 *
 * @param projectRoot - The project root directory
 * @param id - The comparison ID (ISO timestamp or partial match)
 * @returns The comparison data, or null if not found
 */
export async function loadComparison(
  projectRoot: string,
  id: string,
): Promise<ImplementationComparison | null> {
  const implDir = getImplementationsDir(projectRoot);

  // Try exact match first
  try {
    const data = await readFile(
      path.join(implDir, id, 'comparison.json'),
      'utf-8',
    );
    return JSON.parse(data) as ImplementationComparison;
  } catch {
    // Not an exact match
  }

  // Try partial match
  try {
    const entries = await readdir(implDir);
    const match = entries.find(entry => entry.includes(id));
    if (match) {
      const data = await readFile(
        path.join(implDir, match, 'comparison.json'),
        'utf-8',
      );
      return JSON.parse(data) as ImplementationComparison;
    }
  } catch {
    // Directory may not exist
  }

  return null;
}

/**
 * List all saved implementation comparisons.
 *
 * @param projectRoot - The project root directory
 * @returns Array of comparisons sorted by date (newest first)
 */
export async function listComparisons(
  projectRoot: string,
): Promise<ImplementationComparison[]> {
  const implDir = getImplementationsDir(projectRoot);

  let entries: string[];
  try {
    entries = await readdir(implDir);
  } catch {
    return [];
  }

  const comparisons: ImplementationComparison[] = [];

  for (const entry of entries) {
    try {
      const data = await readFile(
        path.join(implDir, entry, 'comparison.json'),
        'utf-8',
      );
      comparisons.push(JSON.parse(data) as ImplementationComparison);
    } catch {
      // Skip invalid entries
    }
  }

  // Sort newest first
  comparisons.sort((a, b) => b.startTime.localeCompare(a.startTime));

  return comparisons;
}

/**
 * Persistence layer for plan comparison results.
 *
 * Reads and writes comparison data to `.agents-reverse-engineer/plans/<id>/`.
 *
 * @module
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { PlanComparison } from './types.js';

/** Base directory name for plan storage */
const PLANS_DIR = 'plans';

/**
 * Get the plans storage directory path.
 *
 * @param projectRoot - The project root directory
 * @returns Absolute path to `.agents-reverse-engineer/plans/`
 */
function getPlansDir(projectRoot: string): string {
  return path.join(projectRoot, '.agents-reverse-engineer', PLANS_DIR);
}

/**
 * Save a plan comparison to disk.
 *
 * Creates the directory structure and writes:
 * - `comparison.json` - Full comparison data
 * - `plan-with-docs.md` - Raw plan text (with docs)
 * - `plan-without-docs.md` - Raw plan text (without docs)
 *
 * @param projectRoot - The project root directory
 * @param comparison - The comparison data to save
 * @param withDocsPlan - Raw plan markdown from "with docs" run
 * @param withoutDocsPlan - Raw plan markdown from "without docs" run
 */
export async function saveComparison(
  projectRoot: string,
  comparison: PlanComparison,
  withDocsPlan: string,
  withoutDocsPlan: string,
): Promise<string> {
  const compDir = path.join(getPlansDir(projectRoot), comparison.id);
  await mkdir(compDir, { recursive: true });

  await Promise.all([
    writeFile(
      path.join(compDir, 'comparison.json'),
      JSON.stringify(comparison, null, 2),
      'utf-8',
    ),
    writeFile(
      path.join(compDir, 'plan-with-docs.md'),
      withDocsPlan,
      'utf-8',
    ),
    writeFile(
      path.join(compDir, 'plan-without-docs.md'),
      withoutDocsPlan,
      'utf-8',
    ),
  ]);

  return compDir;
}

/**
 * Load a plan comparison from disk.
 *
 * @param projectRoot - The project root directory
 * @param id - The comparison ID (ISO timestamp or partial match)
 * @returns The comparison data, or null if not found
 */
export async function loadComparison(
  projectRoot: string,
  id: string,
): Promise<PlanComparison | null> {
  const plansDir = getPlansDir(projectRoot);

  // Try exact match first
  try {
    const data = await readFile(
      path.join(plansDir, id, 'comparison.json'),
      'utf-8',
    );
    return JSON.parse(data) as PlanComparison;
  } catch {
    // Not an exact match
  }

  // Try partial match
  try {
    const entries = await readdir(plansDir);
    const match = entries.find(entry => entry.includes(id));
    if (match) {
      const data = await readFile(
        path.join(plansDir, match, 'comparison.json'),
        'utf-8',
      );
      return JSON.parse(data) as PlanComparison;
    }
  } catch {
    // Directory may not exist
  }

  return null;
}

/**
 * Load plan markdown text from a saved comparison.
 *
 * @param projectRoot - The project root directory
 * @param id - The comparison ID
 * @param variant - Which plan to load
 * @returns The plan markdown text, or null if not found
 */
export async function loadPlanText(
  projectRoot: string,
  id: string,
  variant: 'with-docs' | 'without-docs',
): Promise<string | null> {
  const plansDir = getPlansDir(projectRoot);
  const filename = variant === 'with-docs' ? 'plan-with-docs.md' : 'plan-without-docs.md';

  // Try exact match first, then partial
  for (const tryId of [id]) {
    try {
      return await readFile(path.join(plansDir, tryId, filename), 'utf-8');
    } catch {
      // Not found
    }
  }

  // Partial match
  try {
    const entries = await readdir(plansDir);
    const match = entries.find(entry => entry.includes(id));
    if (match) {
      return await readFile(path.join(plansDir, match, filename), 'utf-8');
    }
  } catch {
    // Directory may not exist
  }

  return null;
}

/**
 * List all saved plan comparisons.
 *
 * @param projectRoot - The project root directory
 * @returns Array of comparisons sorted by date (newest first)
 */
export async function listComparisons(
  projectRoot: string,
): Promise<PlanComparison[]> {
  const plansDir = getPlansDir(projectRoot);

  let entries: string[];
  try {
    entries = await readdir(plansDir);
  } catch {
    return [];
  }

  const comparisons: PlanComparison[] = [];

  for (const entry of entries) {
    try {
      const data = await readFile(
        path.join(plansDir, entry, 'comparison.json'),
        'utf-8',
      );
      comparisons.push(JSON.parse(data) as PlanComparison);
    } catch {
      // Skip invalid entries
    }
  }

  // Sort newest first
  comparisons.sort((a, b) => b.startTime.localeCompare(a.startTime));

  return comparisons;
}

/**
 * Strip ARE artifacts from a worktree for baseline comparison.
 *
 * Removes all ARE-generated documentation from the "without-docs" worktree
 * so it contains only source code, providing a clean baseline.
 *
 * @module
 */

import { readFile, unlink, rm } from 'node:fs/promises';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import fg from 'fast-glob';
import { GENERATED_MARKER_PREFIX } from '../generation/writers/agents-md.js';

/**
 * Strip all ARE artifacts from a worktree.
 *
 * Removes:
 * - All `*.sum` files
 * - Generated `AGENTS.md` and `AGENTS.*.md` files (marker-checked)
 * - Generated `CLAUDE.md` files (marker-checked)
 * - `.agents-reverse-engineer/` directory
 *
 * Commits the removal so the worktree has a clean state.
 *
 * @param worktreePath - Absolute path to the worktree
 * @returns Number of artifacts removed
 */
export async function stripArtifacts(worktreePath: string): Promise<number> {
  let removed = 0;

  // Find all artifact types in parallel
  const [sumFiles, agentsFiles, variantAgentsFiles, claudeFiles] = await Promise.all([
    fg.glob('**/*.sum', {
      cwd: worktreePath,
      absolute: true,
      onlyFiles: true,
      dot: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    }),
    fg.glob('**/AGENTS.md', {
      cwd: worktreePath,
      absolute: true,
      onlyFiles: true,
      dot: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    }),
    fg.glob('**/AGENTS.*.md', {
      cwd: worktreePath,
      absolute: true,
      onlyFiles: true,
      dot: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    }),
    fg.glob('**/CLAUDE.md', {
      cwd: worktreePath,
      absolute: true,
      onlyFiles: true,
      dot: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    }),
  ]);

  // Delete all .sum files
  for (const file of sumFiles) {
    try {
      await unlink(file);
      removed++;
    } catch {
      // File may not exist
    }
  }

  // Delete generated AGENTS.md files (marker-checked)
  for (const file of [...agentsFiles, ...variantAgentsFiles]) {
    try {
      const content = await readFile(file, 'utf-8');
      if (content.includes(GENERATED_MARKER_PREFIX)) {
        await unlink(file);
        removed++;
      }
    } catch {
      // Can't read — skip
    }
  }

  // Delete generated CLAUDE.md files (marker-checked)
  for (const file of claudeFiles) {
    try {
      const content = await readFile(file, 'utf-8');
      if (content.includes(GENERATED_MARKER_PREFIX)) {
        await unlink(file);
        removed++;
      }
    } catch {
      // Can't read — skip
    }
  }

  // Delete .agents-reverse-engineer/ directory
  const configDir = path.join(worktreePath, '.agents-reverse-engineer');
  try {
    await rm(configDir, { recursive: true, force: true });
    removed++;
  } catch {
    // Directory may not exist
  }

  // Commit the removal
  const git = simpleGit(worktreePath);
  await git.add('-A');

  const status = await git.status();
  if (status.staged.length > 0 || status.deleted.length > 0 || status.modified.length > 0) {
    await git.commit('chore(are-plan): strip ARE artifacts for baseline comparison');
  }

  return removed;
}

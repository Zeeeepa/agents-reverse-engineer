/**
 * Git worktree management for plan comparisons.
 *
 * Creates temporary worktrees in /tmp for running AI planners in
 * isolated environments, copies untracked .sum files, and handles
 * cleanup on success or abort.
 *
 * @module
 */

import { simpleGit } from 'simple-git';
import { copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import fg from 'fast-glob';

/**
 * Result of creating the worktree pair.
 */
export interface WorktreePair {
  /** Path to the "with-docs" worktree */
  withDocsPath: string;
  /** Path to the "without-docs" worktree */
  withoutDocsPath: string;
  /** Branch name for "with-docs" */
  withDocsBranch: string;
  /** Branch name for "without-docs" */
  withoutDocsBranch: string;
  /** Cleanup function to remove worktrees */
  cleanup: () => Promise<void>;
}

/**
 * Check if a git branch exists.
 */
async function branchExists(projectRoot: string, branchName: string): Promise<boolean> {
  const git = simpleGit(projectRoot);
  try {
    await git.raw(['rev-parse', '--verify', branchName]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check for uncommitted changes and warn the user.
 *
 * @returns true if there are uncommitted changes
 */
export async function hasUncommittedChanges(projectRoot: string): Promise<boolean> {
  const git = simpleGit(projectRoot);
  const status = await git.status();
  return status.modified.length > 0 || status.not_added.length > 0 ||
    status.staged.length > 0 || status.deleted.length > 0;
}

/**
 * Copy untracked .sum files from the project root to the worktree.
 *
 * .sum files are gitignored, so they won't appear in worktrees by default.
 * This copies them to the "with-docs" worktree so the AI planner can see them.
 */
async function copySumFiles(projectRoot: string, worktreePath: string): Promise<number> {
  const sumFiles = await fg.glob('**/*.sum', {
    cwd: projectRoot,
    onlyFiles: true,
    dot: true,
    ignore: ['**/node_modules/**', '**/.git/**'],
  });

  for (const file of sumFiles) {
    const src = path.join(projectRoot, file);
    const dest = path.join(worktreePath, file);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(src, dest);
  }

  return sumFiles.length;
}

/**
 * Create a pair of git worktrees for plan comparison.
 *
 * Creates named branches from HEAD and temporary worktrees in /tmp.
 * The "with-docs" worktree gets .sum files copied in.
 *
 * @param projectRoot - The project root directory
 * @param taskSlug - Slugified task name for branch naming
 * @param force - Whether to overwrite existing branches
 * @returns WorktreePair with paths, branch names, and cleanup function
 * @throws If branches already exist and force is false
 */
export async function createWorktreePair(
  projectRoot: string,
  taskSlug: string,
  force: boolean,
): Promise<WorktreePair> {
  const git = simpleGit(projectRoot);

  const withDocsBranch = `are/plan/with-docs/${taskSlug}`;
  const withoutDocsBranch = `are/plan/without-docs/${taskSlug}`;

  // Check for existing branches
  const withDocsExists = await branchExists(projectRoot, withDocsBranch);
  const withoutDocsExists = await branchExists(projectRoot, withoutDocsBranch);

  if ((withDocsExists || withoutDocsExists) && !force) {
    throw new Error(
      `Branches already exist for this task:\n` +
      `  ${withDocsBranch}\n` +
      `  ${withoutDocsBranch}\n` +
      `Use --force to overwrite.`,
    );
  }

  // Delete old branches if they exist
  if (withDocsExists) {
    await git.raw(['branch', '-D', withDocsBranch]);
  }
  if (withoutDocsExists) {
    await git.raw(['branch', '-D', withoutDocsBranch]);
  }

  // Create named branches from HEAD
  await git.raw(['branch', withDocsBranch, 'HEAD']);
  await git.raw(['branch', withoutDocsBranch, 'HEAD']);

  // Create temporary worktree base directory
  const tmpId = randomBytes(6).toString('hex');
  const tmpBase = path.join(tmpdir(), `are-plan-${tmpId}`);
  const withDocsPath = path.join(tmpBase, 'with-docs');
  const withoutDocsPath = path.join(tmpBase, 'without-docs');

  // Create worktrees
  await git.raw(['worktree', 'add', withDocsPath, withDocsBranch]);
  await git.raw(['worktree', 'add', withoutDocsPath, withoutDocsBranch]);

  // Copy .sum files to the "with-docs" worktree
  await copySumFiles(projectRoot, withDocsPath);

  // Build cleanup function
  const cleanup = async () => {
    const cleanupGit = simpleGit(projectRoot);
    try {
      await cleanupGit.raw(['worktree', 'remove', '--force', withDocsPath]);
    } catch {
      // Worktree may already be removed
    }
    try {
      await cleanupGit.raw(['worktree', 'remove', '--force', withoutDocsPath]);
    } catch {
      // Worktree may already be removed
    }
  };

  return {
    withDocsPath,
    withoutDocsPath,
    withDocsBranch,
    withoutDocsBranch,
    cleanup,
  };
}

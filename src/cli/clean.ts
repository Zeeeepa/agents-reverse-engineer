/**
 * `are clean` command - Delete all generated documentation artifacts
 *
 * Removes .sum files, AGENTS.md files, root documents (CLAUDE.md),
 * and the GENERATION-PLAN.md file.
 */

import path from 'node:path';
import { access, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import fg from 'fast-glob';
import pc from 'picocolors';
import { createLogger } from '../output/logger.js';

/**
 * Options for the clean command.
 */
export interface CleanOptions {
  /**
   * Show files that would be deleted without deleting them.
   * @default false
   */
  dryRun: boolean;
}

/**
 * Execute the `are clean` command.
 *
 * Finds and deletes all generated documentation artifacts:
 * - `*.sum` files
 * - `AGENTS.md` files
 * - `CLAUDE.md` at project root
 * - `.agents-reverse-engineer/GENERATION-PLAN.md`
 *
 * @param targetPath - Project root directory (defaults to current working directory)
 * @param options - Command options
 */
export async function cleanCommand(
  targetPath: string,
  options: CleanOptions
): Promise<void> {
  const resolvedPath = path.resolve(targetPath || process.cwd());

  const logger = createLogger({ colors: true });

  // Verify target path exists
  try {
    await access(resolvedPath, constants.R_OK);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      logger.error(`Directory not found: ${resolvedPath}`);
      process.exit(1);
    }
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      logger.error(`Permission denied: ${resolvedPath}`);
      process.exit(1);
    }
    throw error;
  }

  // Find all artifacts
  const [sumFiles, agentsFiles] = await Promise.all([
    fg.glob('**/*.sum', {
      cwd: resolvedPath,
      absolute: true,
      onlyFiles: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    }),
    fg.glob('**/AGENTS.md', {
      cwd: resolvedPath,
      absolute: true,
      onlyFiles: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    }),
  ]);

  // Check for root docs and plan file
  const singleFiles: string[] = [];
  const claudeMd = path.join(resolvedPath, 'CLAUDE.md');
  const planFile = path.join(resolvedPath, '.agents-reverse-engineer', 'GENERATION-PLAN.md');

  for (const filePath of [claudeMd, planFile]) {
    try {
      await access(filePath, constants.F_OK);
      singleFiles.push(filePath);
    } catch {
      // File doesn't exist - skip
    }
  }

  const allFiles = [...sumFiles, ...agentsFiles, ...singleFiles];

  if (allFiles.length === 0) {
    logger.info('No generated artifacts found.');
    return;
  }

  // Display found files
  const relativePath = (absPath: string): string =>
    path.relative(resolvedPath, absPath);

  if (options.dryRun) {
    logger.info('Files that would be deleted:');
  }

  for (const file of allFiles) {
    logger.info(`  ${relativePath(file)}`);
  }

  logger.info('');
  logger.info(
    `${pc.bold(String(sumFiles.length))} .sum file(s), ` +
    `${pc.bold(String(agentsFiles.length))} AGENTS.md file(s), ` +
    `${pc.bold(String(singleFiles.length))} root doc(s)`
  );

  if (options.dryRun) {
    logger.info('');
    logger.info(pc.yellow('Dry run — no files were deleted.'));
    return;
  }

  // Delete all files
  let deleted = 0;
  for (const file of allFiles) {
    try {
      await unlink(file);
      deleted++;
    } catch (err) {
      logger.error(`Failed to delete ${relativePath(file)}: ${(err as Error).message}`);
    }
  }

  logger.info('');
  logger.info(pc.green(`Deleted ${deleted} file(s).`));
}

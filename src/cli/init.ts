/**
 * `are init` command - Create default configuration
 *
 * Creates the `.agents-reverse/config.yaml` file with documented defaults.
 * Warns if configuration already exists.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { configExists, writeDefaultConfig, CONFIG_DIR, CONFIG_FILE } from '../config/loader.js';
import { createLogger } from '../output/logger.js';

const GITIGNORE_SECTION = '# agents-reverse-engineer';
const SUM_PATTERN = '*.sum';

/**
 * Ensure `*.sum` is listed in `.gitignore`.
 *
 * If a `# agents-reverse-engineer` section already exists, appends within it.
 * Otherwise creates the section. Idempotent — skips if already present.
 *
 * @returns true if the file was modified
 */
async function ensureGitignoreEntry(root: string): Promise<boolean> {
  const gitignorePath = path.join(root, '.gitignore');

  let content = '';
  try {
    content = await readFile(gitignorePath, 'utf-8');
  } catch {
    // File doesn't exist — will create
  }

  // Already has the entry
  if (content.split('\n').some((line) => line.trim() === SUM_PATTERN)) {
    return false;
  }

  const sectionIdx = content.indexOf(GITIGNORE_SECTION);
  if (sectionIdx !== -1) {
    // Insert after the section header line
    const endOfLine = content.indexOf('\n', sectionIdx);
    const insertAt = endOfLine === -1 ? content.length : endOfLine;
    content = content.slice(0, insertAt) + '\n' + SUM_PATTERN + content.slice(insertAt);
  } else {
    // Append new section
    const separator = content.length > 0 && !content.endsWith('\n') ? '\n\n' : content.length > 0 ? '\n' : '';
    content += `${separator}${GITIGNORE_SECTION}\n${SUM_PATTERN}\n`;
  }

  await writeFile(gitignorePath, content, 'utf-8');
  return true;
}

/**
 * Ensure `.vscode/settings.json` has `files.exclude["**\/*.sum"] = true`.
 *
 * Creates the file and directory if needed. Idempotent.
 *
 * @returns true if the file was modified
 */
async function ensureVscodeExclude(root: string): Promise<boolean> {
  const vscodePath = path.join(root, '.vscode');
  const settingsPath = path.join(vscodePath, 'settings.json');

  let settings: Record<string, unknown> = {};
  try {
    const content = await readFile(settingsPath, 'utf-8');
    settings = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // File doesn't exist or invalid JSON — start fresh
  }

  const filesExclude = (settings['files.exclude'] ?? {}) as Record<string, boolean>;

  if (filesExclude['**/*.sum'] === true) {
    return false;
  }

  filesExclude['**/*.sum'] = true;
  settings['files.exclude'] = filesExclude;

  await mkdir(vscodePath, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, '\t') + '\n', 'utf-8');
  return true;
}

/**
 * Execute the `are init` command.
 *
 * Creates a default configuration file at `.agents-reverse/config.yaml`.
 * If the file already exists, logs a warning and returns without modification.
 *
 * @param root - Root directory where config will be created
 *
 * @example
 * ```typescript
 * await initCommand('.');
 * // Creates .agents-reverse/config.yaml in current directory
 * ```
 */
export async function initCommand(root: string, options?: { force?: boolean }): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const configPath = path.join(resolvedRoot, CONFIG_DIR, CONFIG_FILE);
  const force = options?.force ?? false;

  const logger = createLogger({ colors: true });

  try {
    // Check if config already exists
    if (!force && await configExists(resolvedRoot)) {
      logger.warn(`Config already exists at ${configPath}`);
      logger.info('Edit the file to customize exclusions and options.');
    } else {
      // Create default config
      await writeDefaultConfig(resolvedRoot);

      logger.info(`Created configuration at ${configPath}`);

      // Configure project files to hide generated *.sum artifacts
      try {
        if (await ensureGitignoreEntry(resolvedRoot)) {
          logger.info('Added *.sum to .gitignore');
        }
      } catch {
        logger.warn('Could not update .gitignore');
      }

      try {
        if (await ensureVscodeExclude(resolvedRoot)) {
          logger.info('Added *.sum to .vscode/settings.json files.exclude');
        }
      } catch {
        logger.warn('Could not update .vscode/settings.json');
      }

      logger.info('');
      logger.info('Edit the file to customize:');
      logger.info('  - exclude.patterns: Custom glob patterns to exclude');
      logger.info('  - ai.concurrency: Parallel AI calls (1-20, default: auto)');
      logger.info('  - ai.timeoutMs: Subprocess timeout (default: 300,000ms = 5 min)');
      logger.info('  - ai.backend: AI backend (claude/gemini/opencode/auto)');
      logger.info('');
      logger.info('See README.md for full configuration reference.');
    }
  } catch (err) {
    const error = err as NodeJS.ErrnoException;

    // Permission error
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      logger.error(`Permission denied: Cannot create ${configPath}`);
      logger.info('Check that you have write permissions to this directory.');
      process.exit(1);
    }

    // Other error
    logger.error(`Failed to create configuration: ${error.message}`);
    process.exit(1);
  }
}

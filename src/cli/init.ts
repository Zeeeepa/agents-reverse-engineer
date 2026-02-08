/**
 * `are init` command - Create default configuration
 *
 * Creates the `.agents-reverse/config.yaml` file with documented defaults.
 * Warns if configuration already exists.
 */

import path from 'node:path';
import { configExists, writeDefaultConfig, CONFIG_DIR, CONFIG_FILE } from '../config/loader.js';
import { createLogger } from '../output/logger.js';

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
export async function initCommand(root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const configPath = path.join(resolvedRoot, CONFIG_DIR, CONFIG_FILE);

  const logger = createLogger({
    verbose: true,
    quiet: false,
    colors: true,
    showExcluded: false,
  });

  try {
    // Check if config already exists
    if (await configExists(resolvedRoot)) {
      logger.warn(`Config already exists at ${configPath}`);
      logger.info('Edit the file to customize exclusions and options.');
    } else {
      // Create default config
      await writeDefaultConfig(resolvedRoot);

      logger.info(`Created configuration at ${configPath}`);
      logger.info('');
      logger.info('Edit the file to customize:');
      logger.info('  - exclude.patterns: Custom glob patterns to exclude');
      logger.info('  - ai.concurrency: Parallel AI calls (1-10, default: 5)');
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

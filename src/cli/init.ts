/**
 * `are init` command - Create default configuration
 *
 * Creates the `.agents-reverse/config.yaml` file with documented defaults.
 * Warns if configuration already exists.
 */

import path from 'node:path';
import { configExists, writeDefaultConfig, CONFIG_DIR, CONFIG_FILE } from '../config/loader.js';
import { createLogger } from '../output/logger.js';

import type { EnvironmentType } from '../integration/types.js';

/**
 * Options for the init command.
 */
export interface InitOptions {
  /**
   * Run in interactive mode (reserved for future --interactive flag).
   * @default false
   */
  interactive?: boolean;
  /**
   * Generate integration files for specified AI assistant environment.
   * Valid values: 'claude', 'opencode', 'gemini', 'aider'
   * @default undefined
   */
  integration?: EnvironmentType;
}

/**
 * Execute the `are init` command.
 *
 * Creates a default configuration file at `.agents-reverse/config.yaml`.
 * If the file already exists, logs a warning and returns without modification.
 *
 * @param root - Root directory where config will be created
 * @param options - Command options
 *
 * @example
 * ```typescript
 * await initCommand('.', { interactive: false });
 * // Creates .agents-reverse/config.yaml in current directory
 * ```
 */
export async function initCommand(root: string, options: InitOptions): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const configPath = path.join(resolvedRoot, CONFIG_DIR, CONFIG_FILE);

  const logger = createLogger({
    verbose: true,
    quiet: false,
    colors: true,
    showExcluded: false,
  });

  try {
    let configCreated = false;

    // Check if config already exists
    if (await configExists(resolvedRoot)) {
      logger.warn(`Config already exists at ${configPath}`);
      logger.info('Edit the file to customize exclusions and options.');
    } else {
      // Create default config
      await writeDefaultConfig(resolvedRoot);
      configCreated = true;

      logger.info(`Created configuration at ${configPath}`);
      logger.info('');
      logger.info('Edit the file to customize:');
      logger.info('  - exclude.patterns: Add custom glob patterns to exclude');
      logger.info('  - exclude.vendorDirs: Modify vendor directories list');
      logger.info('  - options.maxFileSize: Adjust large file threshold');
    }

    // Handle integration file generation (runs regardless of config state)
    if (options.integration) {
      const { generateIntegrationFiles } = await import('../integration/generate.js');
      const results = await generateIntegrationFiles(resolvedRoot, {
        environment: options.integration,
      });

      if (results.length === 0) {
        logger.info('');
        logger.info(`No templates available for ${options.integration} environment.`);
      } else {
        for (const result of results) {
          logger.info('');
          logger.info(`${result.environment} integration:`);
          if (result.filesCreated.length > 0) {
            logger.info(`  Created: ${result.filesCreated.join(', ')}`);
          }
          if (result.filesSkipped.length > 0) {
            logger.info(`  Skipped (already exist): ${result.filesSkipped.join(', ')}`);
          }
          if (result.environment === 'claude') {
            logger.info('');
            logger.info('Note: Add SessionEnd hook to .claude/settings.json manually:');
            logger.info('  "hooks": { "SessionEnd": [".claude/hooks/ar-session-end.js"] }');
          }
        }
      }
    } else if (configCreated) {
      // Only show integration hint if we just created config
      logger.info('');
      logger.info('Run with --integration <name> to set up AI assistant commands');
      logger.info('  Supported: claude, opencode, gemini, aider');
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

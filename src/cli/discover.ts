/**
 * `are discover` command - Discover files to analyze
 *
 * Walks a directory tree and applies filters (gitignore, vendor, binary, custom)
 * to identify files suitable for analysis.
 */

import path from 'node:path';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import pc from 'picocolors';
import { loadConfig } from '../config/loader.js';
import { discoverFiles } from '../discovery/run.js';
import { createLogger } from '../output/logger.js';
import { createOrchestrator } from '../generation/orchestrator.js';
import { buildExecutionPlan, formatExecutionPlanAsMarkdown } from '../generation/executor.js';
import type { DiscoveryResult } from '../types/index.js';
import type { ITraceWriter } from '../orchestration/trace.js';

/**
 * Options for the discover command.
 */
export interface DiscoverOptions {
  /**
   * Optional trace writer for emitting discovery events.
   */
  tracer?: ITraceWriter;

  /**
   * Enable debug output.
   * @default false
   */
  debug?: boolean;
}

/**
 * Execute the `are discover` command.
 *
 * Discovers files in the target directory, applying all configured filters
 * (gitignore, vendor, binary, custom patterns).
 *
 * @param targetPath - Directory to scan (defaults to current working directory)
 * @param options - Command options
 *
 * @example
 * ```typescript
 * await discoverCommand('.', {});
 * ```
 */
export async function discoverCommand(
  targetPath: string,
  options: DiscoverOptions
): Promise<void> {
  // Resolve to absolute path (default to cwd)
  const resolvedPath = path.resolve(targetPath || process.cwd());

  // Load configuration (uses defaults if no config file)
  const config = await loadConfig(resolvedPath);

  const logger = createLogger({ colors: config.output.colors });

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

  logger.info(`Discovering files in ${resolvedPath}...`);
  logger.info('');

  // Emit discovery start trace event
  const discoveryStartTime = process.hrtime.bigint();
  options.tracer?.emit({
    type: 'discovery:start',
    targetPath: resolvedPath,
  });

  if (options.debug) {
    console.error(pc.dim(`[debug] Discovering files in: ${resolvedPath}`));
  }

  // Run shared discovery pipeline (walk + filter)
  const result = await discoverFiles(resolvedPath, config, {
    tracer: options.tracer,
    debug: options.debug,
  });

  // Emit discovery end trace event
  const discoveryEndTime = process.hrtime.bigint();
  const discoveryDurationMs = Number(discoveryEndTime - discoveryStartTime) / 1_000_000;
  options.tracer?.emit({
    type: 'discovery:end',
    filesIncluded: result.included.length,
    filesExcluded: result.excluded.length,
    durationMs: discoveryDurationMs,
  });

  if (options.debug) {
    console.error(
      pc.dim(
        `[debug] Discovery complete: ${result.included.length} files included, ${result.excluded.length} excluded`
      )
    );
  }

  // Log results
  // Make paths relative for cleaner output
  const relativePath = (absPath: string): string =>
    path.relative(resolvedPath, absPath);

  // Show each included file
  for (const file of result.included) {
    logger.file(relativePath(file));
  }

  // Show each excluded file
  for (const excluded of result.excluded) {
    logger.excluded(relativePath(excluded.path), excluded.reason, excluded.filter);
  }

  // Summary
  logger.summary(result.included.length, result.excluded.length);

  // Generate GENERATION-PLAN.md
  {
    logger.info('');
    logger.info('Generating execution plan...');

    // Create discovery result for orchestrator
    const discoveryResult: DiscoveryResult = {
      files: result.included,
      excluded: result.excluded.map(e => ({ path: e.path, reason: e.reason })),
    };

    // Create orchestrator and build generation plan
    const orchestrator = createOrchestrator(config, resolvedPath);
    const generationPlan = await orchestrator.createPlan(discoveryResult);

    // Build execution plan with post-order traversal
    const executionPlan = buildExecutionPlan(generationPlan, resolvedPath);

    // Format as markdown
    const markdown = formatExecutionPlanAsMarkdown(executionPlan);

    // Write to .agents-reverse-engineer/GENERATION-PLAN.md
    const configDir = path.join(resolvedPath, '.agents-reverse-engineer');
    const planPath = path.join(configDir, 'GENERATION-PLAN.md');

    try {
      await mkdir(configDir, { recursive: true });
      await writeFile(planPath, markdown, 'utf8');
      logger.info(`Created ${path.relative(resolvedPath, planPath)}`);
    } catch (err) {
      logger.error(`Failed to write plan: ${(err as Error).message}`);
      process.exit(1);
    }
  }

}

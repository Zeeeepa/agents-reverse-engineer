/**
 * CLI generate command
 *
 * Creates and executes a documentation generation plan by:
 * 1. Discovering files to analyze
 * 2. Detecting file types and creating analysis tasks
 * 3. Resolving an AI CLI backend
 * 4. Running concurrent AI analysis via CommandRunner
 * 5. Producing .sum files, AGENTS.md, and root documents
 *
 * With --dry-run, shows the plan without making any AI calls.
 */

import * as path from 'node:path';
import pc from 'picocolors';
import { loadConfig } from '../config/loader.js';
import { createLogger } from '../output/logger.js';
import { walkDirectory } from '../discovery/walker.js';
import {
  applyFilters,
  createGitignoreFilter,
  createVendorFilter,
  createBinaryFilter,
  createCustomFilter,
} from '../discovery/filters/index.js';
import { createOrchestrator, type GenerationPlan } from '../generation/orchestrator.js';
import { buildExecutionPlan } from '../generation/executor.js';
import {
  AIService,
  AIServiceError,
  createBackendRegistry,
  resolveBackend,
  getInstallInstructions,
} from '../ai/index.js';
import { CommandRunner, createTraceWriter, cleanupOldTraces } from '../orchestration/index.js';

/**
 * Options for the generate command.
 */
export interface GenerateOptions {
  /** Dry run - show plan without generating */
  dryRun?: boolean;
  /** Number of concurrent AI calls */
  concurrency?: number;
  /** Stop on first file analysis failure */
  failFast?: boolean;
  /** Show AI prompts and backend details */
  debug?: boolean;
  /** Enable concurrency tracing to .agents-reverse-engineer/traces/ */
  trace?: boolean;
}

/**
 * Format file type distribution for display.
 */
function formatTypeDistribution(plan: GenerationPlan): string {
  const typeCounts = new Map<string, number>();

  for (const file of plan.files) {
    const count = typeCounts.get(file.fileType) ?? 0;
    typeCounts.set(file.fileType, count + 1);
  }

  return Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `  ${type}: ${count}`)
    .join('\n');
}

/**
 * Format the generation plan for display.
 */
function formatPlan(plan: GenerationPlan): string {
  const lines: string[] = [];

  lines.push(`\n=== Generation Plan ===\n`);

  // File summary
  lines.push(`Files to analyze: ${plan.files.length}`);
  lines.push(`Tasks to execute: ${plan.tasks.length}`);
  lines.push('');

  // File type distribution
  lines.push('File types:');
  lines.push(formatTypeDistribution(plan));
  lines.push('');

  // Complexity
  lines.push('Complexity:');
  lines.push(`  Files: ${plan.complexity.fileCount}`);
  lines.push(`  Directory depth: ${plan.complexity.directoryDepth}`);
  if (plan.complexity.architecturalPatterns.length > 0) {
    lines.push(`  Patterns: ${plan.complexity.architecturalPatterns.join(', ')}`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate command - discovers files, plans analysis, and executes AI-driven
 * documentation generation.
 *
 * Default behavior: resolves an AI CLI backend, builds an execution plan,
 * and runs concurrent AI analysis via the CommandRunner. Produces .sum files,
 * AGENTS.md per directory, and root documents (CLAUDE.md, ARCHITECTURE.md, etc.).
 *
 * @param targetPath - Directory to generate documentation for
 * @param options - Command options (concurrency, failFast, debug, etc.)
 */
export async function generateCommand(
  targetPath: string,
  options: GenerateOptions
): Promise<void> {
  const absolutePath = path.resolve(targetPath);
  const logger = createLogger({ colors: true });

  logger.info(`Generating documentation plan for: ${absolutePath}`);

  // Create trace writer (moved earlier to use in config loading and discovery)
  const tracer = createTraceWriter(absolutePath, options.trace ?? false);
  if (options.trace && tracer.filePath) {
    console.error(pc.dim(`[trace] Writing to ${tracer.filePath}`));
  }

  // Load configuration
  const config = await loadConfig(absolutePath, {
    tracer,
    debug: options.debug,
  });

  // Discover files
  logger.info('Discovering files...');

  // Create filters in order (same as discover command)
  const gitignoreFilter = await createGitignoreFilter(absolutePath);
  const vendorFilter = createVendorFilter(config.exclude.vendorDirs);
  const binaryFilter = createBinaryFilter({
    maxFileSize: config.options.maxFileSize,
    additionalExtensions: config.exclude.binaryExtensions,
  });
  const customFilter = createCustomFilter(config.exclude.patterns, absolutePath);
  const filters = [gitignoreFilter, vendorFilter, binaryFilter, customFilter];

  // Walk directory
  const files = await walkDirectory({
    cwd: absolutePath,
    followSymlinks: config.options.followSymlinks,
  });

  // Apply filters
  const filterResult = await applyFilters(files, filters, {
    tracer,
    debug: options.debug,
  });

  // Create discovery result for orchestrator
  const discoveryResult = {
    files: filterResult.included,
    excluded: filterResult.excluded.map(e => ({ path: e.path, reason: e.reason })),
  };

  logger.info(`Found ${discoveryResult.files.length} files to analyze`);

  // Create generation plan
  logger.info('Creating generation plan...');
  const orchestrator = createOrchestrator(
    config,
    absolutePath,
    discoveryResult.files.length,
    { tracer, debug: options.debug }
  );
  const plan = await orchestrator.createPlan(discoveryResult);

  // Display plan
  console.log(formatPlan(plan));

  // ---------------------------------------------------------------------------
  // Dry-run: show execution plan summary without making AI calls
  // ---------------------------------------------------------------------------

  if (options.dryRun) {
    const executionPlan = buildExecutionPlan(plan, absolutePath);
    const dirCount = Object.keys(executionPlan.directoryFileMap).length;

    console.log(pc.bold('\n--- Dry Run Summary ---\n'));
    console.log(`  Files to analyze:     ${pc.cyan(String(executionPlan.fileTasks.length))}`);
    console.log(`  Directories:          ${pc.cyan(String(dirCount))}`);
    console.log(`  Root documents:       ${pc.cyan(String(executionPlan.rootTasks.length))}`);
    console.log(`  Estimated AI calls:   ${pc.cyan(String(executionPlan.tasks.length))}`);
    console.log('');
    console.log(pc.dim('Files:'));
    for (const task of executionPlan.fileTasks) {
      console.log(pc.dim(`  ${task.path}`));
    }
    console.log('');
    console.log(pc.dim('No AI calls made (dry run).'));
    return;
  }

  // ---------------------------------------------------------------------------
  // Resolve backend and run AI analysis
  // ---------------------------------------------------------------------------

  // Resolve AI CLI backend
  const registry = createBackendRegistry();
  let backend;
  try {
    backend = await resolveBackend(registry, config.ai.backend);
  } catch (error) {
    if (error instanceof AIServiceError && error.code === 'CLI_NOT_FOUND') {
      console.error(pc.red('Error: No AI CLI found.\n'));
      console.error(getInstallInstructions(registry));
      process.exit(2);
    }
    throw error;
  }

  // Debug: log backend info
  if (options.debug) {
    console.log(pc.dim(`[debug] Backend: ${backend.name}`));
    console.log(pc.dim(`[debug] CLI command: ${backend.cliCommand}`));
    console.log(pc.dim(`[debug] Model: ${config.ai.model}`));
  }

  // Create AI service
  const aiService = new AIService(backend, {
    timeoutMs: config.ai.timeoutMs,
    maxRetries: config.ai.maxRetries,
    telemetry: { keepRuns: config.ai.telemetry.keepRuns },
  });

  if (options.debug) {
    aiService.setDebug(true);
  }

  // Build execution plan
  const executionPlan = buildExecutionPlan(plan, absolutePath);

  // Determine concurrency
  const concurrency = options.concurrency ?? config.ai.concurrency;

  // Enable subprocess output logging alongside tracing
  if (options.trace) {
    const logDir = path.join(
      absolutePath, '.agents-reverse-engineer', 'subprocess-logs',
      new Date().toISOString().replace(/[:.]/g, '-'),
    );
    aiService.setSubprocessLogDir(logDir);
    console.error(pc.dim(`[trace] Subprocess logs → ${logDir}`));
  }

  // Create command runner
  const runner = new CommandRunner(aiService, {
    concurrency,
    failFast: options.failFast,
    debug: options.debug,
    tracer,
  });

  // Execute the three-phase pipeline
  const summary = await runner.executeGenerate(executionPlan);

  // Write telemetry run log
  await aiService.finalize(absolutePath);

  // Finalize trace and clean up old trace files
  await tracer.finalize();
  if (options.trace) {
    await cleanupOldTraces(absolutePath);
  }

  // Determine exit code from RunSummary
  //   0: all files succeeded
  //   1: some files failed (partial failure)
  //   2: no files succeeded (total failure)
  if (summary.filesProcessed === 0 && summary.filesFailed > 0) {
    process.exit(2);
  } else if (summary.filesFailed > 0) {
    process.exit(1);
  }
  // Exit code 0 -- all files succeeded (or no files to process)
}

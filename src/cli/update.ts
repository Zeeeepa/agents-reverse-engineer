/**
 * CLI update command
 *
 * Updates documentation incrementally based on git changes since last run.
 * Uses the AI service for real file analysis (not placeholders) and processes
 * changed files concurrently via the CommandRunner orchestration engine.
 * Regenerates AGENTS.md for affected directories after analysis.
 */
import * as path from 'node:path';
import { readFile } from 'node:fs/promises';
import pc from 'picocolors';
import { loadConfig, findProjectRoot } from '../config/loader.js';
import { createLogger } from '../output/logger.js';
import {
  createUpdateOrchestrator,
  type UpdatePlan,
} from '../update/index.js';
import { writeAgentsMd, GENERATED_MARKER } from '../generation/writers/agents-md.js';
import { writeClaudeMdPointer } from '../generation/writers/claude-md.js';
import { buildDirectoryPrompt } from '../generation/prompts/index.js';
import {
  AIService,
  AIServiceError,
  createBackendRegistry,
  resolveBackend,
  getInstallInstructions,
} from '../ai/index.js';
import { CommandRunner, ProgressReporter, ProgressLog, createTraceWriter, cleanupOldTraces } from '../orchestration/index.js';

/**
 * Options for the update command.
 */
export interface UpdateCommandOptions {
  /** Include uncommitted changes (staged + working directory) */
  uncommitted?: boolean;
  /** Dry run - show plan without making changes */
  dryRun?: boolean;
  /** Number of concurrent AI calls */
  concurrency?: number;
  /** Stop on first file analysis failure */
  failFast?: boolean;
  /** Show AI prompts and backend details */
  debug?: boolean;
  /** Enable concurrency tracing to .agents-reverse-engineer/traces/ */
  trace?: boolean;
  /** Override AI model (e.g., "sonnet", "opus") */
  model?: string;
}

/**
 * Format cleanup results for display.
 */
function formatCleanup(plan: UpdatePlan): string[] {
  const lines: string[] = [];

  if (plan.cleanup.deletedSumFiles.length > 0) {
    lines.push(pc.yellow('Cleanup (deleted .sum files):'));
    for (const file of plan.cleanup.deletedSumFiles) {
      lines.push(`  ${pc.red('-')} ${file}`);
    }
  }

  if (plan.cleanup.deletedAgentsMd.length > 0) {
    lines.push(pc.yellow('Cleanup (deleted AGENTS.md from empty dirs):'));
    for (const file of plan.cleanup.deletedAgentsMd) {
      lines.push(`  ${pc.red('-')} ${file}`);
    }
  }

  return lines;
}

/**
 * Format the update plan for display.
 */
function formatPlan(plan: UpdatePlan): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(pc.bold('=== Update Plan ==='));
  lines.push('');

  // Baseline info
  if (plan.isFirstRun) {
    lines.push(pc.yellow('First run detected. Use "are generate" for initial documentation.'));
    lines.push('');
  } else {
    lines.push(`Current commit: ${pc.dim(plan.currentCommit.slice(0, 7))}`);
    lines.push('');
  }

  // Summary
  const analyzeCount = plan.filesToAnalyze.length;
  const skipCount = plan.filesToSkip.length;
  const cleanupCount = plan.cleanup.deletedSumFiles.length + plan.cleanup.deletedAgentsMd.length;

  if (analyzeCount === 0 && skipCount === 0 && cleanupCount === 0) {
    lines.push(pc.green('No changes detected since last run.'));
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`Files to analyze: ${pc.cyan(String(analyzeCount))}`);
  lines.push(`Files unchanged: ${pc.dim(String(skipCount))}`);
  if (cleanupCount > 0) {
    lines.push(`Cleanup actions: ${pc.yellow(String(cleanupCount))}`);
  }
  lines.push('');

  // File list with status markers
  if (plan.filesToAnalyze.length > 0) {
    lines.push(pc.cyan('Files to analyze:'));
    for (const file of plan.filesToAnalyze) {
      const status = file.status === 'added' ? pc.green('+') :
                    file.status === 'renamed' ? pc.blue('R') :
                    pc.yellow('M');
      lines.push(`  ${status} ${file.path}`);
      if (file.status === 'renamed' && file.oldPath) {
        lines.push(`    ${pc.dim(`(was: ${file.oldPath})`)}`);
      }
    }
    lines.push('');
  }

  if (plan.filesToSkip.length > 0) {
    lines.push(pc.dim('Files unchanged (skipped):'));
    for (const file of plan.filesToSkip) {
      lines.push(`  ${pc.dim('=')} ${pc.dim(file)}`);
    }
    lines.push('');
  }

  // Cleanup
  lines.push(...formatCleanup(plan));

  // Affected directories
  if (plan.affectedDirs.length > 0) {
    lines.push('');
    lines.push(pc.cyan('Directories for AGENTS.md regeneration:'));
    for (const dir of plan.affectedDirs) {
      lines.push(`  ${dir}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Update command - incrementally updates documentation based on git changes.
 *
 * This command:
 * 1. Checks git repository status
 * 2. Detects files changed since last run (via content-hash comparison)
 * 3. Cleans up orphaned .sum files
 * 4. Resolves an AI CLI backend and creates the AI service
 * 5. Analyzes changed files concurrently via CommandRunner
 * 6. Regenerates AGENTS.md for affected directories
 * 7. Writes telemetry run log and prints run summary
 *
 * Exit codes: 0 = all success, 1 = partial failure, 2 = total failure / no CLI
 */
export async function updateCommand(
  targetPath: string,
  options: UpdateCommandOptions
): Promise<void> {
  const absolutePath = await findProjectRoot(path.resolve(targetPath));
  const logger = createLogger({ colors: true });

  logger.info(`Checking for updates in: ${absolutePath}`);

  // Create trace writer (moved earlier to use in config loading and orchestrator)
  const tracer = createTraceWriter(absolutePath, options.trace ?? false);
  if (options.trace && tracer.filePath) {
    console.error(pc.dim(`[trace] Writing to ${tracer.filePath}`));
  }

  // Load configuration
  const config = await loadConfig(absolutePath, {
    tracer,
    debug: options.debug,
  });

  // Create orchestrator
  const orchestrator = createUpdateOrchestrator(config, absolutePath, {
    tracer,
    debug: options.debug,
  });

  try {
    // Prepare update plan
    const plan = await orchestrator.preparePlan({
      includeUncommitted: options.uncommitted,
      dryRun: options.dryRun,
    });

    // Display plan
    console.log(formatPlan(plan));

    // Handle first run
    if (plan.isFirstRun) {
      console.log(pc.yellow('Hint: Run "are generate" first to create initial documentation.'));
      console.log(pc.yellow('Then run "are update" after making changes.'));
      return;
    }

    // Handle no changes
    if (plan.filesToAnalyze.length === 0 &&
        plan.cleanup.deletedSumFiles.length === 0 &&
        plan.cleanup.deletedAgentsMd.length === 0) {
      console.log(pc.green('All files are up to date.'));
      return;
    }

    if (options.dryRun) {
      logger.info('Dry run complete. No files written.');
      return;
    }

    // -------------------------------------------------------------------------
    // Backend resolution (same pattern as generate command)
    // -------------------------------------------------------------------------

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

    // Resolve effective model (CLI flag > config)
    const effectiveModel = options.model ?? config.ai.model;

    // Debug: log backend info
    if (options.debug) {
      console.log(pc.dim(`[debug] Backend: ${backend.name}`));
      console.log(pc.dim(`[debug] CLI command: ${backend.cliCommand}`));
      console.log(pc.dim(`[debug] Model: ${effectiveModel}`));
    }

    // -------------------------------------------------------------------------
    // AI service setup
    // -------------------------------------------------------------------------

    const aiService = new AIService(backend, {
      timeoutMs: config.ai.timeoutMs,
      maxRetries: config.ai.maxRetries,
      model: effectiveModel,
      telemetry: { keepRuns: config.ai.telemetry.keepRuns },
    });

    if (options.debug) {
      aiService.setDebug(true);
    }

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

    // Create progress log for tail -f monitoring
    const progressLog = ProgressLog.create(absolutePath);
    progressLog.write(`=== ARE Update (${new Date().toISOString()}) ===`);
    progressLog.write(`Project: ${absolutePath}`);
    progressLog.write(`Files to analyze: ${plan.filesToAnalyze.length} | Directories: ${plan.affectedDirs.length}`);
    progressLog.write('');

    // Create command runner
    const runner = new CommandRunner(aiService, {
      concurrency,
      failFast: options.failFast,
      debug: options.debug,
      tracer,
      progressLog,
    });

    // -------------------------------------------------------------------------
    // Phase 1: File analysis via CommandRunner (concurrent AI calls)
    // -------------------------------------------------------------------------

    const summary = await runner.executeUpdate(
      plan.filesToAnalyze,
      absolutePath,
      config,
    );

    // -------------------------------------------------------------------------
    // Phase 2: AGENTS.md regeneration for affected directories
    // -------------------------------------------------------------------------

    if (plan.affectedDirs.length > 0) {
      const knownDirs = new Set(plan.affectedDirs);
      const phase2Start = Date.now();
      let dirsCompleted = 0;
      let dirsFailed = 0;

      // Emit phase start
      tracer.emit({
        type: 'phase:start',
        phase: 'update-phase-dir-regen',
        taskCount: plan.affectedDirs.length,
        concurrency: 1,
      });

      const dirReporter = new ProgressReporter(0, plan.affectedDirs.length, progressLog);
      for (const dir of plan.affectedDirs) {
        const taskStart = Date.now();
        const taskLabel = dir || '.';

        // Emit task:start
        tracer.emit({
          type: 'task:start',
          taskLabel,
          phase: 'update-phase-dir-regen',
        });

        const dirPath = dir === '.' ? absolutePath : path.join(absolutePath, dir);
        dirReporter.onDirectoryStart(dir || '.');
        try {
          // Read existing generated AGENTS.md for incremental update context
          let existingAgentsMd: string | undefined;
          try {
            const agentsContent = await readFile(path.join(dirPath, 'AGENTS.md'), 'utf-8');
            if (agentsContent.includes(GENERATED_MARKER)) {
              existingAgentsMd = agentsContent;
            }
          } catch {
            // No existing AGENTS.md — will generate from scratch
          }

          const prompt = await buildDirectoryPrompt(dirPath, absolutePath, options.debug, knownDirs, undefined, existingAgentsMd);
          const response = await aiService.call({
            prompt: prompt.user,
            systemPrompt: prompt.system,
          });
          await writeAgentsMd(dirPath, absolutePath, response.text);
          await writeClaudeMdPointer(dirPath);
          const dirDurationMs = Date.now() - taskStart;
          dirReporter.onDirectoryDone(
            dir || '.',
            dirDurationMs,
            response.inputTokens,
            response.outputTokens,
            response.model,
            response.cacheReadTokens,
            response.cacheCreationTokens,
          );
          dirsCompleted++;

          // Emit task:done (success)
          tracer.emit({
            type: 'task:done',
            workerId: 0,
            taskIndex: dirsCompleted - 1,
            taskLabel,
            durationMs: Date.now() - taskStart,
            success: true,
            activeTasks: 0,
          });
        } catch (error) {
          dirsFailed++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.log(`${pc.dim('[dir]')} ${pc.yellow('WARN')} ${dir || '.'}: ${errorMsg}`);

          // Emit task:done (failure)
          tracer.emit({
            type: 'task:done',
            workerId: 0,
            taskIndex: dirsCompleted + dirsFailed - 1,
            taskLabel,
            durationMs: Date.now() - taskStart,
            success: false,
            error: errorMsg,
            activeTasks: 0,
          });
        }
      }

      // Emit phase end
      tracer.emit({
        type: 'phase:end',
        phase: 'update-phase-dir-regen',
        durationMs: Date.now() - phase2Start,
        tasksCompleted: dirsCompleted,
        tasksFailed: dirsFailed,
      });
    }

    // -------------------------------------------------------------------------
    // Telemetry finalization
    // -------------------------------------------------------------------------

    await aiService.finalize(absolutePath);

    // Finalize progress log, trace, and clean up old trace files
    await progressLog.finalize();
    await tracer.finalize();
    if (options.trace) {
      await cleanupOldTraces(absolutePath);
    }

    // -------------------------------------------------------------------------
    // Record run state (no-op in frontmatter mode, kept for API compatibility)
    // -------------------------------------------------------------------------

    const filesSkipped = plan.filesToSkip.length;
    await orchestrator.recordRun(
      plan.currentCommit,
      summary.filesProcessed,
      filesSkipped
    );

    // -------------------------------------------------------------------------
    // Exit code: 0 = all success, 1 = partial failure, 2 = total failure
    // -------------------------------------------------------------------------

    if (summary.filesProcessed === 0 && summary.filesFailed > 0) {
      process.exit(2);
    } else if (summary.filesFailed > 0) {
      process.exit(1);
    }
    // Exit code 0 -- all files succeeded (or no files to process)

  } finally {
    orchestrator.close();
  }
}

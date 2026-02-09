/**
 * Rebuild execution orchestrator.
 *
 * Standalone async function that wires together the spec reader, checkpoint
 * manager, AI service, concurrency pool, and progress reporter into a
 * working rebuild pipeline. Processes rebuild units grouped by order value:
 * all units in a group run concurrently via runPool, and groups execute
 * sequentially to respect ordering dependencies.
 *
 * After each order group completes, exported type signatures are extracted
 * from the generated files and accumulated as context for subsequent groups.
 *
 * @module
 */

import * as path from 'node:path';
import { writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import type { AIService } from '../ai/index.js';
import type { AIResponse } from '../ai/types.js';
import { runPool, ProgressReporter, type ProgressLog, type ITraceWriter } from '../orchestration/index.js';
import { CheckpointManager } from './checkpoint.js';
import { readSpecFiles, partitionSpec } from './spec-reader.js';
import { parseModuleOutput } from './output-parser.js';
import type { RebuildUnit, RebuildResult } from './types.js';
import { buildRebuildPrompt } from './prompts.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for the rebuild execution pipeline.
 */
export interface RebuildExecutionOptions {
  /** Absolute path to the output directory */
  outputDir: string;
  /** Maximum concurrent AI calls within each order group */
  concurrency: number;
  /** Stop on first failure */
  failFast?: boolean;
  /** Wipe output directory and start fresh */
  force?: boolean;
  /** Enable verbose debug logging */
  debug?: boolean;
  /** Trace writer for concurrency debugging */
  tracer?: ITraceWriter;
  /** Progress log for tail -f monitoring */
  progressLog?: ProgressLog;
}

// ---------------------------------------------------------------------------
// Context accumulation
// ---------------------------------------------------------------------------

/** Default character limit before truncating older group context */
const BUILT_CONTEXT_LIMIT = 100_000;

/** Number of lines to keep from truncated files (typically imports + type declarations) */
const TRUNCATED_HEAD_LINES = 20;

// ---------------------------------------------------------------------------
// executeRebuild
// ---------------------------------------------------------------------------

/**
 * Execute the rebuild pipeline.
 *
 * Reads spec files, partitions into units, loads/creates checkpoint,
 * processes units grouped by order value (sequential groups, concurrent
 * within each group), accumulates built context, and returns summary.
 *
 * @param aiService - Configured AI service instance
 * @param projectRoot - Absolute path to the project root
 * @param options - Rebuild execution options
 * @returns Summary with counts of processed, failed, and skipped modules
 */
export async function executeRebuild(
  aiService: AIService,
  projectRoot: string,
  options: RebuildExecutionOptions,
): Promise<{ modulesProcessed: number; modulesFailed: number; modulesSkipped: number }> {
  const { outputDir, concurrency, tracer, progressLog } = options;

  // 1. Read specs
  const specFiles = await readSpecFiles(projectRoot);

  // 2. Partition into units
  const units = partitionSpec(specFiles);

  if (options.debug) {
    console.error(`[debug] Rebuild units (${units.length}):`);
    for (const unit of units) {
      console.error(`[debug]   order=${unit.order} name="${unit.name}"`);
    }
  }

  // 3. Handle --force: wipe output directory
  if (options.force) {
    await rm(outputDir, { recursive: true, force: true });
  }

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  // 4. Load/create checkpoint
  const unitNames = units.map((u) => u.name);
  const { manager: checkpoint, isResume } = await CheckpointManager.load(
    outputDir,
    specFiles,
    unitNames,
  );

  if (isResume) {
    const pending = checkpoint.getPendingUnits();
    const done = unitNames.length - pending.length;
    console.log(`Resuming from checkpoint: ${done} of ${unitNames.length} modules already complete`);
    progressLog?.write(`Resuming from checkpoint: ${done} of ${unitNames.length} modules already complete`);
  }

  // 5. Initialize checkpoint (write to disk)
  await checkpoint.initialize();

  // 6. Filter to pending units
  let modulesSkipped = 0;
  const pendingUnits: RebuildUnit[] = [];
  for (const unit of units) {
    if (checkpoint.isDone(unit.name)) {
      modulesSkipped++;
    } else {
      pendingUnits.push(unit);
    }
  }

  if (pendingUnits.length === 0) {
    console.log('All modules already complete. Nothing to rebuild.');
    progressLog?.write('All modules already complete. Nothing to rebuild.');
    return { modulesProcessed: 0, modulesFailed: 0, modulesSkipped };
  }

  // 7. Create progress reporter
  const reporter = new ProgressReporter(pendingUnits.length, 0, progressLog);

  // 8. Concatenate full spec for prompt context
  const fullSpec = specFiles.map((f) => f.content).join('\n\n');

  // 9. Context accumulator for export signatures
  let builtContext = '';

  // 10. Group units by order value
  const orderGroups = new Map<number, RebuildUnit[]>();
  for (const unit of pendingUnits) {
    const group = orderGroups.get(unit.order) ?? [];
    group.push(unit);
    orderGroups.set(unit.order, group);
  }

  // Sort order keys ascending
  const sortedOrders = [...orderGroups.keys()].sort((a, b) => a - b);

  let modulesProcessed = 0;
  let modulesFailed = 0;

  // 11. Process each order group sequentially
  for (const orderValue of sortedOrders) {
    const groupUnits = orderGroups.get(orderValue)!;

    tracer?.emit({
      type: 'phase:start',
      phase: `rebuild-order-${orderValue}`,
      taskCount: groupUnits.length,
      concurrency,
    });

    const groupStart = Date.now();
    const filesWrittenInGroup: string[] = [];

    // Create pool tasks for this group
    const groupTasks = groupUnits.map((unit) => async (): Promise<RebuildResult> => {
      reporter.onFileStart(unit.name);
      const callStart = Date.now();

      const prompt = buildRebuildPrompt(unit, fullSpec, builtContext || undefined);
      const response: AIResponse = await aiService.call({
        prompt: prompt.user,
        systemPrompt: prompt.system,
        taskLabel: `rebuild:${unit.name}`,
      });

      // Parse files from response
      const files = parseModuleOutput(response.text);
      if (files.size === 0) {
        throw new Error(
          `AI produced no files for unit "${unit.name}". Response may have used unexpected format.`,
        );
      }

      // Write files to output directory
      const filesWritten: string[] = [];
      for (const [filePath, content] of files) {
        const absolutePath = path.join(outputDir, filePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, content, 'utf-8');
        filesWritten.push(filePath);
      }

      // Update checkpoint
      checkpoint.markDone(unit.name, filesWritten);

      const durationMs = Date.now() - callStart;
      return {
        unitName: unit.name,
        success: true,
        filesWritten,
        tokensIn: response.inputTokens,
        tokensOut: response.outputTokens,
        cacheReadTokens: response.cacheReadTokens,
        cacheCreationTokens: response.cacheCreationTokens,
        durationMs,
        model: response.model,
      };
    });

    // 12. Run pool with onComplete callback
    await runPool(
      groupTasks,
      {
        concurrency,
        failFast: options.failFast,
        tracer,
        phaseLabel: `rebuild-order-${orderValue}`,
        taskLabels: groupUnits.map((u) => u.name),
      },
      (result) => {
        if (result.success && result.value) {
          const v = result.value;
          modulesProcessed++;
          filesWrittenInGroup.push(...v.filesWritten);
          reporter.onFileDone(
            v.unitName,
            v.durationMs,
            v.tokensIn,
            v.tokensOut,
            v.model,
            v.cacheReadTokens,
            v.cacheCreationTokens,
          );
        } else {
          modulesFailed++;
          const errorMsg = result.error?.message ?? 'Unknown error';
          const unitName = groupUnits[result.index]?.name ?? `unit-${result.index}`;
          checkpoint.markFailed(unitName, errorMsg);
          reporter.onFileError(unitName, errorMsg);
        }
      },
    );

    tracer?.emit({
      type: 'phase:end',
      phase: `rebuild-order-${orderValue}`,
      durationMs: Date.now() - groupStart,
      tasksCompleted: modulesProcessed,
      tasksFailed: modulesFailed,
    });

    // 13. After group completes, accumulate full file content as context
    for (const filePath of filesWrittenInGroup) {
      // Skip non-source files (configs, docs)
      if (filePath.endsWith('.md') || filePath.endsWith('.json') || filePath.endsWith('.yml')) continue;
      try {
        const content = await readFile(path.join(outputDir, filePath), 'utf-8');
        builtContext += `\n// === ${filePath} ===\n${content}\n`;
      } catch {
        // Non-critical: skip unreadable files
      }
    }

    // Truncate older context if it exceeds the limit
    if (builtContext.length > BUILT_CONTEXT_LIMIT) {
      const sections = builtContext.split(/\n\/\/ === /);
      // Keep the first empty section prefix, truncate older sections
      const recentCount = Math.max(1, Math.floor(sections.length / 2));
      const olderSections = sections.slice(1, sections.length - recentCount);
      const recentSections = sections.slice(sections.length - recentCount);

      let truncated = '';
      for (const section of olderSections) {
        const lines = section.split('\n');
        const head = lines.slice(0, TRUNCATED_HEAD_LINES).join('\n');
        truncated += `\n// === ${head}\n// ... (truncated)\n`;
      }
      for (const section of recentSections) {
        truncated += `\n// === ${section}`;
      }
      builtContext = truncated;

      if (options.debug) {
        console.error(`[debug] Built context truncated: keeping last ${recentCount} groups in full`);
      }
    }
  }

  // 14. Flush checkpoint
  await checkpoint.flush();

  // 15. Return summary
  return { modulesProcessed, modulesFailed, modulesSkipped };
}

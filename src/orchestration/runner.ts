/**
 * Three-phase command runner for AI-driven documentation generation.
 *
 * Wires together {@link AIService}, {@link ExecutionPlan}, the concurrency
 * pool, and the progress reporter into a cohesive execution engine.
 *
 * The three execution phases match the {@link ExecutionPlan} dependency graph:
 * 1. **File analysis** -- concurrent AI calls with configurable parallelism
 * 2. **Directory docs** -- sequential, post-order AGENTS.md generation
 * 3. **Root documents** -- sequential AI calls for CLAUDE.md, ARCHITECTURE.md, etc.
 *
 * @module
 */

import * as path from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
import type { AIService } from '../ai/index.js';
import type { AIResponse } from '../ai/types.js';
import type { ExecutionPlan, ExecutionTask } from '../generation/executor.js';
import { writeSumFile, readSumFile } from '../generation/writers/sum.js';
import type { SumFileContent } from '../generation/writers/sum.js';
import { writeAgentsMd } from '../generation/writers/agents-md.js';
import { computeContentHash } from '../change-detection/index.js';
import type { FileChange } from '../change-detection/types.js';
import { detectFileType } from '../generation/detection/detector.js';
import { buildPrompt, buildDirectoryPrompt } from '../generation/prompts/index.js';
import type { Config } from '../config/schema.js';
import {
  checkCodeVsDoc,
  checkCodeVsCode,
  buildInconsistencyReport,
  formatReportForCli,
} from '../quality/index.js';
import type { Inconsistency } from '../quality/index.js';
import { formatExecutionPlanAsMarkdown } from '../generation/executor.js';
import { runPool } from './pool.js';
import { PlanTracker } from './plan-tracker.js';
import { ProgressReporter } from './progress.js';
import type {
  FileTaskResult,
  RunSummary,
  CommandRunOptions,
} from './types.js';

// ---------------------------------------------------------------------------
// CommandRunner
// ---------------------------------------------------------------------------

/**
 * Orchestrates AI-driven documentation generation.
 *
 * Create one instance per command invocation. The runner holds references
 * to the AI service and run options, then executes plans or file lists
 * through the three-phase pipeline.
 *
 * @example
 * ```typescript
 * const runner = new CommandRunner(aiService, {
 *   concurrency: 5,
 *   failFast: false,
 *   quiet: false,
 * });
 *
 * const summary = await runner.executeGenerate(plan);
 * console.log(`Processed ${summary.filesProcessed} files`);
 * ```
 */
export class CommandRunner {
  /** AI service instance for making calls */
  private readonly aiService: AIService;

  /** Command execution options */
  private readonly options: CommandRunOptions;

  /**
   * Create a new command runner.
   *
   * @param aiService - The AI service instance (should be created per CLI run)
   * @param options - Execution options (concurrency, failFast, quiet, etc.)
   */
  constructor(aiService: AIService, options: CommandRunOptions) {
    this.aiService = aiService;
    this.options = options;
  }

  /**
   * Execute the `generate` command using a pre-built execution plan.
   *
   * Runs all three phases:
   * 1. File tasks concurrently through the pool
   * 2. Directory AGENTS.md generation (post-order)
   * 3. Root document generation (sequential)
   *
   * @param plan - The execution plan from the generation orchestrator
   * @returns Aggregated run summary
   */
  async executeGenerate(plan: ExecutionPlan): Promise<RunSummary> {
    const reporter = new ProgressReporter(
      plan.fileTasks.length,
      this.options.quiet ?? false,
    );

    // Initialize plan tracker (writes GENERATION-PLAN.md with checkboxes)
    const planTracker = new PlanTracker(
      plan.projectRoot,
      formatExecutionPlanAsMarkdown(plan),
    );
    await planTracker.initialize();

    const runStart = Date.now();
    let filesProcessed = 0;
    let filesFailed = 0;

    // -------------------------------------------------------------------
    // Pre-Phase 1: Cache old .sum content for stale documentation detection
    // -------------------------------------------------------------------

    const oldSumCache = new Map<string, SumFileContent>();
    for (const task of plan.fileTasks) {
      try {
        const existing = await readSumFile(`${task.absolutePath}.sum`);
        if (existing) {
          oldSumCache.set(task.path, existing);
        }
      } catch {
        // No old .sum to compare -- skip
      }
    }

    // -------------------------------------------------------------------
    // Phase 1: File analysis (concurrent)
    // -------------------------------------------------------------------

    const fileTasks = plan.fileTasks.map(
      (task: ExecutionTask, taskIndex: number) => async (): Promise<FileTaskResult> => {
        reporter.onFileStart(task.path);

        const callStart = Date.now();

        // Read the source file
        const sourceContent = await readFile(task.absolutePath, 'utf-8');

        // Call AI with the task's prompts
        const response: AIResponse = await this.aiService.call({
          prompt: task.userPrompt,
          systemPrompt: task.systemPrompt,
        });

        // Track file size for telemetry
        const fileStat = await stat(task.absolutePath);
        this.aiService.addFilesReadToLastEntry([{
          path: task.path,
          sizeBytes: fileStat.size,
        }]);

        // Compute content hash for change detection
        const contentHash = await computeContentHash(task.absolutePath);

        // Build .sum file content
        const sumContent: SumFileContent = {
          summary: response.text,
          metadata: {
            purpose: extractPurpose(response.text),
            publicInterface: [],
            dependencies: [],
            patterns: [],
          },
          fileType: task.metadata.fileType ?? 'generic',
          generatedAt: new Date().toISOString(),
          contentHash,
        };

        // Write .sum file
        await writeSumFile(task.absolutePath, sumContent);

        const durationMs = Date.now() - callStart;

        return {
          path: task.path,
          success: true,
          tokensIn: response.inputTokens,
          tokensOut: response.outputTokens,
          durationMs,
          model: response.model,
        };
      },
    );

    const poolResults = await runPool(
      fileTasks,
      {
        concurrency: this.options.concurrency,
        failFast: this.options.failFast,
      },
      (result) => {
        if (result.success && result.value) {
          const v = result.value;
          filesProcessed++;
          reporter.onFileDone(v.path, v.durationMs, v.tokensIn, v.tokensOut, v.model);
          planTracker.markDone(v.path);
        } else {
          filesFailed++;
          const errorMsg = result.error?.message ?? 'Unknown error';
          const taskPath = plan.fileTasks[result.index]?.path ?? `task-${result.index}`;
          reporter.onFileError(taskPath, errorMsg);
        }
      },
    );

    // -------------------------------------------------------------------
    // Post-Phase 1: Inconsistency detection (non-throwing)
    // -------------------------------------------------------------------

    let inconsistenciesCodeVsDoc = 0;
    let inconsistenciesCodeVsCode = 0;
    let inconsistencyReport: import('../quality/index.js').InconsistencyReport | undefined;

    try {
      const inconsistencyStart = Date.now();
      const allIssues: Inconsistency[] = [];

      // Collect successfully processed file paths from pool results
      const processedPaths: string[] = [];
      for (const result of poolResults) {
        if (result.success && result.value) {
          processedPaths.push(result.value.path);
        }
      }

      // Group files by directory
      const dirGroups = new Map<string, string[]>();
      for (const filePath of processedPaths) {
        const dir = path.dirname(filePath);
        const group = dirGroups.get(dir);
        if (group) {
          group.push(filePath);
        } else {
          dirGroups.set(dir, [filePath]);
        }
      }

      // Run checks per directory group
      for (const [, groupPaths] of dirGroups) {
        const filesForCodeVsCode: Array<{ path: string; content: string }> = [];

        for (const filePath of groupPaths) {
          const absoluteFilePath = `${plan.projectRoot}/${filePath}`;
          let sourceContent: string;
          try {
            sourceContent = await readFile(absoluteFilePath, 'utf-8');
          } catch {
            continue; // File unreadable, skip
          }

          filesForCodeVsCode.push({ path: filePath, content: sourceContent });

          // Old-doc check: detects stale documentation
          const oldSum = oldSumCache.get(filePath);
          if (oldSum) {
            const oldIssue = checkCodeVsDoc(sourceContent, oldSum, filePath);
            if (oldIssue) {
              oldIssue.description += ' (stale documentation)';
              allIssues.push(oldIssue);
            }
          }

          // New-doc check: detects LLM omissions in freshly generated .sum
          try {
            const newSum = await readSumFile(`${absoluteFilePath}.sum`);
            if (newSum) {
              const newIssue = checkCodeVsDoc(sourceContent, newSum, filePath);
              if (newIssue) {
                allIssues.push(newIssue);
              }
            }
          } catch {
            // Freshly written .sum unreadable -- skip
          }
        }

        // Code-vs-code check scoped to this directory group
        const codeIssues = checkCodeVsCode(filesForCodeVsCode);
        allIssues.push(...codeIssues);
      }

      if (allIssues.length > 0) {
        const report = buildInconsistencyReport(allIssues, {
          projectRoot: plan.projectRoot,
          filesChecked: processedPaths.length,
          durationMs: Date.now() - inconsistencyStart,
        });

        inconsistenciesCodeVsDoc = report.summary.codeVsDoc;
        inconsistenciesCodeVsCode = report.summary.codeVsCode;
        inconsistencyReport = report;

        console.error(formatReportForCli(report));
      }
    } catch (err) {
      // Inconsistency detection must not break the pipeline
      console.error(`[quality] Inconsistency detection failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // -------------------------------------------------------------------
    // Phase 2: Directory docs (sequential, post-order)
    // -------------------------------------------------------------------

    for (const dirTask of plan.directoryTasks) {
      const prompt = await buildDirectoryPrompt(dirTask.absolutePath, plan.projectRoot);
      const dirResponse: AIResponse = await this.aiService.call({
        prompt: prompt.user,
        systemPrompt: prompt.system,
      });
      await writeAgentsMd(dirTask.absolutePath, plan.projectRoot, dirResponse.text);
      reporter.onDirectoryDone(dirTask.path);
      planTracker.markDone(`${dirTask.path}/AGENTS.md`);
    }

    // -------------------------------------------------------------------
    // Phase 3: Root documents (sequential)
    // -------------------------------------------------------------------

    for (const rootTask of plan.rootTasks) {
      const response = await this.aiService.call({
        prompt: rootTask.userPrompt,
        systemPrompt: rootTask.systemPrompt,
      });

      await writeFile(rootTask.outputPath, response.text, 'utf-8');
      reporter.onRootDone(rootTask.path);
      planTracker.markDone(rootTask.path);
    }

    // Ensure all plan tracker writes are flushed
    await planTracker.flush();

    // -------------------------------------------------------------------
    // Build and print summary
    // -------------------------------------------------------------------

    const aiSummary = this.aiService.getSummary();
    const totalDurationMs = Date.now() - runStart;

    const summary: RunSummary = {
      filesProcessed,
      filesFailed,
      filesSkipped: 0,
      totalCalls: aiSummary.totalCalls,
      totalInputTokens: aiSummary.totalInputTokens,
      totalOutputTokens: aiSummary.totalOutputTokens,
      totalDurationMs,
      errorCount: aiSummary.errorCount,
      retryCount: 0,
      totalCostUsd: aiSummary.totalCostUsd,
      costAvailable: aiSummary.costAvailable,
      totalFilesRead: aiSummary.totalFilesRead,
      uniqueFilesRead: aiSummary.uniqueFilesRead,
      inconsistenciesCodeVsDoc,
      inconsistenciesCodeVsCode,
      inconsistencyReport,
    };

    reporter.printSummary(summary, this.options.costThresholdUsd);

    return summary;
  }

  /**
   * Execute the `update` command for a set of changed files.
   *
   * Runs only Phase 1 (file analysis) for the specified files. Does NOT
   * generate directory or root documents -- the update command handles
   * AGENTS.md regeneration itself based on which directories were affected.
   *
   * @param filesToAnalyze - Array of changed files to re-analyze
   * @param projectRoot - Absolute path to the project root
   * @param config - Project configuration for prompt building
   * @returns Aggregated run summary
   */
  async executeUpdate(
    filesToAnalyze: FileChange[],
    projectRoot: string,
    config: Config,
  ): Promise<RunSummary> {
    const reporter = new ProgressReporter(
      filesToAnalyze.length,
      this.options.quiet ?? false,
    );

    const runStart = Date.now();
    let filesProcessed = 0;
    let filesFailed = 0;

    const updateTasks = filesToAnalyze.map(
      (file: FileChange, fileIndex: number) => async (): Promise<FileTaskResult> => {
        reporter.onFileStart(file.path);

        const callStart = Date.now();
        const absolutePath = `${projectRoot}/${file.path}`;

        // Read the source file
        const sourceContent = await readFile(absolutePath, 'utf-8');

        // Detect file type and build prompt
        const fileType = detectFileType(file.path, sourceContent);
        const prompt = buildPrompt({
          filePath: file.path,
          content: sourceContent,
          fileType,
        });

        // Call AI
        const response: AIResponse = await this.aiService.call({
          prompt: prompt.user,
          systemPrompt: prompt.system,
        });

        // Track file size for telemetry
        const fileStat = await stat(absolutePath);
        this.aiService.addFilesReadToLastEntry([{
          path: file.path,
          sizeBytes: fileStat.size,
        }]);

        // Compute content hash for change detection
        const contentHash = await computeContentHash(absolutePath);

        // Build .sum file content
        const sumContent: SumFileContent = {
          summary: response.text,
          metadata: {
            purpose: extractPurpose(response.text),
            publicInterface: [],
            dependencies: [],
            patterns: [],
          },
          fileType,
          generatedAt: new Date().toISOString(),
          contentHash,
        };

        // Write .sum file
        await writeSumFile(absolutePath, sumContent);

        const durationMs = Date.now() - callStart;

        return {
          path: file.path,
          success: true,
          tokensIn: response.inputTokens,
          tokensOut: response.outputTokens,
          durationMs,
          model: response.model,
        };
      },
    );

    const poolResults = await runPool(
      updateTasks,
      {
        concurrency: this.options.concurrency,
        failFast: this.options.failFast,
      },
      (result) => {
        if (result.success && result.value) {
          const v = result.value;
          filesProcessed++;
          reporter.onFileDone(v.path, v.durationMs, v.tokensIn, v.tokensOut, v.model);
        } else {
          filesFailed++;
          const errorMsg = result.error?.message ?? 'Unknown error';
          const filePath = filesToAnalyze[result.index]?.path ?? `file-${result.index}`;
          reporter.onFileError(filePath, errorMsg);
        }
      },
    );

    // -------------------------------------------------------------------
    // Post-analysis: Inconsistency detection (non-throwing)
    // -------------------------------------------------------------------

    let updateInconsistenciesCodeVsDoc = 0;
    let updateInconsistenciesCodeVsCode = 0;
    let updateInconsistencyReport: import('../quality/index.js').InconsistencyReport | undefined;

    try {
      const inconsistencyStart = Date.now();
      const allIssues: Inconsistency[] = [];

      // Collect successfully processed file paths
      const processedPaths: string[] = [];
      for (const result of poolResults) {
        if (result.success && result.value) {
          processedPaths.push(result.value.path);
        }
      }

      // Group files by directory
      const dirGroups = new Map<string, string[]>();
      for (const filePath of processedPaths) {
        const dir = path.dirname(filePath);
        const group = dirGroups.get(dir);
        if (group) {
          group.push(filePath);
        } else {
          dirGroups.set(dir, [filePath]);
        }
      }

      // Run checks per directory group
      for (const [, groupPaths] of dirGroups) {
        const filesForCodeVsCode: Array<{ path: string; content: string }> = [];

        for (const filePath of groupPaths) {
          const absoluteFilePath = `${projectRoot}/${filePath}`;
          let sourceContent: string;
          try {
            sourceContent = await readFile(absoluteFilePath, 'utf-8');
          } catch {
            continue;
          }

          filesForCodeVsCode.push({ path: filePath, content: sourceContent });

          // New-doc check: detects LLM omissions in freshly generated .sum
          try {
            const newSum = await readSumFile(`${absoluteFilePath}.sum`);
            if (newSum) {
              const newIssue = checkCodeVsDoc(sourceContent, newSum, filePath);
              if (newIssue) {
                allIssues.push(newIssue);
              }
            }
          } catch {
            // .sum unreadable -- skip
          }
        }

        // Code-vs-code check scoped to this directory group
        const codeIssues = checkCodeVsCode(filesForCodeVsCode);
        allIssues.push(...codeIssues);
      }

      if (allIssues.length > 0) {
        const report = buildInconsistencyReport(allIssues, {
          projectRoot,
          filesChecked: processedPaths.length,
          durationMs: Date.now() - inconsistencyStart,
        });

        updateInconsistenciesCodeVsDoc = report.summary.codeVsDoc;
        updateInconsistenciesCodeVsCode = report.summary.codeVsCode;
        updateInconsistencyReport = report;

        console.error(formatReportForCli(report));
      }
    } catch (err) {
      console.error(`[quality] Inconsistency detection failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Build and print summary
    const aiSummary = this.aiService.getSummary();
    const totalDurationMs = Date.now() - runStart;

    const summary: RunSummary = {
      filesProcessed,
      filesFailed,
      filesSkipped: 0,
      totalCalls: aiSummary.totalCalls,
      totalInputTokens: aiSummary.totalInputTokens,
      totalOutputTokens: aiSummary.totalOutputTokens,
      totalDurationMs,
      errorCount: aiSummary.errorCount,
      retryCount: 0,
      totalCostUsd: aiSummary.totalCostUsd,
      costAvailable: aiSummary.costAvailable,
      totalFilesRead: aiSummary.totalFilesRead,
      uniqueFilesRead: aiSummary.uniqueFilesRead,
      inconsistenciesCodeVsDoc: updateInconsistenciesCodeVsDoc,
      inconsistenciesCodeVsCode: updateInconsistenciesCodeVsCode,
      inconsistencyReport: updateInconsistencyReport,
    };

    reporter.printSummary(summary, this.options.costThresholdUsd);

    return summary;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the purpose from AI response text.
 *
 * Takes the first non-empty line of the response as the file's purpose.
 * Falls back to empty string if the response is empty.
 *
 * @param responseText - The AI-generated summary text
 * @returns A single-line purpose string
 */
function extractPurpose(responseText: string): string {
  const lines = responseText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip markdown headers and empty lines
    if (trimmed && !trimmed.startsWith('#')) {
      // Truncate to a reasonable length for the purpose field
      return trimmed.length > 120 ? trimmed.slice(0, 117) + '...' : trimmed;
    }
  }
  return '';
}

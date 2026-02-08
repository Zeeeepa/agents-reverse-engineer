/**
 * Three-phase command runner for AI-driven documentation generation.
 *
 * Wires together {@link AIService}, {@link ExecutionPlan}, the concurrency
 * pool, and the progress reporter into a cohesive execution engine.
 *
 * The three execution phases match the {@link ExecutionPlan} dependency graph:
 * 1. **File analysis** -- concurrent AI calls with configurable parallelism
 * 2. **Directory docs** -- concurrent per depth level, post-order AGENTS.md generation
 * 3. **Root documents** -- sequential AI calls for CLAUDE.md, ARCHITECTURE.md, etc.
 *
 * @module
 */

import * as path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import type { AIService } from '../ai/index.js';
import type { AIResponse } from '../ai/types.js';
import type { ExecutionPlan, ExecutionTask } from '../generation/executor.js';
import { writeSumFile, readSumFile } from '../generation/writers/sum.js';
import type { SumFileContent } from '../generation/writers/sum.js';
import { writeAgentsMd } from '../generation/writers/agents-md.js';
import { computeContentHashFromString } from '../change-detection/index.js';
import type { FileChange } from '../change-detection/types.js';
import { detectFileType } from '../generation/detection/detector.js';
import { buildFilePrompt, buildDirectoryPrompt } from '../generation/prompts/index.js';
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
import type { ITraceWriter } from './trace.js';
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

  /** Trace writer for concurrency debugging */
  private readonly tracer: ITraceWriter | undefined;

  /**
   * Create a new command runner.
   *
   * @param aiService - The AI service instance (should be created per CLI run)
   * @param options - Execution options (concurrency, failFast, etc.)
   */
  constructor(aiService: AIService, options: CommandRunOptions) {
    this.aiService = aiService;
    this.options = options;
    this.tracer = options.tracer;

    // Wire the tracer into the AI service for subprocess/retry events
    if (this.tracer) {
      this.aiService.setTracer(this.tracer);
    }
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
    const reporter = new ProgressReporter(plan.fileTasks.length);

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
    // Throttled to avoid opening too many file descriptors at once.
    // -------------------------------------------------------------------

    const prePhase1Start = Date.now();
    this.tracer?.emit({
      type: 'phase:start',
      phase: 'pre-phase-1-cache',
      taskCount: plan.fileTasks.length,
      concurrency: 20,
    });

    const oldSumCache = new Map<string, SumFileContent>();
    const sumReadTasks = plan.fileTasks.map(
      (task) => async () => {
        try {
          const existing = await readSumFile(`${task.absolutePath}.sum`);
          if (existing) {
            oldSumCache.set(task.path, existing);
          }
        } catch {
          // No old .sum to compare -- skip
        }
      },
    );
    await runPool(sumReadTasks, {
      concurrency: 20,
      tracer: this.tracer,
      phaseLabel: 'pre-phase-1-cache',
      taskLabels: plan.fileTasks.map(t => t.path),
    });

    this.tracer?.emit({
      type: 'phase:end',
      phase: 'pre-phase-1-cache',
      durationMs: Date.now() - prePhase1Start,
      tasksCompleted: plan.fileTasks.length,
      tasksFailed: 0,
    });

    // -------------------------------------------------------------------
    // Phase 1: File analysis (concurrent)
    // -------------------------------------------------------------------

    const phase1Start = Date.now();
    this.tracer?.emit({
      type: 'phase:start',
      phase: 'phase-1-files',
      taskCount: plan.fileTasks.length,
      concurrency: this.options.concurrency,
    });

    // Cache source content during Phase 1, reused for inconsistency detection
    const sourceContentCache = new Map<string, string>();

    const fileTasks = plan.fileTasks.map(
      (task: ExecutionTask, taskIndex: number) => async (): Promise<FileTaskResult> => {
        reporter.onFileStart(task.path);

        const callStart = Date.now();

        // Read the source file
        const sourceContent = await readFile(task.absolutePath, 'utf-8');
        sourceContentCache.set(task.path, sourceContent);

        // Call AI with the task's prompts
        const response: AIResponse = await this.aiService.call({
          prompt: task.userPrompt,
          systemPrompt: task.systemPrompt,
          taskLabel: task.path,
        });

        // Track file size for telemetry (from in-memory content, avoids stat syscall)
        this.aiService.addFilesReadToLastEntry([{
          path: task.path,
          sizeBytes: Buffer.byteLength(sourceContent, 'utf-8'),
        }]);

        // Compute content hash from already-loaded content (avoids second readFile)
        const contentHash = computeContentHashFromString(sourceContent);

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
        tracer: this.tracer,
        phaseLabel: 'phase-1-files',
        taskLabels: plan.fileTasks.map(t => t.path),
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

    this.tracer?.emit({
      type: 'phase:end',
      phase: 'phase-1-files',
      durationMs: Date.now() - phase1Start,
      tasksCompleted: filesProcessed,
      tasksFailed: filesFailed,
    });

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

      // Run checks per directory group (throttled to avoid excessive parallel I/O)
      const dirEntries = Array.from(dirGroups.entries());

      this.tracer?.emit({
        type: 'phase:start',
        phase: 'post-phase-1-quality',
        taskCount: dirEntries.length,
        concurrency: 10,
      });

      const dirCheckResults: Inconsistency[][] = [];
      const dirCheckTasks = dirEntries.map(
        ([, groupPaths], groupIndex) => async () => {
          const dirIssues: Inconsistency[] = [];
          const filesForCodeVsCode: Array<{ path: string; content: string }> = [];

          // Process files within this group sequentially to limit I/O
          for (const filePath of groupPaths) {
            const absoluteFilePath = `${plan.projectRoot}/${filePath}`;

            // Use cached content from Phase 1 (avoids re-read)
            let sourceContent = sourceContentCache.get(filePath);
            if (!sourceContent) {
              try {
                sourceContent = await readFile(absoluteFilePath, 'utf-8');
              } catch {
                continue; // File unreadable, skip
              }
            }

            filesForCodeVsCode.push({ path: filePath, content: sourceContent });

            // Old-doc check: detects stale documentation
            const oldSum = oldSumCache.get(filePath);
            if (oldSum) {
              const oldIssue = checkCodeVsDoc(sourceContent, oldSum, filePath);
              if (oldIssue) {
                oldIssue.description += ' (stale documentation)';
                dirIssues.push(oldIssue);
              }
            }

            // New-doc check: detects LLM omissions in freshly generated .sum
            try {
              const newSum = await readSumFile(`${absoluteFilePath}.sum`);
              if (newSum) {
                const newIssue = checkCodeVsDoc(sourceContent, newSum, filePath);
                if (newIssue) {
                  dirIssues.push(newIssue);
                }
              }
            } catch {
              // Freshly written .sum unreadable -- skip
            }
          }

          // Code-vs-code check scoped to this directory group
          const codeIssues = checkCodeVsCode(filesForCodeVsCode);
          dirIssues.push(...codeIssues);

          dirCheckResults[groupIndex] = dirIssues;
        },
      );
      await runPool(dirCheckTasks, {
        concurrency: 10,
        tracer: this.tracer,
        phaseLabel: 'post-phase-1-quality',
        taskLabels: dirEntries.map(([dirPath]) => dirPath),
      });

      this.tracer?.emit({
        type: 'phase:end',
        phase: 'post-phase-1-quality',
        durationMs: Date.now() - inconsistencyStart,
        tasksCompleted: dirEntries.length,
        tasksFailed: 0,
      });

      const allIssuesFlat = dirCheckResults.filter(Boolean).flat();
      allIssues.push(...allIssuesFlat);

      // Release cached source content to free memory
      sourceContentCache.clear();

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
    // Phase 2: Directory docs (concurrent per depth level, post-order)
    // -------------------------------------------------------------------

    // Group directory tasks by depth so same-depth dirs run in parallel
    // while maintaining post-order (children before parents)
    const dirsByDepth = new Map<number, typeof plan.directoryTasks>();
    for (const dirTask of plan.directoryTasks) {
      const depth = (dirTask.metadata.depth as number) ?? 0;
      const group = dirsByDepth.get(depth);
      if (group) {
        group.push(dirTask);
      } else {
        dirsByDepth.set(depth, [dirTask]);
      }
    }

    // Process depth levels in descending order (deepest first = post-order)
    const depthLevels = Array.from(dirsByDepth.keys()).sort((a, b) => b - a);

    for (const depth of depthLevels) {
      const dirsAtDepth = dirsByDepth.get(depth)!;
      const phaseLabel = `phase-2-dirs-depth-${depth}`;
      const dirConcurrency = Math.min(this.options.concurrency, dirsAtDepth.length);

      const phase2Start = Date.now();
      this.tracer?.emit({
        type: 'phase:start',
        phase: phaseLabel,
        taskCount: dirsAtDepth.length,
        concurrency: dirConcurrency,
      });

      const dirTasks = dirsAtDepth.map(
        (dirTask) => async () => {
          const prompt = await buildDirectoryPrompt(dirTask.absolutePath, plan.projectRoot, this.options.debug);
          const dirResponse: AIResponse = await this.aiService.call({
            prompt: prompt.user,
            systemPrompt: prompt.system,
            taskLabel: `${dirTask.path}/AGENTS.md`,
          });
          await writeAgentsMd(dirTask.absolutePath, plan.projectRoot, dirResponse.text);
          reporter.onDirectoryDone(dirTask.path);
          planTracker.markDone(`${dirTask.path}/AGENTS.md`);
        },
      );

      await runPool(dirTasks, {
        concurrency: dirConcurrency,
        failFast: this.options.failFast,
        tracer: this.tracer,
        phaseLabel,
        taskLabels: dirsAtDepth.map(t => t.path),
      });

      this.tracer?.emit({
        type: 'phase:end',
        phase: phaseLabel,
        durationMs: Date.now() - phase2Start,
        tasksCompleted: dirsAtDepth.length,
        tasksFailed: 0,
      });
    }

    // -------------------------------------------------------------------
    // Phase 3: Root documents (sequential)
    // -------------------------------------------------------------------

    const phase3Start = Date.now();
    this.tracer?.emit({
      type: 'phase:start',
      phase: 'phase-3-root',
      taskCount: plan.rootTasks.length,
      concurrency: 1,
    });

    let rootTasksCompleted = 0;
    for (const rootTask of plan.rootTasks) {
      const taskStart = Date.now();

      // Emit task:start event
      this.tracer?.emit({
        type: 'task:start',
        taskLabel: rootTask.path,
        phase: 'phase-3-root',
      });

      try {
        const response = await this.aiService.call({
          prompt: rootTask.userPrompt,
          systemPrompt: rootTask.systemPrompt,
          taskLabel: rootTask.path,
        });

        await writeFile(rootTask.outputPath, response.text, 'utf-8');
        reporter.onRootDone(rootTask.path);
        planTracker.markDone(rootTask.path);
        rootTasksCompleted++;

        // Emit task:done event (success)
        this.tracer?.emit({
          type: 'task:done',
          workerId: 0, // Sequential execution, single worker
          taskIndex: rootTasksCompleted - 1,
          taskLabel: rootTask.path,
          durationMs: Date.now() - taskStart,
          success: true,
          activeTasks: 0, // Sequential, only one active at a time
        });
      } catch (error) {
        // Emit task:done event (failure)
        this.tracer?.emit({
          type: 'task:done',
          workerId: 0,
          taskIndex: rootTasksCompleted,
          taskLabel: rootTask.path,
          durationMs: Date.now() - taskStart,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          activeTasks: 0,
        });
        throw error; // Re-throw to maintain existing error handling
      }
    }

    this.tracer?.emit({
      type: 'phase:end',
      phase: 'phase-3-root',
      durationMs: Date.now() - phase3Start,
      tasksCompleted: rootTasksCompleted,
      tasksFailed: 0,
    });

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
      totalFilesRead: aiSummary.totalFilesRead,
      uniqueFilesRead: aiSummary.uniqueFilesRead,
      inconsistenciesCodeVsDoc,
      inconsistenciesCodeVsCode,
      inconsistencyReport,
    };

    reporter.printSummary(summary);

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
    const reporter = new ProgressReporter(filesToAnalyze.length);

    const runStart = Date.now();
    let filesProcessed = 0;
    let filesFailed = 0;

    // -------------------------------------------------------------------
    // Phase 1: File analysis (concurrent)
    // -------------------------------------------------------------------

    const phase1Start = Date.now();
    this.tracer?.emit({
      type: 'phase:start',
      phase: 'update-phase-1-files',
      taskCount: filesToAnalyze.length,
      concurrency: this.options.concurrency,
    });

    // Cache source content during update, reused for inconsistency detection
    const updateSourceCache = new Map<string, string>();

    const updateTasks = filesToAnalyze.map(
      (file: FileChange, fileIndex: number) => async (): Promise<FileTaskResult> => {
        reporter.onFileStart(file.path);

        const callStart = Date.now();
        const absolutePath = `${projectRoot}/${file.path}`;

        // Read the source file
        const sourceContent = await readFile(absolutePath, 'utf-8');
        updateSourceCache.set(file.path, sourceContent);

        // Detect file type and build prompt
        const fileType = detectFileType(file.path, sourceContent);
        const prompt = buildFilePrompt({
          filePath: file.path,
          content: sourceContent,
          fileType,
        }, this.options.debug);

        // Call AI
        const response: AIResponse = await this.aiService.call({
          prompt: prompt.user,
          systemPrompt: prompt.system,
          taskLabel: file.path,
        });

        // Track file size for telemetry (from in-memory content, avoids stat syscall)
        this.aiService.addFilesReadToLastEntry([{
          path: file.path,
          sizeBytes: Buffer.byteLength(sourceContent, 'utf-8'),
        }]);

        // Compute content hash from already-loaded content (avoids second readFile)
        const contentHash = computeContentHashFromString(sourceContent);

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
        tracer: this.tracer,
        phaseLabel: 'update-phase-1-files',
        taskLabels: filesToAnalyze.map(f => f.path),
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

    this.tracer?.emit({
      type: 'phase:end',
      phase: 'update-phase-1-files',
      durationMs: Date.now() - phase1Start,
      tasksCompleted: filesProcessed,
      tasksFailed: filesFailed,
    });

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

      // Run checks per directory group (throttled to avoid excessive parallel I/O)
      const updateDirEntries = Array.from(dirGroups.entries());

      this.tracer?.emit({
        type: 'phase:start',
        phase: 'update-post-phase-1-quality',
        taskCount: updateDirEntries.length,
        concurrency: 10,
      });

      const updateDirResults: Inconsistency[][] = [];
      const updateDirCheckTasks = updateDirEntries.map(
        ([, groupPaths], groupIndex) => async () => {
          const dirIssues: Inconsistency[] = [];
          const filesForCodeVsCode: Array<{ path: string; content: string }> = [];

          for (const filePath of groupPaths) {
            const absoluteFilePath = `${projectRoot}/${filePath}`;

            // Use cached content from update phase (avoids re-read)
            let sourceContent = updateSourceCache.get(filePath);
            if (!sourceContent) {
              try {
                sourceContent = await readFile(absoluteFilePath, 'utf-8');
              } catch {
                continue;
              }
            }

            filesForCodeVsCode.push({ path: filePath, content: sourceContent });

            // New-doc check: detects LLM omissions in freshly generated .sum
            try {
              const newSum = await readSumFile(`${absoluteFilePath}.sum`);
              if (newSum) {
                const newIssue = checkCodeVsDoc(sourceContent, newSum, filePath);
                if (newIssue) {
                  dirIssues.push(newIssue);
                }
              }
            } catch {
              // .sum unreadable -- skip
            }
          }

          // Code-vs-code check scoped to this directory group
          const codeIssues = checkCodeVsCode(filesForCodeVsCode);
          dirIssues.push(...codeIssues);

          updateDirResults[groupIndex] = dirIssues;
        },
      );
      await runPool(updateDirCheckTasks, {
        concurrency: 10,
        tracer: this.tracer,
        phaseLabel: 'update-post-phase-1-quality',
        taskLabels: updateDirEntries.map(([dirPath]) => dirPath),
      });

      this.tracer?.emit({
        type: 'phase:end',
        phase: 'update-post-phase-1-quality',
        durationMs: Date.now() - inconsistencyStart,
        tasksCompleted: updateDirEntries.length,
        tasksFailed: 0,
      });

      const allIssuesFlat = updateDirResults.filter(Boolean).flat();
      allIssues.push(...allIssuesFlat);

      // Release cached source content to free memory
      updateSourceCache.clear();

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
      totalFilesRead: aiSummary.totalFilesRead,
      uniqueFilesRead: aiSummary.uniqueFilesRead,
      inconsistenciesCodeVsDoc: updateInconsistenciesCodeVsDoc,
      inconsistenciesCodeVsCode: updateInconsistenciesCodeVsCode,
      inconsistencyReport: updateInconsistencyReport,
    };

    reporter.printSummary(summary);

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

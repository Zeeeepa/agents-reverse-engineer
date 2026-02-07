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

import { readFile, writeFile, stat } from 'node:fs/promises';
import type { AIService } from '../ai/index.js';
import type { AIResponse } from '../ai/types.js';
import type { ExecutionPlan, ExecutionTask } from '../generation/executor.js';
import { writeSumFile } from '../generation/writers/sum.js';
import type { SumFileContent } from '../generation/writers/sum.js';
import { writeAgentsMd } from '../generation/writers/agents-md.js';
import { computeContentHash } from '../change-detection/index.js';
import type { FileChange } from '../change-detection/types.js';
import { detectFileType } from '../generation/detection/detector.js';
import { buildPrompt } from '../generation/prompts/index.js';
import type { Config } from '../config/schema.js';
import { runPool } from './pool.js';
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

    const runStart = Date.now();
    let filesProcessed = 0;
    let filesFailed = 0;

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
        } else {
          filesFailed++;
          const errorMsg = result.error?.message ?? 'Unknown error';
          const taskPath = plan.fileTasks[result.index]?.path ?? `task-${result.index}`;
          reporter.onFileError(taskPath, errorMsg);
        }
      },
    );

    // -------------------------------------------------------------------
    // Phase 2: Directory docs (sequential, post-order)
    // -------------------------------------------------------------------

    for (const dirTask of plan.directoryTasks) {
      await writeAgentsMd(dirTask.absolutePath, plan.projectRoot);
      reporter.onDirectoryDone(dirTask.path);
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
    }

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

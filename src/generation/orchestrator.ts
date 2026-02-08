/**
 * Generation orchestrator
 *
 * Coordinates the documentation generation workflow:
 * - Discovers and prepares files for analysis
 * - Detects file types
 * - Creates file analysis tasks with prompts
 * - Creates directory tasks for LLM-generated descriptions
 */

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import pc from 'picocolors';
import type { Config } from '../config/schema.js';
import type { DiscoveryResult } from '../types/index.js';
import { detectFileType } from './detection/detector.js';
import type { FileType } from './types.js';
import { buildFilePrompt } from './prompts/index.js';
import { analyzeComplexity } from './complexity.js';
import type { ComplexityMetrics } from './complexity.js';
import type { ITraceWriter } from '../orchestration/trace.js';

/**
 * A file prepared for analysis.
 */
export interface PreparedFile {
  /** Absolute path to the file */
  filePath: string;
  /** Relative path from project root */
  relativePath: string;
  /** File content */
  content: string;
  /** Detected file type */
  fileType: FileType;
}

/**
 * Analysis task for a file.
 */
export interface AnalysisTask {
  /** Type of task */
  type: 'file' | 'directory';
  /** File or directory path */
  filePath: string;
  /** System prompt (set for file tasks; directory prompts built at execution time) */
  systemPrompt?: string;
  /** User prompt (set for file tasks; directory prompts built at execution time) */
  userPrompt?: string;
  /** Directory info for directory tasks */
  directoryInfo?: {
    /** Paths of .sum files in this directory */
    sumFiles: string[];
    /** Number of files analyzed */
    fileCount: number;
  };
}

/**
 * Result of the generation planning process.
 */
export interface GenerationPlan {
  /** Files to be analyzed */
  files: PreparedFile[];
  /** Analysis tasks to execute */
  tasks: AnalysisTask[];
  /** Complexity metrics */
  complexity: ComplexityMetrics;
}

/**
 * Orchestrates the documentation generation workflow.
 */
export class GenerationOrchestrator {
  private config: Config;
  private projectRoot: string;
  private tracer?: ITraceWriter;
  private debug: boolean;

  constructor(
    config: Config,
    projectRoot: string,
    options?: { tracer?: ITraceWriter; debug?: boolean }
  ) {
    this.config = config;
    this.projectRoot = projectRoot;
    this.tracer = options?.tracer;
    this.debug = options?.debug ?? false;
  }

  /**
   * Prepare files for analysis by reading content and detecting types.
   */
  async prepareFiles(discoveryResult: DiscoveryResult): Promise<PreparedFile[]> {
    const prepared: PreparedFile[] = [];

    for (let i = 0; i < discoveryResult.files.length; i++) {
      const filePath = discoveryResult.files[i];
      try {
        const content = await readFile(filePath, 'utf-8');
        const fileType = detectFileType(filePath, content);
        const relativePath = path.relative(this.projectRoot, filePath);

        prepared.push({
          filePath,
          relativePath,
          content,
          fileType,
        });
      } catch {
        // Skip files that can't be read (permission errors, etc.)
        // Silently ignore - these files won't appear in the plan
      }
    }

    return prepared;
  }

  /**
   * Create analysis tasks for all files.
   */
  createFileTasks(files: PreparedFile[]): AnalysisTask[] {
    const tasks: AnalysisTask[] = [];

    for (const file of files) {
      const prompt = buildFilePrompt({
        filePath: file.filePath,
        content: file.content,
        fileType: file.fileType,
      });

      tasks.push({
        type: 'file',
        filePath: file.relativePath,
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
      });
    }

    return tasks;
  }

  /**
   * Create directory tasks for LLM-generated directory descriptions.
   * These tasks run after all files in a directory are analyzed, allowing
   * the LLM to synthesize a richer directory overview from the .sum files.
   * Prompts are built at execution time by buildDirectoryPrompt().
   */
  createDirectoryTasks(files: PreparedFile[]): AnalysisTask[] {
    const tasks: AnalysisTask[] = [];

    // Group files by directory
    const filesByDir = new Map<string, PreparedFile[]>();
    for (const file of files) {
      const dir = path.dirname(file.relativePath);
      const dirFiles = filesByDir.get(dir) ?? [];
      dirFiles.push(file);
      filesByDir.set(dir, dirFiles);
    }

    // Create a directory task for each directory with analyzed files
    for (const [dir, dirFiles] of Array.from(filesByDir.entries())) {
      const sumFilePaths = dirFiles.map(f => `${f.relativePath}.sum`);

      tasks.push({
        type: 'directory',
        filePath: dir || '.',
        directoryInfo: {
          sumFiles: sumFilePaths,
          fileCount: dirFiles.length,
        },
      });
    }

    return tasks;
  }

  /**
   * Create a complete generation plan.
   */
  async createPlan(discoveryResult: DiscoveryResult): Promise<GenerationPlan> {
    const planStartTime = process.hrtime.bigint();

    // Emit phase start
    this.tracer?.emit({
      type: 'phase:start',
      phase: 'plan-creation',
      taskCount: discoveryResult.files.length,
      concurrency: 1,
    });

    if (this.debug) {
      console.error(pc.dim('[debug] Preparing files: reading and detecting types...'));
    }

    const files = await this.prepareFiles(discoveryResult);

    if (this.debug) {
      console.error(pc.dim(`[debug] Analyzing complexity...`));
    }

    const complexity = analyzeComplexity(
      files.map(f => f.filePath),
      this.projectRoot
    );

    if (this.debug) {
      console.error(pc.dim(`[debug] Complexity analysis: depth=${complexity.directoryDepth}`));
    }

    const fileTasks = this.createFileTasks(files);

    // Add directory tasks for LLM-generated directory descriptions
    // These run after file analysis to synthesize richer directory overviews
    const dirTasks = this.createDirectoryTasks(files);
    const tasks = [...fileTasks, ...dirTasks];

    if (this.debug) {
      console.error(
        pc.dim(
          `[debug] Generation plan: ${files.length} files, ${tasks.length} tasks (${dirTasks.length} directories)`
        )
      );
    }

    // Release file content from PreparedFile objects to free memory.
    // Content has already been embedded into task prompts by createFileTasks()
    // and is no longer needed. The runner re-reads files from disk.
    for (const file of files) {
      (file as { content: string }).content = '';
    }

    const plan: GenerationPlan = {
      files,
      tasks,
      complexity,
    };

    // Emit plan created event
    this.tracer?.emit({
      type: 'plan:created',
      planType: 'generate',
      fileCount: files.length,
      taskCount: tasks.length,
    });

    // Emit phase end
    const planEndTime = process.hrtime.bigint();
    const planDurationMs = Number(planEndTime - planStartTime) / 1_000_000;
    this.tracer?.emit({
      type: 'phase:end',
      phase: 'plan-creation',
      durationMs: planDurationMs,
      tasksCompleted: 1,
      tasksFailed: 0,
    });

    return plan;
  }
}

/**
 * Create a generation orchestrator with default config.
 */
export function createOrchestrator(
  config: Config,
  projectRoot: string,
  options?: { tracer?: ITraceWriter; debug?: boolean }
): GenerationOrchestrator {
  return new GenerationOrchestrator(config, projectRoot, options);
}

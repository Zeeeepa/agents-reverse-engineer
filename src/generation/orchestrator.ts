/**
 * Generation orchestrator
 *
 * Coordinates the documentation generation workflow:
 * - Discovers and prepares files for analysis
 * - Creates file analysis tasks with prompts
 * - Creates directory tasks for LLM-generated descriptions
 */

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import pc from 'picocolors';
import type { Config } from '../config/schema.js';
import type { DiscoveryResult } from '../types/index.js';
import { buildFilePrompt } from './prompts/index.js';
import { analyzeComplexity } from './complexity.js';
import type { ComplexityMetrics } from './complexity.js';
import type { ITraceWriter } from '../orchestration/trace.js';
import { sumFileExists } from './writers/sum.js';
import { isGeneratedAgentsMd } from './writers/agents-md.js';

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
  /** Files to be analyzed (after skip filtering) */
  files: PreparedFile[];
  /** Analysis tasks to execute */
  tasks: AnalysisTask[];
  /** Complexity metrics */
  complexity: ComplexityMetrics;
  /** Compact project directory listing for bird's-eye context */
  projectStructure?: string;
  /** Files skipped due to existing .sum artifacts */
  skippedFiles?: string[];
  /** Directories skipped due to existing AGENTS.md with no dirty children */
  skippedDirs?: string[];
  /** All discovered files (before skip filtering, for directoryFileMap) */
  allDiscoveredFiles?: PreparedFile[];
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
        const relativePath = path.relative(this.projectRoot, filePath);

        prepared.push({
          filePath,
          relativePath,
          content,
        });
      } catch {
        // Skip files that can't be read (permission errors, etc.)
        // Silently ignore - these files won't appear in the plan
      }
    }

    return prepared;
  }

  /**
   * Build a compact project structure listing from prepared files.
   * Groups files by directory to give the AI bird's-eye context.
   */
  private buildProjectStructure(files: PreparedFile[]): string {
    const byDir = new Map<string, string[]>();
    for (const file of files) {
      const dir = path.dirname(file.relativePath) || '.';
      const group = byDir.get(dir) ?? [];
      group.push(path.basename(file.relativePath));
      byDir.set(dir, group);
    }

    const lines: string[] = [];
    for (const [dir, dirFiles] of [...byDir.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`${dir}/`);
      for (const f of dirFiles.sort()) {
        lines.push(`  ${f}`);
      }
    }
    return lines.join('\n');
  }

  /**
   * Filter prepared files, removing those that already have .sum artifacts.
   */
  async filterExistingFiles(files: PreparedFile[]): Promise<{
    filesToProcess: PreparedFile[];
    skippedFiles: string[];
  }> {
    const filesToProcess: PreparedFile[] = [];
    const skippedFiles: string[] = [];

    for (const file of files) {
      const exists = await sumFileExists(file.filePath);
      if (exists) {
        skippedFiles.push(file.relativePath);
      } else {
        filesToProcess.push(file);
      }
    }

    return { filesToProcess, skippedFiles };
  }

  /**
   * Mark a directory and all its ancestors as needing regeneration.
   */
  private markDirtyWithAncestors(dir: string, dirtySet: Set<string>): void {
    let current = dir;
    while (true) {
      dirtySet.add(current);
      if (current === '.' || current === '') break;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  /**
   * Filter directory tasks, keeping only directories that need regeneration.
   *
   * A directory needs regeneration if:
   * - It has no generated AGENTS.md, OR
   * - Any descendant file was processed in phase 1 (dirty propagation)
   */
  async filterExistingDirectories(
    allFiles: PreparedFile[],
    processedFiles: PreparedFile[],
  ): Promise<{ dirsToProcess: Set<string>; skippedDirs: string[] }> {
    // Directories that had files processed → dirty, must regenerate
    const dirtyDirs = new Set<string>();
    for (const file of processedFiles) {
      this.markDirtyWithAncestors(path.dirname(file.relativePath), dirtyDirs);
    }

    // All directories from discovered files
    const allDirs = new Set<string>();
    for (const file of allFiles) {
      allDirs.add(path.dirname(file.relativePath));
    }

    const dirsToProcess = new Set<string>();
    const skippedDirs: string[] = [];

    for (const dir of allDirs) {
      if (dirtyDirs.has(dir)) {
        dirsToProcess.add(dir);
      } else {
        // Check if generated AGENTS.md already exists
        const agentsPath = path.join(this.projectRoot, dir, 'AGENTS.md');
        const isGenerated = await isGeneratedAgentsMd(agentsPath);
        if (isGenerated) {
          skippedDirs.push(dir);
        } else {
          // No generated AGENTS.md → needs generation; propagate up
          this.markDirtyWithAncestors(dir, dirsToProcess);
        }
      }
    }

    return { dirsToProcess, skippedDirs };
  }

  /**
   * Create analysis tasks for all files.
   */
  createFileTasks(files: PreparedFile[], projectStructure?: string): AnalysisTask[] {
    const tasks: AnalysisTask[] = [];

    for (const file of files) {
      const prompt = buildFilePrompt({
        filePath: file.filePath,
        content: file.content,
        projectPlan: projectStructure,
      }, this.debug);

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
   *
   * When `force` is false (default), files with existing `.sum` artifacts
   * and directories with existing generated `AGENTS.md` are skipped.
   * When `force` is true, all files and directories are processed.
   */
  async createPlan(
    discoveryResult: DiscoveryResult,
    options?: { force?: boolean },
  ): Promise<GenerationPlan> {
    const force = options?.force ?? false;
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

    const allFiles = await this.prepareFiles(discoveryResult);

    // --- Skip filtering ---
    let filesToProcess = allFiles;
    let skippedFiles: string[] = [];
    let skippedDirs: string[] = [];

    if (!force) {
      if (this.debug) {
        console.error(pc.dim('[debug] Checking for existing .sum files...'));
      }
      const fileFilter = await this.filterExistingFiles(allFiles);
      filesToProcess = fileFilter.filesToProcess;
      skippedFiles = fileFilter.skippedFiles;
    }

    if (this.debug) {
      console.error(pc.dim(`[debug] Analyzing complexity...`));
    }

    const complexity = analyzeComplexity(
      allFiles.map(f => f.filePath),
      this.projectRoot
    );

    if (this.debug) {
      console.error(pc.dim(`[debug] Complexity analysis: depth=${complexity.directoryDepth}`));
    }

    // Build project structure from ALL files (for bird's-eye context)
    const projectStructure = this.buildProjectStructure(allFiles);

    // Create file tasks only for files to process
    const fileTasks = this.createFileTasks(filesToProcess, projectStructure);

    // --- Directory skip filtering ---
    // Create directory tasks scoped to files being processed,
    // but use allFiles for the full directory set so we can skip correctly
    let dirTasks: AnalysisTask[];

    if (!force) {
      if (this.debug) {
        console.error(pc.dim('[debug] Checking for existing AGENTS.md files...'));
      }
      const dirFilter = await this.filterExistingDirectories(allFiles, filesToProcess);
      skippedDirs = dirFilter.skippedDirs;

      // Create directory tasks only for directories that need processing
      // We use allFiles so the directory tasks know about ALL child .sum files
      // (including pre-existing ones), but filter to only dirty directories
      const allDirTasks = this.createDirectoryTasks(allFiles);
      dirTasks = allDirTasks.filter(t => dirFilter.dirsToProcess.has(t.filePath));
    } else {
      dirTasks = this.createDirectoryTasks(allFiles);
    }

    const tasks = [...fileTasks, ...dirTasks];

    if (this.debug) {
      const skipMsg = skippedFiles.length > 0
        ? `, ${skippedFiles.length} files skipped, ${skippedDirs.length} dirs skipped`
        : '';
      console.error(
        pc.dim(
          `[debug] Generation plan: ${filesToProcess.length} files, ${tasks.length} tasks (${dirTasks.length} directories)${skipMsg}`
        )
      );
    }

    // Release file content from PreparedFile objects to free memory.
    // Content has already been embedded into task prompts by createFileTasks()
    // and is no longer needed. The runner re-reads files from disk.
    for (const file of filesToProcess) {
      (file as { content: string }).content = '';
    }
    for (const file of allFiles) {
      (file as { content: string }).content = '';
    }

    const plan: GenerationPlan = {
      files: filesToProcess,
      tasks,
      complexity,
      projectStructure,
      skippedFiles: skippedFiles.length > 0 ? skippedFiles : undefined,
      skippedDirs: skippedDirs.length > 0 ? skippedDirs : undefined,
      allDiscoveredFiles: allFiles.length !== filesToProcess.length ? allFiles : undefined,
    };

    // Emit plan created event
    this.tracer?.emit({
      type: 'plan:created',
      planType: 'generate',
      fileCount: filesToProcess.length,
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

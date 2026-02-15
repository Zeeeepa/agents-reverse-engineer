/**
 * Documentation orchestrator
 *
 * Unified orchestrator for both generation and incremental update workflows.
 * Combines functionality from GenerationOrchestrator and UpdateOrchestrator.
 */

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { Config } from '../config/schema.js';
import type { DiscoveryResult } from '../types/index.js';
import type { Logger } from '../core/logger.js';
import { nullLogger } from '../core/logger.js';
import type { ITraceWriter } from './trace.js';

// Generation-specific imports
import { buildFilePrompt } from '../generation/prompts/index.js';
import { analyzeComplexity } from '../generation/complexity.js';
import type { ComplexityMetrics } from '../generation/complexity.js';
import { sumFileExists } from '../generation/writers/sum.js';
import { isGeneratedAgentsMd } from '../generation/writers/agents-md.js';

// Update-specific imports
import {
  isGitRepo,
  getCurrentCommit,
  computeContentHash,
  type FileChange,
} from '../change-detection/index.js';
import { cleanupOrphans, getAffectedDirectories } from '../update/orphan-cleaner.js';
import { readSumFile, getSumPath } from '../generation/writers/sum.js';
import type { UpdatePlanOptions, CleanupResult } from '../update/types.js';
import { discoverFiles as runDiscovery } from '../discovery/run.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

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
 * Analysis task for a file or directory.
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
 * Result of update preparation (before analysis).
 */
export interface UpdatePlan {
  /** Files to analyze (added or modified) */
  filesToAnalyze: FileChange[];
  /** Pre-built analysis tasks with prompts (for unified execution) */
  fileTasks: AnalysisTask[];
  /** Files to skip (unchanged based on content hash) */
  filesToSkip: string[];
  /** Cleanup result (files to delete) */
  cleanup: CleanupResult;
  /** Directories that need AGENTS.md regeneration */
  affectedDirs: string[];
  /** Base commit (not used in frontmatter mode, kept for compatibility) */
  baseCommit: string;
  /** Current commit */
  currentCommit: string;
  /** Whether this is first run (no .sum files exist) */
  isFirstRun: boolean;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Unified orchestrator for documentation generation and incremental updates.
 *
 * Provides methods for:
 * - Full project generation: createPlan() -> generates all docs
 * - Incremental updates: preparePlan() -> updates only changed files
 * - Shared task building: createFileTasks() -> builds prompts for both flows
 */
export class DocumentationOrchestrator {
  private config: Config;
  private projectRoot: string;
  private tracer?: ITraceWriter;
  private debug: boolean;
  private logger: Logger;

  constructor(
    config: Config,
    projectRoot: string,
    options?: { tracer?: ITraceWriter; debug?: boolean; logger?: Logger }
  ) {
    this.config = config;
    this.projectRoot = projectRoot;
    this.tracer = options?.tracer;
    this.debug = options?.debug ?? false;
    this.logger = options?.logger ?? nullLogger;
  }

  // ===========================================================================
  // GENERATION METHODS (for `are generate` command)
  // ===========================================================================

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
  async filterExistingFiles(files: PreparedFile[], variant?: string): Promise<{
    filesToProcess: PreparedFile[];
    skippedFiles: string[];
  }> {
    const filesToProcess: PreparedFile[] = [];
    const skippedFiles: string[] = [];

    for (const file of files) {
      const exists = await sumFileExists(file.filePath, variant);
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
    variant?: string,
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
        // Check if generated AGENTS.md (or variant) already exists
        const agentsFilename = variant ? `AGENTS.${variant}.md` : 'AGENTS.md';
        const agentsPath = path.join(this.projectRoot, dir, agentsFilename);
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
    options?: { force?: boolean; variant?: string },
  ): Promise<GenerationPlan> {
    const force = options?.force ?? false;
    const variant = options?.variant;
    const planStartTime = process.hrtime.bigint();

    // Emit phase start
    this.tracer?.emit({
      type: 'phase:start',
      phase: 'plan-creation',
      taskCount: discoveryResult.files.length,
      concurrency: 1,
    });

    if (this.debug) {
      this.logger.debug('[debug] Preparing files: reading and detecting types...');
    }

    const allFiles = await this.prepareFiles(discoveryResult);

    // --- Skip filtering ---
    let filesToProcess = allFiles;
    let skippedFiles: string[] = [];
    let skippedDirs: string[] = [];

    if (!force) {
      if (this.debug) {
        this.logger.debug('[debug] Checking for existing .sum files...');
      }
      const fileFilter = await this.filterExistingFiles(allFiles, variant);
      filesToProcess = fileFilter.filesToProcess;
      skippedFiles = fileFilter.skippedFiles;
    }

    if (this.debug) {
      this.logger.debug('[debug] Analyzing complexity...');
    }

    const complexity = analyzeComplexity(
      allFiles.map(f => f.filePath),
      this.projectRoot
    );

    if (this.debug) {
      this.logger.debug(`[debug] Complexity analysis: depth=${complexity.directoryDepth}`);
    }

    // Build project structure from ALL files (for bird's-eye context)
    const projectStructure = this.buildProjectStructure(allFiles);

    // Create file tasks only for files to process
    const fileTasks = await this.createFileTasks(filesToProcess);

    // --- Directory skip filtering ---
    // Create directory tasks scoped to files being processed,
    // but use allFiles for the full directory set so we can skip correctly
    let dirTasks: AnalysisTask[];

    if (!force) {
      if (this.debug) {
        this.logger.debug('[debug] Checking for existing AGENTS.md files...');
      }
      const dirFilter = await this.filterExistingDirectories(allFiles, filesToProcess, variant);
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
      this.logger.debug(
        `[debug] Generation plan: ${filesToProcess.length} files, ${tasks.length} tasks (${dirTasks.length} directories)${skipMsg}`
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

  // ===========================================================================
  // UPDATE METHODS (for `are update` command)
  // ===========================================================================

  /**
   * Close resources (no-op in frontmatter mode, kept for API compatibility).
   */
  close(): void {
    // No database to close in frontmatter mode
  }

  /**
   * Check prerequisites for update.
   *
   * @throws Error if not in a git repository
   */
  async checkPrerequisites(): Promise<void> {
    const isRepo = await isGitRepo(this.projectRoot);
    if (!isRepo) {
      throw new Error(
        `Not a git repository: ${this.projectRoot}\n` +
        'The update command requires a git repository for change detection.'
      );
    }
  }

  /**
   * Discover all source files in the project.
   */
  private async discoverFiles(): Promise<string[]> {
    const filterResult = await runDiscovery(this.projectRoot, this.config, {
      tracer: this.tracer,
      debug: this.debug,
    });

    // Walker returns absolute paths; convert to relative for consistent usage
    return filterResult.included.map((f: string) => path.relative(this.projectRoot, f));
  }

  /**
   * Prepare update plan without executing analysis.
   *
   * Uses frontmatter-based change detection:
   * - Reads content_hash from each .sum file
   * - Compares with current file content hash
   * - Files with mismatched hashes need re-analysis
   *
   * @param options - Update options
   * @returns Update plan with files to analyze and cleanup actions
   */
  async preparePlan(options: UpdatePlanOptions = {}): Promise<UpdatePlan> {
    const planStartTime = process.hrtime.bigint();

    // Emit phase start
    this.tracer?.emit({
      type: 'phase:start',
      phase: 'update-plan-creation',
      taskCount: 0, // Will be determined after discovery
      concurrency: 1,
    });

    if (this.debug) {
      this.logger.debug('[debug] Creating update plan with change detection...');
    }

    await this.checkPrerequisites();

    // Get current commit for reference
    const currentCommit = await getCurrentCommit(this.projectRoot);

    if (this.debug) {
      this.logger.debug(`[debug] Git commit: ${currentCommit.slice(0, 7)}`);
    }

    // Discover all source files
    if (this.debug) {
      this.logger.debug('[debug] Discovering files...');
    }

    const allFiles = await this.discoverFiles();

    const filesToAnalyze: FileChange[] = [];
    const filesToSkip: string[] = [];
    const deletedOrRenamed: FileChange[] = [];

    // Track which .sum files we've seen (to detect orphans)
    const seenSumFiles = new Set<string>();

    // Check each file against its .sum file
    const variant = options.variant;
    for (const relativePath of allFiles) {
      const filePath = path.join(this.projectRoot, relativePath);
      const sumPath = getSumPath(filePath, variant);
      seenSumFiles.add(sumPath);

      try {
        // Read existing .sum file
        const sumContent = await readSumFile(sumPath);

        if (!sumContent) {
          // No .sum file exists - file needs analysis
          filesToAnalyze.push({ path: relativePath, status: 'added' });
          continue;
        }

        // Compare content hashes
        const currentHash = await computeContentHash(filePath);
        const storedHash = sumContent.contentHash;

        if (!storedHash || storedHash !== currentHash) {
          // Hash mismatch or no hash stored - file needs re-analysis
          filesToAnalyze.push({ path: relativePath, status: 'modified' });
        } else {
          // Hash matches - skip this file
          filesToSkip.push(relativePath);
        }
      } catch {
        // Error reading file - skip it
        filesToSkip.push(relativePath);
      }
    }

    // Cleanup orphans (deleted files whose .sum files still exist)
    const cleanup = await cleanupOrphans(
      this.projectRoot,
      deletedOrRenamed,
      options.dryRun ?? false,
      variant,
    );

    // Get directories affected by changes (for AGENTS.md regeneration)
    // Sort by depth descending (deepest first) so children are processed before parents
    const affectedDirs = Array.from(getAffectedDirectories(filesToAnalyze))
      .sort((a, b) => {
        const depthA = a === '.' ? 0 : a.split(path.sep).length;
        const depthB = b === '.' ? 0 : b.split(path.sep).length;
        return depthB - depthA;
      });

    if (this.debug) {
      this.logger.debug(
        `[debug] Change detection: ${filesToAnalyze.length} changed, ${filesToSkip.length} unchanged, ${cleanup.deletedSumFiles.length} orphaned`
      );
      this.logger.debug(`[debug] Affected directories: ${affectedDirs.length}`);
    }

    // Emit plan created event
    this.tracer?.emit({
      type: 'plan:created',
      planType: 'update',
      fileCount: filesToAnalyze.length,
      taskCount: filesToAnalyze.length + affectedDirs.length, // File tasks + dir regen tasks
    });

    // Emit phase end
    const planEndTime = process.hrtime.bigint();
    const planDurationMs = Number(planEndTime - planStartTime) / 1_000_000;
    this.tracer?.emit({
      type: 'phase:end',
      phase: 'update-plan-creation',
      durationMs: planDurationMs,
      tasksCompleted: 1,
      tasksFailed: 0,
    });

    // Determine if this is first run (no files to skip means no existing .sum files)
    const isFirstRun = filesToSkip.length === 0 && filesToAnalyze.length > 0;

    // Build analysis tasks with prompts for files that need re-analysis
    // (Skip if dry run or first run - no point building tasks we won't execute)
    const fileTasks = options.dryRun || isFirstRun
      ? []
      : await this.createFileTasks(filesToAnalyze, variant);

    return {
      filesToAnalyze,
      fileTasks,
      filesToSkip,
      cleanup,
      affectedDirs,
      baseCommit: currentCommit, // Not used in frontmatter mode
      currentCommit,
      isFirstRun,
    };
  }

  /**
   * Record file analyzed (no-op in frontmatter mode - hash is stored in .sum file).
   * Kept for API compatibility.
   */
  async recordFileAnalyzed(
    _relativePath: string,
    _contentHash: string,
    _currentCommit: string
  ): Promise<void> {
    // No-op: content hash is stored in .sum file frontmatter
  }

  /**
   * Remove file from state (no-op in frontmatter mode).
   * Kept for API compatibility.
   */
  async removeFileState(_relativePath: string): Promise<void> {
    // No-op: .sum file cleanup is handled separately
  }

  /**
   * Record a completed update run (no-op in frontmatter mode).
   * Kept for API compatibility.
   */
  async recordRun(
    _commitHash: string,
    _filesAnalyzed: number,
    _filesSkipped: number
  ): Promise<number> {
    // No-op: no run history in frontmatter mode
    return 0;
  }

  /**
   * Get last run information (not available in frontmatter mode).
   * Kept for API compatibility.
   */
  async getLastRun(): Promise<undefined> {
    // No run history in frontmatter mode
    return undefined;
  }

  /**
   * Check if this is the first run.
   * In frontmatter mode, checks if any .sum files exist.
   */
  async isFirstRun(): Promise<boolean> {
    const plan = await this.preparePlan({ dryRun: true });
    return plan.isFirstRun;
  }

  // ===========================================================================
  // SHARED METHODS (used by both generate and update)
  // ===========================================================================

  /**
   * Create analysis tasks for files.
   * Pre-builds prompts with optional existing .sum content for incremental updates.
   *
   * Used by both generate (PreparedFile[]) and update (FileChange[]) workflows.
   *
   * @param files - Files to create tasks for (PreparedFile[] or FileChange[])
   * @returns Array of analysis tasks with pre-built prompts
   */
  async createFileTasks(
    files: PreparedFile[] | FileChange[],
    variant?: string,
  ): Promise<AnalysisTask[]> {
    const tasks: AnalysisTask[] = [];

    for (const file of files) {
      // Handle both PreparedFile (generate) and FileChange (update)
      const isFileChange = 'path' in file && 'status' in file;
      const filePath = isFileChange ? (file as FileChange).path : (file as PreparedFile).relativePath;
      const absolutePath = isFileChange
        ? path.join(this.projectRoot, (file as FileChange).path)
        : (file as PreparedFile).filePath;

      // Read content (already loaded for PreparedFile, need to load for FileChange)
      const content = isFileChange
        ? await readFile(absolutePath, 'utf-8')
        : (file as PreparedFile).content;

      // For updates, read existing .sum for incremental update context
      const existingSumContent = isFileChange
        ? await readSumFile(getSumPath(absolutePath, variant))
        : undefined;

      // Build prompt (same logic for both, with optional existingSum for updates)
      const prompt = buildFilePrompt({
        filePath,
        content,
        existingSum: existingSumContent?.summary,
        sourceFileSize: content.length,
        compressionRatio: this.config.generation.compressionRatio,
      }, this.debug);

      tasks.push({
        type: 'file',
        filePath,
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
      });
    }

    return tasks;
  }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Create a documentation orchestrator.
 *
 * This is the unified orchestrator for both generation and update workflows.
 */
export function createOrchestrator(
  config: Config,
  projectRoot: string,
  options?: { tracer?: ITraceWriter; debug?: boolean; logger?: Logger }
): DocumentationOrchestrator {
  return new DocumentationOrchestrator(config, projectRoot, options);
}

/**
 * Alias for createOrchestrator (for update command compatibility).
 */
export function createUpdateOrchestrator(
  config: Config,
  projectRoot: string,
  options?: { tracer?: ITraceWriter; debug?: boolean; logger?: Logger }
): DocumentationOrchestrator {
  return new DocumentationOrchestrator(config, projectRoot, options);
}

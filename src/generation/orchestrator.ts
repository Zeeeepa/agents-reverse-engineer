/**
 * Generation orchestrator
 *
 * Coordinates the documentation generation workflow:
 * - Discovers and prepares files for analysis
 * - Detects file types
 * - Creates analysis tasks with prompts
 * - Tracks token budget
 * - Creates directory-summary tasks for LLM-generated descriptions
 */

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import pc from 'picocolors';
import type { Config } from '../config/schema.js';
import type { DiscoveryResult } from '../types/index.js';
import { detectFileType } from './detection/detector.js';
import type { FileType } from './types.js';
import { BudgetTracker, countTokens, needsChunking, chunkFile } from './budget/index.js';
import { buildPrompt, buildChunkPrompt } from './prompts/index.js';
import { analyzeComplexity, shouldGenerateArchitecture, shouldGenerateStack } from './complexity.js';
import type { ComplexityMetrics, PackageRoot } from './complexity.js';
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
  /** Token count of content */
  tokens: number;
  /** Whether file needs chunking */
  needsChunking: boolean;
}

/**
 * Analysis task for a file or chunk.
 */
export interface AnalysisTask {
  /** Type of task */
  type: 'file' | 'chunk' | 'synthesis' | 'directory-summary';
  /** File or directory path */
  filePath: string;
  /** System prompt */
  systemPrompt: string;
  /** User prompt */
  userPrompt: string;
  /** Estimated tokens for this task */
  estimatedTokens: number;
  /** Chunk info if applicable */
  chunkInfo?: {
    index: number;
    total: number;
    startLine: number;
    endLine: number;
  };
  /** Directory info for directory-summary tasks */
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
  /** Whether to generate ARCHITECTURE.md */
  generateArchitecture: boolean;
  /** Whether to generate STACK.md */
  generateStack: boolean;
  /** Whether to generate STRUCTURE.md */
  generateStructure: boolean;
  /** Whether to generate CONVENTIONS.md */
  generateConventions: boolean;
  /** Whether to generate TESTING.md */
  generateTesting: boolean;
  /** Whether to generate INTEGRATIONS.md */
  generateIntegrations: boolean;
  /** Whether to generate CONCERNS.md */
  generateConcerns: boolean;
  /** Package roots where supplementary docs will be generated */
  packageRoots: PackageRoot[];
  /** Budget tracker state */
  budget: {
    total: number;
    estimated: number;
    remaining: number;
  };
  /** Files skipped due to budget */
  skippedFiles: string[];
}

/**
 * Orchestrates the documentation generation workflow.
 */
export class GenerationOrchestrator {
  private config: Config;
  private projectRoot: string;
  private budgetTracker: BudgetTracker;
  private tracer?: ITraceWriter;
  private debug: boolean;

  constructor(
    config: Config,
    projectRoot: string,
    totalFiles: number,
    options?: { tracer?: ITraceWriter; debug?: boolean }
  ) {
    this.config = config;
    this.projectRoot = projectRoot;
    this.budgetTracker = new BudgetTracker(
      config.generation.tokenBudget,
      totalFiles
    );
    this.tracer = options?.tracer;
    this.debug = options?.debug ?? false;
  }

  /**
   * Prepare files for analysis by reading content and detecting types.
   *
   * Files are read with bounded concurrency to avoid exhausting file
   * descriptors, and the event loop is yielded periodically during
   * CPU-intensive tokenization.
   */
  async prepareFiles(discoveryResult: DiscoveryResult): Promise<PreparedFile[]> {
    const prepared: PreparedFile[] = [];

    // Yield to the event loop periodically during tokenization
    const YIELD_INTERVAL = 50;

    for (let i = 0; i < discoveryResult.files.length; i++) {
      const filePath = discoveryResult.files[i];
      try {
        const content = await readFile(filePath, 'utf-8');
        const tokens = countTokens(content);
        const fileType = detectFileType(filePath, content);
        const relativePath = path.relative(this.projectRoot, filePath);

        prepared.push({
          filePath,
          relativePath,
          content,
          fileType,
          tokens,
          needsChunking: needsChunking(tokens, this.config.generation.chunkSize),
        });
      } catch {
        // Skip files that can't be read (permission errors, etc.)
        // Silently ignore - these files won't appear in the plan
      }

      // Yield to event loop periodically to prevent starvation
      // during CPU-intensive BPE tokenization
      if (i % YIELD_INTERVAL === 0 && i > 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }

    // Sort by token count (smaller files first for breadth-first coverage)
    return prepared.sort((a, b) => a.tokens - b.tokens);
  }

  /**
   * Create analysis tasks for files within budget.
   */
  createTasks(files: PreparedFile[]): {
    tasks: AnalysisTask[];
    skipped: string[];
  } {
    const tasks: AnalysisTask[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      const promptOverhead = 600; // Approximate overhead for prompts
      const estimatedTotal = file.tokens + promptOverhead;

      if (!this.budgetTracker.canProcess(estimatedTotal)) {
        this.budgetTracker.recordSkipped(file.relativePath);
        skipped.push(file.relativePath);
        continue;
      }

      if (file.needsChunking) {
        // Create chunk tasks
        const chunks = chunkFile(file.content, {
          chunkSize: this.config.generation.chunkSize,
        });

        for (const chunk of chunks) {
          const chunkPrompt = buildChunkPrompt({
            filePath: file.filePath,
            content: chunk.content,
            fileType: file.fileType,
            chunkIndex: chunk.index,
            totalChunks: chunks.length,
            lineRange: { start: chunk.startLine, end: chunk.endLine },
          });

          tasks.push({
            type: 'chunk',
            filePath: file.relativePath,
            systemPrompt: chunkPrompt.system,
            userPrompt: chunkPrompt.user,
            estimatedTokens: chunk.tokens + promptOverhead,
            chunkInfo: {
              index: chunk.index,
              total: chunks.length,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
            },
          });
        }

        // Add synthesis task (will be executed after chunks)
        tasks.push({
          type: 'synthesis',
          filePath: file.relativePath,
          systemPrompt: '', // Will be set during execution
          userPrompt: `Synthesize summaries for ${file.relativePath}`,
          estimatedTokens: promptOverhead,
        });
      } else {
        // Single file task
        const prompt = buildPrompt({
          filePath: file.filePath,
          content: file.content,
          fileType: file.fileType,
        });

        tasks.push({
          type: 'file',
          filePath: file.relativePath,
          systemPrompt: prompt.system,
          userPrompt: prompt.user,
          estimatedTokens: estimatedTotal,
        });
      }

      this.budgetTracker.recordProcessed(file.relativePath, estimatedTotal);
    }

    return { tasks, skipped };
  }

  /**
   * Create directory-summary tasks for LLM-generated directory descriptions.
   * These tasks run after all files in a directory are analyzed, allowing
   * the LLM to synthesize a richer directory overview from the .sum files.
   */
  createDirectorySummaryTasks(files: PreparedFile[]): AnalysisTask[] {
    const tasks: AnalysisTask[] = [];

    // Group files by directory
    const filesByDir = new Map<string, PreparedFile[]>();
    for (const file of files) {
      const dir = path.dirname(file.relativePath);
      const dirFiles = filesByDir.get(dir) ?? [];
      dirFiles.push(file);
      filesByDir.set(dir, dirFiles);
    }

    // Create a directory-summary task for each directory with analyzed files
    for (const [dir, dirFiles] of Array.from(filesByDir.entries())) {
      const sumFilePaths = dirFiles.map(f => `${f.relativePath}.sum`);
      const promptOverhead = 800; // Overhead for directory summary prompts

      tasks.push({
        type: 'directory-summary',
        filePath: dir || '.',
        systemPrompt: `You are generating a directory description for documentation.
Analyze the provided .sum file contents to create a concise, informative directory overview.
Focus on:
1. The primary purpose of this directory
2. How the files work together
3. Key patterns or conventions used
Keep the description to 1-3 sentences.`,
        userPrompt: `Generate a directory description for "${dir || 'root'}" based on ${dirFiles.length} analyzed files.
The .sum files contain individual file summaries - synthesize them into a cohesive directory overview.`,
        estimatedTokens: promptOverhead,
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
      console.error(pc.dim('[debug] Preparing files: reading and tokenizing...'));
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
      const patterns = complexity.architecturalPatterns.length > 0 ? complexity.architecturalPatterns.join(', ') : 'none';
      console.error(pc.dim(`[debug] Complexity analysis: ${patterns}, depth=${complexity.directoryDepth}`));
    }

    const { tasks: fileTasks, skipped } = this.createTasks(files);

    const budgetUsed = this.budgetTracker.getReport().used;
    if (this.debug) {
      console.error(
        pc.dim(
          `[debug] Budget: ${budgetUsed}/${this.config.generation.tokenBudget} tokens used, ${skipped.length} files skipped`
        )
      );
    }

    // Add directory-summary tasks for LLM-generated directory descriptions
    // These run after file analysis to synthesize richer directory overviews
    const dirTasks = this.createDirectorySummaryTasks(files);
    const tasks = [...fileTasks, ...dirTasks];

    if (this.debug) {
      const chunkTasks = fileTasks.filter(t => t.type === 'chunk').length;
      const synthesisTasks = fileTasks.filter(t => t.type === 'synthesis').length;
      console.error(
        pc.dim(
          `[debug] Generation plan: ${files.length} files, ${tasks.length} tasks (${chunkTasks} chunks, ${synthesisTasks} synthesis, ${dirTasks.length} directories)`
        )
      );
    }

    // Check for package manifest to determine STACK.md generation
    const hasPackageManifest = await this.hasPackageManifest();

    // Release file content from PreparedFile objects to free memory.
    // Content has already been embedded into task prompts by createTasks()
    // and is no longer needed. The runner re-reads files from disk.
    for (const file of files) {
      (file as { content: string }).content = '';
    }

    const plan: GenerationPlan = {
      files,
      tasks,
      complexity,
      generateArchitecture: this.config.generation.generateArchitecture &&
        shouldGenerateArchitecture(complexity),
      generateStack: this.config.generation.generateStack &&
        hasPackageManifest &&
        shouldGenerateStack(hasPackageManifest),
      generateStructure: this.config.generation.generateStructure,
      generateConventions: this.config.generation.generateConventions,
      generateTesting: this.config.generation.generateTesting,
      generateIntegrations: this.config.generation.generateIntegrations,
      generateConcerns: this.config.generation.generateConcerns,
      packageRoots: complexity.packageRoots,
      budget: {
        total: this.config.generation.tokenBudget,
        estimated: budgetUsed,
        remaining: this.budgetTracker.remaining,
      },
      skippedFiles: skipped,
    };

    // Emit plan created event
    this.tracer?.emit({
      type: 'plan:created',
      planType: 'generate',
      fileCount: files.length,
      taskCount: tasks.length,
      budgetUsed: budgetUsed,
      budgetTotal: this.config.generation.tokenBudget,
      filesSkipped: skipped.length,
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

  /**
   * Check if a package manifest (package.json, pyproject.toml, go.mod, Cargo.toml) exists in project root.
   */
  private async hasPackageManifest(): Promise<boolean> {
    const manifests = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml'];
    for (const manifest of manifests) {
      try {
        await readFile(path.join(this.projectRoot, manifest), 'utf-8');
        return true;
      } catch {
        // Continue checking other manifests
      }
    }
    return false;
  }

  /**
   * Get budget report.
   */
  getBudgetReport() {
    return this.budgetTracker.getReport();
  }
}

/**
 * Create a generation orchestrator with default config.
 */
export function createOrchestrator(
  config: Config,
  projectRoot: string,
  totalFiles: number,
  options?: { tracer?: ITraceWriter; debug?: boolean }
): GenerationOrchestrator {
  return new GenerationOrchestrator(config, projectRoot, totalFiles, options);
}

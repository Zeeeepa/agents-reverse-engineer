/**
 * Update orchestrator
 *
 * Coordinates incremental documentation updates using frontmatter-based change detection:
 * 1. Check git repository status
 * 2. Scan for existing .sum files
 * 3. Compare content hashes from frontmatter with current file hashes
 * 4. Clean up orphaned .sum files
 * 5. Prepare analysis tasks for changed files
 * 6. Track affected directories for AGENTS.md regeneration
 */
import * as path from 'node:path';
import type { Config } from '../config/schema.js';
import {
  isGitRepo,
  getCurrentCommit,
  computeContentHash,
  type FileChange,
} from '../change-detection/index.js';
import { cleanupOrphans, getAffectedDirectories } from './orphan-cleaner.js';
import { readSumFile, getSumPath } from '../generation/writers/sum.js';
import type { UpdateOptions, CleanupResult } from './types.js';
import { walkDirectory } from '../discovery/walker.js';
import {
  applyFilters,
  createGitignoreFilter,
  createVendorFilter,
  createBinaryFilter,
  createCustomFilter,
} from '../discovery/filters/index.js';

/**
 * Result of update preparation (before analysis).
 */
export interface UpdatePlan {
  /** Files to analyze (added or modified) */
  filesToAnalyze: FileChange[];
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

/**
 * Orchestrates incremental documentation updates using frontmatter-based change detection.
 */
export class UpdateOrchestrator {
  private config: Config;
  private projectRoot: string;

  constructor(config: Config, projectRoot: string) {
    this.config = config;
    this.projectRoot = projectRoot;
  }

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
    // Create filters
    const gitignoreFilter = await createGitignoreFilter(this.projectRoot);
    const vendorFilter = createVendorFilter(this.config.exclude.vendorDirs);
    const binaryFilter = createBinaryFilter({
      maxFileSize: this.config.options.maxFileSize,
      additionalExtensions: this.config.exclude.binaryExtensions,
    });
    const customFilter = createCustomFilter(this.config.exclude.patterns, this.projectRoot);
    const filters = [gitignoreFilter, vendorFilter, binaryFilter, customFilter];

    // Walk directory
    const files = await walkDirectory({
      cwd: this.projectRoot,
      followSymlinks: this.config.options.followSymlinks,
    });

    // Apply filters
    const filterResult = await applyFilters(files, filters);

    // Walker returns absolute paths; convert to relative for consistent usage
    return filterResult.included.map(f => path.relative(this.projectRoot, f));
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
  async preparePlan(options: UpdateOptions = {}): Promise<UpdatePlan> {
    await this.checkPrerequisites();

    // Get current commit for reference
    const currentCommit = await getCurrentCommit(this.projectRoot);

    // Discover all source files
    const allFiles = await this.discoverFiles();

    const filesToAnalyze: FileChange[] = [];
    const filesToSkip: string[] = [];
    const deletedOrRenamed: FileChange[] = [];

    // Track which .sum files we've seen (to detect orphans)
    const seenSumFiles = new Set<string>();

    // Check each file against its .sum file
    for (const relativePath of allFiles) {
      const filePath = path.join(this.projectRoot, relativePath);
      const sumPath = getSumPath(filePath);
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
      options.dryRun ?? false
    );

    // Get directories affected by changes (for AGENTS.md regeneration)
    const affectedDirs = Array.from(getAffectedDirectories(filesToAnalyze));

    // Determine if this is first run (no files to skip means no existing .sum files)
    const isFirstRun = filesToSkip.length === 0 && filesToAnalyze.length > 0;
    return {
      filesToAnalyze,
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
}

/**
 * Create an update orchestrator.
 */
export function createUpdateOrchestrator(
  config: Config,
  projectRoot: string
): UpdateOrchestrator {
  return new UpdateOrchestrator(config, projectRoot);
}

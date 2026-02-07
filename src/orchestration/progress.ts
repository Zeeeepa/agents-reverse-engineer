/**
 * Streaming build-log progress reporter with ETA calculation.
 *
 * Outputs one line per event (start, done, fail, dir-done, root-done)
 * using `console.log` for atomic, non-corrupting concurrent output.
 * Each line shows progress counter, status, file path, timing, and
 * token counts using colored output via `picocolors`.
 *
 * ETA is computed via a moving average of the last 10 completion times,
 * displayed after 2 or more files have completed.
 *
 * All methods except {@link printSummary} are no-ops when `quiet` is true.
 *
 * @module
 */

import pc from 'picocolors';
import type { RunSummary } from './types.js';
import { formatCost, formatTokens } from '../ai/pricing.js';

// ---------------------------------------------------------------------------
// ProgressReporter
// ---------------------------------------------------------------------------

/**
 * Streaming build-log progress reporter.
 *
 * Create one instance per command run. Call the event methods as files
 * are processed. Call {@link printSummary} at the end of the run.
 *
 * @example
 * ```typescript
 * const reporter = new ProgressReporter(fileCount, false);
 * reporter.onFileStart('src/index.ts');
 * reporter.onFileDone('src/index.ts', 1200, 500, 300, 'sonnet');
 * reporter.printSummary(summary);
 * ```
 */
export class ProgressReporter {
  /** Total number of file tasks in this run */
  private readonly totalFiles: number;

  /** Whether to suppress per-file output */
  private readonly quiet: boolean;

  /** Number of files completed successfully */
  private completed: number = 0;

  /** Number of files that failed */
  private failed: number = 0;

  /** Sliding window of recent completion durations for ETA */
  private readonly completionTimes: number[] = [];

  /** Maximum window size for ETA moving average */
  private readonly windowSize: number = 10;

  /** Timestamp when the reporter was created */
  private readonly startTime: number = Date.now();

  /**
   * Create a new progress reporter.
   *
   * @param totalFiles - Total number of file tasks to process
   * @param quiet - When true, suppress all per-file output (summary still prints)
   */
  constructor(totalFiles: number, quiet: boolean) {
    this.totalFiles = totalFiles;
    this.quiet = quiet;
  }

  /**
   * Log the start of file analysis.
   *
   * Output format: `[X/Y] ANALYZING path`
   *
   * @param filePath - Relative path to the file being analyzed
   */
  onFileStart(filePath: string): void {
    if (this.quiet) return;
    const counter = pc.dim(`[${this.completed + this.failed + 1}/${this.totalFiles}]`);
    console.log(`${counter} ${pc.cyan('ANALYZING')} ${filePath}`);
  }

  /**
   * Log the successful completion of file analysis.
   *
   * Output format: `[X/Y] DONE path Xs in/out tok ~Ns remaining`
   *
   * Records the completion time for ETA calculation.
   *
   * @param filePath - Relative path to the completed file
   * @param durationMs - Wall-clock duration of the AI call
   * @param tokensIn - Number of input tokens consumed
   * @param tokensOut - Number of output tokens generated
   * @param model - Model identifier used for this call
   */
  onFileDone(
    filePath: string,
    durationMs: number,
    tokensIn: number,
    tokensOut: number,
    model: string,
  ): void {
    this.completed++;

    // Record completion time for ETA
    this.completionTimes.push(durationMs);
    if (this.completionTimes.length > this.windowSize) {
      this.completionTimes.shift();
    }

    if (this.quiet) return;

    const counter = pc.dim(`[${this.completed + this.failed}/${this.totalFiles}]`);
    const time = pc.dim(`${(durationMs / 1000).toFixed(1)}s`);
    const tokens = pc.dim(`${tokensIn}/${tokensOut} tok`);
    const modelLabel = pc.dim(model);
    const eta = this.formatETA();

    console.log(
      `${counter} ${pc.green('DONE')} ${filePath} ${time} ${tokens} ${modelLabel}${eta}`,
    );
  }

  /**
   * Log a file analysis failure.
   *
   * Output format: `[X/Y] FAIL path error`
   *
   * @param filePath - Relative path to the failed file
   * @param error - Error message describing the failure
   */
  onFileError(filePath: string, error: string): void {
    this.failed++;

    if (this.quiet) return;

    const counter = pc.dim(`[${this.completed + this.failed}/${this.totalFiles}]`);
    console.log(`${counter} ${pc.red('FAIL')} ${filePath} ${pc.dim(error)}`);
  }

  /**
   * Log the completion of directory AGENTS.md generation.
   *
   * Output format: `[dir] DONE dirPath/AGENTS.md`
   *
   * @param dirPath - Path to the directory
   */
  onDirectoryDone(dirPath: string): void {
    if (this.quiet) return;
    console.log(`${pc.dim('[dir]')} ${pc.blue('DONE')} ${dirPath}/AGENTS.md`);
  }

  /**
   * Log the completion of a root document generation.
   *
   * Output format: `[root] DONE docPath`
   *
   * @param docPath - Path to the root document
   */
  onRootDone(docPath: string): void {
    if (this.quiet) return;
    console.log(`${pc.dim('[root]')} ${pc.blue('DONE')} ${docPath}`);
  }

  /**
   * Print the end-of-run summary.
   *
   * Always printed, even when `quiet` is true. Shows files processed,
   * estimated cost with token breakdown, files read with unique dedup,
   * time elapsed, errors, and retries.
   *
   * When `costThresholdUsd` is provided and cost data is available, a
   * warning is printed to stderr if the run cost exceeds the threshold.
   *
   * @param summary - Aggregated run summary
   * @param costThresholdUsd - Optional cost threshold in USD for warning
   */
  printSummary(summary: RunSummary, costThresholdUsd?: number): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    console.log('');
    console.log(pc.bold('=== Run Summary ==='));
    console.log(`  Files processed: ${pc.green(String(summary.filesProcessed))}`);
    if (summary.filesFailed > 0) {
      console.log(`  Files failed:    ${pc.red(String(summary.filesFailed))}`);
    }
    if (summary.filesSkipped > 0) {
      console.log(`  Files skipped:   ${pc.yellow(String(summary.filesSkipped))}`);
    }
    console.log(`  Total calls:     ${summary.totalCalls}`);

    const costStr = formatCost(summary.totalCostUsd, summary.costAvailable);
    const tokIn = formatTokens(summary.totalInputTokens);
    const tokOut = formatTokens(summary.totalOutputTokens);
    console.log(`  Estimated cost:  ${costStr} (${tokIn} in / ${tokOut} out)`);

    if (summary.totalFilesRead > 0) {
      console.log(`  Files read:      ${summary.totalFilesRead} (${summary.uniqueFilesRead} unique)`);
    }

    console.log(`  Total time:      ${elapsed}s`);
    console.log(`  Errors:          ${summary.errorCount}`);
    if (summary.retryCount > 0) {
      console.log(`  Retries:         ${summary.retryCount}`);
    }

    // Cost threshold warning (printed to stderr to preserve JSON stdout)
    if (
      costThresholdUsd !== undefined &&
      summary.costAvailable &&
      summary.totalCostUsd > costThresholdUsd
    ) {
      console.error(
        pc.yellow(
          `Warning: Run cost $${summary.totalCostUsd.toFixed(4)} exceeds configured threshold of $${costThresholdUsd.toFixed(4)}`,
        ),
      );
    }
  }

  // -------------------------------------------------------------------------
  // ETA calculation
  // -------------------------------------------------------------------------

  /**
   * Compute and format the estimated time remaining.
   *
   * Uses a moving average of the last 10 completion times.
   * Returns an empty string if fewer than 2 completions have occurred.
   *
   * @returns Formatted ETA string like ` ~12s remaining` or ` ~2m 30s remaining`
   */
  private formatETA(): string {
    if (this.completionTimes.length < 2) return '';

    const avg =
      this.completionTimes.reduce((a, b) => a + b, 0) /
      this.completionTimes.length;
    const remaining = this.totalFiles - this.completed - this.failed;

    if (remaining <= 0) return '';

    const etaMs = avg * remaining;
    const seconds = Math.round(etaMs / 1000);

    if (seconds < 60) {
      return pc.dim(` ~${seconds}s remaining`);
    }

    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return pc.dim(` ~${minutes}m ${secs}s remaining`);
  }
}

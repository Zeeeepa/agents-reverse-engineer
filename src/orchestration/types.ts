/**
 * Shared types for the orchestration module.
 *
 * These types are used across the concurrency pool, progress reporter,
 * and command runner to represent task results, run summaries, progress
 * events, and command options.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// File task result
// ---------------------------------------------------------------------------

/**
 * Result of processing a single file through AI analysis.
 *
 * Produced by the command runner for each file task, carrying token
 * counts and timing data needed for the run summary.
 */
export interface FileTaskResult {
  /** Relative path to the source file */
  path: string;
  /** Whether the AI call succeeded */
  success: boolean;
  /** Number of input tokens consumed */
  tokensIn: number;
  /** Number of output tokens generated */
  tokensOut: number;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  /** Model identifier used for this call */
  model: string;
  /** Error message if the call failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// Run summary
// ---------------------------------------------------------------------------

/**
 * Aggregated summary of a command run.
 *
 * Produced at the end of a generate or update command execution,
 * combining per-file results into totals for display and telemetry.
 */
export interface RunSummary {
  /** Number of files that were successfully processed */
  filesProcessed: number;
  /** Number of files that failed processing */
  filesFailed: number;
  /** Number of files that were skipped (e.g., dry-run) */
  filesSkipped: number;
  /** Total number of AI calls made */
  totalCalls: number;
  /** Sum of input tokens across all calls */
  totalInputTokens: number;
  /** Sum of output tokens across all calls */
  totalOutputTokens: number;
  /** Total wall-clock duration in milliseconds */
  totalDurationMs: number;
  /** Number of errors encountered */
  errorCount: number;
  /** Number of retries that occurred */
  retryCount: number;
  /** Total estimated cost in USD */
  totalCostUsd: number;
  /** Whether cost data was available */
  costAvailable: boolean;
  /** Total file reads across all calls */
  totalFilesRead: number;
  /** Unique files read (deduped by path) */
  uniqueFilesRead: number;
}

// ---------------------------------------------------------------------------
// Progress events
// ---------------------------------------------------------------------------

/**
 * Event emitted by the command runner to the progress reporter.
 *
 * Each event type carries different optional fields:
 * - `start`: filePath, index, total
 * - `done`: filePath, index, total, durationMs, tokensIn, tokensOut, model
 * - `error`: filePath, index, total, error
 * - `dir-done`: filePath (directory path)
 * - `root-done`: filePath (root document path)
 */
export interface ProgressEvent {
  /** Event type */
  type: 'start' | 'done' | 'error' | 'dir-done' | 'root-done';
  /** File or directory path */
  filePath: string;
  /** Zero-based index of this task in the current phase */
  index: number;
  /** Total number of tasks in the current phase */
  total: number;
  /** Wall-clock duration in milliseconds (for 'done' events) */
  durationMs?: number;
  /** Input tokens consumed (for 'done' events) */
  tokensIn?: number;
  /** Output tokens generated (for 'done' events) */
  tokensOut?: number;
  /** Model identifier (for 'done' events) */
  model?: string;
  /** Error message (for 'error' events) */
  error?: string;
}

// ---------------------------------------------------------------------------
// Command run options
// ---------------------------------------------------------------------------

/**
 * Options that control how commands execute.
 *
 * These are populated from a combination of config file defaults
 * and CLI flag overrides.
 */
export interface CommandRunOptions {
  /** Maximum number of concurrent AI calls */
  concurrency: number;
  /** Stop pulling new tasks on first error */
  failFast?: boolean;
  /** Suppress per-file progress output */
  quiet?: boolean;
  /** Show debug information (exact prompts sent) */
  debug?: boolean;
  /** List files that would be processed without executing */
  dryRun?: boolean;
  /** Cost threshold in USD for warning when exceeded */
  costThresholdUsd?: number;
}

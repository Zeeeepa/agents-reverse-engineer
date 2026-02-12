/**
 * In-memory telemetry logger for AI service calls.
 *
 * Accumulates {@link TelemetryEntry} instances during a run and computes
 * aggregate summaries. The logger is created once per CLI invocation and
 * finalized when the run completes.
 *
 * @module
 */

import type { TelemetryEntry, RunLog, FileRead } from '../types.js';

/**
 * Accumulates per-call telemetry entries in memory and produces a
 * complete {@link RunLog} when the run finishes.
 *
 * @example
 * ```typescript
 * const logger = new TelemetryLogger('2026-02-07T12:00:00.000Z', 'Claude', 'sonnet', 'generate');
 * logger.addEntry(entry);
 * const summary = logger.getSummary();
 * const runLog = logger.toRunLog();
 * ```
 */
export class TelemetryLogger {
  /** Unique identifier for this run (ISO timestamp-based) */
  readonly runId: string;

  /** ISO 8601 timestamp when the run started */
  readonly startTime: string;

  /** Backend used for this run */
  readonly backend: string;

  /** Model used for this run */
  readonly model: string;

  /** Command that triggered this run */
  readonly command: string;

  /** Accumulated telemetry entries */
  private readonly entries: TelemetryEntry[] = [];

  /**
   * Create a new telemetry logger for a run.
   *
   * @param runId - Unique run identifier (typically an ISO timestamp)
   * @param backend - Backend name (e.g., "Claude", "Gemini", "OpenCode")
   * @param model - Model name (e.g., "sonnet", "opus", "haiku")
   * @param command - Command name (e.g., "generate", "update", "specify", "rebuild")
   */
  constructor(runId: string, backend: string, model: string, command: string) {
    this.runId = runId;
    this.startTime = new Date().toISOString();
    this.backend = backend;
    this.model = model;
    this.command = command;
  }

  /**
   * Record a telemetry entry for a completed AI call.
   *
   * @param entry - The telemetry entry to record
   */
  addEntry(entry: TelemetryEntry): void {
    this.entries.push(entry);
  }

  /**
   * Get all recorded entries as a read-only array.
   *
   * @returns Immutable view of the accumulated entries
   */
  getEntries(): readonly TelemetryEntry[] {
    return this.entries;
  }

  /**
   * Update the most recent entry's filesRead array.
   *
   * Called by the AI service after the command runner attaches file
   * metadata to the last call.
   *
   * @param filesRead - Array of file-read records to attach
   */
  setFilesReadOnLastEntry(filesRead: FileRead[]): void {
    if (this.entries.length === 0) return;
    this.entries[this.entries.length - 1]!.filesRead = filesRead;
  }

  /**
   * Compute aggregate summary statistics from all recorded entries.
   *
   * Totals are computed on every call (not cached) so the summary
   * always reflects the current state of the entries array.
   *
   * @returns Summary with totals for calls, tokens, duration, and errors
   */
  getSummary(): RunLog['summary'] {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheCreationTokens = 0;
    let totalDurationMs = 0;
    let errorCount = 0;
    let totalFilesRead = 0;
    const uniqueFilePaths = new Set<string>();

    for (const entry of this.entries) {
      totalInputTokens += entry.inputTokens;
      totalOutputTokens += entry.outputTokens;
      totalCacheReadTokens += entry.cacheReadTokens;
      totalCacheCreationTokens += entry.cacheCreationTokens;
      totalDurationMs += entry.latencyMs;
      if (entry.error !== undefined) {
        errorCount++;
      }
      totalFilesRead += entry.filesRead.length;
      for (const file of entry.filesRead) {
        uniqueFilePaths.add(file.path);
      }
    }

    return {
      totalCalls: this.entries.length,
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheCreationTokens,
      totalDurationMs,
      errorCount,
      totalFilesRead,
      uniqueFilesRead: uniqueFilePaths.size,
    };
  }

  /**
   * Assemble the complete {@link RunLog} for this run.
   *
   * Sets `endTime` to the current time, includes all entries, and
   * computes the summary. Call this once when the run is finished.
   *
   * @returns Complete run log ready for serialization
   */
  toRunLog(): RunLog {
    return {
      runId: this.runId,
      startTime: this.startTime,
      endTime: new Date().toISOString(),
      backend: this.backend,
      model: this.model,
      command: this.command,
      entries: [...this.entries],
      summary: this.getSummary(),
    };
  }
}

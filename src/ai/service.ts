/**
 * AI service orchestrator.
 *
 * The {@link AIService} class is the main entry point for making AI calls.
 * It ties together the subprocess wrapper, retry logic, backend selection,
 * and telemetry logging into a clean `call()` method.
 *
 * @module
 */

import type { AIBackend, AICallOptions, AIResponse, TelemetryEntry, RunLog, FileRead } from './types.js';
import { AIServiceError } from './types.js';
import { runSubprocess } from './subprocess.js';
import { withRetry, DEFAULT_RETRY_OPTIONS } from './retry.js';
import { TelemetryLogger } from './telemetry/logger.js';
import { writeRunLog } from './telemetry/run-log.js';
import { cleanupOldLogs } from './telemetry/cleanup.js';
import { estimateCost } from './pricing.js';
import type { ModelPricing } from './pricing.js';

// ---------------------------------------------------------------------------
// Rate-limit detection patterns
// ---------------------------------------------------------------------------

/** Patterns in stderr that indicate a transient rate-limit error */
const RATE_LIMIT_PATTERNS = [
  'rate limit',
  '429',
  'too many requests',
  'overloaded',
];

/**
 * Check whether stderr text contains rate-limit indicators.
 *
 * @param stderr - Standard error output from the subprocess
 * @returns `true` if any rate-limit pattern matches (case-insensitive)
 */
function isRateLimitStderr(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return RATE_LIMIT_PATTERNS.some((pattern) => lower.includes(pattern));
}

// ---------------------------------------------------------------------------
// AIService options
// ---------------------------------------------------------------------------

/**
 * Configuration options for the {@link AIService}.
 *
 * These are typically sourced from the config schema's `ai` section.
 */
export interface AIServiceOptions {
  /** Default subprocess timeout in milliseconds */
  timeoutMs: number;
  /** Maximum number of retries for transient errors */
  maxRetries: number;
  /** Telemetry settings */
  telemetry: {
    /** Number of most recent run logs to keep on disk */
    keepRuns: number;
    /** Optional cost threshold in USD. Warn when exceeded. */
    costThresholdUsd?: number;
  };
  /** Custom pricing overrides from config */
  pricingOverrides?: Record<string, ModelPricing>;
}

// ---------------------------------------------------------------------------
// AIService
// ---------------------------------------------------------------------------

/**
 * Orchestrates AI CLI calls with retry, timeout, and telemetry.
 *
 * Create one instance per CLI run. Call {@link call} for each AI invocation.
 * Call {@link finalize} at the end to write the run log and clean up old files.
 *
 * @example
 * ```typescript
 * import { AIService } from './service.js';
 * import { resolveBackend, createBackendRegistry } from './registry.js';
 *
 * const registry = createBackendRegistry();
 * const backend = await resolveBackend(registry, 'auto');
 * const service = new AIService(backend, {
 *   timeoutMs: 120_000,
 *   maxRetries: 3,
 *   telemetry: { keepRuns: 10 },
 * });
 *
 * const response = await service.call({ prompt: 'Summarize this codebase' });
 * console.log(response.text);
 *
 * const { logPath, summary } = await service.finalize('/path/to/project');
 * console.log(`Log written to ${logPath}, cost: $${summary.totalCostUsd}`);
 * ```
 */
export class AIService {
  /** The backend adapter used for CLI invocations */
  private readonly backend: AIBackend;

  /** Service configuration */
  private readonly options: AIServiceOptions;

  /** In-memory telemetry logger for this run */
  private readonly logger: TelemetryLogger;

  /** Running count of calls made (used for entry tracking) */
  private callCount: number = 0;

  /**
   * Create a new AI service instance.
   *
   * @param backend - The resolved backend adapter
   * @param options - Service configuration (timeout, retries, telemetry)
   */
  constructor(backend: AIBackend, options: AIServiceOptions) {
    this.backend = backend;
    this.options = options;
    this.logger = new TelemetryLogger(new Date().toISOString());
  }

  /**
   * Make an AI call with retry logic and telemetry recording.
   *
   * The call flow:
   * 1. Build CLI args via the backend adapter
   * 2. Wrap the subprocess invocation in retry logic
   * 3. On success: parse response via backend, record telemetry entry
   * 4. On failure: record error telemetry entry, throw the error
   *
   * Retries are attempted for `RATE_LIMIT` and `TIMEOUT` errors only.
   * All other errors are treated as permanent failures.
   *
   * @param options - The call options (prompt, model, timeout, etc.)
   * @returns The normalized AI response
   * @throws {AIServiceError} On timeout, rate limit exhaustion, parse error, or subprocess failure
   */
  async call(options: AICallOptions): Promise<AIResponse> {
    this.callCount++;
    const callStart = Date.now();
    const timestamp = new Date().toISOString();

    const args = this.backend.buildArgs(options);
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs;

    let retryCount = 0;

    try {
      const response = await withRetry(
        async () => {
          const result = await runSubprocess(this.backend.cliCommand, args, {
            timeoutMs,
            input: options.prompt,
          });

          if (result.timedOut) {
            throw new AIServiceError('TIMEOUT', 'Subprocess timed out');
          }

          if (result.exitCode !== 0) {
            if (isRateLimitStderr(result.stderr)) {
              throw new AIServiceError(
                'RATE_LIMIT',
                `Rate limited by ${this.backend.name}: ${result.stderr.slice(0, 200)}`,
              );
            }
            throw new AIServiceError(
              'SUBPROCESS_ERROR',
              `${this.backend.name} CLI exited with code ${result.exitCode}: ${result.stderr.slice(0, 500)}`,
            );
          }

          // Parse the response -- wrap in try/catch for parse errors
          try {
            return this.backend.parseResponse(result.stdout, result.durationMs, result.exitCode);
          } catch (error) {
            if (error instanceof AIServiceError) {
              throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            throw new AIServiceError('PARSE_ERROR', `Failed to parse response: ${message}`);
          }
        },
        {
          ...DEFAULT_RETRY_OPTIONS,
          maxRetries: this.options.maxRetries,
          isRetryable: (error: unknown): boolean => {
            return (
              error instanceof AIServiceError &&
              (error.code === 'RATE_LIMIT' || error.code === 'TIMEOUT')
            );
          },
          onRetry: (_attempt: number, _error: unknown) => {
            retryCount++;
          },
        },
      );

      // Compute cost via pricing engine
      const costResult = estimateCost(
        response.model,
        response.inputTokens,
        response.outputTokens,
        response.costUsd > 0 ? response.costUsd : undefined,
        this.options.pricingOverrides,
      );

      // Record successful call
      this.logger.addEntry({
        timestamp,
        prompt: options.prompt,
        systemPrompt: options.systemPrompt,
        response: response.text,
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cacheReadTokens: response.cacheReadTokens,
        cacheCreationTokens: response.cacheCreationTokens,
        costUsd: costResult.costUsd,
        latencyMs: response.durationMs,
        exitCode: response.exitCode,
        retryCount,
        thinking: 'not supported',
        filesRead: [],
        costSource: costResult.source,
      });

      return response;
    } catch (error) {
      // Record failed call
      const latencyMs = Date.now() - callStart;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.addEntry({
        timestamp,
        prompt: options.prompt,
        systemPrompt: options.systemPrompt,
        response: '',
        model: options.model ?? 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0,
        latencyMs,
        exitCode: 1,
        error: errorMessage,
        retryCount,
        thinking: 'not supported',
        filesRead: [],
        costSource: 'unavailable' as const,
      });

      throw error;
    }
  }

  /**
   * Finalize the run: write the run log to disk and clean up old files.
   *
   * Call this once at the end of a CLI invocation, after all `call()`
   * invocations have completed (or failed).
   *
   * @param projectRoot - Absolute path to the project root directory
   * @returns The log file path and the run summary
   */
  async finalize(projectRoot: string): Promise<{ logPath: string; summary: RunLog['summary'] }> {
    const runLog = this.logger.toRunLog();
    const logPath = await writeRunLog(projectRoot, runLog);
    await cleanupOldLogs(projectRoot, this.options.telemetry.keepRuns);
    return { logPath, summary: runLog.summary };
  }

  /**
   * Attach file-read metadata to the most recent telemetry entry.
   *
   * Called by the command runner after an AI call completes, to record
   * which source files were sent as context for that call.
   *
   * @param filesRead - Array of file-read records (path + size)
   */
  addFilesReadToLastEntry(filesRead: FileRead[]): void {
    this.logger.setFilesReadOnLastEntry(filesRead);
  }

  /**
   * Get the current run summary without finalizing.
   *
   * Useful for displaying progress during a run.
   *
   * @returns Current summary statistics
   */
  getSummary(): RunLog['summary'] {
    return this.logger.getSummary();
  }
}

/**
 * AI service orchestrator.
 *
 * The {@link AIService} class is the main entry point for making AI calls.
 * It wraps any {@link AIProvider} with retry logic, telemetry recording,
 * and optional subprocess log writing.
 *
 * For CLI usage, pass an {@link AIBackend} which is auto-wrapped in a
 * {@link SubprocessProvider}. For library usage, pass any custom
 * {@link AIProvider} implementation directly.
 *
 * @module
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { AIBackend, AIProvider, AICallOptions, AIResponse, SubprocessResult, RunLog, FileRead } from './types.js';
import { AIServiceError } from './types.js';
import { withRetry, DEFAULT_RETRY_OPTIONS } from './retry.js';
import { TelemetryLogger } from './telemetry/logger.js';
import { writeRunLog } from './telemetry/run-log.js';
import { cleanupOldLogs } from './telemetry/cleanup.js';
import { SubprocessProvider } from './providers/subprocess.js';
import type { ITraceWriter } from '../orchestration/trace.js';
import type { Logger } from '../core/logger.js';
import { nullLogger } from '../core/logger.js';

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
  /** Default model identifier (e.g., "sonnet", "opus") applied to all calls unless overridden per-call */
  model?: string;
  /** Command that triggered this run (e.g., "generate", "update", "specify", "rebuild") */
  command: string;
  /** Telemetry settings */
  telemetry: {
    /** Number of most recent run logs to keep on disk */
    keepRuns: number;
  };
}

// ---------------------------------------------------------------------------
// AIService
// ---------------------------------------------------------------------------

/**
 * Orchestrates AI calls with retry, timeout, and telemetry.
 *
 * Wraps any {@link AIProvider} with retry logic and telemetry recording.
 * Create one instance per run. Call {@link call} for each AI invocation.
 * Call {@link finalize} at the end to write the run log.
 *
 * @example
 * ```typescript
 * // CLI usage (backward compatible): pass AIBackend directly
 * import { AIService } from './service.js';
 * import { resolveBackend, createBackendRegistry } from './registry.js';
 *
 * const backend = await resolveBackend(createBackendRegistry(), 'auto');
 * const service = new AIService(backend, {
 *   timeoutMs: 120_000,
 *   maxRetries: 3,
 *   telemetry: { keepRuns: 10 },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Library usage: pass custom AIProvider
 * import { AIService } from './service.js';
 * import type { AIProvider } from './types.js';
 *
 * const provider: AIProvider = new MyCustomProvider();
 * const service = new AIService(provider, {
 *   timeoutMs: 120_000,
 *   maxRetries: 3,
 *   telemetry: { keepRuns: 10 },
 * });
 * ```
 */
export class AIService {
  /** The provider used for AI calls */
  private readonly provider: AIProvider;

  /** Service configuration */
  private readonly options: AIServiceOptions;

  /** In-memory telemetry logger for this run */
  private readonly logger: TelemetryLogger;

  /** Running count of calls made (used for entry tracking) */
  private callCount: number = 0;

  /** Trace writer for retry event tracing */
  private tracer: ITraceWriter | null = null;

  /** Whether debug mode is enabled */
  private debug: boolean = false;

  /** Directory for subprocess output logs (null = disabled) */
  private subprocessLogDir: string | null = null;

  /** Serializes log writes so concurrent workers don't interleave mkdirs */
  private logWriteQueue: Promise<void> = Promise.resolve();

  /** Debug/warn/error logger (injected; defaults to silent) */
  private readonly log: Logger;

  /** Backend reference kept for subprocess log writing (null when using custom provider) */
  private readonly backend: AIBackend | null;

  /**
   * Create a new AI service instance.
   *
   * Accepts either an {@link AIBackend} (auto-wrapped in {@link SubprocessProvider})
   * or a custom {@link AIProvider} implementation.
   *
   * @param providerOrBackend - An AIProvider or AIBackend
   * @param options - Service configuration (timeout, retries, telemetry)
   * @param debugLogger - Optional debug logger (defaults to nullLogger)
   */
  constructor(providerOrBackend: AIProvider | AIBackend, options: AIServiceOptions, debugLogger?: Logger) {
    this.options = options;
    this.log = debugLogger ?? nullLogger;

    // Auto-wrap AIBackend in SubprocessProvider for backward compatibility
    if (isAIBackend(providerOrBackend)) {
      this.backend = providerOrBackend;
      this.provider = new SubprocessProvider(providerOrBackend, {
        timeoutMs: options.timeoutMs,
        logger: this.log,
      });
      // Create logger with backend name, model, and command
      this.logger = new TelemetryLogger(
        new Date().toISOString(),
        providerOrBackend.name,
        options.model ?? 'unknown',
        options.command,
      );
    } else {
      this.backend = null;
      this.provider = providerOrBackend;
      // For custom providers, use 'custom' as backend name
      this.logger = new TelemetryLogger(
        new Date().toISOString(),
        'custom',
        options.model ?? 'unknown',
        options.command,
      );
    }
  }

  /**
   * Set the trace writer for retry event tracing.
   *
   * If the provider is a {@link SubprocessProvider}, also sets the tracer
   * on it for subprocess spawn/exit events.
   *
   * @param tracer - The trace writer instance
   */
  setTracer(tracer: ITraceWriter): void {
    this.tracer = tracer;
    // Forward to subprocess provider if applicable
    if (this.provider instanceof SubprocessProvider) {
      this.provider.setTracer(tracer);
    }
  }

  /**
   * Enable debug mode for verbose subprocess logging to stderr.
   */
  setDebug(enabled: boolean): void {
    this.debug = enabled;
  }

  /**
   * Set a directory for writing subprocess stdout/stderr log files.
   *
   * When set, each subprocess invocation writes a `.log` file containing
   * the metadata header, stdout, and stderr. Useful for diagnosing
   * timed-out or failed subprocesses whose output would otherwise be lost.
   *
   * @param dir - Absolute path to the log directory (created on first write)
   */
  setSubprocessLogDir(dir: string): void {
    this.subprocessLogDir = dir;
    // Forward to subprocess provider if applicable
    if (this.provider instanceof SubprocessProvider) {
      this.provider.setSubprocessLogDir(dir);
    }
  }

  /**
   * Make an AI call with retry logic and telemetry recording.
   *
   * The call flow:
   * 1. Merge service-level model default
   * 2. Delegate to the provider with retry wrapping
   * 3. On success: record telemetry entry
   * 4. On failure: record error telemetry entry, throw the error
   *
   * Retries are attempted for `RATE_LIMIT` errors only.
   *
   * @param options - The call options (prompt, model, timeout, etc.)
   * @returns The normalized AI response
   * @throws {AIServiceError} On timeout, rate limit exhaustion, parse error, or subprocess failure
   */
  async call(options: AICallOptions): Promise<AIResponse> {
    this.callCount++;
    const callStart = Date.now();
    const timestamp = new Date().toISOString();
    const taskLabel = options.taskLabel ?? 'unknown';

    // Merge service-level model as default (per-call options.model wins)
    const effectiveOptions: AICallOptions = {
      ...options,
      model: options.model ?? this.options.model,
    };

    let retryCount = 0;

    try {
      const response = await withRetry(
        async () => {
          return this.provider.call(effectiveOptions);
        },
        {
          ...DEFAULT_RETRY_OPTIONS,
          maxRetries: this.options.maxRetries,
          isRetryable: (error: unknown): boolean => {
            // Only retry rate limits. Timeouts are NOT retried because
            // spawning another heavyweight subprocess on a system that's
            // already struggling (or against an unresponsive API) makes
            // things worse and can exhaust system resources.
            return (
              error instanceof AIServiceError &&
              error.code === 'RATE_LIMIT'
            );
          },
          onRetry: (attempt: number, error: unknown) => {
            retryCount++;

            const errorCode = error instanceof AIServiceError ? error.code : 'UNKNOWN';

            // Always warn on retry (not just debug) -- retries are noteworthy
            this.log.warn(
              `[warn] Retrying "${taskLabel}" (attempt ${attempt}/${this.options.maxRetries}, reason: ${errorCode})`,
            );

            // Emit retry trace event
            if (this.tracer) {
              this.tracer.emit({
                type: 'retry',
                attempt,
                taskLabel,
                errorCode,
              });
            }
          },
        },
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
        latencyMs: response.durationMs,
        exitCode: response.exitCode,
        retryCount,
        thinking: 'not supported',
        filesRead: [],
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
        latencyMs,
        exitCode: 1,
        error: errorMessage,
        retryCount,
        thinking: 'not supported',
        filesRead: [],
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

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/**
 * Check whether the given object is an AIBackend (has buildArgs, parseResponse)
 * rather than an AIProvider (has only call).
 */
function isAIBackend(obj: AIProvider | AIBackend): obj is AIBackend {
  return 'buildArgs' in obj && 'parseResponse' in obj && 'cliCommand' in obj;
}

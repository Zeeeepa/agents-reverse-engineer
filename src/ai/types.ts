/**
 * Shared types for the AI service layer.
 *
 * Defines the contract for backends, responses, subprocess results,
 * retry configuration, and telemetry logging. Every AI service module
 * imports from this file.
 */

// ---------------------------------------------------------------------------
// Subprocess
// ---------------------------------------------------------------------------

/**
 * Result returned by the subprocess wrapper after a CLI process completes.
 *
 * Always populated -- even on error or timeout, the fields are filled
 * with whatever information was available.
 */
export interface SubprocessResult {
  /** Standard output captured from the child process */
  stdout: string;
  /** Standard error captured from the child process */
  stderr: string;
  /** Numeric exit code (0 = success, non-zero = failure) */
  exitCode: number;
  /** Signal that terminated the process, or `null` if it exited normally */
  signal: string | null;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  /** Whether the process was killed because it exceeded its timeout */
  timedOut: boolean;
  /** OS PID of the child process (undefined if spawn failed) */
  childPid?: number;
}

// ---------------------------------------------------------------------------
// AI Call
// ---------------------------------------------------------------------------

/**
 * Input options for an AI call.
 *
 * Only `prompt` is required; all other fields have backend-specific defaults.
 */
export interface AICallOptions {
  /** The prompt to send to the AI model */
  prompt: string;
  /** Optional system prompt to set context/behavior */
  systemPrompt?: string;
  /** Model identifier (e.g., "sonnet", "opus") -- backend interprets this */
  model?: string;
  /** Subprocess timeout in milliseconds (overrides config default) */
  timeoutMs?: number;
  /** Maximum number of agentic turns (backend-specific) */
  maxTurns?: number;
  /** Label for tracing (e.g., file path being processed) */
  taskLabel?: string;
}

/**
 * Normalized response from any AI CLI backend.
 *
 * Every backend adapter must parse its CLI's raw output into this shape
 * so that callers never need to know which backend was used.
 */
export interface AIResponse {
  /** The AI model's text response */
  text: string;
  /** Model identifier as reported by the backend */
  model: string;
  /** Number of input tokens consumed */
  inputTokens: number;
  /** Number of output tokens generated */
  outputTokens: number;
  /** Number of tokens served from cache reads */
  cacheReadTokens: number;
  /** Number of tokens written to cache */
  cacheCreationTokens: number;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  /** Process exit code from the CLI */
  exitCode: number;
  /** Original CLI JSON output for debugging */
  raw: unknown;
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

/**
 * Contract for an AI CLI backend adapter.
 *
 * Each supported CLI (Claude, Gemini, OpenCode) implements this interface.
 * The registry selects the appropriate backend at runtime.
 *
 * @example
 * ```typescript
 * const backend: AIBackend = new ClaudeBackend();
 * if (await backend.isAvailable()) {
 *   const args = backend.buildArgs({ prompt: 'Hello' });
 *   // spawn the process with backend.cliCommand and args
 * }
 * ```
 */
export interface AIBackend {
  /** Human-readable backend name (e.g., "Claude", "Gemini") */
  readonly name: string;
  /** CLI executable name on PATH (e.g., "claude", "gemini") */
  readonly cliCommand: string;

  /** Check whether this backend's CLI is available on PATH */
  isAvailable(): Promise<boolean>;

  /** Build the CLI argument array for a given call */
  buildArgs(options: AICallOptions): string[];

  /** Parse the CLI's stdout into a normalized {@link AIResponse} */
  parseResponse(stdout: string, durationMs: number, exitCode: number): AIResponse;

  /** Get user-facing install instructions when the CLI is not found */
  getInstallInstructions(): string;
}

// ---------------------------------------------------------------------------
// Retry
// ---------------------------------------------------------------------------

/**
 * Configuration for the retry utility.
 *
 * Controls exponential backoff timing and which errors are retryable.
 */
export interface RetryOptions {
  /** Maximum number of retries (e.g., 3 means up to 4 total attempts) */
  maxRetries: number;
  /** Base delay in milliseconds before first retry */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds */
  maxDelayMs: number;
  /** Exponential multiplier applied to the base delay */
  multiplier: number;
  /** Predicate that returns `true` if the error is transient and retryable */
  isRetryable: (error: unknown) => boolean;
  /** Optional callback invoked before each retry attempt */
  onRetry?: (attempt: number, error: unknown) => void;
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

/**
 * Record of a single file read that was sent as context to an AI call.
 */
export interface FileRead {
  /** File path relative to project root */
  path: string;
  /** File size in bytes at time of read */
  sizeBytes: number;
}

/**
 * Per-call telemetry log entry.
 *
 * Captures everything needed to replay or debug a single AI call
 * without re-running it.
 */
export interface TelemetryEntry {
  /** ISO 8601 timestamp when the call was initiated */
  timestamp: string;
  /** The prompt that was sent */
  prompt: string;
  /** The system prompt, if one was used */
  systemPrompt?: string;
  /** The AI model's text response */
  response: string;
  /** Model identifier */
  model: string;
  /** Number of input tokens consumed */
  inputTokens: number;
  /** Number of output tokens generated */
  outputTokens: number;
  /** Number of tokens served from cache reads */
  cacheReadTokens: number;
  /** Number of tokens written to cache */
  cacheCreationTokens: number;
  /** Wall-clock latency in milliseconds */
  latencyMs: number;
  /** Process exit code */
  exitCode: number;
  /** Error message, if the call failed */
  error?: string;
  /** Number of retries that occurred before this result */
  retryCount: number;
  /** AI thinking/reasoning content. "not supported" when backend doesn't provide it */
  thinking: string;
  /** Files sent as context for this call */
  filesRead: FileRead[];
}

/**
 * Per-run log file structure.
 *
 * Aggregates all {@link TelemetryEntry} instances for a single CLI run,
 * plus a computed summary for quick performance review.
 */
export interface RunLog {
  /** Unique run identifier (ISO timestamp-based) */
  runId: string;
  /** ISO 8601 timestamp when the run started */
  startTime: string;
  /** ISO 8601 timestamp when the run finished */
  endTime: string;
  /** All individual call entries */
  entries: TelemetryEntry[];
  /** Aggregated summary across all entries */
  summary: {
    /** Total number of AI calls made */
    totalCalls: number;
    /** Sum of input tokens across all calls */
    totalInputTokens: number;
    /** Sum of output tokens across all calls */
    totalOutputTokens: number;
    /** Total wall-clock duration in milliseconds */
    totalDurationMs: number;
    /** Number of calls that resulted in an error */
    errorCount: number;
    /** Total file reads across all calls (including duplicates) */
    totalFilesRead: number;
    /** Unique files read (deduped by path) */
    uniqueFilesRead: number;
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Error codes for typed error handling in the AI service layer */
export type AIServiceErrorCode =
  | 'CLI_NOT_FOUND'
  | 'TIMEOUT'
  | 'PARSE_ERROR'
  | 'SUBPROCESS_ERROR'
  | 'RATE_LIMIT';

/**
 * Typed error for AI service failures.
 *
 * Carries a machine-readable {@link AIServiceErrorCode} so callers can
 * branch on the error type without parsing message strings.
 *
 * @example
 * ```typescript
 * try {
 *   await callAI(options);
 * } catch (error) {
 *   if (error instanceof AIServiceError && error.code === 'RATE_LIMIT') {
 *     // handle rate limiting
 *   }
 * }
 * ```
 */
export class AIServiceError extends Error {
  /** Machine-readable error code */
  readonly code: AIServiceErrorCode;

  constructor(code: AIServiceErrorCode, message: string) {
    super(message);
    this.name = 'AIServiceError';
    this.code = code;
  }
}

/**
 * Subprocess-based AI provider.
 *
 * Wraps an {@link AIBackend} to implement the {@link AIProvider} interface
 * by spawning CLI subprocesses. This is the default provider used by the
 * CLI commands and preserves the existing behavior exactly.
 *
 * @module
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { AIProvider, AIBackend, AICallOptions, AIResponse } from '../types.js';
import { AIServiceError } from '../types.js';
import { runSubprocess } from '../subprocess.js';
import type { SubprocessResult } from '../types.js';
import type { ITraceWriter } from '../../orchestration/trace.js';
import type { Logger } from '../../core/logger.js';
import { nullLogger } from '../../core/logger.js';

/** Patterns in stderr that indicate a transient rate-limit error */
const RATE_LIMIT_PATTERNS = [
  'rate limit',
  '429',
  'too many requests',
  'overloaded',
];

function isRateLimitStderr(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return RATE_LIMIT_PATTERNS.some((pattern) => lower.includes(pattern));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Options for the subprocess provider.
 */
export interface SubprocessProviderOptions {
  /** Default subprocess timeout in milliseconds */
  timeoutMs: number;
  /** Whether debug mode is enabled */
  debug?: boolean;
  /** Logger for debug/warn output */
  logger?: Logger;
  /** Trace writer for subprocess events */
  tracer?: ITraceWriter | null;
}

/**
 * AI provider that spawns CLI subprocesses via an {@link AIBackend}.
 *
 * This is the provider used by existing CLI commands. It preserves the
 * exact subprocess spawning, timeout enforcement, rate-limit detection,
 * and response parsing behavior.
 *
 * @example
 * ```typescript
 * import { SubprocessProvider } from './providers/subprocess.js';
 * import { ClaudeBackend } from '../backends/claude.js';
 *
 * const provider = new SubprocessProvider(new ClaudeBackend(), {
 *   timeoutMs: 120_000,
 * });
 * const response = await provider.call({ prompt: 'Hello' });
 * ```
 */
export class SubprocessProvider implements AIProvider {
  readonly backend: AIBackend;
  private readonly timeoutMs: number;
  private readonly debug: boolean;
  private readonly log: Logger;
  private tracer: ITraceWriter | null;

  /** Number of currently active subprocesses (for debug logging) */
  private activeCount: number = 0;

  /** Directory for subprocess output logs (null = disabled) */
  private subprocessLogDir: string | null = null;

  /** Serializes log writes so concurrent workers don't interleave mkdirs */
  private logWriteQueue: Promise<void> = Promise.resolve();

  constructor(backend: AIBackend, options: SubprocessProviderOptions) {
    this.backend = backend;
    this.timeoutMs = options.timeoutMs;
    this.debug = options.debug ?? false;
    this.log = options.logger ?? nullLogger;
    this.tracer = options.tracer ?? null;
  }

  /**
   * Set the trace writer (allows late binding after construction).
   */
  setTracer(tracer: ITraceWriter): void {
    this.tracer = tracer;
  }

  /**
   * Set a directory for writing subprocess stdout/stderr log files.
   */
  setSubprocessLogDir(dir: string): void {
    this.subprocessLogDir = dir;
  }

  async call(options: AICallOptions): Promise<AIResponse> {
    const taskLabel = options.taskLabel ?? 'unknown';
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const args = this.backend.buildArgs(options);

    if (this.debug) {
      const mem = process.memoryUsage();
      this.log.debug(
        `[debug] Spawning subprocess for "${taskLabel}" ` +
        `(active: ${this.activeCount}, ` +
        `heapUsed: ${formatBytes(mem.heapUsed)}, ` +
        `rss: ${formatBytes(mem.rss)}, ` +
        `timeout: ${(timeoutMs / 1000).toFixed(0)}s)`,
      );
    }

    this.activeCount++;

    const stdinInput = this.backend.composeStdinInput?.(options) ?? options.prompt;

    const envOverrides = this.getEnvOverrides();

    if (this.debug && envOverrides?.CODEX_HOME) {
      this.log.debug(`[debug] Using CODEX_HOME override: ${envOverrides.CODEX_HOME}`);
    }

    const result = await runSubprocess(this.backend.cliCommand, args, {
      timeoutMs,
      input: stdinInput,
      env: envOverrides,
      onSpawn: (pid) => {
        this.tracer?.emit({
          type: 'subprocess:spawn',
          childPid: pid ?? -1,
          command: this.backend.cliCommand,
          taskLabel,
        });
      },
    });

    this.activeCount--;

    // Emit subprocess:exit trace
    if (this.tracer && result.childPid !== undefined) {
      this.tracer.emit({
        type: 'subprocess:exit',
        childPid: result.childPid,
        command: this.backend.cliCommand,
        taskLabel,
        exitCode: result.exitCode,
        signal: result.signal,
        durationMs: result.durationMs,
        timedOut: result.timedOut,
      });
    }

    // Write subprocess output log (fire-and-forget, non-critical)
    this.enqueueSubprocessLog(result, taskLabel);

    if (result.timedOut) {
      this.log.warn(
        `[warn] Subprocess timed out after ${(result.durationMs / 1000).toFixed(1)}s ` +
        `for "${taskLabel}" (PID ${result.childPid ?? 'unknown'}, ` +
        `timeout was ${(timeoutMs / 1000).toFixed(0)}s)`,
      );
      throw new AIServiceError('TIMEOUT', 'Subprocess timed out');
    }

    if (this.debug) {
      this.log.debug(
        `[debug] Subprocess exited for "${taskLabel}" ` +
        `(PID ${result.childPid ?? 'unknown'}, ` +
        `exitCode: ${result.exitCode}, ` +
        `duration: ${(result.durationMs / 1000).toFixed(1)}s, ` +
        `active: ${this.activeCount})`,
      );
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

    // Parse the response
    try {
      return this.backend.parseResponse(result.stdout, result.durationMs, result.exitCode);
    } catch (error) {
      if (error instanceof AIServiceError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new AIServiceError('PARSE_ERROR', `Failed to parse response: ${message}`);
    }
  }

  /**
   * Resolve optional environment overrides for backend subprocesses.
   *
   * For Codex, prefer project-local `.codex` when present and `CODEX_HOME`
   * isn't already set by the user.
   */
  private getEnvOverrides(): NodeJS.ProcessEnv | undefined {
    if (this.backend.cliCommand !== 'codex') {
      return undefined;
    }

    if (process.env.CODEX_HOME && process.env.CODEX_HOME.trim().length > 0) {
      return undefined;
    }

    const localCodexHome = path.join(process.cwd(), '.codex');
    if (!existsSync(localCodexHome)) {
      return undefined;
    }

    return {
      CODEX_HOME: localCodexHome,
    };
  }

  /**
   * Enqueue a subprocess output log write.
   *
   * Serializes writes via a promise chain to avoid concurrent mkdir races.
   * Failures are silently swallowed -- log writing is non-critical.
   */
  private enqueueSubprocessLog(result: SubprocessResult, taskLabel: string): void {
    if (this.subprocessLogDir === null) return;

    const dir = this.subprocessLogDir;
    const sanitized = taskLabel.replace(/\//g, '--').replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${sanitized}_pid${result.childPid ?? 0}.log`;
    const filePath = path.join(dir, filename);

    const content =
      `task:      ${taskLabel}\n` +
      `pid:       ${result.childPid ?? 'unknown'}\n` +
      `command:   ${this.backend.cliCommand}\n` +
      `exit:      ${result.exitCode}\n` +
      `signal:    ${result.signal ?? 'none'}\n` +
      `duration:  ${result.durationMs}ms\n` +
      `timed_out: ${result.timedOut}\n` +
      `\n--- stdout ---\n` +
      result.stdout +
      `\n--- stderr ---\n` +
      result.stderr;

    this.logWriteQueue = this.logWriteQueue
      .then(async () => {
        await mkdir(dir, { recursive: true });
        await writeFile(filePath, content, 'utf-8');
      })
      .catch(() => { /* non-critical -- log loss is acceptable */ });
  }
}

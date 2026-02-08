/**
 * Low-level subprocess wrapper for AI CLI invocations.
 *
 * This is the ONLY place in the codebase that spawns AI CLI processes.
 * Centralizes timeout enforcement, stdin piping, zombie prevention,
 * SIGKILL escalation, and exit code extraction.
 *
 * @module
 */

import { execFile } from 'node:child_process';
import type { SubprocessResult } from './types.js';

/** Grace period after SIGTERM before escalating to SIGKILL (ms) */
const SIGKILL_GRACE_MS = 5_000;

/**
 * Options for subprocess execution.
 */
export interface SubprocessOptions {
  /** Maximum time in milliseconds before the process is killed */
  timeoutMs: number;
  /** Optional stdin input to pipe to the process */
  input?: string;
  /**
   * Callback fired synchronously when the child process is spawned.
   * Use this for trace events that need the actual spawn time.
   */
  onSpawn?: (pid: number | undefined) => void;
}

/**
 * Spawn a CLI subprocess with timeout enforcement and stdin piping.
 *
 * Always resolves -- never rejects. Errors are captured in the returned
 * {@link SubprocessResult} fields (`exitCode`, `timedOut`, `stderr`) so
 * that callers can decide how to handle failures.
 *
 * When the subprocess exceeds its timeout, `execFile` sends SIGTERM.
 * If the process doesn't exit within {@link SIGKILL_GRACE_MS} after
 * SIGTERM, we escalate to SIGKILL to prevent hung processes from
 * lingering indefinitely.
 *
 * @param command - The CLI executable to run (e.g., "claude", "gemini")
 * @param args - Argument array passed to the executable
 * @param options - Timeout, optional stdin input, and spawn callback
 * @returns Resolved result with stdout, stderr, exit code, timing, and timeout flag
 *
 * @example
 * ```typescript
 * import { runSubprocess } from './subprocess.js';
 *
 * const result = await runSubprocess('claude', ['-p', '--output-format', 'json'], {
 *   timeoutMs: 120_000,
 *   input: 'Summarize this codebase',
 *   onSpawn: (pid) => console.log(`Spawned PID ${pid}`),
 * });
 *
 * if (result.timedOut) {
 *   console.error('CLI timed out after 120s');
 * } else if (result.exitCode !== 0) {
 *   console.error('CLI failed:', result.stderr);
 * } else {
 *   const response = JSON.parse(result.stdout);
 * }
 * ```
 */
export function runSubprocess(
  command: string,
  args: string[],
  options: SubprocessOptions,
): Promise<SubprocessResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let sigkillTimer: ReturnType<typeof setTimeout> | undefined;

    const child = execFile(
      command,
      args,
      {
        timeout: options.timeoutMs,
        killSignal: 'SIGTERM',
        maxBuffer: 10 * 1024 * 1024, // 10MB for large AI responses
        encoding: 'utf-8',
        env: { ...process.env, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' },
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;

        // Clear SIGKILL escalation timer -- process has exited
        if (sigkillTimer !== undefined) clearTimeout(sigkillTimer);

        // Detect timeout: execFile sets `killed = true` when the process
        // is terminated due to exceeding the timeout option.
        const timedOut = error !== null && 'killed' in error && error.killed === true;

        // Extract exit code from the error or child process.
        // execFile puts the exit code in error.code when the process exits
        // with a non-zero code, but error.code can also be a string like
        // 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'. Fall back to child.exitCode,
        // then default to 1 for unknown failures and 0 for no error.
        let exitCode: number;
        if (error === null) {
          exitCode = 0;
        } else if (typeof error.code === 'number') {
          exitCode = error.code;
        } else if (child.exitCode !== null) {
          exitCode = child.exitCode;
        } else {
          exitCode = 1;
        }

        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode,
          signal: (error !== null && 'signal' in error ? error.signal as string : null) ?? null,
          durationMs,
          timedOut,
          childPid: child.pid,
        });
      },
    );

    // Notify caller of spawn (for trace events at actual spawn time)
    options.onSpawn?.(child.pid);

    // SIGKILL escalation: if the process doesn't exit within
    // timeout + grace period, force-kill it. This handles cases where
    // SIGTERM is caught/ignored by the child or its process tree.
    if (child.pid !== undefined) {
      sigkillTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Process may already be dead -- ignore
        }
      }, options.timeoutMs + SIGKILL_GRACE_MS);

      // Don't let this timer keep the event loop alive
      sigkillTimer.unref();
    }

    // Write prompt to stdin if provided, then close the stream.
    // IMPORTANT: Always call .end() -- the child process blocks waiting
    // for EOF on stdin otherwise (see RESEARCH.md Pitfall 1).
    if (options.input !== undefined && child.stdin !== null) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
  });
}

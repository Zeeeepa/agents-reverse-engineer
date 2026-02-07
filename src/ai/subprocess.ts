/**
 * Low-level subprocess wrapper for AI CLI invocations.
 *
 * This is the ONLY place in the codebase that spawns AI CLI processes.
 * Centralizes timeout enforcement, stdin piping, zombie prevention,
 * and exit code extraction.
 *
 * @module
 */

import { execFile } from 'node:child_process';
import type { SubprocessResult } from './types.js';

/**
 * Spawn a CLI subprocess with timeout enforcement and stdin piping.
 *
 * Always resolves -- never rejects. Errors are captured in the returned
 * {@link SubprocessResult} fields (`exitCode`, `timedOut`, `stderr`) so
 * that callers can decide how to handle failures.
 *
 * @param command - The CLI executable to run (e.g., "claude", "gemini")
 * @param args - Argument array passed to the executable
 * @param options - Timeout and optional stdin input
 * @returns Resolved result with stdout, stderr, exit code, timing, and timeout flag
 *
 * @example
 * ```typescript
 * import { runSubprocess } from './subprocess.js';
 *
 * const result = await runSubprocess('claude', ['-p', '--output-format', 'json'], {
 *   timeoutMs: 120_000,
 *   input: 'Summarize this codebase',
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
  options: { timeoutMs: number; input?: string },
): Promise<SubprocessResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const child = execFile(
      command,
      args,
      {
        timeout: options.timeoutMs,
        killSignal: 'SIGTERM',
        maxBuffer: 10 * 1024 * 1024, // 10MB for large AI responses
        encoding: 'utf-8',
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;

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
        });
      },
    );

    // Write prompt to stdin if provided, then close the stream.
    // IMPORTANT: Always call .end() -- the child process blocks waiting
    // for EOF on stdin otherwise (see RESEARCH.md Pitfall 1).
    if (options.input !== undefined && child.stdin !== null) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
  });
}

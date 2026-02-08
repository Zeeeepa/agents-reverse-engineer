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
 * Track active subprocesses for debugging concurrency.
 * Maps PID to spawn timestamp and command.
 */
const activeSubprocesses = new Map<number, { command: string; spawnedAt: number }>();

/**
 * Get current count of active subprocesses.
 */
export function getActiveSubprocessCount(): number {
  return activeSubprocesses.size;
}

/**
 * Get details of all active subprocesses.
 */
export function getActiveSubprocesses(): Array<{ pid: number; command: string; spawnedAt: number; runningMs: number }> {
  const now = Date.now();
  return Array.from(activeSubprocesses.entries()).map(([pid, info]) => ({
    pid,
    command: info.command,
    spawnedAt: info.spawnedAt,
    runningMs: now - info.spawnedAt,
  }));
}

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

    const activeCount = activeSubprocesses.size;
    console.error(`[subprocess] Currently active: ${activeCount} subprocess(es)`);
    console.error(`[subprocess] Spawning: ${command} ${args.join(' ')}`);

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
        console.error(`[subprocess:${child.pid}] Callback fired after ${durationMs}ms`);

        // Clear SIGKILL escalation timer -- process has exited
        if (sigkillTimer !== undefined) {
          console.error(`[subprocess:${child.pid}] Clearing SIGKILL timer`);
          clearTimeout(sigkillTimer);
        }

        // Ensure the process is fully terminated (no-op if already dead)
        // This handles edge cases where child processes might still be running
        console.error(`[subprocess:${child.pid}] Attempting explicit SIGKILL cleanup`);
        try {
          if (child.pid !== undefined) {
            process.kill(child.pid, 'SIGKILL');
            console.error(`[subprocess:${child.pid}] Sent SIGKILL`);
          }
        } catch (killError) {
          // Process is already dead or doesn't exist -- expected in most cases
          console.error(`[subprocess:${child.pid}] SIGKILL failed (process already dead): ${killError instanceof Error ? killError.message : String(killError)}`);
        }

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

        console.error(`[subprocess:${child.pid}] Exited: code=${exitCode}, timedOut=${timedOut}, signal=${error !== null && 'signal' in error ? error.signal : null}`);

        // Remove from active tracking
        if (child.pid !== undefined) {
          activeSubprocesses.delete(child.pid);
          console.error(`[subprocess:${child.pid}] Removed from active list (remaining: ${activeSubprocesses.size})`);
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

    console.error(`[subprocess:${child.pid}] Spawned with PID ${child.pid}`);

    // Track this subprocess
    if (child.pid !== undefined) {
      activeSubprocesses.set(child.pid, {
        command: `${command} ${args.join(' ')}`,
        spawnedAt: startTime,
      });
      console.error(`[subprocess:${child.pid}] Registered in active list (total: ${activeSubprocesses.size})`);
    }

    // Notify caller of spawn (for trace events at actual spawn time)
    options.onSpawn?.(child.pid);
    console.error(`[subprocess:${child.pid}] onSpawn callback invoked`);

    // SIGKILL escalation: if the process doesn't exit within
    // timeout + grace period, force-kill it. This handles cases where
    // SIGTERM is caught/ignored by the child or its process tree.
    if (child.pid !== undefined) {
      const killDelay = options.timeoutMs + SIGKILL_GRACE_MS;
      console.error(`[subprocess:${child.pid}] Setting SIGKILL timer for ${killDelay}ms (timeout=${options.timeoutMs}ms + grace=${SIGKILL_GRACE_MS}ms)`);

      sigkillTimer = setTimeout(() => {
        console.error(`[subprocess:${child.pid}] SIGKILL timer fired - process exceeded timeout+grace`);
        try {
          child.kill('SIGKILL');
          console.error(`[subprocess:${child.pid}] Sent escalation SIGKILL`);
        } catch (killError) {
          // Process may already be dead -- ignore
          console.error(`[subprocess:${child.pid}] Escalation SIGKILL failed: ${killError instanceof Error ? killError.message : String(killError)}`);
        }
      }, killDelay);

      // Don't let this timer keep the event loop alive
      sigkillTimer.unref();
      console.error(`[subprocess:${child.pid}] SIGKILL timer unref'd`);
    }

    // Write prompt to stdin if provided, then close the stream.
    // IMPORTANT: Always call .end() -- the child process blocks waiting
    // for EOF on stdin otherwise (see RESEARCH.md Pitfall 1).
    if (options.input !== undefined && child.stdin !== null) {
      const inputSize = Buffer.byteLength(options.input, 'utf-8');
      console.error(`[subprocess:${child.pid}] Writing ${inputSize} bytes to stdin`);
      child.stdin.write(options.input);
      child.stdin.end();
      console.error(`[subprocess:${child.pid}] Stdin closed`);
    } else {
      console.error(`[subprocess:${child.pid}] No stdin input provided`);
    }
  });
}

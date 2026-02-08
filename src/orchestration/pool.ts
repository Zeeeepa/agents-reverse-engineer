/**
 * Iterator-based concurrency pool.
 *
 * Provides a zero-dependency concurrency limiter using the shared-iterator
 * worker pattern. Workers pull from a shared iterator so exactly N tasks
 * execute concurrently, with new tasks starting as previous ones complete.
 *
 * This avoids the "batch" anti-pattern where `Promise.all` on chunks of N
 * tasks idles workers while waiting for the slowest task in each batch.
 *
 * @module
 */

import type { ITraceWriter } from './trace.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options for the concurrency pool.
 */
export interface PoolOptions {
  /** Maximum number of concurrent workers */
  concurrency: number;
  /** Stop pulling new tasks on first error */
  failFast?: boolean;
  /** Trace writer for concurrency debugging (no-op when tracing is off) */
  tracer?: ITraceWriter;
  /** Phase label for trace events (e.g., 'phase-1-files') */
  phaseLabel?: string;
  /** Labels for each task by index (e.g., file paths). Used in trace events. */
  taskLabels?: string[];
}

/**
 * Result of a single task execution within the pool.
 *
 * Indexed by the task's position in the original array so callers
 * can correlate results back to their inputs.
 */
export interface TaskResult<T> {
  /** Zero-based index of the task in the original array */
  index: number;
  /** Whether the task completed successfully */
  success: boolean;
  /** The resolved value (present when success is true) */
  value?: T;
  /** The error (present when success is false) */
  error?: Error;
}

// ---------------------------------------------------------------------------
// Pool implementation
// ---------------------------------------------------------------------------

/**
 * Run an array of async task factories through a concurrency-limited pool.
 *
 * Uses the shared-iterator pattern: all workers iterate over the same
 * `entries()` iterator, so each task is picked up by exactly one worker.
 * When a worker finishes a task, it immediately pulls the next one from
 * the iterator, keeping all worker slots busy.
 *
 * @typeParam T - The resolved type of each task
 * @param tasks - Array of zero-argument async functions to execute
 * @param options - Pool configuration (concurrency, failFast, tracing)
 * @param onComplete - Optional callback invoked after each task settles
 * @returns Array of results indexed by original task position (may be sparse if aborted)
 *
 * @example
 * ```typescript
 * const results = await runPool(
 *   urls.map(url => () => fetch(url).then(r => r.json())),
 *   { concurrency: 5, failFast: false },
 *   (result) => console.log(`Task ${result.index}: ${result.success}`),
 * );
 * ```
 */
export async function runPool<T>(
  tasks: Array<() => Promise<T>>,
  options: PoolOptions,
  onComplete?: (result: TaskResult<T>) => void,
): Promise<TaskResult<T>[]> {
  const results: TaskResult<T>[] = [];

  if (tasks.length === 0) {
    return results;
  }

  const tracer = options.tracer;
  const phase = options.phaseLabel ?? 'unknown';
  const taskLabels = options.taskLabels;

  // Shared abort flag -- workers check before pulling next task
  let aborted = false;

  // Active task counter for trace snapshots
  let activeTasks = 0;

  async function worker(
    iterator: IterableIterator<[number, () => Promise<T>]>,
    workerId: number,
  ): Promise<void> {
    let tasksExecuted = 0;

    tracer?.emit({ type: 'worker:start', workerId, phase });

    for (const [index, task] of iterator) {
      if (aborted) break;

      activeTasks++;
      const taskStart = Date.now();
      const label = taskLabels?.[index] ?? `task-${index}`;

      tracer?.emit({
        type: 'task:pickup',
        workerId,
        taskIndex: index,
        taskLabel: label,
        activeTasks,
      });

      try {
        const value = await task();
        activeTasks--;
        tasksExecuted++;

        tracer?.emit({
          type: 'task:done',
          workerId,
          taskIndex: index,
          taskLabel: label,
          durationMs: Date.now() - taskStart,
          success: true,
          activeTasks,
        });

        const result: TaskResult<T> = { index, success: true, value };
        results[index] = result;
        onComplete?.(result);
      } catch (err) {
        activeTasks--;
        tasksExecuted++;

        const error = err instanceof Error ? err : new Error(String(err));

        tracer?.emit({
          type: 'task:done',
          workerId,
          taskIndex: index,
          taskLabel: label,
          durationMs: Date.now() - taskStart,
          success: false,
          error: error.message,
          activeTasks,
        });

        const result: TaskResult<T> = { index, success: false, error };
        results[index] = result;
        onComplete?.(result);

        if (options.failFast) {
          aborted = true;
          break;
        }
      }
    }

    tracer?.emit({ type: 'worker:end', workerId, phase, tasksExecuted });
  }

  // Spawn workers, capped at the number of available tasks
  const effectiveConcurrency = Math.min(options.concurrency, tasks.length);
  const iterator = tasks.entries();
  const workers = Array.from({ length: effectiveConcurrency }, (_, workerId) =>
    worker(iterator, workerId),
  );

  await Promise.allSettled(workers);

  return results;
}

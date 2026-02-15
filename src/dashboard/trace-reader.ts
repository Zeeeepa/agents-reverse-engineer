/**
 * Trace file reader for the dashboard.
 *
 * Stream-parses NDJSON trace files from `.agents-reverse-engineer/traces/`
 * and reconstructs timeline data for visualization.
 *
 * @module
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { TraceEvent } from '../orchestration/trace.js';

/** Directory for trace files (relative to project root) */
const TRACES_DIR = '.agents-reverse-engineer/traces';

/** Parsed trace containing all events and derived timeline data */
export interface ParsedTrace {
  /** Trace file path */
  filePath: string;
  /** All events in sequence order */
  events: TraceEvent[];
  /** Phase timeline reconstructed from events */
  phases: PhaseTimeline[];
  /** Total elapsed time in ms */
  totalElapsedMs: number;
}

/** Timeline data for a single phase */
export interface PhaseTimeline {
  /** Phase name (e.g., "phase-1-files") */
  phase: string;
  /** Start elapsed time (ms from run start) */
  startMs: number;
  /** End elapsed time (ms from run start) */
  endMs: number;
  /** Duration in ms */
  durationMs: number;
  /** Concurrency level */
  concurrency: number;
  /** Total tasks in this phase */
  taskCount: number;
  /** Tasks completed successfully */
  tasksCompleted: number;
  /** Tasks that failed */
  tasksFailed: number;
  /** Worker timelines */
  workers: WorkerTimeline[];
}

/** Timeline data for a single worker within a phase */
export interface WorkerTimeline {
  /** Worker ID */
  workerId: number;
  /** Tasks executed by this worker */
  tasks: TaskSpan[];
}

/** Time span for a single task execution */
export interface TaskSpan {
  /** Task label (typically a file path) */
  label: string;
  /** Task index in the phase */
  taskIndex: number;
  /** Start elapsed time (ms from run start) */
  startMs: number;
  /** End elapsed time (ms from run start) */
  endMs: number;
  /** Duration in ms */
  durationMs: number;
  /** Whether the task succeeded */
  success: boolean;
}

/**
 * List all trace files, newest first.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @returns Array of absolute paths to trace files
 */
export async function listTraceFiles(projectRoot: string): Promise<string[]> {
  const tracesDir = path.join(projectRoot, TRACES_DIR);

  let entries: string[];
  try {
    const allEntries = await fs.readdir(tracesDir);
    entries = allEntries.filter(
      (name) => name.startsWith('trace-') && name.endsWith('.ndjson'),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  // Sort newest first (ISO timestamps sort lexicographically)
  entries.sort();
  entries.reverse();

  return entries.map((name) => path.join(tracesDir, name));
}

/**
 * Parse a trace NDJSON file into structured timeline data.
 *
 * Uses readline for line-by-line streaming to avoid loading
 * large trace files entirely into memory.
 *
 * @param filePath - Absolute path to the trace NDJSON file
 * @returns Parsed trace with events and reconstructed timeline
 */
export async function parseTraceFile(filePath: string): Promise<ParsedTrace> {
  const events: TraceEvent[] = [];

  const rl = createInterface({
    input: createReadStream(filePath, 'utf-8'),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as TraceEvent);
    } catch {
      // Skip malformed lines
    }
  }

  const phases = reconstructPhases(events);
  const lastEvent = events[events.length - 1];
  const totalElapsedMs = lastEvent?.elapsedMs ?? 0;

  return { filePath, events, phases, totalElapsedMs };
}

/**
 * Find a trace file by partial timestamp match.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param query - Partial timestamp to match in the filename
 * @returns Absolute path to the matching trace file, or null
 */
export async function findTraceFile(projectRoot: string, query: string): Promise<string | null> {
  const files = await listTraceFiles(projectRoot);
  return files.find((f) => f.includes(query)) ?? null;
}

/**
 * Reconstruct phase timelines from a flat event stream.
 *
 * Associates tasks with the phase that was active when the task was picked up,
 * using worker:start events to track which phase each worker belongs to.
 */
function reconstructPhases(events: TraceEvent[]): PhaseTimeline[] {
  const phases: PhaseTimeline[] = [];
  const phaseStarts = new Map<string, { startMs: number; concurrency: number; taskCount: number }>();
  const workerTasks = new Map<string, Map<number, TaskSpan[]>>();
  // Track which phase each worker is currently assigned to
  const workerPhase = new Map<number, string>();
  // Track which phase a pending task belongs to (keyed by "workerId:taskIndex")
  const pendingTasks = new Map<string, { span: TaskSpan; phase: string }>();

  for (const event of events) {
    switch (event.type) {
      case 'phase:start': {
        phaseStarts.set(event.phase, {
          startMs: event.elapsedMs,
          concurrency: event.concurrency,
          taskCount: event.taskCount,
        });
        workerTasks.set(event.phase, new Map());
        break;
      }

      case 'phase:end': {
        const start = phaseStarts.get(event.phase);
        if (!start) break;

        const workers = workerTasks.get(event.phase) ?? new Map();
        const workerTimelines: WorkerTimeline[] = [];
        for (const [workerId, tasks] of workers) {
          workerTimelines.push({ workerId, tasks });
        }
        workerTimelines.sort((a, b) => a.workerId - b.workerId);

        phases.push({
          phase: event.phase,
          startMs: start.startMs,
          endMs: event.elapsedMs,
          durationMs: event.durationMs,
          concurrency: start.concurrency,
          taskCount: start.taskCount,
          tasksCompleted: event.tasksCompleted,
          tasksFailed: event.tasksFailed,
          workers: workerTimelines,
        });

        // Clear worker assignments for this phase
        for (const [wId, phase] of workerPhase) {
          if (phase === event.phase) workerPhase.delete(wId);
        }
        break;
      }

      case 'worker:start': {
        workerPhase.set(event.workerId, event.phase);
        break;
      }

      case 'task:pickup': {
        const key = `${event.workerId}:${event.taskIndex}`;
        const phase = workerPhase.get(event.workerId) ?? '';
        pendingTasks.set(key, {
          span: {
            label: event.taskLabel,
            taskIndex: event.taskIndex,
            startMs: event.elapsedMs,
            endMs: event.elapsedMs,
            durationMs: 0,
            success: true,
          },
          phase,
        });
        break;
      }

      case 'task:done': {
        const key = `${event.workerId}:${event.taskIndex}`;
        const pending = pendingTasks.get(key);
        if (pending) {
          pending.span.endMs = event.elapsedMs;
          pending.span.durationMs = event.durationMs;
          pending.span.success = event.success;
          pendingTasks.delete(key);

          // Add to the phase the task was picked up in
          const workers = workerTasks.get(pending.phase);
          if (workers) {
            if (!workers.has(event.workerId)) {
              workers.set(event.workerId, []);
            }
            workers.get(event.workerId)!.push(pending.span);
          }
        }
        break;
      }
    }
  }

  return phases;
}

/**
 * Extract a short display ID from a trace filename.
 *
 * Converts "trace-2026-02-14T13-46-11-934Z.ndjson" to "2026-02-14 13:46".
 */
export function shortTraceId(filePath: string): string {
  const basename = path.basename(filePath, '.ndjson');
  const match = basename.match(/trace-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]} ${match[2]}:${match[3]}`;
  }
  return basename;
}

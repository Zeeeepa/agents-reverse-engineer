/**
 * View 3: ASCII Gantt Timeline.
 *
 * Renders a text-based Gantt chart showing concurrent execution
 * phases, workers, and task spans from trace data.
 *
 * @module
 */

import pc from 'picocolors';
import type { ParsedTrace, PhaseTimeline, WorkerTimeline } from '../trace-reader.js';
import { shortTraceId } from '../trace-reader.js';
import { formatDuration } from '../cost-calculator.js';

/** Maximum width for the timeline bar */
const BAR_WIDTH = 60;

/**
 * Render an ASCII Gantt timeline from a parsed trace.
 *
 * Shows each phase with its workers and task spans. Tasks are
 * rendered as horizontal bars proportional to their duration.
 *
 * @param trace - Parsed trace data
 */
export function renderTimeline(trace: ParsedTrace): void {
  console.log(pc.bold(pc.cyan(`=== Trace Timeline: ${shortTraceId(trace.filePath)} ===`)));
  console.log(pc.dim(`Total elapsed: ${formatDuration(trace.totalElapsedMs)} | Phases: ${trace.phases.length}`));
  console.log();

  if (trace.phases.length === 0) {
    console.log(pc.dim('No phase data in this trace.'));
    return;
  }

  const totalMs = trace.totalElapsedMs || 1;

  for (const phase of trace.phases) {
    renderPhase(phase, totalMs);
    console.log();
  }

  // Overall stats
  renderConcurrencyStats(trace);
}

/**
 * Render a single phase with its workers.
 */
function renderPhase(phase: PhaseTimeline, totalMs: number): void {
  const statusColor = phase.tasksFailed > 0 ? pc.red : pc.green;
  const doneLabel = `${phase.tasksCompleted}/${phase.taskCount} done`;
  const failLabel = phase.tasksFailed > 0 ? pc.red(` ${phase.tasksFailed} failed`) : '';

  console.log(
    pc.bold(`[${phase.phase}]`) +
    pc.dim(` ${formatDuration(phase.durationMs)} | concurrency: ${phase.concurrency} | `) +
    statusColor(doneLabel) + failLabel,
  );

  // Render phase bar (position within total timeline)
  const phaseStart = Math.round((phase.startMs / totalMs) * BAR_WIDTH);
  const phaseLen = Math.max(1, Math.round((phase.durationMs / totalMs) * BAR_WIDTH));
  const phasePad = ' '.repeat(phaseStart);
  const phaseBar = '\u2588'.repeat(phaseLen);
  console.log(pc.dim('  ') + phasePad + pc.blue(phaseBar) + pc.dim(` ${formatDuration(phase.durationMs)}`));

  // Render worker task spans (up to 10 workers for readability)
  const workersToShow = phase.workers.slice(0, 10);
  for (const worker of workersToShow) {
    renderWorker(worker, phase, totalMs);
  }

  if (phase.workers.length > 10) {
    console.log(pc.dim(`  ... and ${phase.workers.length - 10} more workers`));
  }
}

/**
 * Render a single worker's task spans within a phase.
 */
function renderWorker(worker: WorkerTimeline, phase: PhaseTimeline, totalMs: number): void {
  const prefix = pc.dim(`  w${String(worker.workerId).padStart(2)} `);

  if (worker.tasks.length === 0) {
    console.log(prefix + pc.dim('(idle)'));
    return;
  }

  // Build a character-level timeline bar
  const bar = new Array(BAR_WIDTH).fill(' ');

  for (const task of worker.tasks) {
    const start = Math.round((task.startMs / totalMs) * BAR_WIDTH);
    const len = Math.max(1, Math.round((task.durationMs / totalMs) * BAR_WIDTH));
    const char = task.success ? '\u2593' : '\u2591';
    for (let i = start; i < Math.min(start + len, BAR_WIDTH); i++) {
      bar[i] = char;
    }
  }

  const barStr = bar.join('');
  const taskCount = `${worker.tasks.length} tasks`;
  const totalWorkerMs = worker.tasks.reduce((sum, t) => sum + t.durationMs, 0);
  const utilization = phase.durationMs > 0
    ? Math.round((totalWorkerMs / phase.durationMs) * 100)
    : 0;

  // Color failed tasks differently
  const hasFails = worker.tasks.some((t) => !t.success);
  const coloredBar = hasFails ? pc.yellow(barStr) : pc.green(barStr);

  console.log(prefix + coloredBar + pc.dim(` ${taskCount}, ${utilization}% util`));
}

/**
 * Render overall concurrency efficiency stats.
 */
function renderConcurrencyStats(trace: ParsedTrace): void {
  console.log(pc.bold('Concurrency Efficiency:'));

  for (const phase of trace.phases) {
    if (phase.workers.length === 0) continue;

    const totalTaskMs = phase.workers.reduce(
      (sum, w) => sum + w.tasks.reduce((s, t) => s + t.durationMs, 0),
      0,
    );

    // Sequential time = sum of all task durations
    // Parallel time = actual phase duration
    const speedup = phase.durationMs > 0 ? totalTaskMs / phase.durationMs : 0;

    // Worker utilization
    const maxPossibleMs = phase.durationMs * phase.workers.length;
    const utilization = maxPossibleMs > 0 ? (totalTaskMs / maxPossibleMs) * 100 : 0;

    console.log(
      `  ${pc.cyan(phase.phase.padEnd(25))} ` +
      `speedup: ${pc.bold(speedup.toFixed(1))}x | ` +
      `utilization: ${colorPercent(utilization)} | ` +
      `sequential: ${formatDuration(totalTaskMs)} | ` +
      `actual: ${formatDuration(phase.durationMs)}`,
    );
  }
}

/**
 * Color a percentage value: green >80%, yellow >50%, red otherwise.
 */
function colorPercent(pct: number): string {
  const s = `${Math.round(pct)}%`;
  if (pct >= 80) return pc.green(s);
  if (pct >= 50) return pc.yellow(s);
  return pc.red(s);
}

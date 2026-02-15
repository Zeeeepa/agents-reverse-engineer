/**
 * View 4: Cost Trends.
 *
 * Aggregates metrics across runs by date and displays cost trends,
 * cache savings, cost per file, and error rate trends.
 *
 * @module
 */

import pc from 'picocolors';
import type { RunLog } from '../../ai/types.js';
import {
  computeRunCost,
  formatCost,
  formatTokens,
  formatDuration,
  type CostBreakdown,
} from '../cost-calculator.js';

/** Aggregated metrics for a single day */
interface DayMetrics {
  date: string;
  runCount: number;
  totalCost: CostBreakdown;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalFiles: number;
  totalErrors: number;
  totalCalls: number;
  totalDurationMs: number;
}

/**
 * Render cost trends across all runs, aggregated by date.
 *
 * @param logs - Array of run logs (already sorted newest first)
 */
export function renderTrends(logs: RunLog[]): void {
  if (logs.length === 0) {
    console.log(pc.dim('No run logs found.'));
    return;
  }

  console.log(pc.bold(pc.cyan('=== Cost & Usage Trends ===')));
  console.log();

  const days = aggregateByDate(logs);

  // Daily cost table
  renderDailyTable(days);

  // Cache savings
  console.log();
  renderCacheSavings(logs);

  // Cost per file
  console.log();
  renderCostPerFile(logs);

  // Error rate
  console.log();
  renderErrorRate(days);

  // Sparkline chart (ASCII)
  console.log();
  renderSparkline(days);
}

/**
 * Aggregate run logs by date.
 */
function aggregateByDate(logs: RunLog[]): DayMetrics[] {
  const byDate = new Map<string, DayMetrics>();

  for (const log of logs) {
    const date = log.startTime.slice(0, 10); // "2026-02-14"
    let day = byDate.get(date);
    if (!day) {
      day = {
        date,
        runCount: 0,
        totalCost: { inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, totalCost: 0 },
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        totalFiles: 0,
        totalErrors: 0,
        totalCalls: 0,
        totalDurationMs: 0,
      };
      byDate.set(date, day);
    }

    const cost = computeRunCost(log);
    day.runCount++;
    day.totalCost.inputCost += cost.inputCost;
    day.totalCost.outputCost += cost.outputCost;
    day.totalCost.cacheReadCost += cost.cacheReadCost;
    day.totalCost.cacheWriteCost += cost.cacheWriteCost;
    day.totalCost.totalCost += cost.totalCost;
    day.totalInputTokens += log.summary.totalInputTokens;
    day.totalOutputTokens += log.summary.totalOutputTokens;
    day.totalCacheReadTokens += log.summary.totalCacheReadTokens;
    day.totalCacheWriteTokens += log.summary.totalCacheCreationTokens;
    day.totalFiles += log.summary.uniqueFilesRead;
    day.totalErrors += log.summary.errorCount;
    day.totalCalls += log.summary.totalCalls;
    day.totalDurationMs += log.summary.totalDurationMs;
  }

  // Sort by date ascending
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Render the daily aggregation table.
 */
function renderDailyTable(days: DayMetrics[]): void {
  console.log(pc.bold('Daily Costs:'));

  const rows = days.map((d) => ({
    date: d.date,
    runs: String(d.runCount),
    calls: String(d.totalCalls),
    cost: formatCost(d.totalCost.totalCost),
    inTok: formatTokens(d.totalInputTokens),
    outTok: formatTokens(d.totalOutputTokens),
    duration: formatDuration(d.totalDurationMs),
    errors: String(d.totalErrors),
  }));

  const headers = { date: 'Date', runs: 'Runs', calls: 'Calls', cost: 'Cost', inTok: 'In Tok', outTok: 'Out Tok', duration: 'Duration', errors: 'Err' };
  type ColKey = keyof typeof headers;
  const cols: ColKey[] = ['date', 'runs', 'calls', 'cost', 'inTok', 'outTok', 'duration', 'errors'];

  const widths: Record<string, number> = {};
  for (const col of cols) {
    widths[col] = headers[col].length;
    for (const row of rows) {
      widths[col] = Math.max(widths[col], row[col].length);
    }
  }

  const headerLine = cols.map((col) => headers[col].padEnd(widths[col])).join('  ');
  console.log(pc.bold(headerLine));
  console.log(pc.dim('-'.repeat(headerLine.length)));

  for (const row of rows) {
    const parts = cols.map((col) => {
      const val = row[col].padEnd(widths[col]);
      if (col === 'cost') return pc.yellow(val);
      if (col === 'errors' && Number(row.errors) > 0) return pc.red(val);
      if (col === 'date') return pc.cyan(val);
      return val;
    });
    console.log(parts.join('  '));
  }
}

/**
 * Render cache savings analysis.
 */
function renderCacheSavings(logs: RunLog[]): void {
  console.log(pc.bold('Cache Savings:'));

  let totalCacheReadTokens = 0;
  let totalInputTokens = 0;
  let totalCacheReadCost = 0;
  let inputCostIfNoCache = 0;

  for (const log of logs) {
    const cost = computeRunCost(log);
    totalCacheReadTokens += log.summary.totalCacheReadTokens;
    totalInputTokens += log.summary.totalInputTokens;
    totalCacheReadCost += cost.cacheReadCost;

    // What would cache reads have cost as regular input?
    const { inputCost: hypotheticalCost } = computeRunCost({
      ...log,
      summary: {
        ...log.summary,
        totalInputTokens: log.summary.totalInputTokens + log.summary.totalCacheReadTokens,
        totalCacheReadTokens: 0,
      },
    });
    inputCostIfNoCache += hypotheticalCost;
  }

  const saved = inputCostIfNoCache - totalCacheReadCost;
  console.log(`  Cache read tokens: ${formatTokens(totalCacheReadTokens)}`);
  console.log(`  Cache read cost:   ${formatCost(totalCacheReadCost)}`);
  console.log(`  Would-be input:    ${formatCost(inputCostIfNoCache)}`);
  console.log(`  ${pc.green('Saved: ' + formatCost(saved > 0 ? saved : 0))}`);
}

/**
 * Render cost-per-file analysis.
 */
function renderCostPerFile(logs: RunLog[]): void {
  console.log(pc.bold('Cost Per File:'));

  for (const log of logs) {
    const cost = computeRunCost(log);
    const files = log.summary.uniqueFilesRead || 1;
    const costPerFile = cost.totalCost / files;
    const date = log.startTime.slice(0, 10);

    console.log(
      `  ${pc.cyan(date)} ${log.backend}/${log.model}: ` +
      `${formatCost(costPerFile)}/file (${files} files, ${formatCost(cost.totalCost)} total)`,
    );
  }
}

/**
 * Render error rate by day.
 */
function renderErrorRate(days: DayMetrics[]): void {
  const hasErrors = days.some((d) => d.totalErrors > 0);
  if (!hasErrors) {
    console.log(pc.green('Error Rate: 0% across all runs'));
    return;
  }

  console.log(pc.bold('Error Rate:'));
  for (const day of days) {
    const rate = day.totalCalls > 0 ? (day.totalErrors / day.totalCalls) * 100 : 0;
    const bar = rate > 0 ? pc.red('\u2588'.repeat(Math.max(1, Math.round(rate / 2)))) : pc.green('\u2713');
    console.log(`  ${pc.cyan(day.date)} ${bar} ${rate.toFixed(1)}% (${day.totalErrors}/${day.totalCalls})`);
  }
}

/**
 * Render an ASCII sparkline of daily costs.
 */
function renderSparkline(days: DayMetrics[]): void {
  if (days.length < 2) return;

  console.log(pc.bold('Cost Sparkline:'));

  const costs = days.map((d) => d.totalCost.totalCost);
  const max = Math.max(...costs);
  const min = Math.min(...costs);
  const range = max - min || 1;

  const sparks = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
  const line = costs.map((c) => {
    const idx = Math.round(((c - min) / range) * (sparks.length - 1));
    return sparks[idx];
  }).join('');

  console.log(`  ${pc.cyan(days[0].date)} ${pc.yellow(line)} ${pc.cyan(days[days.length - 1].date)}`);
  console.log(`  ${pc.dim(`min: ${formatCost(min)} | max: ${formatCost(max)}`)}`);
}

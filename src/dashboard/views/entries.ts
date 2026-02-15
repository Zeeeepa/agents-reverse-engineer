/**
 * View 2: Per-Entry Drill-down.
 *
 * Shows detailed per-call breakdown for a specific run, highlighting
 * slowest calls, highest token counts, and any errors/retries.
 *
 * @module
 */

import pc from 'picocolors';
import type { RunLog, TelemetryEntry } from '../../ai/types.js';
import {
  getModelPricing,
  computeCost,
  formatCost,
  formatTokens,
  formatDuration,
} from '../cost-calculator.js';
import { shortRunId } from '../log-reader.js';

/**
 * Render the per-entry drill-down for a specific run.
 *
 * Displays each entry with: File, Model, In Tok, Out Tok, Cache R, Cache W,
 * Latency, Retries, Status. Highlights outliers.
 *
 * @param log - The run log to drill into
 */
export function renderEntriesTable(log: RunLog): void {
  console.log(pc.bold(pc.cyan(`=== Run Detail: ${shortRunId(log.runId)} ===`)));
  console.log(pc.dim(`Backend: ${log.backend} | Model: ${log.model} | Command: ${log.command}`));
  console.log();

  const entries = log.entries;
  if (entries.length === 0) {
    console.log(pc.dim('No entries in this run.'));
    return;
  }

  // Compute stats for outlier detection
  const latencies = entries.map((e) => e.latencyMs);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p90Latency = percentile(latencies, 0.9);

  const rows = entries.map((entry) => {
    const file = extractFileName(entry);
    return {
      file,
      model: truncate(entry.model, 20),
      inTok: formatTokens(entry.inputTokens),
      outTok: formatTokens(entry.outputTokens),
      cacheR: formatTokens(entry.cacheReadTokens),
      cacheW: formatTokens(entry.cacheCreationTokens),
      latency: formatDuration(entry.latencyMs),
      retries: String(entry.retryCount),
      status: entry.error ? 'FAIL' : 'OK',
      // Raw values for highlighting
      _latencyMs: entry.latencyMs,
      _error: entry.error,
      _retries: entry.retryCount,
    };
  });

  // Column headers
  const headers = {
    file: 'File',
    model: 'Model',
    inTok: 'In Tok',
    outTok: 'Out Tok',
    cacheR: 'Cache R',
    cacheW: 'Cache W',
    latency: 'Latency',
    retries: 'Ret',
    status: 'Status',
  };

  type ColKey = keyof typeof headers;
  const cols: ColKey[] = ['file', 'model', 'inTok', 'outTok', 'cacheR', 'cacheW', 'latency', 'retries', 'status'];

  const widths: Record<string, number> = {};
  for (const col of cols) {
    widths[col] = headers[col].length;
    for (const row of rows) {
      widths[col] = Math.max(widths[col], row[col].length);
    }
  }

  // Render header
  const headerLine = cols.map((col) => headers[col].padEnd(widths[col])).join('  ');
  console.log(pc.bold(headerLine));
  console.log(pc.dim('-'.repeat(headerLine.length)));

  // Render rows with highlighting
  for (const row of rows) {
    const parts = cols.map((col) => {
      const val = row[col].padEnd(widths[col]);
      if (col === 'status') {
        return row._error ? pc.red(val) : pc.green(val);
      }
      if (col === 'latency' && row._latencyMs > p90Latency) {
        return pc.yellow(val);
      }
      if (col === 'retries' && row._retries > 0) {
        return pc.yellow(val);
      }
      if (col === 'file') return pc.cyan(val);
      return val;
    });
    console.log(parts.join('  '));
  }

  // Summary stats
  console.log();
  const pricing = getModelPricing(entries[0]?.model ?? log.model);
  const totalCost = computeCost(
    log.summary.totalInputTokens,
    log.summary.totalOutputTokens,
    log.summary.totalCacheReadTokens,
    log.summary.totalCacheCreationTokens,
    pricing,
  );

  console.log(pc.bold('Summary:'));
  console.log(`  Calls: ${entries.length} | Errors: ${pc.red(String(log.summary.errorCount))} | Avg latency: ${formatDuration(avgLatency)} | P90: ${formatDuration(p90Latency)}`);
  console.log(`  Tokens: ${formatTokens(log.summary.totalInputTokens)} in / ${formatTokens(log.summary.totalOutputTokens)} out / ${formatTokens(log.summary.totalCacheReadTokens)} cache read / ${formatTokens(log.summary.totalCacheCreationTokens)} cache write`);
  console.log(`  Cost: ${pc.yellow(formatCost(totalCost.totalCost))} (input: ${formatCost(totalCost.inputCost)}, output: ${formatCost(totalCost.outputCost)}, cache read: ${formatCost(totalCost.cacheReadCost)}, cache write: ${formatCost(totalCost.cacheWriteCost)})`);
  console.log(`  Duration: ${formatDuration(log.summary.totalDurationMs)} wall time`);

  // Top 5 slowest
  const sorted = [...entries].sort((a, b) => b.latencyMs - a.latencyMs);
  const top5 = sorted.slice(0, 5);
  console.log();
  console.log(pc.bold('Slowest calls:'));
  for (const entry of top5) {
    const file = extractFileName(entry);
    console.log(`  ${pc.yellow(formatDuration(entry.latencyMs).padEnd(8))} ${file}`);
  }
}

/**
 * Extract a short filename from a telemetry entry.
 */
function extractFileName(entry: TelemetryEntry): string {
  if (entry.filesRead.length > 0) {
    return entry.filesRead[0].path;
  }
  // Fall back to parsing the prompt for the file path
  const match = entry.prompt.match(/File: (.+?)(?:\n|$)/);
  return match?.[1] ?? '(unknown)';
}

/**
 * Truncate a string with ellipsis.
 */
function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '\u2026' : s;
}

/**
 * Compute the p-th percentile of a sorted array.
 */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

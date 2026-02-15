/**
 * View 1: Run Summary Table.
 *
 * Displays a table of all run logs with key metrics and computed costs.
 *
 * @module
 */

import pc from 'picocolors';
import type { RunLog } from '../../ai/types.js';
import { computeRunCost, formatCost, formatTokens, formatDuration } from '../cost-calculator.js';
import { shortRunId } from '../log-reader.js';

/**
 * Render the run summary table to stdout.
 *
 * Displays one row per run with columns: Run, Backend, Model, Files, Calls,
 * Input Tok, Output Tok, Cache Read, Cache Write, Duration, Errors, Cost.
 *
 * @param logs - Array of run logs (already sorted newest first)
 */
export function renderSummaryTable(logs: RunLog[]): void {
  if (logs.length === 0) {
    console.log(pc.dim('No run logs found.'));
    return;
  }

  console.log(pc.bold(pc.cyan('=== Run Summary ===')));
  console.log();

  // Compute column data
  const rows = logs.map((log) => {
    const cost = computeRunCost(log);
    return {
      run: shortRunId(log.runId),
      backend: log.backend,
      model: log.model,
      cmd: log.command,
      files: String(log.summary.uniqueFilesRead),
      calls: String(log.summary.totalCalls),
      inTok: formatTokens(log.summary.totalInputTokens),
      outTok: formatTokens(log.summary.totalOutputTokens),
      cacheR: formatTokens(log.summary.totalCacheReadTokens),
      cacheW: formatTokens(log.summary.totalCacheCreationTokens),
      duration: formatDuration(log.summary.totalDurationMs),
      errors: String(log.summary.errorCount),
      cost: formatCost(cost.totalCost),
    };
  });

  // Compute column widths
  const headers = {
    run: 'Run',
    backend: 'Backend',
    model: 'Model',
    cmd: 'Cmd',
    files: 'Files',
    calls: 'Calls',
    inTok: 'In Tok',
    outTok: 'Out Tok',
    cacheR: 'Cache R',
    cacheW: 'Cache W',
    duration: 'Duration',
    errors: 'Err',
    cost: 'Cost',
  };

  type ColKey = keyof typeof headers;
  const cols: ColKey[] = ['run', 'backend', 'model', 'cmd', 'files', 'calls', 'inTok', 'outTok', 'cacheR', 'cacheW', 'duration', 'errors', 'cost'];

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

  // Render rows
  for (const row of rows) {
    const parts = cols.map((col) => {
      const val = row[col].padEnd(widths[col]);
      switch (col) {
        case 'run': return pc.cyan(val);
        case 'errors': return Number(row.errors) > 0 ? pc.red(val) : pc.dim(val);
        case 'cost': return pc.yellow(val);
        default: return val;
      }
    });
    console.log(parts.join('  '));
  }

  // Summary footer
  console.log();
  const totalCost = rows.reduce((sum, r) => sum + parseFloat(r.cost.replace('$', '')), 0);
  console.log(pc.bold(`Total: ${logs.length} runs, ${formatCost(totalCost)} total cost`));
}

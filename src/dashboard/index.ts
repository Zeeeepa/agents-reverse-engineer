/**
 * Dashboard entry point.
 *
 * Parses CLI arguments and dispatches to the appropriate view.
 * Invoked by the `dashboard` subcommand in `src/cli/index.ts`.
 *
 * @module
 */

import { findProjectRoot } from '../config/loader.js';
import { readAllRunLogs, readRunLog } from './log-reader.js';
import { listTraceFiles, parseTraceFile, findTraceFile } from './trace-reader.js';
import { renderSummaryTable } from './views/summary.js';
import { renderEntriesTable } from './views/entries.js';
import { renderTimeline } from './views/timeline.js';
import { renderTrends } from './views/trends.js';
import { generateHtmlReport } from './html-report.js';

/** Options parsed from CLI flags */
export interface DashboardOptions {
  /** Specific run ID to drill into */
  run?: string;
  /** Trace ID/query to show timeline for */
  trace?: string;
  /** Output format: table (default), json, html */
  format?: 'table' | 'json' | 'html';
  /** Show trends view */
  trends?: boolean;
}

/**
 * Dashboard command handler.
 *
 * Routes to the appropriate view based on options:
 * - No options: summary table of all runs
 * - `--run <id>`: per-entry drill-down for a specific run
 * - `--trace <id>`: ASCII timeline from trace file
 * - `--trends`: cost and usage trends
 * - `--format html`: generate self-contained HTML report
 * - `--format json`: output raw data as JSON
 *
 * @param targetPath - Project path (default: ".")
 * @param options - Dashboard options from CLI flags
 */
export async function dashboardCommand(targetPath: string, options: DashboardOptions): Promise<void> {
  const projectRoot = await findProjectRoot(targetPath);

  // HTML report mode
  if (options.format === 'html') {
    const logs = await readAllRunLogs(projectRoot);
    const html = generateHtmlReport(logs);
    process.stdout.write(html);
    return;
  }

  // JSON output mode
  if (options.format === 'json') {
    const logs = await readAllRunLogs(projectRoot);
    process.stdout.write(JSON.stringify(logs, null, 2) + '\n');
    return;
  }

  // Trace timeline mode
  if (options.trace) {
    const tracePath = await findTraceFile(projectRoot, options.trace);
    if (!tracePath) {
      const available = await listTraceFiles(projectRoot);
      console.error(`Trace not found: "${options.trace}"`);
      if (available.length > 0) {
        console.error('Available traces:');
        for (const f of available.slice(0, 10)) {
          console.error(`  ${f}`);
        }
      }
      process.exit(1);
    }
    const parsed = await parseTraceFile(tracePath);
    renderTimeline(parsed);
    return;
  }

  // Per-run drill-down mode
  if (options.run) {
    const log = await readRunLog(projectRoot, options.run);
    if (!log) {
      const allLogs = await readAllRunLogs(projectRoot);
      console.error(`Run not found: "${options.run}"`);
      if (allLogs.length > 0) {
        console.error('Available runs:');
        for (const l of allLogs.slice(0, 10)) {
          console.error(`  ${l.runId} (${l.backend}/${l.model} ${l.command})`);
        }
      }
      process.exit(1);
    }
    renderEntriesTable(log);
    return;
  }

  // Trends mode
  if (options.trends) {
    const logs = await readAllRunLogs(projectRoot);
    renderTrends(logs);
    return;
  }

  // Default: summary table
  const logs = await readAllRunLogs(projectRoot);
  renderSummaryTable(logs);
}

/**
 * HTML Report Generator.
 *
 * Generates a self-contained HTML file with embedded data and
 * Chart.js visualizations for deep analysis after a run.
 *
 * @module
 */

import type { RunLog } from '../ai/types.js';
import { computeRunCost, formatCost, formatTokens, formatDuration } from './cost-calculator.js';
import { shortRunId } from './log-reader.js';

/**
 * Generate a self-contained HTML report from run logs.
 *
 * The output includes:
 * - Run summary table
 * - Cost breakdown charts (Chart.js via CDN)
 * - Token distribution visualization
 * - Daily cost trend chart
 *
 * @param logs - Array of run logs
 * @returns Complete HTML string
 */
export function generateHtmlReport(logs: RunLog[]): string {
  const tableRows = logs.map((log) => {
    const cost = computeRunCost(log);
    return {
      runId: shortRunId(log.runId),
      backend: log.backend,
      model: log.model,
      command: log.command,
      files: log.summary.uniqueFilesRead,
      calls: log.summary.totalCalls,
      inputTokens: log.summary.totalInputTokens,
      outputTokens: log.summary.totalOutputTokens,
      cacheReadTokens: log.summary.totalCacheReadTokens,
      cacheWriteTokens: log.summary.totalCacheCreationTokens,
      durationMs: log.summary.totalDurationMs,
      errors: log.summary.errorCount,
      cost: cost.totalCost,
      inputCost: cost.inputCost,
      outputCost: cost.outputCost,
      cacheReadCost: cost.cacheReadCost,
      cacheWriteCost: cost.cacheWriteCost,
    };
  });

  // Aggregate by date for trends
  const byDate = new Map<string, { date: string; cost: number; tokens: number; calls: number }>();
  for (const log of logs) {
    const date = log.startTime.slice(0, 10);
    const existing = byDate.get(date) ?? { date, cost: 0, tokens: 0, calls: 0 };
    const cost = computeRunCost(log);
    existing.cost += cost.totalCost;
    existing.tokens += log.summary.totalOutputTokens;
    existing.calls += log.summary.totalCalls;
    byDate.set(date, existing);
  }
  const dailyData = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  const totalCost = tableRows.reduce((sum, r) => sum + r.cost, 0);
  const totalTokens = tableRows.reduce((sum, r) => sum + r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens, 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ARE Telemetry Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; background: #0d1117; color: #c9d1d9; padding: 24px; }
  h1 { color: #58a6ff; margin-bottom: 8px; }
  h2 { color: #58a6ff; margin: 24px 0 12px; border-bottom: 1px solid #21262d; padding-bottom: 8px; }
  .stats { display: flex; gap: 24px; margin: 16px 0; }
  .stat { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 16px; min-width: 150px; }
  .stat-label { color: #8b949e; font-size: 12px; text-transform: uppercase; }
  .stat-value { color: #f0f6fc; font-size: 24px; font-weight: bold; margin-top: 4px; }
  .stat-value.cost { color: #f9826c; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { background: #161b22; color: #8b949e; text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #21262d; }
  td { padding: 8px 12px; border-bottom: 1px solid #21262d; font-size: 13px; }
  tr:hover { background: #161b22; }
  .error { color: #f85149; }
  .cost { color: #f9826c; }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 16px 0; }
  .chart-container { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 16px; }
  canvas { max-height: 300px; }
  footer { margin-top: 32px; color: #484f58; font-size: 12px; text-align: center; }
</style>
</head>
<body>
<h1>ARE Telemetry Dashboard</h1>
<p style="color:#8b949e">Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} | ${logs.length} runs</p>

<div class="stats">
  <div class="stat"><div class="stat-label">Total Cost</div><div class="stat-value cost">${formatCost(totalCost)}</div></div>
  <div class="stat"><div class="stat-label">Total Runs</div><div class="stat-value">${logs.length}</div></div>
  <div class="stat"><div class="stat-label">Total Tokens</div><div class="stat-value">${formatTokens(totalTokens)}</div></div>
  <div class="stat"><div class="stat-label">Total Errors</div><div class="stat-value${logs.reduce((s, l) => s + l.summary.errorCount, 0) > 0 ? ' error' : ''}">${logs.reduce((s, l) => s + l.summary.errorCount, 0)}</div></div>
</div>

<h2>Run Summary</h2>
<table>
<thead>
<tr><th>Run</th><th>Backend</th><th>Model</th><th>Cmd</th><th>Files</th><th>Calls</th><th>In Tok</th><th>Out Tok</th><th>Cache R</th><th>Cache W</th><th>Duration</th><th>Err</th><th>Cost</th></tr>
</thead>
<tbody>
${tableRows.map((r) => `<tr>
<td>${r.runId}</td><td>${r.backend}</td><td>${r.model}</td><td>${r.command}</td>
<td>${r.files}</td><td>${r.calls}</td><td>${formatTokens(r.inputTokens)}</td><td>${formatTokens(r.outputTokens)}</td>
<td>${formatTokens(r.cacheReadTokens)}</td><td>${formatTokens(r.cacheWriteTokens)}</td>
<td>${formatDuration(r.durationMs)}</td><td class="${r.errors > 0 ? 'error' : ''}">${r.errors}</td><td class="cost">${formatCost(r.cost)}</td>
</tr>`).join('\n')}
</tbody>
</table>

<h2>Charts</h2>
<div class="charts">
  <div class="chart-container"><canvas id="costChart"></canvas></div>
  <div class="chart-container"><canvas id="tokenChart"></canvas></div>
  <div class="chart-container"><canvas id="trendChart"></canvas></div>
  <div class="chart-container"><canvas id="durationChart"></canvas></div>
</div>

<script>
const chartColors = { blue: '#58a6ff', green: '#3fb950', orange: '#f9826c', purple: '#bc8cff', gray: '#484f58' };
const chartDefaults = { responsive: true, plugins: { legend: { labels: { color: '#c9d1d9' } } }, scales: { x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } }, y: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } } } };

// Cost breakdown per run
new Chart(document.getElementById('costChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(tableRows.map((r) => r.runId))},
    datasets: [
      { label: 'Input', data: ${JSON.stringify(tableRows.map((r) => +r.inputCost.toFixed(4)))}, backgroundColor: chartColors.blue },
      { label: 'Output', data: ${JSON.stringify(tableRows.map((r) => +r.outputCost.toFixed(4)))}, backgroundColor: chartColors.green },
      { label: 'Cache Read', data: ${JSON.stringify(tableRows.map((r) => +r.cacheReadCost.toFixed(4)))}, backgroundColor: chartColors.purple },
      { label: 'Cache Write', data: ${JSON.stringify(tableRows.map((r) => +r.cacheWriteCost.toFixed(4)))}, backgroundColor: chartColors.orange },
    ],
  },
  options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, title: { display: true, text: 'Cost Breakdown per Run ($)', color: '#c9d1d9' } }, scales: { ...chartDefaults.scales, x: { ...chartDefaults.scales.x, stacked: true }, y: { ...chartDefaults.scales.y, stacked: true } } },
});

// Token distribution per run
new Chart(document.getElementById('tokenChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(tableRows.map((r) => r.runId))},
    datasets: [
      { label: 'Input', data: ${JSON.stringify(tableRows.map((r) => r.inputTokens))}, backgroundColor: chartColors.blue },
      { label: 'Output', data: ${JSON.stringify(tableRows.map((r) => r.outputTokens))}, backgroundColor: chartColors.green },
      { label: 'Cache Read', data: ${JSON.stringify(tableRows.map((r) => r.cacheReadTokens))}, backgroundColor: chartColors.purple },
      { label: 'Cache Write', data: ${JSON.stringify(tableRows.map((r) => r.cacheWriteTokens))}, backgroundColor: chartColors.orange },
    ],
  },
  options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, title: { display: true, text: 'Token Distribution per Run', color: '#c9d1d9' } }, scales: { ...chartDefaults.scales, x: { ...chartDefaults.scales.x, stacked: true }, y: { ...chartDefaults.scales.y, stacked: true } } },
});

// Daily cost trend
new Chart(document.getElementById('trendChart'), {
  type: 'line',
  data: {
    labels: ${JSON.stringify(dailyData.map((d) => d.date))},
    datasets: [{
      label: 'Daily Cost ($)',
      data: ${JSON.stringify(dailyData.map((d) => +d.cost.toFixed(4)))},
      borderColor: chartColors.orange,
      backgroundColor: chartColors.orange + '33',
      fill: true,
      tension: 0.3,
    }],
  },
  options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, title: { display: true, text: 'Daily Cost Trend', color: '#c9d1d9' } } },
});

// Duration per run
new Chart(document.getElementById('durationChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(tableRows.map((r) => r.runId))},
    datasets: [{
      label: 'Duration (s)',
      data: ${JSON.stringify(tableRows.map((r) => +(r.durationMs / 1000).toFixed(1)))},
      backgroundColor: chartColors.blue,
    }],
  },
  options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, title: { display: true, text: 'Run Duration (seconds)', color: '#c9d1d9' } } },
});
</script>

<footer>Generated by agents-reverse-engineer dashboard</footer>
</body>
</html>`;
}

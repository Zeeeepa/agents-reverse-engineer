/**
 * Terminal comparison table for implementation results.
 *
 * Renders the side-by-side comparison of "with docs" vs "without docs"
 * implementation runs with colored deltas.
 *
 * @module
 */

import pc from 'picocolors';
import { formatCost, formatDuration, formatTokens } from '../../dashboard/cost-calculator.js';
import type { ImplementationComparison } from '../types.js';

/**
 * Format a percentage delta string with color.
 *
 * Positive deltas (improvements) are green, negative are red.
 */
function formatDelta(withVal: number, withoutVal: number): string {
  if (withoutVal === 0) return withVal > 0 ? pc.green('N/A \u2192 ' + String(withVal)) : '\u2014';
  const pct = ((withVal - withoutVal) / withoutVal * 100);
  const sign = pct >= 0 ? '+' : '';
  const formatted = `${sign}${Math.round(pct)}%`;
  return pct >= 0 ? pc.green(formatted) : pc.red(formatted);
}

/**
 * Pad a string to a fixed width (right-padded).
 */
function pad(str: string, width: number): string {
  const stripped = str.replace(/\x1B\[\d+m/g, '');
  const padding = Math.max(0, width - stripped.length);
  return str + ' '.repeat(padding);
}

/**
 * Render the full implementation comparison report to the terminal.
 */
export function renderComparison(comparison: ImplementationComparison): void {
  const { withDocs, withoutDocs } = comparison;

  console.log('');
  console.log(pc.bold('=== Results ==='));
  console.log('');

  // Header
  const col1 = 20;
  const col2 = 15;
  const col3 = 15;
  const col4 = 12;

  console.log(
    pad('', col1) +
    pad(pc.dim('Without ARE'), col2) +
    pad(pc.bold('With ARE'), col3) +
    pad('Delta', col4)
  );
  console.log(pc.dim('  ' + '\u2500'.repeat(col1 + col2 + col3 + col4 - 2)));

  // Rows
  const rows: Array<[string, string, string, string]> = [
    [
      'Files created',
      String(withoutDocs.metrics.filesCreated),
      String(withDocs.metrics.filesCreated),
      formatDelta(withDocs.metrics.filesCreated, withoutDocs.metrics.filesCreated),
    ],
    [
      'Files modified',
      String(withoutDocs.metrics.filesModified),
      String(withDocs.metrics.filesModified),
      formatDelta(withDocs.metrics.filesModified, withoutDocs.metrics.filesModified),
    ],
    [
      'Lines added',
      String(withoutDocs.metrics.linesAdded),
      String(withDocs.metrics.linesAdded),
      formatDelta(withDocs.metrics.linesAdded, withoutDocs.metrics.linesAdded),
    ],
    [
      'Lines deleted',
      String(withoutDocs.metrics.linesDeleted),
      String(withDocs.metrics.linesDeleted),
      formatDelta(withDocs.metrics.linesDeleted, withoutDocs.metrics.linesDeleted),
    ],
    [
      'Commits',
      String(withoutDocs.metrics.commitCount),
      String(withDocs.metrics.commitCount),
      formatDelta(withDocs.metrics.commitCount, withoutDocs.metrics.commitCount),
    ],
    [
      'Output tokens',
      formatTokens(withoutDocs.outputTokens),
      formatTokens(withDocs.outputTokens),
      formatDelta(withDocs.outputTokens, withoutDocs.outputTokens),
    ],
    [
      'Latency',
      formatDuration(withoutDocs.latencyMs),
      formatDuration(withDocs.latencyMs),
      `+${formatDuration(withDocs.latencyMs - withoutDocs.latencyMs)}`,
    ],
    [
      'Cost',
      formatCost(withoutDocs.cost.totalCost),
      formatCost(withDocs.cost.totalCost),
      `+${formatCost(withDocs.cost.totalCost - withoutDocs.cost.totalCost)}`,
    ],
  ];

  // Add test/build/lint rows only if metrics are non-zero
  if (withDocs.metrics.testsCreated > 0 || withoutDocs.metrics.testsCreated > 0) {
    rows.push([
      'Tests passing',
      `${withoutDocs.metrics.testsPassing}/${withoutDocs.metrics.testsCreated}`,
      `${withDocs.metrics.testsPassing}/${withDocs.metrics.testsCreated}`,
      formatDelta(withDocs.metrics.testsPassing, withoutDocs.metrics.testsPassing),
    ]);
  }

  if (withDocs.metrics.buildSuccess || withoutDocs.metrics.buildSuccess) {
    rows.push([
      'Build',
      withoutDocs.metrics.buildSuccess ? pc.green('pass') : pc.red('fail'),
      withDocs.metrics.buildSuccess ? pc.green('pass') : pc.red('fail'),
      '',
    ]);
  }

  for (const [label, without, withVal, delta] of rows) {
    console.log(
      '  ' +
      pad(label, col1) +
      pad(without, col2) +
      pad(withVal, col3) +
      delta
    );
  }

  // Evaluation results (if available)
  if (comparison.evaluation) {
    const eval_ = comparison.evaluation;
    console.log('');
    console.log(pc.bold('=== Quality Evaluation ==='));
    console.log(pc.dim(`  Evaluator model: ${eval_.evalModel}`));
    console.log('');

    const withDocsTotal = eval_.planALabel === 'withDocs' ? eval_.totalScoreA : eval_.totalScoreB;
    const withoutDocsTotal = eval_.planALabel === 'withDocs' ? eval_.totalScoreB : eval_.totalScoreA;

    console.log(`  With ARE docs:    ${pc.bold(withDocsTotal.toFixed(2))} / 5.00`);
    console.log(`  Without ARE docs: ${pc.bold(withoutDocsTotal.toFixed(2))} / 5.00`);

    const delta = withDocsTotal - withoutDocsTotal;
    const deltaStr = delta >= 0 ? pc.green(`+${delta.toFixed(2)}`) : pc.red(delta.toFixed(2));
    console.log(`  Delta:            ${deltaStr}`);
    console.log('');
    console.log(`  ${pc.dim(eval_.summary)}`);
  }

  // Footer
  console.log('');
  console.log(pc.dim(`Results saved to: .agents-reverse-engineer/implementations/${comparison.id}/`));
  console.log(pc.dim(`Branches: ${comparison.branches.withDocs}`));
  console.log(pc.dim(`          ${comparison.branches.withoutDocs}`));
}

/**
 * Render the header section showing task and config.
 */
export function renderHeader(
  task: string,
  model: string,
  backend: string,
  branches: { withDocs: string; withoutDocs: string },
): void {
  console.log(pc.bold('=== ARE Implementation Comparison ==='));
  console.log(`Task: "${task}"`);
  console.log(`Model: ${model}  Backend: ${backend}`);
  console.log(`Branches: ${branches.withDocs}, ${branches.withoutDocs}`);
  console.log('');
}

/**
 * Render a phase progress message.
 */
export function renderPhaseStart(phase: number, total: number, label: string): void {
  console.log(`Phase ${phase}/${total}: ${pc.bold(label)}`);
  console.log(`  ${pc.dim('\u21BB')} AI implementing...`);
}

/**
 * Render a phase completion message.
 */
export function renderPhaseComplete(
  durationMs: number,
  outputTokens: number,
  cost: number,
  success: boolean,
): void {
  if (success) {
    console.log(`  ${pc.green('\u2713')} Done  ${formatDuration(durationMs)}  ${formatTokens(outputTokens)} output tokens  ${formatCost(cost)}`);
  } else {
    console.log(`  ${pc.red('\u2717')} Failed after ${formatDuration(durationMs)}`);
  }
  console.log('');
}

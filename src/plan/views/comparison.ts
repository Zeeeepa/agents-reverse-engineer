/**
 * Terminal comparison table for plan results.
 *
 * Renders the side-by-side comparison of "with docs" vs "without docs"
 * plan runs with colored deltas.
 *
 * @module
 */

import pc from 'picocolors';
import { formatCost, formatDuration, formatTokens } from '../../dashboard/cost-calculator.js';
import type { PlanComparison } from '../types.js';

/**
 * Format a percentage delta string with color.
 *
 * Positive deltas (improvements) are green, negative are red.
 * For metrics where higher is better (tokens, sections, file refs, etc.)
 */
function formatDelta(withVal: number, withoutVal: number): string {
  if (withoutVal === 0) return withVal > 0 ? pc.green('N/A → ' + String(withVal)) : '—';
  const pct = ((withVal - withoutVal) / withoutVal * 100);
  const sign = pct >= 0 ? '+' : '';
  const formatted = `${sign}${Math.round(pct)}%`;
  return pct >= 0 ? pc.green(formatted) : pc.red(formatted);
}

/**
 * Pad a string to a fixed width (right-padded).
 */
function pad(str: string, width: number): string {
  // Strip ANSI codes for length calculation
  const stripped = str.replace(/\x1B\[\d+m/g, '');
  const padding = Math.max(0, width - stripped.length);
  return str + ' '.repeat(padding);
}

/**
 * Render the full comparison report to the terminal.
 *
 * @param comparison - The plan comparison data
 */
export function renderComparison(comparison: PlanComparison): void {
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
  console.log(pc.dim('  ' + '─'.repeat(col1 + col2 + col3 + col4 - 2)));

  // Rows
  const rows: Array<[string, string, string, string]> = [
    [
      'Output tokens',
      formatTokens(withoutDocs.outputTokens),
      formatTokens(withDocs.outputTokens),
      formatDelta(withDocs.outputTokens, withoutDocs.outputTokens),
    ],
    [
      'Sections',
      String(withoutDocs.metrics.sectionCount),
      String(withDocs.metrics.sectionCount),
      formatDelta(withDocs.metrics.sectionCount, withoutDocs.metrics.sectionCount),
    ],
    [
      'File references',
      String(withoutDocs.metrics.fileReferences),
      String(withDocs.metrics.fileReferences),
      formatDelta(withDocs.metrics.fileReferences, withoutDocs.metrics.fileReferences),
    ],
    [
      'Actionable steps',
      String(withoutDocs.metrics.actionableSteps),
      String(withDocs.metrics.actionableSteps),
      formatDelta(withDocs.metrics.actionableSteps, withoutDocs.metrics.actionableSteps),
    ],
    [
      'Code identifiers',
      String(withoutDocs.metrics.codeIdentifiers),
      String(withDocs.metrics.codeIdentifiers),
      formatDelta(withDocs.metrics.codeIdentifiers, withoutDocs.metrics.codeIdentifiers),
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
  console.log(pc.dim(`Plans saved to: .agents-reverse-engineer/plans/${comparison.id}/`));
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
  console.log(pc.bold('=== ARE Plan Comparison ==='));
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
  console.log(`  ${pc.dim('\u21BB')} AI exploring codebase...`);
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

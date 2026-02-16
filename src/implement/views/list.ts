/**
 * List view for saved implementation comparisons.
 *
 * Renders a summary table of all `--list` results.
 *
 * @module
 */

import pc from 'picocolors';
import { formatCost } from '../../dashboard/cost-calculator.js';
import type { ImplementationComparison } from '../types.js';

/**
 * Pad a string to a fixed width.
 */
function pad(str: string, width: number): string {
  const stripped = str.replace(/\x1B\[\d+m/g, '');
  const padding = Math.max(0, width - stripped.length);
  return str + ' '.repeat(padding);
}

/**
 * Render the list of saved implementation comparisons.
 *
 * @param comparisons - Array of comparisons (sorted newest first)
 */
export function renderList(comparisons: ImplementationComparison[]): void {
  if (comparisons.length === 0) {
    console.log('No implementation comparisons found.');
    console.log(pc.dim('Run `are implement "<task>"` to create one.'));
    return;
  }

  console.log(pc.bold(`Implementation Comparisons (${comparisons.length} total)`));
  console.log('');

  // Table header
  const dateW = 22;
  const taskW = 40;
  const modelW = 10;
  const costW = 12;
  const statusW = 8;

  console.log(
    pad(pc.dim('Date'), dateW) +
    pad(pc.dim('Task'), taskW) +
    pad(pc.dim('Model'), modelW) +
    pad(pc.dim('Cost'), costW) +
    pc.dim('Status')
  );
  console.log(pc.dim('\u2500'.repeat(dateW + taskW + modelW + costW + statusW)));

  for (const comp of comparisons) {
    // Truncate task to fit column
    const taskDisplay = comp.task.length > taskW - 2
      ? comp.task.slice(0, taskW - 5) + '...'
      : comp.task;

    // Total cost across both runs
    const totalCost = comp.withDocs.cost.totalCost + comp.withoutDocs.cost.totalCost;

    // Format date as YYYY-MM-DD HH:mm
    const dateStr = comp.startTime.replace('T', ' ').slice(0, 16);

    // Status indicator
    const bothSuccess = comp.withDocs.success && comp.withoutDocs.success;
    const status = bothSuccess ? pc.green('\u2713 Done') : pc.red('\u2717 Fail');

    console.log(
      pad(dateStr, dateW) +
      pad(taskDisplay, taskW) +
      pad(comp.model, modelW) +
      pad(formatCost(totalCost), costW) +
      status
    );
  }
}

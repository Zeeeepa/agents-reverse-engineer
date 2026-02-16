/**
 * List view for saved plan comparisons.
 *
 * Renders a summary table of all `--list` results.
 *
 * @module
 */

import pc from 'picocolors';
import { formatCost, formatDuration } from '../../dashboard/cost-calculator.js';
import type { PlanComparison } from '../types.js';

/**
 * Pad a string to a fixed width.
 */
function pad(str: string, width: number): string {
  const stripped = str.replace(/\x1B\[\d+m/g, '');
  const padding = Math.max(0, width - stripped.length);
  return str + ' '.repeat(padding);
}

/**
 * Render the list of saved plan comparisons.
 *
 * @param comparisons - Array of comparisons (sorted newest first)
 */
export function renderList(comparisons: PlanComparison[]): void {
  if (comparisons.length === 0) {
    console.log('No plan comparisons found.');
    console.log(pc.dim('Run `are plan "<task>"` to create one.'));
    return;
  }

  console.log(pc.bold(`Plan Comparisons (${comparisons.length} total)`));
  console.log('');

  // Table header
  const dateW = 22;
  const taskW = 40;
  const modelW = 10;
  const costW = 12;
  const deltaW = 12;

  console.log(
    pad(pc.dim('Date'), dateW) +
    pad(pc.dim('Task'), taskW) +
    pad(pc.dim('Model'), modelW) +
    pad(pc.dim('Cost'), costW) +
    pc.dim('File Refs +/-')
  );
  console.log(pc.dim('─'.repeat(dateW + taskW + modelW + costW + deltaW)));

  for (const comp of comparisons) {
    // Truncate task to fit column
    const taskDisplay = comp.task.length > taskW - 2
      ? comp.task.slice(0, taskW - 5) + '...'
      : comp.task;

    // File references delta
    const withRefs = comp.withDocs.metrics.fileReferences;
    const withoutRefs = comp.withoutDocs.metrics.fileReferences;
    let refsDelta: string;
    if (withoutRefs === 0) {
      refsDelta = withRefs > 0 ? pc.green(`0 → ${withRefs}`) : '—';
    } else {
      const pct = Math.round((withRefs - withoutRefs) / withoutRefs * 100);
      refsDelta = pct >= 0 ? pc.green(`+${pct}%`) : pc.red(`${pct}%`);
    }

    // Total cost across both runs
    const totalCost = comp.withDocs.cost.totalCost + comp.withoutDocs.cost.totalCost;

    // Format date as YYYY-MM-DD HH:mm
    const dateStr = comp.startTime.replace('T', ' ').slice(0, 16);

    console.log(
      pad(dateStr, dateW) +
      pad(taskDisplay, taskW) +
      pad(comp.model, modelW) +
      pad(formatCost(totalCost), costW) +
      refsDelta
    );
  }
}

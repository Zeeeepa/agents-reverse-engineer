/**
 * Structured report builder and CLI formatter for inconsistency results.
 *
 * Aggregates individual inconsistency issues into a typed report with
 * summary counts, and formats the report as human-readable plain text
 * for CLI output. No color dependencies -- the reporter stays pure
 * so it can be tested easily.
 */

import type {
  Inconsistency,
  InconsistencyReport,
} from '../types.js';

/**
 * Build a structured inconsistency report from a list of issues.
 *
 * Computes summary counts by type (code-vs-doc, code-vs-code) and
 * severity (error, warning, info). Attaches run metadata including
 * timestamp, project root, files checked, and duration.
 *
 * @param issues - All detected inconsistencies
 * @param metadata - Run context (projectRoot, filesChecked, durationMs)
 * @returns Structured report with issues and summary counts
 */
export function buildInconsistencyReport(
  issues: Inconsistency[],
  metadata: { projectRoot: string; filesChecked: number; durationMs: number },
): InconsistencyReport {
  let codeVsDoc = 0;
  let codeVsCode = 0;
  let phantomPaths = 0;
  let errors = 0;
  let warnings = 0;
  let info = 0;

  for (const issue of issues) {
    if (issue.type === 'code-vs-doc') codeVsDoc++;
    if (issue.type === 'code-vs-code') codeVsCode++;
    if (issue.type === 'phantom-path') phantomPaths++;
    if (issue.severity === 'error') errors++;
    if (issue.severity === 'warning') warnings++;
    if (issue.severity === 'info') info++;
  }

  return {
    metadata: {
      timestamp: new Date().toISOString(),
      projectRoot: metadata.projectRoot,
      filesChecked: metadata.filesChecked,
      durationMs: metadata.durationMs,
    },
    issues,
    summary: {
      total: issues.length,
      codeVsDoc,
      codeVsCode,
      phantomPaths,
      errors,
      warnings,
      info,
    },
  };
}

/**
 * Format an inconsistency report as human-readable plain text.
 *
 * Output format:
 * ```
 * === Inconsistency Report ===
 * Checked 42 files in 150ms
 * Found 3 issue(s)
 *
 * [ERROR] Documentation out of sync: 2 exports undocumented, 1 ...
 *   File: src/foo/bar.ts
 *
 * [WARN] Symbol "Config" exported from 2 files
 *   Files: src/config/a.ts, src/config/b.ts
 * ```
 *
 * Uses plain text only (no picocolors). Color can be added by the
 * CLI layer if needed.
 *
 * @param report - The structured inconsistency report
 * @returns Formatted string for stderr output
 */
export function formatReportForCli(report: InconsistencyReport): string {
  const lines: string[] = [];

  lines.push('=== Inconsistency Report ===');
  lines.push(`Checked ${report.metadata.filesChecked} files in ${report.metadata.durationMs}ms`);
  lines.push(`Found ${report.summary.total} issue(s)`);
  lines.push('');

  for (const issue of report.issues) {
    const severityTag =
      issue.severity === 'error' ? '[ERROR]' :
      issue.severity === 'warning' ? '[WARN]' :
      '[INFO]';

    lines.push(`${severityTag} ${issue.description}`);

    if (issue.type === 'code-vs-doc') {
      lines.push(`  File: ${issue.filePath}`);
    } else if (issue.type === 'phantom-path') {
      lines.push(`  Doc: ${issue.agentsMdPath}`);
      lines.push(`  Path: ${issue.details.referencedPath}`);
    } else {
      lines.push(`  Files: ${issue.files.join(', ')}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

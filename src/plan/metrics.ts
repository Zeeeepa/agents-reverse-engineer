/**
 * Plan text metric extraction.
 *
 * Analyzes markdown plan text to produce quantitative metrics for
 * comparison between "with docs" and "without docs" plans.
 *
 * @module
 */

import type { PlanMetrics } from './types.js';

/**
 * Extract quantitative metrics from a plan's markdown text.
 *
 * @param text - The plan text in markdown format
 * @returns Extracted metrics
 *
 * @example
 * ```typescript
 * const metrics = extractPlanMetrics(planMarkdown);
 * console.log(`${metrics.fileReferences} file references found`);
 * ```
 */
export function extractPlanMetrics(text: string): PlanMetrics {
  const lines = text.split('\n');

  // Section count: markdown headings (##, ###, etc.)
  const sectionCount = lines.filter(line => /^#{1,6}\s+/.test(line)).length;

  // File references: backtick-wrapped paths (containing / or .)
  // Matches `src/foo/bar.ts`, `./utils.js`, `package.json`, etc.
  const fileRefMatches = text.match(/`[^`]*[/\\][^`]+`|`[^`]+\.[a-z]{1,4}`/gi);
  const fileReferences = fileRefMatches ? fileRefMatches.length : 0;

  // Actionable steps: numbered list items (1. 2. 3.) and checkbox items (- [ ] / - [x])
  const actionableSteps = lines.filter(line =>
    /^\s*\d+[.)]\s+/.test(line) || /^\s*-\s+\[[ x]\]/i.test(line)
  ).length;

  // Code identifiers: backtick-wrapped symbols (excluding file paths already counted)
  // This catches function names, class names, variables, etc.
  const allBacktickMatches = text.match(/`[^`]+`/g);
  const codeIdentifiers = allBacktickMatches ? allBacktickMatches.length : 0;

  return {
    charCount: text.length,
    lineCount: lines.length,
    sectionCount,
    fileReferences,
    actionableSteps,
    codeIdentifiers,
  };
}

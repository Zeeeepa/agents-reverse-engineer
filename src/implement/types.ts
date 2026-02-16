/**
 * Type definitions for the `are implement` command.
 *
 * Defines data model for implementation execution, quality evaluation,
 * comparison records, and CLI options.
 *
 * @module
 */

import type { CostBreakdown } from '../dashboard/cost-calculator.js';

/**
 * Quantitative metrics extracted from an implementation run.
 *
 * Measured via git diff analysis and optional test/build/lint runners.
 */
export interface ImplementationMetrics {
  filesCreated: number;
  filesModified: number;
  linesAdded: number;
  linesDeleted: number;
  testsCreated: number;
  testsPassing: number;
  testsFailing: number;
  lintErrors: number;
  lintWarnings: number;
  buildSuccess: boolean;
  commitCount: number;
}

/**
 * Result of a single AI implementation run in a worktree.
 */
export interface ImplementationRunResult {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  latencyMs: number;
  cost: CostBreakdown;
  metrics: ImplementationMetrics;
  implementationLog: string;
  success: boolean;
  error?: string;
}

/**
 * Score for a single evaluation criterion (1-5 scale).
 */
export interface CriterionScore {
  score: number;
  reasoning: string;
}

/**
 * AI evaluator's quality assessment of both implementations.
 *
 * `planALabel` tracks which implementation was presented as "Plan A"
 * to the evaluator (randomized to prevent position bias).
 */
export interface ImplementationEvaluation {
  planALabel: 'withDocs' | 'withoutDocs';
  codeQuality: CriterionScore;
  completeness: CriterionScore;
  testCoverage: CriterionScore;
  errorHandling: CriterionScore;
  adherenceToSpec: CriterionScore;
  totalScoreA: number;
  totalScoreB: number;
  summary: string;
  evalModel: string;
}

/**
 * Computed deltas between "with docs" and "without docs" implementations.
 */
export interface ComparisonDeltas {
  costDelta: number;
  latencyDelta: number;
  filesCreatedRatio: number | null;
  testPassingRatio: number | null;
  qualityScoreDelta: number | null;
}

/**
 * Full persisted implementation comparison record.
 */
export interface ImplementationComparison {
  id: string;
  startTime: string;
  endTime: string;
  task: string;
  taskSlug: string;
  backend: string;
  model: string;
  branches: {
    withDocs: string;
    withoutDocs: string;
  };
  withDocs: ImplementationRunResult;
  withoutDocs: ImplementationRunResult;
  evaluation: ImplementationEvaluation | null;
  deltas: ComparisonDeltas;
}

/**
 * CLI options for `are implement`.
 */
export interface ImplementOptions {
  model?: string;
  backend?: string;
  eval?: boolean;
  evalModel?: string;
  dryRun?: boolean;
  show?: string;
  list?: boolean;
  debug?: boolean;
  trace?: boolean;
  taskSlug?: string;
  runTests?: boolean;
  runBuild?: boolean;
  runLint?: boolean;
  force?: boolean;
}

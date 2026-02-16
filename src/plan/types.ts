/**
 * Types for the `are plan` command.
 *
 * Defines the data model for A/B plan comparisons: run results,
 * metrics extracted from plan text, qualitative evaluation scores,
 * and the full comparison record persisted to disk.
 *
 * @module
 */

import type { CostBreakdown } from '../dashboard/cost-calculator.js';

// ---------------------------------------------------------------------------
// Plan metrics (extracted from plan text)
// ---------------------------------------------------------------------------

/**
 * Quantitative metrics extracted from a plan's markdown text.
 */
export interface PlanMetrics {
  /** Total character count */
  charCount: number;
  /** Total line count */
  lineCount: number;
  /** Number of markdown headings (##, ###, etc.) */
  sectionCount: number;
  /** Number of backtick-wrapped file path references */
  fileReferences: number;
  /** Number of numbered/checkbox list items (actionable steps) */
  actionableSteps: number;
  /** Number of backtick-wrapped code identifiers */
  codeIdentifiers: number;
}

// ---------------------------------------------------------------------------
// Plan run result
// ---------------------------------------------------------------------------

/**
 * Result of a single AI planning run (either with or without docs).
 */
export interface PlanRunResult {
  /** Number of input tokens consumed */
  inputTokens: number;
  /** Number of output tokens generated */
  outputTokens: number;
  /** Number of tokens served from cache reads */
  cacheReadTokens: number;
  /** Number of tokens written to cache */
  cacheCreationTokens: number;
  /** Wall-clock duration in milliseconds */
  latencyMs: number;
  /** Cost breakdown */
  cost: CostBreakdown;
  /** Plan text metrics */
  metrics: PlanMetrics;
  /** The raw plan text output */
  planText: string;
  /** Whether this run completed successfully */
  success: boolean;
  /** Error message if the run failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// Qualitative evaluation
// ---------------------------------------------------------------------------

/**
 * Score for a single evaluation criterion (0-5 scale).
 */
export interface CriterionScore {
  /** Score from 1 to 5 */
  score: number;
  /** Evaluator's reasoning for this score */
  reasoning: string;
}

/**
 * Qualitative evaluation result from the AI evaluator.
 *
 * Plans are presented in randomized order as "Plan A"/"Plan B" to
 * prevent ordering bias.
 */
export interface QualitativeEvaluation {
  /** Which plan was presented as "Plan A" */
  planALabel: 'withDocs' | 'withoutDocs';
  /** Specificity score (25% weight) */
  specificity: CriterionScore;
  /** Accuracy score (25% weight) */
  accuracy: CriterionScore;
  /** Completeness score (20% weight) */
  completeness: CriterionScore;
  /** Actionability score (20% weight) */
  actionability: CriterionScore;
  /** Risk awareness score (10% weight) */
  riskAwareness: CriterionScore;
  /** Weighted total for Plan A */
  totalScoreA: number;
  /** Weighted total for Plan B */
  totalScoreB: number;
  /** Overall evaluator summary */
  summary: string;
  /** Model used for evaluation */
  evalModel: string;
}

// ---------------------------------------------------------------------------
// Comparison deltas
// ---------------------------------------------------------------------------

/**
 * Computed deltas between "with docs" and "without docs" runs.
 */
export interface ComparisonDeltas {
  /** Cost difference (withDocs.cost.totalCost - withoutDocs.cost.totalCost) */
  costDelta: number;
  /** Latency difference in ms */
  latencyDelta: number;
  /** Ratio of file references (withDocs / withoutDocs), null if withoutDocs is 0 */
  specificityRatio: number | null;
  /** Ratio of actionable steps (withDocs / withoutDocs), null if withoutDocs is 0 */
  actionabilityRatio: number | null;
  /** Quality score delta (withDocs - withoutDocs), null if no eval */
  qualityScoreDelta: number | null;
}

// ---------------------------------------------------------------------------
// Full comparison
// ---------------------------------------------------------------------------

/**
 * Complete plan comparison record, persisted as `comparison.json`.
 */
export interface PlanComparison {
  /** Unique ID (ISO timestamp) */
  id: string;
  /** ISO 8601 start time */
  startTime: string;
  /** ISO 8601 end time */
  endTime: string;
  /** Original task description */
  task: string;
  /** Slugified task for branch names */
  taskSlug: string;
  /** Backend used */
  backend: string;
  /** Model used */
  model: string;
  /** Branch names */
  branches: {
    withDocs: string;
    withoutDocs: string;
  };
  /** Results from the "with docs" run */
  withDocs: PlanRunResult;
  /** Results from the "without docs" run */
  withoutDocs: PlanRunResult;
  /** Qualitative evaluation (null if --eval not used) */
  evaluation: QualitativeEvaluation | null;
  /** Computed deltas */
  deltas: ComparisonDeltas;
}

// ---------------------------------------------------------------------------
// Command options
// ---------------------------------------------------------------------------

/**
 * Options for the `are plan` command.
 */
export interface PlanOptions {
  /** Model for planning */
  model?: string;
  /** Backend to use */
  backend?: string;
  /** Run AI quality evaluator on both plans */
  eval?: boolean;
  /** Model for evaluator */
  evalModel?: string;
  /** Show what would happen without executing */
  dryRun?: boolean;
  /** View a previous comparison by ID */
  show?: string;
  /** List all plan comparisons */
  list?: boolean;
  /** Verbose output */
  debug?: boolean;
  /** Enable tracing */
  trace?: boolean;
  /** Force overwrite existing branches */
  force?: boolean;
}

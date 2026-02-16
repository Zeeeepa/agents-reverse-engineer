/**
 * `are plan` command - Compare AI planning quality with and without ARE docs.
 *
 * Creates an A/B comparison by running an AI planning task in two
 * environments: one with full ARE documentation, one stripped to source
 * code only. Produces quantitative metrics and optional qualitative
 * evaluation to measure documentation impact.
 *
 * @module
 */

export { slugify } from './slugify.js';
export { buildPlanningPrompt, buildEvaluatorPrompt } from './prompts.js';
export { extractPlanMetrics } from './metrics.js';
export { createWorktreePair, hasUncommittedChanges } from './worktree.js';
export { stripArtifacts } from './strip-artifacts.js';
export { executePlanRun, extractPlanText } from './executor.js';
export { evaluatePlans } from './evaluator.js';
export { saveComparison, loadComparison, loadPlanText, listComparisons } from './storage.js';
export { renderComparison, renderHeader, renderPhaseStart, renderPhaseComplete } from './views/comparison.js';
export { renderList } from './views/list.js';

export type {
  PlanComparison,
  PlanRunResult,
  PlanMetrics,
  PlanOptions,
  ComparisonDeltas,
  QualitativeEvaluation,
  CriterionScore,
} from './types.js';

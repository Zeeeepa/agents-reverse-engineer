/**
 * Public API for the `are implement` module.
 *
 * @module
 */

export { executeImplementation } from './executor.js';
export { extractImplementationMetrics } from './metrics.js';
export { buildImplementationPrompt, buildEvaluatorPrompt } from './prompts.js';
export { evaluateImplementations } from './evaluator.js';
export { saveComparison, loadComparison, listComparisons } from './storage.js';
export { renderComparison, renderHeader, renderPhaseStart, renderPhaseComplete } from './views/comparison.js';
export { renderList } from './views/list.js';

export type {
  ImplementationComparison,
  ImplementationRunResult,
  ImplementationMetrics,
  ImplementOptions,
  ComparisonDeltas,
  ImplementationEvaluation,
  CriterionScore,
} from './types.js';

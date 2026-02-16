/**
 * AI quality evaluator for plan comparisons.
 *
 * Invokes a third AI call to evaluate both plans on a 5-point rubric.
 * Plans are presented in randomized order to prevent position bias.
 *
 * @module
 */

import { runSubprocess } from '../ai/subprocess.js';
import { ClaudeBackend } from '../ai/backends/claude.js';
import { buildEvaluatorPrompt } from './prompts.js';
import type { QualitativeEvaluation, CriterionScore } from './types.js';

/** Timeout for evaluation (5 minutes) */
const EVAL_TIMEOUT_MS = 300_000;

/** Criterion weights for computing weighted total */
const WEIGHTS = {
  specificity: 0.25,
  accuracy: 0.25,
  completeness: 0.20,
  actionability: 0.20,
  riskAwareness: 0.10,
} as const;

/**
 * Raw evaluation JSON shape returned by the AI evaluator.
 */
interface RawEvalResult {
  specificity: { planA: { score: number; reasoning: string }; planB: { score: number; reasoning: string } };
  accuracy: { planA: { score: number; reasoning: string }; planB: { score: number; reasoning: string } };
  completeness: { planA: { score: number; reasoning: string }; planB: { score: number; reasoning: string } };
  actionability: { planA: { score: number; reasoning: string }; planB: { score: number; reasoning: string } };
  riskAwareness: { planA: { score: number; reasoning: string }; planB: { score: number; reasoning: string } };
  summary: string;
}

/**
 * Run the AI quality evaluator on two plans.
 *
 * Randomizes plan order to prevent position bias, invokes the AI
 * evaluator, and maps scores back to the original labels.
 *
 * @param task - The original task description
 * @param withDocsPlan - Plan text from the "with docs" run
 * @param withoutDocsPlan - Plan text from the "without docs" run
 * @param model - Model to use for evaluation
 * @param debug - Whether to enable debug output
 * @returns Qualitative evaluation result, or null if evaluation fails
 */
export async function evaluatePlans(
  task: string,
  withDocsPlan: string,
  withoutDocsPlan: string,
  model?: string,
  debug?: boolean,
): Promise<QualitativeEvaluation | null> {
  // Randomize order to prevent position bias
  const withDocsFirst = Math.random() < 0.5;
  const planA = withDocsFirst ? withDocsPlan : withoutDocsPlan;
  const planB = withDocsFirst ? withoutDocsPlan : withDocsPlan;
  const planALabel: 'withDocs' | 'withoutDocs' = withDocsFirst ? 'withDocs' : 'withoutDocs';

  const prompt = buildEvaluatorPrompt(task, planA, planB);

  // Run evaluator as non-agentic (no tools, single turn)
  const args: string[] = [
    '-p', prompt,
    '--output-format', 'json',
    '--no-session-persistence',
    '--disable-slash-commands',
    '--tools', '',
    '--max-turns', '1',
  ];

  if (model) {
    args.push('--model', model);
  }

  if (debug) {
    console.error(`[eval] Running evaluator with model: ${model ?? 'default'}`);
  }

  const result = await runSubprocess('claude', args, {
    timeoutMs: EVAL_TIMEOUT_MS,
  });

  if (result.exitCode !== 0 && !result.stdout) {
    if (debug) {
      console.error(`[eval] Evaluator failed: exit ${result.exitCode}`);
      console.error(`[eval] Stderr: ${result.stderr.slice(0, 500)}`);
    }
    return null;
  }

  try {
    // Parse the response to get the text
    const backend = new ClaudeBackend();
    const response = backend.parseResponse(result.stdout, result.durationMs, result.exitCode);

    // Extract JSON from the response text
    const jsonText = extractJson(response.text);
    const raw: RawEvalResult = JSON.parse(jsonText);

    // Map scores back to original labels
    const mapScore = (criterion: { planA: { score: number; reasoning: string }; planB: { score: number; reasoning: string } }): CriterionScore => ({
      // We want the "withDocs" score, which depends on which was Plan A
      score: planALabel === 'withDocs' ? criterion.planA.score : criterion.planB.score,
      reasoning: planALabel === 'withDocs' ? criterion.planA.reasoning : criterion.planB.reasoning,
    });

    // Compute weighted totals
    const computeWeightedTotal = (getter: 'planA' | 'planB') =>
      raw.specificity[getter].score * WEIGHTS.specificity +
      raw.accuracy[getter].score * WEIGHTS.accuracy +
      raw.completeness[getter].score * WEIGHTS.completeness +
      raw.actionability[getter].score * WEIGHTS.actionability +
      raw.riskAwareness[getter].score * WEIGHTS.riskAwareness;

    return {
      planALabel,
      specificity: mapScore(raw.specificity),
      accuracy: mapScore(raw.accuracy),
      completeness: mapScore(raw.completeness),
      actionability: mapScore(raw.actionability),
      riskAwareness: mapScore(raw.riskAwareness),
      totalScoreA: computeWeightedTotal('planA'),
      totalScoreB: computeWeightedTotal('planB'),
      summary: raw.summary,
      evalModel: response.model,
    };
  } catch (error) {
    if (debug) {
      console.error(`[eval] Failed to parse evaluator response: ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  }
}

/**
 * Extract JSON from a response that may contain markdown fences or preamble.
 */
function extractJson(text: string): string {
  // Try to find JSON inside markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) return fenceMatch[1];

  // Try to find a JSON object directly
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    return text.slice(jsonStart, jsonEnd + 1);
  }

  return text;
}

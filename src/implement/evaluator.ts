/**
 * AI quality evaluator for implementation comparisons.
 *
 * Runs a single-turn, non-agentic Claude invocation to blindly evaluate
 * two implementations. Randomizes presentation order to prevent position bias.
 *
 * @module
 */

import { runSubprocess } from '../ai/subprocess.js';
import { ClaudeBackend } from '../ai/backends/claude.js';
import { buildEvaluatorPrompt } from './prompts.js';
import type { ImplementationEvaluation, CriterionScore } from './types.js';

/** Timeout for evaluation (5 minutes) */
const EVAL_TIMEOUT_MS = 300_000;

/** Weighted scoring criteria */
const WEIGHTS = {
  codeQuality: 0.30,
  completeness: 0.25,
  testCoverage: 0.20,
  errorHandling: 0.15,
  adherenceToSpec: 0.10,
} as const;

/** Raw JSON structure returned by the evaluator model */
interface RawEvalResult {
  codeQuality: { planA: { score: number; reasoning: string }; planB: { score: number; reasoning: string } };
  completeness: { planA: { score: number; reasoning: string }; planB: { score: number; reasoning: string } };
  testCoverage: { planA: { score: number; reasoning: string }; planB: { score: number; reasoning: string } };
  errorHandling: { planA: { score: number; reasoning: string }; planB: { score: number; reasoning: string } };
  adherenceToSpec: { planA: { score: number; reasoning: string }; planB: { score: number; reasoning: string } };
  summary: string;
}

/**
 * Evaluate two implementations blindly using an AI model.
 *
 * Randomizes which implementation is "Plan A" vs "Plan B" to prevent
 * position bias, then maps scores back to the original labels.
 *
 * @param task - The original task description
 * @param withDocsImpl - Implementation log from the "with docs" run
 * @param withoutDocsImpl - Implementation log from the "without docs" run
 * @param model - Model to use for evaluation
 * @param debug - Enable debug logging
 * @returns Evaluation result, or null if evaluation fails
 */
export async function evaluateImplementations(
  task: string,
  withDocsImpl: string,
  withoutDocsImpl: string,
  model?: string,
  debug?: boolean,
): Promise<ImplementationEvaluation | null> {
  // Randomize order to prevent position bias
  const withDocsFirst = Math.random() < 0.5;
  const implA = withDocsFirst ? withDocsImpl : withoutDocsImpl;
  const implB = withDocsFirst ? withoutDocsImpl : withDocsImpl;
  const planALabel: 'withDocs' | 'withoutDocs' = withDocsFirst ? 'withDocs' : 'withoutDocs';

  const prompt = buildEvaluatorPrompt(task, implA, implB);

  // Non-agentic single turn (no tools, just evaluation)
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

  const result = await runSubprocess('claude', args, {
    timeoutMs: EVAL_TIMEOUT_MS,
  });

  if (result.exitCode !== 0 && !result.stdout) {
    return null;
  }

  try {
    const backend = new ClaudeBackend();
    const response = backend.parseResponse(result.stdout, result.durationMs, result.exitCode);

    const jsonText = extractJson(response.text);
    const raw: RawEvalResult = JSON.parse(jsonText);

    // Map scores: extract the "withDocs" score based on which position it was in
    const mapScore = (
      criterion: { planA: { score: number; reasoning: string }; planB: { score: number; reasoning: string } },
    ): CriterionScore => ({
      score: planALabel === 'withDocs' ? criterion.planA.score : criterion.planB.score,
      reasoning: planALabel === 'withDocs' ? criterion.planA.reasoning : criterion.planB.reasoning,
    });

    const computeWeightedTotal = (getter: 'planA' | 'planB') =>
      raw.codeQuality[getter].score * WEIGHTS.codeQuality +
      raw.completeness[getter].score * WEIGHTS.completeness +
      raw.testCoverage[getter].score * WEIGHTS.testCoverage +
      raw.errorHandling[getter].score * WEIGHTS.errorHandling +
      raw.adherenceToSpec[getter].score * WEIGHTS.adherenceToSpec;

    return {
      planALabel,
      codeQuality: mapScore(raw.codeQuality),
      completeness: mapScore(raw.completeness),
      testCoverage: mapScore(raw.testCoverage),
      errorHandling: mapScore(raw.errorHandling),
      adherenceToSpec: mapScore(raw.adherenceToSpec),
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
 * Extract JSON from model output that may contain markdown fences or prose.
 */
function extractJson(text: string): string {
  // Try markdown fence
  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) return fenceMatch[1];

  // Try raw JSON object
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    return text.slice(jsonStart, jsonEnd + 1);
  }

  return text;
}

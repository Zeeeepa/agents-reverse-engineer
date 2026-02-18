/**
 * Agentic AI execution for plan comparisons.
 *
 * Uses {@link AIService} to run an AI CLI in agentic mode (with tools)
 * inside a worktree, capturing the plan output with full telemetry,
 * tracing, and retry support.
 *
 * @module
 */

import type { AIService } from '../ai/service.js';
import { computeCost, getModelPricing } from '../dashboard/cost-calculator.js';
import { extractPlanMetrics } from './metrics.js';
import { buildPlanningPrompt } from './prompts.js';
import type { PlanRunResult } from './types.js';

/** Timeout for agentic exploration (20 minutes) */
const AGENTIC_TIMEOUT_MS = 1_200_000;

/**
 * Options for executing a plan run.
 */
export interface ExecuteOptions {
  /** The task description */
  task: string;
  /** Working directory (worktree path) */
  cwd: string;
  /** Model to use */
  model?: string;
  /** Debug mode */
  debug?: boolean;
  /** AI service instance for subprocess management */
  aiService: AIService;
}

/**
 * Execute an AI planning run in a worktree using the AI service in agentic mode.
 *
 * Invokes the AI with tools enabled (Read, Glob, Grep, Bash) so it can
 * explore the codebase and produce a thorough plan. All calls go through
 * {@link AIService} for retry logic, telemetry, and subprocess logging.
 *
 * @param options - Execution options
 * @returns Plan run result with metrics and token usage
 */
export async function executePlanRun(options: ExecuteOptions): Promise<PlanRunResult> {
  const { task, cwd, model, debug, aiService } = options;
  const prompt = buildPlanningPrompt(task);

  if (debug) {
    console.error(`[plan] Executing in: ${cwd}`);
  }

  try {
    const response = await aiService.call({
      prompt,
      model,
      timeoutMs: AGENTIC_TIMEOUT_MS,
      maxTurns: 25,
      allowedTools: 'Read,Glob,Grep,Bash,Task,WebSearch,WebFetch',
      cwd,
      taskLabel: `plan:${cwd.includes('without-docs') ? 'without-docs' : 'with-docs'}`,
    });

    if (debug) {
      console.error(`[plan] Completed. Duration: ${response.durationMs}ms`);
    }

    const pricing = getModelPricing(response.model);
    const cost = computeCost(
      response.inputTokens,
      response.outputTokens,
      response.cacheReadTokens,
      response.cacheCreationTokens,
      pricing,
    );

    const metrics = extractPlanMetrics(response.text);

    return {
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      cacheReadTokens: response.cacheReadTokens,
      cacheCreationTokens: response.cacheCreationTokens,
      latencyMs: response.durationMs,
      cost,
      metrics,
      planText: response.text,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`[plan] FAILURE DIAGNOSTICS:`);
    console.error(`[plan]   Error: ${errorMessage}`);

    const isTimeout = error instanceof Error && error.message.includes('timed out');

    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      latencyMs: 0,
      cost: { inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, totalCost: 0 },
      metrics: { charCount: 0, lineCount: 0, sectionCount: 0, fileReferences: 0, actionableSteps: 0, codeIdentifiers: 0 },
      planText: '',
      success: false,
      error: isTimeout ? `Timed out after ${AGENTIC_TIMEOUT_MS / 1000}s` : errorMessage,
    };
  }
}

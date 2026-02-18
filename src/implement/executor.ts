/**
 * Agentic AI execution for implementation comparisons.
 *
 * Uses {@link AIService} to run an AI CLI in agentic mode (with write tools)
 * inside a worktree, capturing the implementation output with full telemetry,
 * tracing, and retry support.
 *
 * @module
 */

import type { AIService } from '../ai/service.js';
import { computeCost, getModelPricing } from '../dashboard/cost-calculator.js';
import { extractImplementationMetrics } from './metrics.js';
import { buildImplementationPrompt } from './prompts.js';
import type { ImplementationRunResult } from './types.js';

/** Timeout for agentic implementation (40 minutes — 2x planning timeout) */
const IMPLEMENTATION_TIMEOUT_MS = 2_400_000;

/**
 * Options for executing an implementation run.
 */
export interface ExecuteOptions {
  /** The task description */
  task: string;
  /** Plan text from the previous `are plan` run (omit for plan-less runs) */
  planText?: string;
  /** Working directory (worktree path) */
  cwd: string;
  /** Git ref (SHA) of the branch fork point — used to measure cumulative changes across all sessions */
  baseRef?: string;
  /** Model to use */
  model?: string;
  /** Debug mode */
  debug?: boolean;
  /** Run test suite after implementation */
  runTests?: boolean;
  /** Run build after implementation */
  runBuild?: boolean;
  /** Run linter after implementation */
  runLint?: boolean;
  /** AI service instance for subprocess management */
  aiService: AIService;
}

/**
 * Execute an AI implementation run in a worktree using the AI service in agentic mode.
 *
 * Invokes the AI with write tools enabled (Read, Glob, Grep, Bash, Write, Edit)
 * so it can create and modify files, run commands, and implement the plan.
 * All calls go through {@link AIService} for retry logic, telemetry, and
 * subprocess logging.
 *
 * @param options - Execution options
 * @returns Implementation run result with metrics and token usage
 */
export async function executeImplementation(options: ExecuteOptions): Promise<ImplementationRunResult> {
  const { task, planText, cwd, baseRef, model, debug, runTests, runBuild, runLint, aiService } = options;

  const prompt = buildImplementationPrompt(task, planText, { runTests, runBuild, runLint });

  if (debug) {
    console.error(`[implement] Executing in: ${cwd}`);
  }

  try {
    const response = await aiService.call({
      prompt,
      model,
      timeoutMs: IMPLEMENTATION_TIMEOUT_MS,
      maxTurns: 100,
      allowedTools: 'Read,Glob,Grep,Bash,Write,Edit,Task,WebSearch,WebFetch,TodoWrite',
      cwd,
      taskLabel: `implement:${cwd.includes('without-docs') ? 'without-docs' : 'with-docs'}`,
    });

    if (debug) {
      console.error(`[implement] Completed. Duration: ${response.durationMs}ms`);
    }

    const pricing = getModelPricing(response.model);
    const cost = computeCost(
      response.inputTokens,
      response.outputTokens,
      response.cacheReadTokens,
      response.cacheCreationTokens,
      pricing,
    );

    const metrics = await extractImplementationMetrics(cwd, {
      baseRef,
      runTests,
      runBuild,
      runLint,
      debug,
    });

    return {
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      cacheReadTokens: response.cacheReadTokens,
      cacheCreationTokens: response.cacheCreationTokens,
      latencyMs: response.durationMs,
      cost,
      metrics,
      implementationLog: response.text,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`[implement] FAILURE DIAGNOSTICS:`);
    console.error(`[implement]   Error: ${errorMessage}`);

    const isTimeout = error instanceof Error && error.message.includes('timed out');

    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      latencyMs: 0,
      cost: { inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, totalCost: 0 },
      metrics: {
        filesCreated: 0,
        filesModified: 0,
        linesAdded: 0,
        linesDeleted: 0,
        testsCreated: 0,
        testsPassing: 0,
        testsFailing: 0,
        lintErrors: 0,
        lintWarnings: 0,
        buildSuccess: false,
        commitCount: 0,
      },
      implementationLog: '',
      success: false,
      error: isTimeout ? `Timed out after ${IMPLEMENTATION_TIMEOUT_MS / 1000}s` : errorMessage,
    };
  }
}

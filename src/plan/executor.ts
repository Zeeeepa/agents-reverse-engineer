/**
 * Agentic AI execution for plan comparisons.
 *
 * Spawns an AI CLI in agentic mode (with tools) inside a worktree,
 * captures the plan output, and parses the response.
 *
 * @module
 */

import { runSubprocess } from '../ai/subprocess.js';
import { ClaudeBackend } from '../ai/backends/claude.js';
import { computeCost, getModelPricing } from '../dashboard/cost-calculator.js';
import { extractPlanMetrics } from './metrics.js';
import { buildPlanningPrompt } from './prompts.js';
import type { PlanRunResult } from './types.js';

/** Timeout for agentic exploration (10 minutes) */
const AGENTIC_TIMEOUT_MS = 600_000;

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
}

/**
 * Execute an AI planning run in a worktree using Claude in agentic mode.
 *
 * Spawns `claude -p` with tools enabled so the AI can read files,
 * search the codebase, and produce a thorough plan.
 *
 * @param options - Execution options
 * @returns Plan run result with metrics and token usage
 */
export async function executePlanRun(options: ExecuteOptions): Promise<PlanRunResult> {
  const { task, cwd, model, debug } = options;
  const prompt = buildPlanningPrompt(task);

  // Build agentic args (different from standard --print mode):
  // - Tools enabled (Read, Glob, Grep, Bash)
  // - Multiple turns allowed
  const args: string[] = [
    '-p', prompt,
    '--allowedTools', 'Read,Glob,Grep,Bash',
    '--output-format', 'json',
    '--no-session-persistence',
    '--disable-slash-commands',
    '--max-turns', '25',
  ];

  if (model) {
    args.push('--model', model);
  }

  if (debug) {
    console.error(`[plan] Executing in: ${cwd}`);
    console.error(`[plan] Args: claude ${args.join(' ')}`);
  }

  const result = await runSubprocess('claude', args, {
    timeoutMs: AGENTIC_TIMEOUT_MS,
    cwd,
  });

  if (debug) {
    console.error(`[plan] Exit code: ${result.exitCode}, Duration: ${result.durationMs}ms`);
    if (result.stderr) {
      console.error(`[plan] Stderr: ${result.stderr.slice(0, 500)}`);
    }
  }

  // Parse the response
  try {
    const backend = new ClaudeBackend();
    const response = backend.parseResponse(result.stdout, result.durationMs, result.exitCode);

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
    // Execution failed but we still have some data
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      latencyMs: result.durationMs,
      cost: { inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, totalCost: 0 },
      metrics: { charCount: 0, lineCount: 0, sectionCount: 0, fileReferences: 0, actionableSteps: 0, codeIdentifiers: 0 },
      planText: '',
      success: false,
      error: result.timedOut ? `Timed out after ${AGENTIC_TIMEOUT_MS / 1000}s` : errorMessage,
    };
  }
}

/**
 * Extract the plan text from a Claude agentic run's raw stdout.
 *
 * Parses the JSON output to get the `result` field containing the plan.
 *
 * @param stdout - Raw stdout from the Claude CLI
 * @returns The plan text, or an error message if parsing fails
 */
export function extractPlanText(stdout: string): string {
  try {
    const backend = new ClaudeBackend();
    const response = backend.parseResponse(stdout, 0, 0);
    return response.text;
  } catch {
    // If we can't parse JSON, try to extract any meaningful text
    // Remove JSON noise and return what we have
    return stdout.length > 0
      ? `[Failed to parse structured output. Raw output length: ${stdout.length} chars]`
      : '[No output received from AI]';
  }
}

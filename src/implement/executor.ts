/**
 * Agentic AI execution for implementation comparisons.
 *
 * Spawns an AI CLI in agentic mode (with write tools) inside a worktree,
 * captures the implementation output, and parses the response.
 *
 * @module
 */

import { runSubprocess } from '../ai/subprocess.js';
import { ClaudeBackend } from '../ai/backends/claude.js';
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
}

/**
 * Execute an AI implementation run in a worktree using Claude in agentic mode.
 *
 * Spawns `claude -p` with write tools enabled so the AI can create and
 * modify files, run commands, and implement the plan.
 *
 * @param options - Execution options
 * @returns Implementation run result with metrics and token usage
 */
export async function executeImplementation(options: ExecuteOptions): Promise<ImplementationRunResult> {
  const { task, planText, cwd, baseRef, model, debug, runTests, runBuild, runLint } = options;

  const prompt = buildImplementationPrompt(task, planText, { runTests, runBuild, runLint });

  // Build agentic args with write tools enabled (unlike planning which is read-only)
  const args: string[] = [
    '-p', prompt,
    '--allowedTools', 'Read,Glob,Grep,Bash,Write,Edit',
    '--output-format', 'json',
    '--no-session-persistence',
    '--disable-slash-commands',
    '--max-turns', '100',
  ];

  if (model) {
    args.push('--model', model);
  }

  if (debug) {
    console.error(`[implement] Executing in: ${cwd}`);
    console.error(`[implement] Args: claude ${args.join(' ')}`);
  }

  const result = await runSubprocess('claude', args, {
    timeoutMs: IMPLEMENTATION_TIMEOUT_MS,
    cwd,
  });

  if (debug) {
    console.error(`[implement] Exit code: ${result.exitCode}, Duration: ${result.durationMs}ms`);
    if (result.stderr) {
      console.error(`[implement] Stderr: ${result.stderr.slice(0, 500)}`);
    }
  }

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
    console.error(`[implement]   Exit code: ${result.exitCode}, Signal: ${result.signal}, TimedOut: ${result.timedOut}`);
    console.error(`[implement]   Duration: ${result.durationMs}ms`);
    console.error(`[implement]   Stdout length: ${result.stdout.length} chars`);
    console.error(`[implement]   Stderr length: ${result.stderr.length} chars`);
    if (result.stderr) {
      console.error(`[implement]   Stderr (first 1000): ${result.stderr.slice(0, 1000)}`);
    }
    if (result.stdout) {
      console.error(`[implement]   Stdout (last 500): ${result.stdout.slice(-500)}`);
    }
    console.error(`[implement]   Parse error: ${errorMessage}`);

    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      latencyMs: result.durationMs,
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
      error: result.timedOut ? `Timed out after ${IMPLEMENTATION_TIMEOUT_MS / 1000}s` : errorMessage,
    };
  }
}

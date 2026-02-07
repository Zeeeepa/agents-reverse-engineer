/**
 * Claude CLI backend adapter.
 *
 * Full implementation of the {@link AIBackend} interface for the Claude Code
 * CLI (`claude`). Builds CLI arguments, parses structured JSON responses
 * with Zod validation, detects CLI availability on PATH, and provides
 * install instructions.
 *
 * The prompt is NOT included in the args array -- it goes to stdin via
 * the subprocess wrapper ({@link runSubprocess}).
 *
 * @module
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import type { AIBackend, AICallOptions, AIResponse } from '../types.js';
import { AIServiceError } from '../types.js';

// ---------------------------------------------------------------------------
// Zod schema for Claude CLI JSON output
// ---------------------------------------------------------------------------

/**
 * Schema validated against Claude CLI v2.1.31 JSON output.
 *
 * When invoked with `claude -p --output-format json`, the CLI produces a
 * single JSON object on stdout matching this shape. See RESEARCH.md for
 * the live verification details.
 */
const ClaudeResponseSchema = z.object({
  type: z.literal('result'),
  subtype: z.enum(['success', 'error']),
  is_error: z.boolean(),
  duration_ms: z.number(),
  duration_api_ms: z.number(),
  num_turns: z.number(),
  result: z.string(),
  session_id: z.string(),
  total_cost_usd: z.number(),
  usage: z.object({
    input_tokens: z.number(),
    cache_creation_input_tokens: z.number(),
    cache_read_input_tokens: z.number(),
    output_tokens: z.number(),
  }),
  modelUsage: z.record(z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadInputTokens: z.number(),
    cacheCreationInputTokens: z.number(),
    costUSD: z.number(),
  })),
});

// ---------------------------------------------------------------------------
// PATH detection utility
// ---------------------------------------------------------------------------

/**
 * Check whether a command is available on the system PATH.
 *
 * Splits `process.env.PATH` by the platform delimiter and checks each
 * directory for a file matching the command name. On Windows, also checks
 * each extension from `process.env.PATHEXT` (e.g., `.exe`, `.cmd`, `.bat`).
 *
 * Uses `fs.stat` (not `fs.access` with execute bit) for cross-platform
 * compatibility -- Windows does not have Unix execute permissions.
 *
 * @param command - The bare command name to look for (e.g., "claude")
 * @returns `true` if the command exists as a file in any PATH directory
 *
 * @example
 * ```typescript
 * if (await isCommandOnPath('claude')) {
 *   console.log('Claude CLI is available');
 * }
 * ```
 */
export async function isCommandOnPath(command: string): Promise<boolean> {
  const envPath = process.env.PATH ?? '';
  const pathDirs = envPath
    .replace(/["]+/g, '')
    .split(path.delimiter)
    .filter(Boolean);

  // On Windows, PATHEXT lists executable extensions (e.g., ".EXE;.CMD;.BAT").
  // On other platforms, PATHEXT is unset; check the bare command name only.
  const envExt = process.env.PATHEXT ?? '';
  const extensions = envExt ? envExt.split(';') : [''];

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      try {
        const candidate = path.join(dir, command + ext);
        const stat = await fs.stat(candidate);
        if (stat.isFile()) {
          return true;
        }
      } catch {
        // Not found in this dir/ext combination, continue
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Claude backend
// ---------------------------------------------------------------------------

/**
 * Claude Code CLI backend adapter.
 *
 * Implements the {@link AIBackend} interface for the `claude` CLI.
 * This is the primary (and currently only fully implemented) backend.
 *
 * @example
 * ```typescript
 * const backend = new ClaudeBackend();
 * if (await backend.isAvailable()) {
 *   const args = backend.buildArgs({ prompt: 'Summarize this file' });
 *   const result = await runSubprocess('claude', args, {
 *     timeoutMs: 120_000,
 *     input: 'Summarize this file',
 *   });
 *   const response = backend.parseResponse(result.stdout, result.durationMs, result.exitCode);
 * }
 * ```
 */
export class ClaudeBackend implements AIBackend {
  readonly name = 'claude';
  readonly cliCommand = 'claude';

  /**
   * Check if the `claude` CLI is available on PATH.
   */
  async isAvailable(): Promise<boolean> {
    return isCommandOnPath(this.cliCommand);
  }

  /**
   * Build CLI arguments for a Claude invocation.
   *
   * Returns the argument array for `claude -p --output-format json`. The
   * prompt itself is NOT included -- it goes to stdin via the subprocess
   * wrapper.
   *
   * @param options - Call options (model, systemPrompt, maxTurns)
   * @returns Argument array suitable for {@link runSubprocess}
   */
  buildArgs(options: AICallOptions): string[] {
    const args: string[] = [
      '-p',                        // Non-interactive print mode
      '--output-format', 'json',   // Structured JSON output
      '--no-session-persistence',  // Don't save session to disk
      '--permission-mode', 'bypassPermissions',  // Non-interactive: skip permission prompts (PITFALLS.md §8)
    ];

    if (options.model) {
      args.push('--model', options.model);
    }

    if (options.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt);
    }

    if (options.maxTurns !== undefined) {
      args.push('--max-turns', String(options.maxTurns));
    }

    return args;
  }

  /**
   * Parse Claude CLI JSON output into a normalized {@link AIResponse}.
   *
   * Handles non-JSON prefix text by finding the first `{` character
   * (defensive parsing per RESEARCH.md Pitfall 4). Validates the response
   * against the Zod schema and extracts the model name from `modelUsage`.
   *
   * @param stdout - Raw stdout from the Claude CLI process
   * @param durationMs - Wall-clock duration of the subprocess
   * @param exitCode - Process exit code
   * @returns Normalized AI response
   * @throws {AIServiceError} With code `PARSE_ERROR` if JSON is missing or schema validation fails
   */
  parseResponse(stdout: string, durationMs: number, exitCode: number): AIResponse {
    // Find JSON object in stdout (handle any prefix text like upgrade notices)
    const jsonStart = stdout.indexOf('{');
    if (jsonStart === -1) {
      throw new AIServiceError(
        'PARSE_ERROR',
        `No JSON object found in Claude CLI output. Raw output (first 200 chars): ${stdout.slice(0, 200)}`,
      );
    }

    let parsed: z.infer<typeof ClaudeResponseSchema>;
    try {
      parsed = ClaudeResponseSchema.parse(JSON.parse(stdout.slice(jsonStart)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AIServiceError(
        'PARSE_ERROR',
        `Failed to parse Claude CLI JSON response: ${message}`,
      );
    }

    // Extract model name from modelUsage keys (first key is the model used)
    const modelName = Object.keys(parsed.modelUsage)[0] ?? 'unknown';

    return {
      text: parsed.result,
      model: modelName,
      inputTokens: parsed.usage.input_tokens,
      outputTokens: parsed.usage.output_tokens,
      cacheReadTokens: parsed.usage.cache_read_input_tokens,
      cacheCreationTokens: parsed.usage.cache_creation_input_tokens,
      costUsd: parsed.total_cost_usd,
      durationMs,
      exitCode,
      raw: parsed,
    };
  }

  /**
   * Get user-facing install instructions for the Claude CLI.
   */
  getInstallInstructions(): string {
    return [
      'Claude Code (recommended):',
      '  npm install -g @anthropic-ai/claude-code',
      '  https://code.claude.com',
    ].join('\n');
  }
}

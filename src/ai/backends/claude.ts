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
 * Schema for Claude CLI JSON result object.
 *
 * Uses `.passthrough()` on nested objects so that new fields added by
 * future CLI versions don't cause validation failures.
 *
 * Supports both legacy single-object output (CLI ≤ 2.1.31) and NDJSON
 * streaming output (CLI ≥ 2.1.38).
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
  }).passthrough(),
  modelUsage: z.record(z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadInputTokens: z.number(),
    cacheCreationInputTokens: z.number(),
    costUSD: z.number(),
  }).passthrough()),
}).passthrough();

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
   * Supports two output formats:
   * - **Legacy** (CLI ≤ 2.1.31): Single JSON object on stdout, possibly
   *   preceded by non-JSON text (upgrade notices, etc.)
   * - **NDJSON** (CLI ≥ 2.1.38): Multiple newline-delimited JSON objects
   *   (`system`, `assistant`, `result`). We extract the `{"type":"result",...}`
   *   line and parse that.
   *
   * Validates the response against the Zod schema and extracts the model
   * name from `modelUsage`.
   *
   * @param stdout - Raw stdout from the Claude CLI process
   * @param durationMs - Wall-clock duration of the subprocess
   * @param exitCode - Process exit code
   * @returns Normalized AI response
   * @throws {AIServiceError} With code `PARSE_ERROR` if JSON is missing or schema validation fails
   */
  parseResponse(stdout: string, durationMs: number, exitCode: number): AIResponse {
    // Try NDJSON format first: find the line containing the result object.
    // Claude CLI ≥ 2.1.38 emits multiple JSON lines; we need the "result" one.
    const resultJson = this.extractResultJson(stdout);

    if (resultJson === undefined) {
      throw new AIServiceError(
        'PARSE_ERROR',
        `No JSON result object found in Claude CLI output. Raw output (first 200 chars): ${stdout.slice(0, 200)}`,
      );
    }

    let parsed: z.infer<typeof ClaudeResponseSchema>;
    try {
      parsed = ClaudeResponseSchema.parse(JSON.parse(resultJson));
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
      durationMs,
      exitCode,
      raw: parsed,
    };
  }

  /**
   * Extract the result JSON string from Claude CLI stdout.
   *
   * Handles three output formats:
   * - **JSON array** (CLI ≥ 2.1.38): `[{system}, {assistant}, {result}]`
   *   Parses the array, finds the element with `type: "result"`, and
   *   re-serializes it.
   * - **NDJSON**: Multiple newline-delimited JSON objects. Finds the
   *   line with `type: "result"`.
   * - **Legacy** (CLI ≤ 2.1.31): A single JSON object (possibly preceded
   *   by non-JSON text).
   *
   * @param stdout - Raw stdout from the CLI process
   * @returns The JSON string for the result object, or `undefined` if not found
   */
  private extractResultJson(stdout: string): string | undefined {
    const trimmed = stdout.trim();

    // Strategy 1: JSON array — `[{...}, {...}, {...}]`
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed) as Array<Record<string, unknown>>;
        const result = arr.find((item) => item.type === 'result');
        if (result !== undefined) {
          return JSON.stringify(result);
        }
      } catch {
        // Not a valid JSON array; fall through to other strategies
      }
    }

    // Strategy 2: NDJSON — look for a line that is the result object
    const lines = stdout.split('\n');
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith('{')) continue;
      try {
        const obj = JSON.parse(l) as Record<string, unknown>;
        if (obj.type === 'result') {
          return l;
        }
      } catch {
        // Not a complete JSON line, skip
      }
    }

    // Strategy 3: Legacy single-object — find first `{` and try to parse
    const jsonStart = stdout.indexOf('{');
    if (jsonStart !== -1) {
      return stdout.slice(jsonStart);
    }

    return undefined;
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

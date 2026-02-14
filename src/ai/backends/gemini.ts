/**
 * Gemini CLI backend.
 *
 * Implements the {@link AIBackend} interface for the Gemini CLI (`gemini`).
 * Parses the JSON output format produced by `gemini -p <prompt> --output-format json`,
 * extracts token metrics from `stats.models`, and maps ARE model aliases
 * to Gemini model identifiers.
 *
 * @module
 */

import { z } from 'zod';
import type { AIBackend, AICallOptions, AIResponse } from '../types.js';
import { AIServiceError } from '../types.js';
import { isCommandOnPath } from './common.js';

// ---------------------------------------------------------------------------
// Zod schemas for Gemini CLI JSON response
// ---------------------------------------------------------------------------

const GeminiModelTokensSchema = z.object({
  prompt: z.number().optional().default(0),
  response: z.number().optional().default(0),
  total: z.number().optional().default(0),
}).passthrough();

const GeminiStatsSchema = z.object({
  session: z.object({
    duration: z.number().optional().default(0),
  }).passthrough().optional(),
  models: z.record(
    z.object({
      tokens: GeminiModelTokensSchema.optional(),
    }).passthrough(),
  ).optional(),
}).passthrough();

const GeminiResponseSchema = z.object({
  response: z.string().nullable(),
  stats: GeminiStatsSchema.optional(),
  error: z.unknown().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Model alias resolution
// ---------------------------------------------------------------------------

/** Maps ARE standard aliases and Gemini short names to full model identifiers. */
const MODEL_ALIASES: Record<string, string> = {
  // ARE standard aliases → Gemini equivalents
  'sonnet': 'gemini-3-flash-preview',
  'opus':   'gemini-3-pro-preview',
  'haiku':  'gemini-2.5-flash',
  // Gemini short names
  'flash':  'gemini-3-flash-preview',
  'pro':    'gemini-3-pro-preview',
};

function resolveModelForGemini(model: string): string {
  if (model.startsWith('gemini-')) return model;
  return MODEL_ALIASES[model] ?? model;
}

// ---------------------------------------------------------------------------
// Backend implementation
// ---------------------------------------------------------------------------

/**
 * Gemini CLI backend.
 *
 * @example
 * ```typescript
 * const backend = new GeminiBackend();
 * if (await backend.isAvailable()) {
 *   const args = backend.buildArgs({ prompt: 'Hello', model: 'flash' });
 *   // → ['-p', 'Hello', '--output-format', 'json', '-m', 'gemini-3-flash-preview']
 * }
 * ```
 */
export class GeminiBackend implements AIBackend {
  readonly name = 'gemini';
  readonly cliCommand = 'gemini';

  async isAvailable(): Promise<boolean> {
    return isCommandOnPath(this.cliCommand);
  }

  /**
   * Build CLI arguments for a Gemini invocation.
   *
   * Uses `-p <prompt>` for headless mode and `--output-format json` for
   * structured output. Unlike the Claude CLI (where `-p` means
   * "non-interactive mode" and the prompt goes to stdin), Gemini CLI's
   * `-p`/`--prompt` flag requires the prompt text as its argument value.
   *
   * The system prompt is folded into the prompt using XML tags since
   * Gemini CLI has no `--system-prompt` flag.
   */
  buildArgs(options: AICallOptions): string[] {
    let prompt = options.prompt;
    if (options.systemPrompt) {
      prompt = `<system-instructions>\n${options.systemPrompt}\n</system-instructions>\n\n${prompt}`;
    }

    const args: string[] = ['-p', prompt, '--output-format', 'json'];

    if (options.model) {
      args.push('-m', resolveModelForGemini(options.model));
    }

    return args;
  }

  /**
   * Compose stdin input for the subprocess.
   *
   * Returns an empty string because Gemini CLI receives the prompt via
   * the `-p` argument, not stdin.
   */
  composeStdinInput(_options: AICallOptions): string {
    return '';
  }

  /**
   * Parse Gemini CLI JSON output into a normalized {@link AIResponse}.
   *
   * Handles the `{ response, stats, error }` shape produced by
   * `gemini -p --output-format json`. Token metrics are extracted from
   * `stats.models[modelName].tokens` when available.
   */
  parseResponse(stdout: string, durationMs: number, exitCode: number): AIResponse {
    const json = this.extractJson(stdout);
    if (json === undefined) {
      throw new AIServiceError(
        'PARSE_ERROR',
        `No JSON found in Gemini CLI output. Raw (first 200 chars): ${stdout.slice(0, 200)}`,
      );
    }

    let parsed: z.infer<typeof GeminiResponseSchema>;
    try {
      parsed = GeminiResponseSchema.parse(JSON.parse(json));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new AIServiceError(
        'PARSE_ERROR',
        `Failed to parse Gemini response: ${msg}`,
      );
    }

    // Check for model-reported error
    if (parsed.error != null && parsed.error !== '') {
      const errorMsg = typeof parsed.error === 'string'
        ? parsed.error
        : JSON.stringify(parsed.error);
      throw new AIServiceError(
        'SUBPROCESS_ERROR',
        `Gemini CLI reported error: ${errorMsg}`,
      );
    }

    const responseText = parsed.response ?? '';
    if (responseText.trim().length === 0) {
      throw new AIServiceError(
        'PARSE_ERROR',
        `Empty response from Gemini CLI. Raw (first 200 chars): ${stdout.slice(0, 200)}`,
      );
    }

    const { inputTokens, outputTokens, model } = this.extractMetrics(parsed.stats);

    return {
      text: responseText,
      model,
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      durationMs,
      exitCode,
      raw: parsed,
    };
  }

  getInstallInstructions(): string {
    return [
      'Gemini CLI:',
      '  npm install -g @google-gemini/gemini-cli',
      '  https://github.com/google-gemini/gemini-cli',
    ].join('\n');
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Extract the JSON object from stdout, handling potential prefix text
   * (e.g., version notices, warnings) before the JSON body.
   */
  private extractJson(stdout: string): string | undefined {
    const trimmed = stdout.trim();
    if (!trimmed) return undefined;

    // Fast path: output starts with `{`
    if (trimmed.startsWith('{')) return trimmed;

    // Fallback: find first `{` (skip prefix text)
    const idx = trimmed.indexOf('{');
    if (idx !== -1) return trimmed.slice(idx);

    return undefined;
  }

  /**
   * Extract token counts and model name from the `stats.models` map.
   *
   * If multiple models appear (e.g., routing), tokens are aggregated and
   * the first model name is used. Returns zeros if stats are absent.
   */
  private extractMetrics(stats: z.infer<typeof GeminiStatsSchema> | undefined): {
    inputTokens: number;
    outputTokens: number;
    model: string;
  } {
    if (!stats?.models) {
      return { inputTokens: 0, outputTokens: 0, model: 'unknown' };
    }

    const entries = Object.entries(stats.models);
    if (entries.length === 0) {
      return { inputTokens: 0, outputTokens: 0, model: 'unknown' };
    }

    let inputTokens = 0;
    let outputTokens = 0;
    const modelName = entries[0][0];

    for (const [, data] of entries) {
      if (data.tokens) {
        inputTokens += data.tokens.prompt;
        outputTokens += data.tokens.response;
      }
    }

    return { inputTokens, outputTokens, model: modelName };
  }
}

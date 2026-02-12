/**
 * Codex CLI backend adapter.
 *
 * Implements the {@link AIBackend} interface for the Codex CLI (`codex`).
 * Uses `codex exec --json` and parses JSONL events, with a plain-text
 * fallback for compatibility with CLI output changes.
 *
 * @module
 */

import type { AIBackend, AICallOptions, AIResponse } from '../types.js';
import { AIServiceError } from '../types.js';
import { isCommandOnPath } from './claude.js';

/**
 * Wrap system instructions for CLIs that do not expose a dedicated
 * system-prompt flag.
 */
function composePromptWithSystem(options: AICallOptions): string {
  if (options.systemPrompt) {
    return `<system-instructions>\n${options.systemPrompt}\n</system-instructions>\n\n${options.prompt}`;
  }
  return options.prompt;
}

/**
 * Recursively collect textual payloads from parsed JSON events.
 *
 * Codex JSONL can evolve across versions, so extraction intentionally
 * accepts multiple shapes (e.g., `text`, nested arrays, output content).
 */
function collectText(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectText(item, out);
    }
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }

  const obj = value as Record<string, unknown>;

  // Common payload key used by responses/events.
  if (typeof obj.text === 'string' && obj.text.trim().length > 0) {
    out.push(obj.text.trim());
  }

  for (const nested of Object.values(obj)) {
    collectText(nested, out);
  }
}

/**
 * Remove duplicate lines while preserving insertion order.
 */
function uniq(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/**
 * Codex CLI backend adapter.
 */
export class CodexBackend implements AIBackend {
  readonly name = 'codex';
  readonly cliCommand = 'codex';

  async isAvailable(): Promise<boolean> {
    return isCommandOnPath(this.cliCommand);
  }

  buildArgs(options: AICallOptions): string[] {
    const args: string[] = [
      // Approval policy is a global codex flag, so it must come before the
      // `exec` subcommand (newer CLIs reject it after `exec`).
      '-a',
      'never',
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--ephemeral',
      '--sandbox',
      'read-only',
      '--color',
      'never',
    ];

    if (options.model) {
      args.push('--model', options.model);
    }

    // Explicit stdin mode for consistent subprocess behavior.
    args.push('-');

    return args;
  }

  composeStdinInput(options: AICallOptions): string {
    return composePromptWithSystem(options);
  }

  parseResponse(stdout: string, durationMs: number, exitCode: number): AIResponse {
    const trimmed = stdout.trim();
    if (trimmed.length === 0) {
      throw new AIServiceError('PARSE_ERROR', 'Empty Codex CLI output');
    }

    const lines = trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    let parsedJsonLines = 0;
    const textParts: string[] = [];
    let model = 'unknown';

    for (const line of lines) {
      if (!line.startsWith('{') && !line.startsWith('[')) {
        continue;
      }

      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch {
        continue;
      }

      parsedJsonLines++;

      const obj = json as Record<string, unknown>;
      const type = typeof obj.type === 'string' ? obj.type : '';
      if (
        type === 'error' ||
        type === 'thread.started' ||
        type === 'turn.started' ||
        type.endsWith('.error') ||
        type.endsWith('.failed')
      ) {
        continue;
      }

      if (typeof obj.model === 'string' && obj.model.length > 0) {
        model = obj.model;
      }

      collectText(json, textParts);
    }

    // Preferred path: JSONL with extracted textual payloads.
    const extracted = uniq(textParts).join('\n').trim();
    if (parsedJsonLines > 0 && extracted.length > 0) {
      return {
        text: extracted,
        model,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        durationMs,
        exitCode,
        raw: { format: 'jsonl', lineCount: parsedJsonLines },
      };
    }

    // Compatibility fallback: treat stdout as the final message body.
    if (parsedJsonLines === 0 && trimmed.length > 0) {
      return {
        text: trimmed,
        model,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        durationMs,
        exitCode,
        raw: { format: 'text' },
      };
    }

    throw new AIServiceError(
      'PARSE_ERROR',
      'Failed to extract assistant text from Codex CLI output',
    );
  }

  getInstallInstructions(): string {
    return [
      'Codex CLI:',
      '  npm install -g @openai/codex',
      '  https://github.com/openai/codex',
    ].join('\n');
  }
}

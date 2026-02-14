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
import { isCommandOnPath } from './common.js';

interface CodexUsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Recursively collect textual payloads from parsed JSON events.
 *
 * Codex JSONL can evolve across versions, so extraction intentionally
 * accepts multiple shapes (e.g., `text`, nested arrays, output content).
 */
function collectText(
  value: unknown,
  out: string[],
  shouldSkipObject?: (obj: Record<string, unknown>) => boolean,
): void {
  if (typeof value === 'string') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectText(item, out, shouldSkipObject);
    }
    return;
  }
  const obj = asRecord(value);
  if (!obj) {
    return;
  }

  if (shouldSkipObject?.(obj)) {
    return;
  }

  // Common payload key used by responses/events.
  if (typeof obj.text === 'string' && obj.text.trim().length > 0) {
    out.push(obj.text.trim());
  }

  for (const nested of Object.values(obj)) {
    collectText(nested, out, shouldSkipObject);
  }
}

function shouldSkipTextObject(obj: Record<string, unknown>): boolean {
  const type = asString(obj.type) ?? '';
  if (type === 'reasoning' || type.endsWith('.reasoning')) {
    return true;
  }
  return false;
}

/**
 * Extract assistant-facing text from Codex `item.completed` payloads.
 *
 * Keeps assistant output (`agent_message`) and drops model reasoning.
 */
function extractAssistantTextFromItem(item: unknown): string[] {
  const itemObj = asRecord(item);
  if (!itemObj) {
    return [];
  }

  const itemType = asString(itemObj.type) ?? '';
  if (itemType !== 'agent_message') {
    return [];
  }

  const textParts: string[] = [];

  const directText = asString(itemObj.text);
  if (directText && directText.trim().length > 0) {
    textParts.push(directText.trim());
  }

  const content = itemObj.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      const partObj = asRecord(part);
      if (!partObj) continue;
      const partType = asString(partObj.type) ?? '';
      const partText = asString(partObj.text);
      if ((partType === 'text' || partType === 'output_text') && partText && partText.trim().length > 0) {
        textParts.push(partText.trim());
      }
    }
  }

  return textParts;
}

/**
 * Extract token usage from Codex `turn.completed` events.
 */
function extractUsageFromTurnCompleted(usage: unknown): CodexUsageTotals {
  const usageObj = asRecord(usage);
  if (!usageObj) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
  }

  const rawInput = asNumber(usageObj.input_tokens)
    ?? asNumber(usageObj.inputTokens)
    ?? 0;
  const cacheRead = asNumber(usageObj.cached_input_tokens)
    ?? asNumber(usageObj.cache_read_input_tokens)
    ?? asNumber(usageObj.cacheReadInputTokens)
    ?? 0;
  const cacheCreation = asNumber(usageObj.cache_creation_input_tokens)
    ?? asNumber(usageObj.cacheCreationInputTokens)
    ?? 0;
  const output = asNumber(usageObj.output_tokens)
    ?? asNumber(usageObj.outputTokens)
    ?? 0;

  // Preserve ARE's token semantics:
  // - inputTokens: non-cached input
  // - cacheReadTokens/cacheCreationTokens: cached components
  const nonCachedInput = rawInput >= cacheRead ? rawInput - cacheRead : rawInput;

  return {
    inputTokens: nonCachedInput,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheCreation,
  };
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
    const parsedEvents: Record<string, unknown>[] = [];
    const usageTotals: CodexUsageTotals = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
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

      const events: Record<string, unknown>[] = [];
      if (Array.isArray(json)) {
        for (const item of json) {
          const obj = asRecord(item);
          if (obj) events.push(obj);
        }
      } else {
        const obj = asRecord(json);
        if (obj) events.push(obj);
      }

      for (const obj of events) {
        parsedJsonLines++;
        parsedEvents.push(obj);

        const type = asString(obj.type) ?? '';
        if (
          type === 'error' ||
          type === 'thread.started' ||
          type === 'turn.started' ||
          type.endsWith('.error') ||
          type.endsWith('.failed')
        ) {
          continue;
        }

        const directModel = asString(obj.model);
        if (directModel && directModel.length > 0) {
          model = directModel;
        }

        // Preferred path: Codex JSON stream emits assistant output as item.completed.
        if (type === 'item.completed') {
          textParts.push(...extractAssistantTextFromItem(obj.item));
          continue;
        }

        if (type === 'turn.completed') {
          const usage = extractUsageFromTurnCompleted(obj.usage);
          usageTotals.inputTokens += usage.inputTokens;
          usageTotals.outputTokens += usage.outputTokens;
          usageTotals.cacheReadTokens += usage.cacheReadTokens;
          usageTotals.cacheCreationTokens += usage.cacheCreationTokens;
          continue;
        }
      }
    }

    // Preferred path: assistant message items only (no reasoning leakage).
    const extracted = uniq(textParts).join('\n').trim();
    if (extracted.length > 0) {
      return {
        text: extracted,
        model,
        inputTokens: usageTotals.inputTokens,
        outputTokens: usageTotals.outputTokens,
        cacheReadTokens: usageTotals.cacheReadTokens,
        cacheCreationTokens: usageTotals.cacheCreationTokens,
        durationMs,
        exitCode,
        raw: { format: 'jsonl', lineCount: parsedJsonLines },
      };
    }

    // Compatibility fallback: extract text from JSON objects while skipping reasoning nodes.
    if (parsedJsonLines > 0) {
      const fallbackParts: string[] = [];
      for (const event of parsedEvents) {
        collectText(event, fallbackParts, shouldSkipTextObject);
      }
      const fallbackExtracted = uniq(fallbackParts).join('\n').trim();
      if (fallbackExtracted.length > 0) {
        return {
          text: fallbackExtracted,
          model,
          inputTokens: usageTotals.inputTokens,
          outputTokens: usageTotals.outputTokens,
          cacheReadTokens: usageTotals.cacheReadTokens,
          cacheCreationTokens: usageTotals.cacheCreationTokens,
          durationMs,
          exitCode,
          raw: { format: 'jsonl-fallback', lineCount: parsedJsonLines },
        };
      }
    }

    // Compatibility fallback: treat stdout as the final message body.
    if (parsedJsonLines === 0 && trimmed.length > 0) {
      return {
        text: trimmed,
        model,
        inputTokens: usageTotals.inputTokens,
        outputTokens: usageTotals.outputTokens,
        cacheReadTokens: usageTotals.cacheReadTokens,
        cacheCreationTokens: usageTotals.cacheCreationTokens,
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

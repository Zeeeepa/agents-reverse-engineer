/**
 * OpenCode CLI backend adapter.
 *
 * Full implementation of the {@link AIBackend} interface for the OpenCode CLI
 * (`opencode`). Parses NDJSON streaming output, aggregates token usage across
 * turns, calculates cost when not provided, and extracts response text from
 * `text` events.
 *
 * OpenCode outputs NDJSON (one JSON event per line) with key event types:
 * - `text`: assistant text output (`part.text`)
 * - `step_finish`: per-turn token usage and cost (`part.tokens`, `part.cost`)
 * - `step_start`, `tool_use`, `tool_result`: other lifecycle events (ignored)
 *
 * @module
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { AIBackend, AICallOptions, AIResponse } from '../types.js';
import { AIServiceError } from '../types.js';
import { isCommandOnPath } from './claude.js';

// ---------------------------------------------------------------------------
// Zod schemas for OpenCode NDJSON events
// ---------------------------------------------------------------------------

/**
 * Schema for token breakdown within a `step_finish` event.
 */
const OpenCodeTokensSchema = z.object({
  total: z.number().optional().default(0),
  input: z.number().optional().default(0),
  output: z.number().optional().default(0),
  reasoning: z.number().optional().default(0),
  cache: z.object({
    read: z.number().optional().default(0),
    write: z.number().optional().default(0),
  }).optional().default({ read: 0, write: 0 }),
}).passthrough();

/**
 * Schema for the `part` object within a `step_finish` event.
 */
const OpenCodeStepFinishPartSchema = z.object({
  type: z.literal('step-finish'),
  cost: z.number().optional().default(0),
  tokens: OpenCodeTokensSchema.optional(),
}).passthrough();

/**
 * Schema for a `step_finish` NDJSON event line.
 */
const OpenCodeStepFinishSchema = z.object({
  type: z.literal('step_finish'),
  part: OpenCodeStepFinishPartSchema,
}).passthrough();

/**
 * Schema for the `part` object within a `text` event.
 */
const OpenCodeTextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
}).passthrough();

/**
 * Schema for a `text` NDJSON event line.
 */
const OpenCodeTextSchema = z.object({
  type: z.literal('text'),
  part: OpenCodeTextPartSchema,
}).passthrough();

// ---------------------------------------------------------------------------
// Cost calculation constants (Anthropic Claude Sonnet pricing as default)
// ---------------------------------------------------------------------------

/** Input token price per million tokens (USD) */
const INPUT_COST_PER_MTOK = 15;
/** Output token price per million tokens (USD) */
const OUTPUT_COST_PER_MTOK = 75;
/** Cache write token price per million tokens (USD) */
const CACHE_WRITE_COST_PER_MTOK = 18.75;
/** Cache read token price per million tokens (USD) */
const CACHE_READ_COST_PER_MTOK = 1.50;

/**
 * Calculate cost from token counts when OpenCode doesn't provide it.
 *
 * Uses Anthropic Claude Sonnet pricing as the default since OpenCode
 * is typically used with Anthropic models.
 */
function calculateCostFromTokens(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number {
  const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_MTOK;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_MTOK;
  const cacheWriteCost = (cacheWriteTokens / 1_000_000) * CACHE_WRITE_COST_PER_MTOK;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * CACHE_READ_COST_PER_MTOK;
  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

// ---------------------------------------------------------------------------
// Aggregated metrics from NDJSON parsing
// ---------------------------------------------------------------------------

/**
 * Aggregated metrics collected from all NDJSON events in a single
 * OpenCode CLI invocation.
 */
interface ParsedOpenCodeOutput {
  /** Concatenated text from all `text` events */
  text: string;
  /** Number of `step_finish` events (agentic turns) */
  numTurns: number;
  /** Sum of input tokens across all turns */
  inputTokens: number;
  /** Sum of output tokens across all turns */
  outputTokens: number;
  /** Sum of reasoning tokens across all turns */
  reasoningTokens: number;
  /** Sum of cache read tokens across all turns */
  cacheReadTokens: number;
  /** Sum of cache write tokens across all turns */
  cacheWriteTokens: number;
  /** Sum of cost across all turns (often 0 from OpenCode) */
  totalCost: number;
  /** All parsed NDJSON events (for `raw` field) */
  events: unknown[];
}

// ---------------------------------------------------------------------------
// Model name mapping (short form → OpenCode provider/model format)
// ---------------------------------------------------------------------------

/**
 * Map of short model names to OpenCode's `provider/model` format.
 *
 * OpenCode requires fully-qualified model identifiers (e.g.,
 * `anthropic/claude-sonnet-4-5`), while ARE config uses short aliases
 * (e.g., `sonnet`). Names already containing `/` are passed through
 * unchanged.
 */
const MODEL_ALIASES: Record<string, string> = {
  'sonnet': 'anthropic/claude-sonnet-4-5',
  'opus': 'anthropic/claude-opus-4-6',
  'haiku': 'anthropic/claude-haiku-4-5',
};

/**
 * Resolve a model name to OpenCode's `provider/model` format.
 *
 * If the name already contains `/`, it's assumed to be fully-qualified
 * and is returned as-is. Otherwise, looks up the short alias.
 *
 * @param model - Short alias or fully-qualified model identifier
 * @returns Fully-qualified model identifier for OpenCode CLI
 */
function resolveModelForOpenCode(model: string): string {
  if (model.includes('/')) return model;
  return MODEL_ALIASES[model] ?? model;
}

// ---------------------------------------------------------------------------
// OpenCode agent config for ARE
// ---------------------------------------------------------------------------

/** Agent name used in `.opencode/agents/` and `--agent` flag */
const OPENCODE_AGENT_NAME = 'are-summarizer';

/**
 * Content of the `.opencode/agents/are-summarizer.md` agent file.
 *
 * Disables all tools and limits to 1 agentic step so the model produces
 * a single text response rather than entering agentic multi-turn mode.
 * The dynamic ARE system prompt is delivered via `<system-instructions>`
 * XML tags in stdin (see {@link OpenCodeBackend.composeStdinInput}).
 */
const OPENCODE_AGENT_CONTENT = `---
description: "ARE documentation summarizer — single-turn, no tools, raw markdown output"
steps: 1
tools:
  "*": false
---

You are a documentation generator for the agents-reverse-engineer (ARE) tool.

CRITICAL RULES:
- Output ONLY the raw content requested — your entire response IS the document
- Do NOT include preamble, thinking, planning, or meta-commentary
- Do NOT say "Here is...", "I'll generate...", "Let me...", "Perfect!", or similar
- Do NOT summarize what you did or list changes you made
- When \`<system-instructions>\` tags are present in the input, follow them exactly
- The content after \`</system-instructions>\` is the user prompt — respond to it directly
`;

// ---------------------------------------------------------------------------
// OpenCode backend
// ---------------------------------------------------------------------------

/**
 * OpenCode CLI backend adapter.
 *
 * Implements the {@link AIBackend} interface for the `opencode` CLI.
 * Parses NDJSON streaming output, aggregates tokens across turns,
 * and calculates cost when not provided by the CLI.
 *
 * @example
 * ```typescript
 * const backend = new OpenCodeBackend();
 * if (await backend.isAvailable()) {
 *   const args = backend.buildArgs({ prompt: 'Summarize this file' });
 *   const result = await runSubprocess('opencode', args, {
 *     timeoutMs: 120_000,
 *     input: 'Summarize this file',
 *   });
 *   const response = backend.parseResponse(result.stdout, result.durationMs, result.exitCode);
 * }
 * ```
 */
export class OpenCodeBackend implements AIBackend {
  readonly name = 'opencode';
  readonly cliCommand = 'opencode';

  /**
   * Check if the `opencode` CLI is available on PATH.
   */
  async isAvailable(): Promise<boolean> {
    return isCommandOnPath(this.cliCommand);
  }

  /**
   * Build CLI arguments for an OpenCode invocation.
   *
   * Returns the argument array for `opencode run --format json`. The
   * prompt itself is NOT included — it goes to stdin via the subprocess
   * wrapper.
   *
   * OpenCode limitations compared to Claude CLI:
   * - No `--max-turns` equivalent (mitigated via agent `steps: 1`)
   * - No `--allowedTools` equivalent (mitigated via agent `tools: {"*": false}`)
   * - No `--system-prompt` equivalent (mitigated via {@link composeStdinInput})
   * - No `--no-session-persistence` equivalent
   *
   * @param options - Call options (model selection supported)
   * @returns Argument array suitable for {@link runSubprocess}
   */
  buildArgs(options: AICallOptions): string[] {
    const args: string[] = [
      'run',
      '--format', 'json',
      '--agent', OPENCODE_AGENT_NAME,
    ];

    if (options.model) {
      args.push('--model', resolveModelForOpenCode(options.model));
    }

    return args;
  }

  /**
   * Compose stdin input, folding the system prompt into the payload.
   *
   * OpenCode has no `--system-prompt` CLI flag, so the dynamic system
   * prompt is wrapped in `<system-instructions>` XML tags and prepended
   * to the user prompt. The static agent prompt (in the agent markdown
   * file) instructs the model to follow these tags.
   */
  composeStdinInput(options: AICallOptions): string {
    if (options.systemPrompt) {
      return `<system-instructions>\n${options.systemPrompt}\n</system-instructions>\n\n${options.prompt}`;
    }
    return options.prompt;
  }

  /**
   * Ensure the ARE agent config exists in the target project.
   *
   * Creates `.opencode/agents/are-summarizer.md` with tool restrictions
   * (`"*": false`) and step limit (`steps: 1`) so OpenCode runs in
   * single-turn, non-agentic mode when invoked by ARE.
   *
   * Always overwrites — the file is an ARE-owned artifact whose content
   * may evolve across versions.
   */
  async ensureProjectConfig(projectRoot: string): Promise<void> {
    const agentDir = path.join(projectRoot, '.opencode', 'agents');
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      path.join(agentDir, `${OPENCODE_AGENT_NAME}.md`),
      OPENCODE_AGENT_CONTENT,
      'utf-8',
    );
  }

  /**
   * Parse OpenCode CLI NDJSON output into a normalized {@link AIResponse}.
   *
   * OpenCode emits NDJSON (one JSON object per line) with no single "result"
   * summary object (unlike Claude CLI). The response text is spread across
   * multiple `text` events, and token usage is in `step_finish` events.
   *
   * Parsing strategy:
   * 1. Split stdout by newlines, filter empty lines
   * 2. Parse each line as JSON (skip malformed lines gracefully)
   * 3. Collect `text` events → concatenate `part.text` for final response
   * 4. Collect `step_finish` events → aggregate tokens across all turns
   * 5. If aggregated cost === 0, calculate from token counts
   * 6. Return AIResponse with aggregated metrics
   *
   * @param stdout - Raw NDJSON stdout from the OpenCode CLI process
   * @param durationMs - Wall-clock duration of the subprocess
   * @param exitCode - Process exit code
   * @returns Normalized AI response
   * @throws {AIServiceError} With code `PARSE_ERROR` if no text content found
   */
  parseResponse(stdout: string, durationMs: number, exitCode: number): AIResponse {
    const parsed = this.parseNdjson(stdout);

    if (!parsed.text) {
      throw new AIServiceError(
        'PARSE_ERROR',
        `No text content found in OpenCode CLI output. ` +
        `Parsed ${parsed.events.length} event(s), ${parsed.numTurns} turn(s). ` +
        `Raw output (first 200 chars): ${stdout.slice(0, 200)}`,
      );
    }

    // Calculate cost if OpenCode didn't provide it
    let cost = parsed.totalCost;
    if (cost === 0 && (parsed.inputTokens > 0 || parsed.outputTokens > 0)) {
      cost = calculateCostFromTokens(
        parsed.inputTokens,
        parsed.outputTokens,
        parsed.cacheReadTokens,
        parsed.cacheWriteTokens,
      );
    }

    return {
      text: parsed.text,
      model: 'unknown',  // OpenCode NDJSON doesn't include model name
      inputTokens: parsed.inputTokens,
      outputTokens: parsed.outputTokens,
      cacheReadTokens: parsed.cacheReadTokens,
      cacheCreationTokens: parsed.cacheWriteTokens,
      durationMs,
      exitCode,
      raw: {
        events: parsed.events,
        numTurns: parsed.numTurns,
        reasoningTokens: parsed.reasoningTokens,
        calculatedCost: cost,
      },
    };
  }

  /**
   * Parse NDJSON stdout into aggregated metrics.
   *
   * Each line is parsed independently. Malformed lines are skipped
   * gracefully to handle partial output from killed processes or
   * interleaved stderr.
   *
   * @param stdout - Raw NDJSON output from OpenCode CLI
   * @returns Aggregated metrics from all parsed events
   */
  private parseNdjson(stdout: string): ParsedOpenCodeOutput {
    const result: ParsedOpenCodeOutput = {
      text: '',
      numTurns: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalCost: 0,
      events: [],
    };

    const textParts: string[] = [];
    const lines = stdout.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        // Malformed JSON line — skip gracefully
        continue;
      }

      result.events.push(event);

      // Extract text from `text` events
      if (event.type === 'text') {
        const textParsed = OpenCodeTextSchema.safeParse(event);
        if (textParsed.success) {
          textParts.push(textParsed.data.part.text);
        }
      }

      // Aggregate tokens from `step_finish` events
      // Check both top-level `type` and nested `part.type` for robustness
      if (event.type === 'step_finish' || (event.part as Record<string, unknown>)?.type === 'step-finish') {
        const stepParsed = OpenCodeStepFinishSchema.safeParse(event);
        if (stepParsed.success) {
          result.numTurns++;
          const tokens = stepParsed.data.part.tokens;
          if (tokens) {
            result.inputTokens += tokens.input;
            result.outputTokens += tokens.output;
            result.reasoningTokens += tokens.reasoning;
            result.cacheReadTokens += tokens.cache.read;
            result.cacheWriteTokens += tokens.cache.write;
          }
          result.totalCost += stepParsed.data.part.cost;
        }
      }
    }

    result.text = textParts.join('');

    return result;
  }

  /**
   * Get user-facing install instructions for the OpenCode CLI.
   */
  getInstallInstructions(): string {
    return [
      'OpenCode:',
      '  curl -fsSL https://opencode.ai/install | bash',
      '  https://opencode.ai',
    ].join('\n');
  }
}

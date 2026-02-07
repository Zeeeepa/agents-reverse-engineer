/**
 * Cost estimation engine with pricing table, prefix matching, and format helpers.
 *
 * Provides hardcoded per-model pricing for major AI providers (Claude, GPT, Gemini)
 * and utility functions for estimating, looking up, and formatting costs.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-model pricing rates in cost per million tokens. */
export interface ModelPricing {
  /** Cost in USD per 1 million input tokens */
  inputCostPerMTok: number;
  /** Cost in USD per 1 million output tokens */
  outputCostPerMTok: number;
}

/** Source of a cost estimate. */
export type CostSource = 'cli-reported' | 'estimated' | 'unavailable';

/** Result of a cost estimation with provenance tracking. */
export interface CostEstimate {
  /** Estimated cost in USD (0 when unavailable) */
  costUsd: number;
  /** How the cost was determined */
  source: CostSource;
}

// ---------------------------------------------------------------------------
// Default pricing table
// ---------------------------------------------------------------------------

/**
 * Hardcoded pricing for major AI models.
 *
 * Keys are model ID prefixes. Models with date suffixes (e.g.
 * `claude-opus-4-5-20251101`) are matched via prefix lookup against these keys.
 *
 * Prices are in USD per million tokens, verified as of 2026-02-07.
 */
export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude (Anthropic) - verified 2026-02-07
  'claude-opus-4-6':   { inputCostPerMTok: 5,    outputCostPerMTok: 25 },
  'claude-opus-4-5':   { inputCostPerMTok: 5,    outputCostPerMTok: 25 },
  'claude-opus-4-1':   { inputCostPerMTok: 15,   outputCostPerMTok: 75 },
  'claude-opus-4':     { inputCostPerMTok: 15,   outputCostPerMTok: 75 },
  'claude-sonnet-4-5': { inputCostPerMTok: 3,    outputCostPerMTok: 15 },
  'claude-sonnet-4':   { inputCostPerMTok: 3,    outputCostPerMTok: 15 },
  'claude-haiku-4-5':  { inputCostPerMTok: 1,    outputCostPerMTok: 5 },
  'claude-haiku-3-5':  { inputCostPerMTok: 0.80, outputCostPerMTok: 4 },
  'claude-haiku-3':    { inputCostPerMTok: 0.25, outputCostPerMTok: 1.25 },

  // OpenAI GPT - from web search 2026-02-07
  'gpt-4o':            { inputCostPerMTok: 2.50, outputCostPerMTok: 10 },
  'gpt-4o-mini':       { inputCostPerMTok: 0.15, outputCostPerMTok: 0.60 },
  'gpt-4':             { inputCostPerMTok: 30,   outputCostPerMTok: 60 },

  // Google Gemini - from web search 2026-02-07
  'gemini-2.5-flash':  { inputCostPerMTok: 0.15, outputCostPerMTok: 0.60 },
  'gemini-2.5-pro':    { inputCostPerMTok: 1.25, outputCostPerMTok: 10 },
  'gemini-3-flash':    { inputCostPerMTok: 0.50, outputCostPerMTok: 3 },
};

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Look up pricing for a model ID, with optional config overrides.
 *
 * Resolution order:
 * 1. Exact match in merged table (overrides spread over defaults)
 * 2. Prefix match with longest-key-first ordering to avoid ambiguity
 * 3. `undefined` if no match found
 *
 * @param model - Model identifier (e.g. `"claude-opus-4-5-20251101"`)
 * @param overrides - Optional pricing overrides from user config
 * @returns Pricing rates or `undefined` for unknown models
 */
export function lookupPricing(
  model: string,
  overrides?: Record<string, ModelPricing>,
): ModelPricing | undefined {
  const table: Record<string, ModelPricing> = {
    ...DEFAULT_MODEL_PRICING,
    ...overrides,
  };

  // Exact match
  if (table[model] !== undefined) {
    return table[model];
  }

  // Prefix match: sort keys longest-first so longer prefixes win
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (model.startsWith(key)) {
      return table[key];
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the cost of an AI call.
 *
 * Resolution order:
 * 1. CLI-reported cost (when available and > 0)
 * 2. Pricing table estimate (input + output token costs)
 * 3. Unavailable (unknown model, no CLI cost)
 *
 * All costs are rounded to 4 decimal places.
 *
 * @param model - Model identifier
 * @param inputTokens - Number of input tokens consumed
 * @param outputTokens - Number of output tokens generated
 * @param cliReportedCost - Cost reported by the CLI (if available)
 * @param overrides - Optional pricing overrides from user config
 * @returns Cost estimate with source provenance
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cliReportedCost?: number,
  overrides?: Record<string, ModelPricing>,
): CostEstimate {
  // CLI-reported cost takes precedence when available and non-zero
  if (cliReportedCost !== undefined && cliReportedCost > 0) {
    return {
      costUsd: Number(cliReportedCost.toFixed(4)),
      source: 'cli-reported',
    };
  }

  // Fall back to pricing table
  const pricing = lookupPricing(model, overrides);
  if (pricing === undefined) {
    return { costUsd: 0, source: 'unavailable' };
  }

  const inputCost = (pricing.inputCostPerMTok * inputTokens) / 1_000_000;
  const outputCost = (pricing.outputCostPerMTok * outputTokens) / 1_000_000;
  const totalCost = Number((inputCost + outputCost).toFixed(4));

  return { costUsd: totalCost, source: 'estimated' };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a cost value for display.
 *
 * @param costUsd - Cost in USD
 * @param available - Whether the cost is available (false returns "N/A")
 * @returns Formatted cost string (e.g. `"$0.1234"` or `"N/A"`)
 */
export function formatCost(costUsd: number, available: boolean): string {
  if (!available) {
    return 'N/A';
  }
  return `$${costUsd.toFixed(4)}`;
}

/**
 * Format a token count for display with appropriate suffix.
 *
 * - >= 1,000,000: `"1.5M"`
 * - >= 1,000: `"42K"`
 * - < 1,000: `"500"`
 *
 * @param count - Number of tokens
 * @returns Formatted token count string
 */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    const millions = count / 1_000_000;
    // Remove trailing zeros: 1.0 -> 1, 1.5 -> 1.5
    return `${parseFloat(millions.toFixed(1))}M`;
  }
  if (count >= 1_000) {
    const thousands = count / 1_000;
    return `${parseFloat(thousands.toFixed(1))}K`;
  }
  return `${count}`;
}

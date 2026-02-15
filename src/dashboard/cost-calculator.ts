/**
 * Model pricing and cost computation for the dashboard.
 *
 * Maintains per-model pricing tables and computes costs from token counts.
 * Prices are in USD per million tokens.
 *
 * @module
 */

import type { RunLog } from '../ai/types.js';

/** Pricing per million tokens for a model */
export interface ModelPricing {
  /** Cost per 1M input tokens */
  inputPerM: number;
  /** Cost per 1M output tokens */
  outputPerM: number;
  /** Cost per 1M cache read tokens (typically discounted) */
  cacheReadPerM: number;
  /** Cost per 1M cache write/creation tokens */
  cacheWritePerM: number;
}

/** Cost breakdown for a run or entry */
export interface CostBreakdown {
  /** Input token cost */
  inputCost: number;
  /** Output token cost */
  outputCost: number;
  /** Cache read cost */
  cacheReadCost: number;
  /** Cache write cost */
  cacheWriteCost: number;
  /** Total cost */
  totalCost: number;
}

/**
 * Model pricing table (USD per million tokens).
 *
 * Sources: Anthropic, OpenAI, Google AI pricing pages.
 * Update as new models ship.
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic Claude models
  'claude-opus-4-6': { inputPerM: 15, outputPerM: 75, cacheReadPerM: 1.5, cacheWritePerM: 18.75 },
  'claude-sonnet-4-5-20250929': { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  'claude-haiku-4-5-20251001': { inputPerM: 0.8, outputPerM: 4, cacheReadPerM: 0.08, cacheWritePerM: 1 },
  // Anthropic shorthand aliases
  'opus': { inputPerM: 15, outputPerM: 75, cacheReadPerM: 1.5, cacheWritePerM: 18.75 },
  'sonnet': { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  'haiku': { inputPerM: 0.8, outputPerM: 4, cacheReadPerM: 0.08, cacheWritePerM: 1 },
  // OpenAI Codex models
  'codex-mini-latest': { inputPerM: 1.50, outputPerM: 6, cacheReadPerM: 0.375, cacheWritePerM: 1.875 },
  'codex-mini': { inputPerM: 1.50, outputPerM: 6, cacheReadPerM: 0.375, cacheWritePerM: 1.875 },
  'gpt-5.1-codex-mini': { inputPerM: 0.25, outputPerM: 2, cacheReadPerM: 0.0625, cacheWritePerM: 0.3125 },
  'gpt-5': { inputPerM: 1.25, outputPerM: 10, cacheReadPerM: 0.3125, cacheWritePerM: 1.5625 },
  'gpt-4.1': { inputPerM: 2, outputPerM: 8, cacheReadPerM: 0.5, cacheWritePerM: 2.5 },
  'o3': { inputPerM: 2, outputPerM: 8, cacheReadPerM: 0.5, cacheWritePerM: 2.5 },
  'o4-mini': { inputPerM: 0.40, outputPerM: 1.60, cacheReadPerM: 0.10, cacheWritePerM: 0.50 },
  // Google Gemini models
  'gemini-2.5-flash': { inputPerM: 0.15, outputPerM: 0.60, cacheReadPerM: 0.0375, cacheWritePerM: 0.15 },
  'gemini-3.0-flash': { inputPerM: 0.15, outputPerM: 0.60, cacheReadPerM: 0.0375, cacheWritePerM: 0.15 },
  'gemini-2.5-pro': { inputPerM: 1.25, outputPerM: 10, cacheReadPerM: 0.3125, cacheWritePerM: 1.25 },
};

/**
 * Default pricing for unknown models (uses Sonnet pricing as baseline).
 */
const DEFAULT_PRICING: ModelPricing = { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 };

/**
 * Look up pricing for a model identifier.
 *
 * Tries exact match first, then partial match (model ID contains the key
 * or key contains the model ID). Falls back to default pricing.
 *
 * @param model - Model identifier from the run log
 * @returns Pricing data for the model
 */
export function getModelPricing(model: string): ModelPricing {
  const lower = model.toLowerCase();

  // Exact match
  if (MODEL_PRICING[lower]) return MODEL_PRICING[lower];

  // Partial match: model contains a known key, or key contains model
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (lower.includes(key) || key.includes(lower)) {
      return pricing;
    }
  }

  return DEFAULT_PRICING;
}

/**
 * Compute cost breakdown from token counts and model pricing.
 */
export function computeCost(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
  pricing: ModelPricing,
): CostBreakdown {
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerM;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerM;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.cacheReadPerM;
  const cacheWriteCost = (cacheWriteTokens / 1_000_000) * pricing.cacheWritePerM;

  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
  };
}

/**
 * Compute cost for an entire run log using per-entry model pricing.
 *
 * Uses the model from each entry (not the run-level model) for accuracy,
 * since individual entries report the actual model used.
 */
export function computeRunCost(runLog: RunLog): CostBreakdown {
  // Use per-entry model for precise costing, fall back to run-level model
  const entryModel = runLog.entries[0]?.model ?? runLog.model;
  const pricing = getModelPricing(entryModel);

  return computeCost(
    runLog.summary.totalInputTokens,
    runLog.summary.totalOutputTokens,
    runLog.summary.totalCacheReadTokens,
    runLog.summary.totalCacheCreationTokens,
    pricing,
  );
}

/**
 * Format a cost value as a dollar string.
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Format a token count with K/M suffix for readability.
 */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

/**
 * Format a duration in ms to human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

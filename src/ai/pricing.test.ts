import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MODEL_PRICING,
  lookupPricing,
  estimateCost,
  formatCost,
  formatTokens,
} from './pricing.js';
import type { ModelPricing, CostSource, CostEstimate } from './pricing.js';

// ---------------------------------------------------------------------------
// DEFAULT_MODEL_PRICING
// ---------------------------------------------------------------------------

describe('DEFAULT_MODEL_PRICING', () => {
  it('contains 15 models across Claude, GPT, and Gemini families', () => {
    const keys = Object.keys(DEFAULT_MODEL_PRICING);
    expect(keys).toHaveLength(15);

    const claudeKeys = keys.filter((k) => k.startsWith('claude-'));
    const gptKeys = keys.filter((k) => k.startsWith('gpt-'));
    const geminiKeys = keys.filter((k) => k.startsWith('gemini-'));

    expect(claudeKeys.length).toBe(9);
    expect(gptKeys.length).toBe(3);
    expect(geminiKeys.length).toBe(3);
  });

  it('has correct pricing for claude-sonnet-4', () => {
    const pricing = DEFAULT_MODEL_PRICING['claude-sonnet-4'];
    expect(pricing).toBeDefined();
    expect(pricing.inputCostPerMTok).toBe(3);
    expect(pricing.outputCostPerMTok).toBe(15);
  });

  it('has correct pricing for gpt-4o', () => {
    const pricing = DEFAULT_MODEL_PRICING['gpt-4o'];
    expect(pricing).toBeDefined();
    expect(pricing.inputCostPerMTok).toBe(2.5);
    expect(pricing.outputCostPerMTok).toBe(10);
  });

  it('has correct pricing for gemini-2.5-pro', () => {
    const pricing = DEFAULT_MODEL_PRICING['gemini-2.5-pro'];
    expect(pricing).toBeDefined();
    expect(pricing.inputCostPerMTok).toBe(1.25);
    expect(pricing.outputCostPerMTok).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// lookupPricing
// ---------------------------------------------------------------------------

describe('lookupPricing', () => {
  it('returns exact match for known model', () => {
    const result = lookupPricing('claude-opus-4-5');
    expect(result).toBeDefined();
    expect(result!.inputCostPerMTok).toBe(5);
    expect(result!.outputCostPerMTok).toBe(25);
  });

  it('returns prefix match for model with date suffix', () => {
    const result = lookupPricing('claude-opus-4-5-20251101');
    expect(result).toBeDefined();
    expect(result!.inputCostPerMTok).toBe(5);
    expect(result!.outputCostPerMTok).toBe(25);
  });

  it('prefers longer prefix key over shorter one', () => {
    // 'claude-opus-4-5' should match before 'claude-opus-4'
    const result = lookupPricing('claude-opus-4-5-20251101');
    expect(result).toBeDefined();
    // claude-opus-4-5 has input=5, claude-opus-4 has input=15
    expect(result!.inputCostPerMTok).toBe(5);
  });

  it('returns undefined for unknown model', () => {
    const result = lookupPricing('custom-model');
    expect(result).toBeUndefined();
  });

  it('uses config overrides over defaults', () => {
    const overrides: Record<string, ModelPricing> = {
      'my-model': { inputCostPerMTok: 1, outputCostPerMTok: 5 },
    };
    const result = lookupPricing('my-model', overrides);
    expect(result).toBeDefined();
    expect(result!.inputCostPerMTok).toBe(1);
    expect(result!.outputCostPerMTok).toBe(5);
  });

  it('config overrides take precedence over hardcoded defaults', () => {
    const overrides: Record<string, ModelPricing> = {
      'claude-sonnet-4': { inputCostPerMTok: 99, outputCostPerMTok: 99 },
    };
    const result = lookupPricing('claude-sonnet-4', overrides);
    expect(result).toBeDefined();
    expect(result!.inputCostPerMTok).toBe(99);
    expect(result!.outputCostPerMTok).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// estimateCost
// ---------------------------------------------------------------------------

describe('estimateCost', () => {
  it('returns CLI-reported cost when available and non-zero', () => {
    const result = estimateCost('claude-sonnet-4', 1000, 100, 0.018);
    expect(result.costUsd).toBe(0.018);
    expect(result.source).toBe('cli-reported');
  });

  it('falls back to pricing table when CLI cost is zero', () => {
    // claude-sonnet-4: input=3, output=15
    // cost = (3 * 1_000_000 / 1_000_000) + (15 * 100_000 / 1_000_000) = 3 + 1.5 = 4.5
    const result = estimateCost('claude-sonnet-4', 1_000_000, 100_000, 0);
    expect(result.costUsd).toBe(4.5);
    expect(result.source).toBe('estimated');
  });

  it('falls back to pricing table when CLI cost is undefined', () => {
    const result = estimateCost('claude-sonnet-4', 1_000_000, 100_000);
    expect(result.costUsd).toBe(4.5);
    expect(result.source).toBe('estimated');
  });

  it('returns unavailable source when model is not in pricing table', () => {
    const result = estimateCost('unknown-model', 1000, 100);
    expect(result.costUsd).toBe(0);
    expect(result.source).toBe('unavailable');
  });

  it('uses 4-decimal precision for estimated costs', () => {
    // claude-haiku-3-5: input=0.80, output=4
    // cost = (0.80 * 1234 / 1_000_000) + (4 * 567 / 1_000_000)
    //      = 0.0009872 + 0.002268 = 0.0032552
    // rounded to 4 decimals = 0.0033
    const result = estimateCost('claude-haiku-3-5', 1234, 567);
    expect(result.costUsd).toBe(0.0033);
    expect(result.source).toBe('estimated');
  });

  it('passes overrides to lookupPricing', () => {
    const overrides: Record<string, ModelPricing> = {
      'my-custom': { inputCostPerMTok: 10, outputCostPerMTok: 20 },
    };
    // cost = (10 * 1_000_000 / 1_000_000) + (20 * 500_000 / 1_000_000) = 10 + 10 = 20
    const result = estimateCost('my-custom', 1_000_000, 500_000, undefined, overrides);
    expect(result.costUsd).toBe(20);
    expect(result.source).toBe('estimated');
  });
});

// ---------------------------------------------------------------------------
// formatCost
// ---------------------------------------------------------------------------

describe('formatCost', () => {
  it('returns $X.XXXX with 4-decimal precision for available costs', () => {
    expect(formatCost(0.1234, true)).toBe('$0.1234');
  });

  it('returns N/A when cost is unavailable', () => {
    expect(formatCost(0, false)).toBe('N/A');
  });

  it('pads to 4 decimal places', () => {
    expect(formatCost(1.5, true)).toBe('$1.5000');
  });

  it('rounds to 4 decimal places', () => {
    expect(formatCost(0.123456, true)).toBe('$0.1235');
  });
});

// ---------------------------------------------------------------------------
// formatTokens
// ---------------------------------------------------------------------------

describe('formatTokens', () => {
  it('formats millions with M suffix', () => {
    expect(formatTokens(1_500_000)).toBe('1.5M');
  });

  it('formats thousands with K suffix', () => {
    expect(formatTokens(42_000)).toBe('42K');
  });

  it('formats small numbers without suffix', () => {
    expect(formatTokens(500)).toBe('500');
  });

  it('formats exact million', () => {
    expect(formatTokens(1_000_000)).toBe('1M');
  });

  it('formats exact thousand', () => {
    expect(formatTokens(1_000)).toBe('1K');
  });
});

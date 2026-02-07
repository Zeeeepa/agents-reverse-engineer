# Phase 8: Full Telemetry - Research

**Researched:** 2026-02-07
**Domain:** AI CLI telemetry enrichment (thinking capture, file tracking, cost estimation)
**Confidence:** HIGH

## Summary

This phase extends the existing telemetry infrastructure (built in Phase 6) with three new dimensions: thinking/reasoning content capture, files-read tracking, and cost estimation. The existing architecture is well-suited for extension -- the `TelemetryEntry` interface, `TelemetryLogger`, `RunLog` summary, and `ProgressReporter.printSummary()` all need to be widened but not restructured.

The primary technical challenge is that the current tool invokes the Claude CLI with `--output-format json`, which returns only a single final result JSON object. This object does NOT include thinking content or file-read metadata. To capture those, the tool must switch to `--output-format stream-json --verbose`, which emits JSONL events including `tool_use`/`tool_result` events (with file paths and content) and `thinking` content blocks. Alternatively, since this tool uses `-p` mode with simple single-turn prompts (no agentic tool use), thinking content and file reads may not be present at all -- the tool sends file content directly in the prompt, and thinking requires models with extended thinking enabled. The pragmatic approach is: (1) add the fields to types and log entries, (2) parse what's available from the existing JSON output, (3) use marker values when data isn't available, and (4) implement cost estimation independently using a hardcoded pricing table since the Claude CLI already provides `total_cost_usd` in its response.

**Primary recommendation:** Extend `TelemetryEntry` and `RunLog` types with `thinking`, `filesRead`, and per-call `costUsd` fields. Build a standalone `pricing.ts` module with hardcoded rates for major models and config-driven overrides. Enrich `ProgressReporter.printSummary()` to show cost. Parse `total_cost_usd` from the existing Claude CLI JSON response (already captured). For thinking and files-read, populate from what's available in the current output format and mark as "not available" when absent.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | ^3.24.1 | Validate extended CLI response schemas | Already a project dependency, used for CLI JSON parsing |
| `node:fs/promises` | Built-in | Read file sizes for files-read tracking | Already used throughout |
| `node:path` | Built-in | Normalize file paths to project-relative | Already used throughout |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `picocolors` | ^1.1.1 | Colored cost display in summary | Already a project dependency |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hardcoded pricing table | External pricing API | Adds network dependency, unreliable for offline use; hardcoded is simpler, config overrides cover edge cases |
| `--output-format stream-json --verbose` | Keep `--output-format json` | Stream-json gives thinking + tool events but requires JSONL parsing rewrite; current JSON is sufficient since tool sends file content in prompts (no agentic file reads) |
| Per-model pricing lookup | Use CLI-reported `total_cost_usd` only | CLI cost is already captured; pricing table enables cost estimation for backends that don't report cost (Gemini, OpenCode stubs) and provides independent verification |

**Installation:**
```bash
# No new dependencies needed -- all built-in Node.js modules + existing project deps
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── ai/
│   ├── types.ts                 # MODIFY: Extend TelemetryEntry, RunLog, AIResponse
│   ├── service.ts               # MODIFY: Populate new fields in telemetry entries
│   ├── pricing.ts               # NEW: Cost estimation engine + hardcoded pricing table
│   ├── backends/
│   │   └── claude.ts            # MODIFY: Extract thinking from response if available
│   └── telemetry/
│       └── logger.ts            # MODIFY: Compute new summary fields (cost, files)
├── config/
│   └── schema.ts                # MODIFY: Add telemetry.costThresholdUsd, ai.pricing overrides
└── orchestration/
    ├── types.ts                 # MODIFY: Add cost fields to RunSummary
    ├── progress.ts              # MODIFY: Add cost display to printSummary()
    └── runner.ts                # MODIFY: Track files sent as context per call
```

### Pattern 1: Pricing Table with Config Overrides

**What:** A `ModelPricing` interface and a `PricingTable` that maps model ID patterns to per-token rates. Hardcoded defaults ship with the tool; users can override via config for custom/private models.

**When to use:** Every cost calculation. Called after each AI call with the model name and token counts.

**Example:**
```typescript
// Source: Codebase pattern analysis + Anthropic pricing docs

interface ModelPricing {
  inputCostPerMTok: number;   // Cost per million input tokens
  outputCostPerMTok: number;  // Cost per million output tokens
}

/** Hardcoded default pricing (USD per million tokens) */
const DEFAULT_PRICING: Record<string, ModelPricing> = {
  // Claude models
  'claude-opus-4-6':           { inputCostPerMTok: 5,    outputCostPerMTok: 25 },
  'claude-opus-4-5':           { inputCostPerMTok: 5,    outputCostPerMTok: 25 },
  'claude-opus-4-1':           { inputCostPerMTok: 15,   outputCostPerMTok: 75 },
  'claude-sonnet-4-5':         { inputCostPerMTok: 3,    outputCostPerMTok: 15 },
  'claude-sonnet-4':           { inputCostPerMTok: 3,    outputCostPerMTok: 15 },
  'claude-haiku-4-5':          { inputCostPerMTok: 1,    outputCostPerMTok: 5 },
  'claude-haiku-3-5':          { inputCostPerMTok: 0.80, outputCostPerMTok: 4 },
  // GPT models
  'gpt-4o':                    { inputCostPerMTok: 2.50, outputCostPerMTok: 10 },
  'gpt-4o-mini':               { inputCostPerMTok: 0.15, outputCostPerMTok: 0.60 },
  'gpt-4':                     { inputCostPerMTok: 30,   outputCostPerMTok: 60 },
  // Gemini models
  'gemini-2.5-flash':          { inputCostPerMTok: 0.15, outputCostPerMTok: 0.60 },
  'gemini-2.5-pro':            { inputCostPerMTok: 1.25, outputCostPerMTok: 10 },
  'gemini-3-flash':            { inputCostPerMTok: 0.50, outputCostPerMTok: 3 },
};

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  pricingOverrides: Record<string, ModelPricing> = {},
): { costUsd: number; pricingAvailable: boolean } {
  // Try exact match first, then prefix match (e.g., "claude-opus-4-5-20251101" matches "claude-opus-4-5")
  const allPricing = { ...DEFAULT_PRICING, ...pricingOverrides };
  const pricing = allPricing[model]
    ?? Object.entries(allPricing).find(([key]) => model.startsWith(key))?.[1];

  if (!pricing) {
    return { costUsd: 0, pricingAvailable: false };
  }

  const costUsd = (inputTokens / 1_000_000) * pricing.inputCostPerMTok
                + (outputTokens / 1_000_000) * pricing.outputCostPerMTok;

  return { costUsd: Number(costUsd.toFixed(4)), pricingAvailable: true };
}
```

### Pattern 2: Extended TelemetryEntry with New Fields

**What:** Add optional fields to `TelemetryEntry` for thinking content, files read, and enriched cost data.

**When to use:** Every telemetry log entry. New fields are optional so existing entries remain valid.

**Example:**
```typescript
// Source: Codebase types.ts analysis

interface FileRead {
  path: string;       // Relative to project root
  sizeBytes: number;  // File size at time of read
}

interface TelemetryEntry {
  // ... existing fields ...

  /** AI thinking/reasoning content, if available */
  thinking: string;  // "not supported" when backend doesn't provide it

  /** Files read during this call */
  filesRead: FileRead[];

  /** Whether cost was estimated from pricing table vs reported by CLI */
  costSource: 'cli-reported' | 'estimated' | 'unavailable';
}
```

### Pattern 3: Summary with Cost and Files

**What:** Extend `RunLog.summary` and `RunSummary` with cost display and files-read aggregation.

**When to use:** End of every run, displayed in terminal summary and written to log file.

**Example:**
```typescript
// Source: Codebase orchestration/types.ts analysis

interface RunSummary {
  // ... existing fields ...

  /** Total estimated cost in USD across all calls */
  totalCostUsd: number;

  /** Whether cost data is available ("$0.1234" vs "N/A") */
  costAvailable: boolean;

  /** Total number of files read across all calls */
  totalFilesRead: number;

  /** Number of unique files read (deduped by path) */
  uniqueFilesRead: number;
}
```

### Pattern 4: Cost Threshold Warning

**What:** A configurable cost threshold in the config schema. When the run's total cost exceeds this threshold, emit a warning.

**When to use:** Checked after each AI call and at run summary time.

**Example:**
```typescript
// Source: Config schema analysis

// In config/schema.ts AISchema telemetry section:
telemetry: z.object({
  keepRuns: z.number().min(0).default(10),
  costThresholdUsd: z.number().min(0).optional(),  // undefined = no warning
}).default({}),

// In config/schema.ts AI section:
pricing: z.record(z.object({
  inputCostPerMTok: z.number(),
  outputCostPerMTok: z.number(),
})).optional(),  // undefined = use defaults only
```

### Anti-Patterns to Avoid

- **Switching to stream-json for this phase:** The current `--output-format json` is sufficient. This tool doesn't use agentic tool use (it sends file content in the prompt), so there are no `Read` tool events to parse. Thinking content is not available in `-p` mode with the current approach. Switching to stream-json would require rewriting the subprocess + parsing layer for marginal gain. Defer to a future phase if agentic mode is needed.
- **Hardcoding costs using cost-per-1K format:** Use cost-per-million-tokens (MTok) to match how providers actually quote prices. Avoids confusing fractional cents.
- **Truncating thinking content:** The CONTEXT.md decision says "full verbatim thinking output -- no truncation." Respect this even though thinking strings can be large. JSON log files can handle it.
- **Silently dropping cost data for unknown models:** The decision says "log a warning" and "show N/A." Don't silently show $0.00 -- that's misleading.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token pricing data | Scraping pricing pages at runtime | Hardcoded table + config overrides | Offline-safe, fast, user-controllable for private models |
| Cost formatting | Ad-hoc string concatenation | Consistent format function: `formatCost(usd: number): string` | Ensures 4-decimal precision everywhere, handles N/A case |
| Model ID matching | Exact string equality | Prefix matching with fallback | Model IDs include date suffixes (e.g., `claude-opus-4-5-20251101`) that shouldn't require exact pricing entries |
| Files-read aggregation | Manual Set tracking | `Map<string, FileRead>` keyed by path | Gives both unique count and dedup in one pass |

**Key insight:** The Claude CLI already reports `total_cost_usd` in its JSON response. For the Claude backend, we should use the CLI-reported cost (it accounts for cache discounts, etc.) and only fall back to the pricing table for estimation when the CLI doesn't report cost (Gemini, OpenCode, or if the field is missing). The pricing table serves as independent verification and as the primary source for non-Claude backends.

## Common Pitfalls

### Pitfall 1: Model ID Mismatch in Pricing Lookup

**What goes wrong:** The pricing table has `claude-opus-4-5` but the CLI reports the model as `claude-opus-4-5-20251101`. Exact string match fails, cost shows N/A.
**Why it happens:** Claude CLI includes the model date suffix in the `modelUsage` keys. Other backends may do similar things.
**How to avoid:** Use prefix matching: iterate pricing table keys and check `modelId.startsWith(key)`. Sort keys longest-first to avoid false matches (e.g., `claude-opus-4-5` shouldn't match `claude-opus-4`).
**Warning signs:** Cost shows N/A even though the model is in the pricing table.

### Pitfall 2: Thinking Content Not Available in Current Architecture

**What goes wrong:** Developer expects thinking content from `--output-format json` but it's never there.
**Why it happens:** The current tool uses `claude -p --output-format json` which returns a single result JSON object. This object does NOT include thinking blocks. Thinking is part of the streaming `content_block_start`/`content_block_delta` events in `stream-json` format. Furthermore, the tool's prompts are simple analysis prompts -- the CLI doesn't enable extended thinking by default.
**How to avoid:** Accept that thinking content will be "not supported" for this phase. Set the `thinking` field to the marker value `"not supported"`. If a future phase needs thinking, it must: (1) switch to `--output-format stream-json --verbose`, (2) parse JSONL events, and (3) possibly enable thinking via API flags.
**Warning signs:** The `thinking` field is always the marker value.

### Pitfall 3: Files-Read Tracking Scope Confusion

**What goes wrong:** The CONTEXT.md says "Track files from both sources: files we sent to the AI as context + any files the AI reports reading." But the tool sends file content directly in the prompt -- the AI doesn't "read" files via tool use.
**Why it happens:** In the current architecture (Phase 6/7), the `CommandRunner` reads source files with `readFile()` and passes their content in the prompt string. The AI never uses a `Read` tool. So "files the AI reports reading" is empty.
**How to avoid:** Track files sent as context by the runner. The `ExecutionTask` already has `path` and `absolutePath`. Record those as the "files read" for each call. The `filesRead` array captures what went INTO the call, not what the AI read autonomously.
**Warning signs:** `filesRead` is always empty if only looking for AI tool_use events.

### Pitfall 4: Double-Counting Cost (CLI-Reported vs Estimated)

**What goes wrong:** The `costUsd` field on `TelemetryEntry` already exists and is populated from the Claude CLI's `total_cost_usd`. If the new pricing table also estimates cost, the summary could double-count.
**Why it happens:** The `AIResponse.costUsd` is already captured and logged. Adding a pricing table estimate creates two sources of cost truth.
**How to avoid:** Use a clear precedence: (1) If CLI reports cost (`total_cost_usd > 0`), use that and mark `costSource: 'cli-reported'`. (2) If CLI doesn't report cost, use pricing table estimate and mark `costSource: 'estimated'`. (3) If neither is available, mark `costSource: 'unavailable'` and show N/A. Never add them together.
**Warning signs:** Summary shows cost much higher than expected.

### Pitfall 5: Cost Formatting Precision

**What goes wrong:** JavaScript floating-point produces `$0.0541997500000000` instead of `$0.0542`.
**Why it happens:** Floating-point arithmetic. Multiplying token counts by rates produces many decimal places.
**How to avoid:** Use `Number(cost.toFixed(4))` for all cost computations. The CONTEXT.md specifies 4-decimal precision ($0.1234). Apply this consistently in both storage and display.
**Warning signs:** Costs with 15+ decimal places in the JSON log.

## Code Examples

### Cost Estimation Engine

```typescript
// Source: Anthropic pricing page (verified 2026-02-07)
// https://platform.claude.com/docs/en/about-claude/pricing

export interface ModelPricing {
  /** Cost per million input tokens (USD) */
  inputCostPerMTok: number;
  /** Cost per million output tokens (USD) */
  outputCostPerMTok: number;
}

/**
 * Default pricing table. Model IDs use the base name without date suffix.
 * Lookup uses prefix matching, so "claude-opus-4-5-20251101" matches "claude-opus-4-5".
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

export type CostSource = 'cli-reported' | 'estimated' | 'unavailable';

export interface CostEstimate {
  costUsd: number;
  source: CostSource;
}

/**
 * Look up pricing for a model, using prefix matching.
 * Keys are sorted longest-first to avoid false prefix matches.
 */
export function lookupPricing(
  model: string,
  overrides: Record<string, ModelPricing> = {},
): ModelPricing | undefined {
  const allPricing = { ...DEFAULT_MODEL_PRICING, ...overrides };

  // Exact match first
  if (allPricing[model]) return allPricing[model];

  // Prefix match (longest key first to avoid ambiguity)
  const sortedKeys = Object.keys(allPricing).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (model.startsWith(key)) {
      return allPricing[key];
    }
  }

  return undefined;
}

/**
 * Estimate cost for an AI call.
 *
 * Precedence: CLI-reported cost > pricing table estimate > unavailable
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cliReportedCost: number | undefined,
  pricingOverrides: Record<string, ModelPricing> = {},
): CostEstimate {
  // Use CLI-reported cost if available and non-zero
  if (cliReportedCost !== undefined && cliReportedCost > 0) {
    return {
      costUsd: Number(cliReportedCost.toFixed(4)),
      source: 'cli-reported',
    };
  }

  // Fall back to pricing table
  const pricing = lookupPricing(model, pricingOverrides);
  if (!pricing) {
    return { costUsd: 0, source: 'unavailable' };
  }

  const cost = (inputTokens / 1_000_000) * pricing.inputCostPerMTok
             + (outputTokens / 1_000_000) * pricing.outputCostPerMTok;

  return {
    costUsd: Number(cost.toFixed(4)),
    source: 'estimated',
  };
}
```

### Extended TelemetryEntry

```typescript
// Source: Codebase src/ai/types.ts -- fields to add

interface FileRead {
  /** File path relative to project root */
  path: string;
  /** File size in bytes at time of read */
  sizeBytes: number;
}

// Add to existing TelemetryEntry interface:
interface TelemetryEntry {
  // ... all existing fields remain unchanged ...

  /** AI thinking/reasoning content. "not supported" when backend doesn't provide it */
  thinking: string;

  /** Files read as context for this call */
  filesRead: FileRead[];

  /** How the cost was determined */
  costSource: CostSource;
}
```

### Extended RunLog Summary

```typescript
// Source: Codebase src/ai/types.ts -- add to RunLog.summary

interface RunLogSummary {
  // ... existing fields ...

  /** Total estimated cost in USD (sum of all entry costs) */
  totalCostUsd: number;

  /** Whether cost data is available for all entries */
  costAvailable: boolean;

  /** Total number of file reads across all calls (including duplicates) */
  totalFilesRead: number;

  /** Number of unique files read (deduped by path) */
  uniqueFilesRead: number;
}
```

### Enhanced Summary Display

```typescript
// Source: Codebase src/orchestration/progress.ts -- printSummary enhancement

function formatCost(usd: number, available: boolean): string {
  if (!available) return 'N/A';
  return `$${usd.toFixed(4)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
  return String(count);
}

// In printSummary:
// Before (existing):
//   console.log(`  Tokens in:       ${summary.totalInputTokens.toLocaleString()}`);
//   console.log(`  Tokens out:      ${summary.totalOutputTokens.toLocaleString()}`);

// After (enhanced):
//   const costStr = formatCost(summary.totalCostUsd, summary.costAvailable);
//   const tokIn = formatTokens(summary.totalInputTokens);
//   const tokOut = formatTokens(summary.totalOutputTokens);
//   console.log(`  Estimated cost:  ${costStr} (${tokIn} in / ${tokOut} out)`);
//   console.log(`  Files read:      ${summary.totalFilesRead} (${summary.uniqueFilesRead} unique)`);
```

### Config Schema Extension

```typescript
// Source: Codebase src/config/schema.ts -- extensions

const TelemetrySchema = z.object({
  /** Number of most recent run logs to keep on disk */
  keepRuns: z.number().min(0).default(10),
  /** Optional cost threshold in USD. Warn when exceeded. */
  costThresholdUsd: z.number().min(0).optional(),
}).default({});

// Add to AISchema:
const AISchema = z.object({
  // ... existing fields ...
  telemetry: TelemetrySchema,
  /** Custom model pricing overrides (model ID -> rates) */
  pricing: z.record(z.object({
    inputCostPerMTok: z.number(),
    outputCostPerMTok: z.number(),
  })).optional(),
}).default({});
```

### Cost Threshold Warning

```typescript
// Source: Design decision from CONTEXT.md

function checkCostThreshold(
  totalCostUsd: number,
  threshold: number | undefined,
): string | undefined {
  if (threshold === undefined || totalCostUsd <= threshold) return undefined;
  return `Warning: Estimated run cost $${totalCostUsd.toFixed(4)} exceeds configured threshold $${threshold.toFixed(4)}`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No cost tracking | Claude CLI reports `total_cost_usd` in JSON output | Phase 6 (already implemented) | Cost per call is already captured in TelemetryEntry.costUsd |
| No thinking capture | Extended thinking API returns `thinking` content blocks | Claude 4 models (2025) | Available in API responses but NOT in CLI `-p --output-format json` |
| No file tracking | CLI `stream-json --verbose` shows tool_use events with file metadata | Claude Code v2.x | File reads visible in stream events but not in final result object |
| Flat per-token pricing | Per-million-token pricing with cache tiers | Industry standard 2025+ | All major providers now quote prices per MTok |

**Deprecated/outdated:**
- Claude Sonnet 3.7's full thinking output: Claude 4+ models return summarized thinking in the API. Full thinking requires special access.
- Simple per-1K-token pricing: Providers now use per-MTok pricing with separate cache write/read tiers.

## Claude's Discretion Recommendations

### Config Schema for Cost Threshold and Pricing Overrides

**Recommendation:** Add `telemetry.costThresholdUsd` as optional number and `pricing` as optional record in the `ai` config section.

```yaml
# In config.yaml
ai:
  telemetry:
    keepRuns: 10
    costThresholdUsd: 5.00  # Warn when run cost exceeds $5
  pricing:
    my-private-model:
      inputCostPerMTok: 2.0
      outputCostPerMTok: 8.0
```

**Rationale:** Using `.optional()` means the fields are absent by default (no warnings, default pricing only). This is backward compatible -- existing config files remain valid.

### How to Parse Thinking Content from CLI Output

**Recommendation:** For this phase, set the `thinking` field to `"not supported"` as the marker value for all entries.

**Rationale:** The current architecture uses `claude -p --output-format json` which returns a single result object. This object does NOT contain thinking blocks. Thinking blocks are only available in the `stream-json` format's streaming events. Since:
1. The tool uses simple single-turn prompts (no agentic tool use)
2. Extended thinking is not enabled by default in `-p` mode
3. Switching to `stream-json` would require rewriting the subprocess + parsing layer

The pragmatic approach is to populate the field with the marker value now and defer real thinking capture to a future phase that switches to `stream-json` parsing. The field's presence in the schema ensures forward compatibility.

### Which Specific Model IDs to Include in Hardcoded Pricing

**Recommendation:** Include these 14 models (verified 2026-02-07):

**Claude (Anthropic):** `claude-opus-4-6`, `claude-opus-4-5`, `claude-opus-4-1`, `claude-opus-4`, `claude-sonnet-4-5`, `claude-sonnet-4`, `claude-haiku-4-5`, `claude-haiku-3-5`, `claude-haiku-3`

**OpenAI:** `gpt-4o`, `gpt-4o-mini`, `gpt-4`

**Google:** `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3-flash`

**Rationale:** These cover the most commonly used models from each provider. Prefix matching handles date-suffixed variants (e.g., `claude-opus-4-5-20251101` matches `claude-opus-4-5`). Users can add custom models via config overrides.

### Warning Message Format

**Recommendation:**

For cost threshold exceeded:
```
Warning: Run cost $5.1234 exceeds configured threshold of $5.0000
```

For unknown model pricing:
```
Warning: No pricing data for model "custom-model-v2". Cost shown as N/A. Add pricing in config.yaml under ai.pricing.
```

**Rationale:** Actionable messages that tell the user what happened AND what to do about it. The config path hint for unknown models reduces support burden.

## Open Questions

1. **Thinking capture completeness**
   - What we know: The `--output-format json` final result object does NOT include thinking blocks. Extended thinking content is only available via `stream-json` streaming events. The current tool architecture processes only the final result.
   - What's unclear: Whether a future Claude CLI version will include thinking content in the non-streaming JSON result object.
   - Recommendation: Add the `thinking` field with marker value now. Plan a future phase to switch to `stream-json` parsing if thinking capture becomes a priority.

2. **Files-read tracking for non-context files**
   - What we know: The tool currently reads files with `readFile()` in the `CommandRunner` and passes content in the prompt. The AI never uses `Read` tool calls. The `stream-json --verbose` format DOES show `tool_use_result` events with `file` objects when the AI reads files autonomously.
   - What's unclear: Whether future phases will use agentic mode where the AI reads files via tool use.
   - Recommendation: Track files sent as context by the runner (from `ExecutionTask.path` and file size). This satisfies "files we sent to the AI as context." The "files the AI reports reading" dimension will be empty for now; add it when agentic mode is implemented.

3. **Cache-adjusted cost accuracy**
   - What we know: The Claude CLI's `total_cost_usd` field accounts for prompt caching discounts. The pricing table estimate does not.
   - What's unclear: How accurate the pricing table estimate is compared to actual billed cost when caching is active.
   - Recommendation: Always prefer CLI-reported cost. Mark pricing-table estimates with `costSource: 'estimated'` so users know it's approximate.

## Sources

### Primary (HIGH confidence)
- Anthropic pricing page (https://platform.claude.com/docs/en/about-claude/pricing) -- All Claude model pricing per MTok, verified 2026-02-07
- Anthropic extended thinking docs (https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking) -- Thinking blocks structure, API format, summarization behavior
- Claude Code CLI reference (https://code.claude.com/docs/en/cli-reference) -- All flags including `--output-format`, `--verbose`
- Claude Code headless docs (https://code.claude.com/docs/en/headless) -- Print mode, JSON output structure
- **Live verification:** Claude CLI v2.1.31 `--output-format json` response structure verified on this machine (2026-02-07) -- includes `total_cost_usd`, `usage`, `modelUsage`
- **Live verification:** Claude CLI v2.1.31 `--output-format stream-json --verbose` event structure verified on this machine (2026-02-07) -- includes `tool_use_result` with `file` objects showing `filePath`, `content`, `numLines`
- Existing codebase: `src/ai/types.ts`, `src/ai/service.ts`, `src/ai/telemetry/logger.ts`, `src/orchestration/progress.ts`, `src/config/schema.ts` -- current telemetry, config, and display architecture

### Secondary (MEDIUM confidence)
- OpenAI pricing (https://openai.com/api/pricing/) -- GPT-4, GPT-4o, GPT-4o-mini pricing, from web search 2026-02-07
- Google Gemini pricing (https://ai.google.dev/gemini-api/docs/pricing) -- Gemini Flash/Pro pricing, from web search 2026-02-07

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new dependencies, extends existing patterns
- Architecture: HIGH -- Extends existing TelemetryEntry, RunLog, and ProgressReporter with minimal structural change
- Pricing data: HIGH for Claude (official docs), MEDIUM for GPT/Gemini (web search, cross-referenced with multiple sources)
- Thinking capture: HIGH -- Verified that `--output-format json` does NOT include thinking; marker value approach is pragmatic
- Files-read tracking: HIGH -- Verified that runner already has file paths; `stream-json --verbose` shows file metadata for future use
- Pitfalls: HIGH -- Based on live CLI testing and codebase analysis

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days -- pricing may change, but architecture patterns are stable)

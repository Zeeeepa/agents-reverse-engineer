/**
 * Public API for the AI service layer.
 *
 * This barrel export is the ONLY import point for the AI service layer.
 * No other module should reach into `src/ai/backends/` or `src/ai/telemetry/`
 * directly.
 *
 * @module
 *
 * @example
 * ```typescript
 * import {
 *   AIService,
 *   createBackendRegistry,
 *   resolveBackend,
 * } from './ai/index.js';
 *
 * const registry = createBackendRegistry();
 * const backend = await resolveBackend(registry, 'auto');
 * const service = new AIService(backend, {
 *   timeoutMs: 120_000,
 *   maxRetries: 3,
 *   telemetry: { keepRuns: 10 },
 * });
 *
 * const response = await service.call({ prompt: 'Hello' });
 * ```
 */

// ---------------------------------------------------------------------------
// Types and errors
// ---------------------------------------------------------------------------

export type {
  AIBackend,
  AIResponse,
  AICallOptions,
  SubprocessResult,
  RetryOptions,
  TelemetryEntry,
  RunLog,
  FileRead,
  CostSource,
} from './types.js';

export { AIServiceError } from './types.js';

// ---------------------------------------------------------------------------
// Service orchestrator
// ---------------------------------------------------------------------------

export { AIService } from './service.js';
export type { AIServiceOptions } from './service.js';

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

export {
  BackendRegistry,
  createBackendRegistry,
  resolveBackend,
  detectBackend,
  getInstallInstructions,
} from './registry.js';

// ---------------------------------------------------------------------------
// Retry utility
// ---------------------------------------------------------------------------

export { withRetry, DEFAULT_RETRY_OPTIONS } from './retry.js';

// ---------------------------------------------------------------------------
// Subprocess wrapper
// ---------------------------------------------------------------------------

export { runSubprocess } from './subprocess.js';

// ---------------------------------------------------------------------------
// Backend utilities
// ---------------------------------------------------------------------------

export { isCommandOnPath } from './backends/claude.js';

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export { DEFAULT_MODEL_PRICING, estimateCost, lookupPricing, formatCost, formatTokens } from './pricing.js';
export type { ModelPricing, CostEstimate } from './pricing.js';

---
phase: 06-ai-service-foundation
plan: 03
subsystem: ai
tags: [telemetry, orchestrator, barrel-export, config-schema, zod, subprocess, retry]

# Dependency graph
requires:
  - phase: 06-01
    provides: Shared types (AIBackend, AIResponse, SubprocessResult, TelemetryEntry, RunLog, AIServiceError), subprocess wrapper, retry utility
  - phase: 06-02
    provides: Claude backend adapter, Gemini/OpenCode stubs, backend registry with auto-detection
provides:
  - TelemetryLogger for in-memory per-call logging with summary computation
  - writeRunLog for writing pretty-printed JSON run logs to disk
  - cleanupOldLogs for removing old telemetry files keeping N most recent
  - AIService orchestrator tying subprocess, retry, backend, and telemetry together
  - Config schema extended with ai section (backend, model, timeoutMs, maxRetries, telemetry.keepRuns)
  - Barrel export (src/ai/index.ts) as single import point for the AI service layer
affects: [07-ai-powered-generation, 08-telemetry-and-cost]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AIService orchestrator pattern: single call() entry point wrapping subprocess + retry + telemetry"
    - "Telemetry per-run file pattern: one JSON file per CLI invocation in .agents-reverse-engineer/logs/"
    - "Barrel export pattern: src/ai/index.ts as the only public import point"

key-files:
  created:
    - src/ai/telemetry/logger.ts
    - src/ai/telemetry/run-log.ts
    - src/ai/telemetry/cleanup.ts
    - src/ai/service.ts
    - src/ai/index.ts
  modified:
    - src/config/schema.ts

key-decisions:
  - "Rate-limit detection uses case-insensitive substring matching on stderr for patterns: rate limit, 429, too many requests, overloaded"
  - "AIService records telemetry entries for both successful and failed calls (error entries have zero tokens)"
  - "Config ai section uses .default({}) at every level for full backward compatibility"
  - "Barrel export re-exports AIServiceOptions type from service.ts for consumer convenience"

patterns-established:
  - "Telemetry entry for every call: success entries carry full token/cost data, error entries carry error message and actual latency"
  - "finalize() writes log + cleans up as a single operation at end of run"
  - "Config schema backward compatibility: new sections always have .default({}) so existing configs parse unchanged"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 6 Plan 03: AI Service Orchestrator, Telemetry, and Public API Summary

**AIService orchestrator with subprocess/retry/telemetry integration, per-run JSON telemetry logging with cleanup, config schema ai section, and barrel export as single import point**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T12:05:39Z
- **Completed:** 2026-02-07T12:09:01Z
- **Tasks:** 3/3
- **Files created:** 5
- **Files modified:** 1

## Accomplishments
- Built telemetry subsystem: TelemetryLogger for in-memory accumulation, writeRunLog for JSON file output, cleanupOldLogs for retention management
- Built AIService orchestrator that ties together subprocess spawning, retry with rate-limit/timeout detection, and telemetry logging into a single call() method
- Extended config schema with backward-compatible ai section covering backend, model, timeout, retries, and telemetry settings
- Created barrel export (src/ai/index.ts) re-exporting all public types, classes, and functions as the single import point

## Task Commits

Each task was committed atomically:

1. **Task 1: Build telemetry subsystem** - `cb1134a` (feat)
2. **Task 2: Build AIService orchestrator and extend config schema** - `8457980` (feat)
3. **Task 3: Create barrel export and verify full compilation** - `94f6d86` (feat)

## Files Created/Modified
- `src/ai/telemetry/logger.ts` - TelemetryLogger class: accumulates entries, computes summary totals, produces RunLog
- `src/ai/telemetry/run-log.ts` - writeRunLog: writes pretty-printed JSON to .agents-reverse-engineer/logs/
- `src/ai/telemetry/cleanup.ts` - cleanupOldLogs: removes old run files keeping N most recent
- `src/ai/service.ts` - AIService class: call() with retry/telemetry, finalize() for run log output, getSummary() for progress
- `src/ai/index.ts` - Barrel export re-exporting all public API types and functions
- `src/config/schema.ts` - Extended with AISchema and AIConfig type export

## Decisions Made
- **Rate-limit detection via stderr patterns:** Uses case-insensitive substring matching for "rate limit", "429", "too many requests", "overloaded". Simple and effective for current backend CLIs.
- **Telemetry for all calls:** Both successful and failed calls produce TelemetryEntry records. Error entries have zero tokens/cost but record actual latency and error message. This ensures complete run visibility.
- **Config backward compatibility via nested defaults:** Every level of the ai schema uses `.default({})` so that existing config files without an `ai` section parse correctly with all defaults populated.
- **AIServiceOptions exported as named type:** Exported from service.ts and re-exported via barrel for consumers to type their own configuration objects.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Complete AI service layer ready to be wired into commands in Phase 7
- AIService.call() handles all error paths: timeout, rate limit (with retry), parse error, subprocess failure
- Config schema provides full AI configuration with backward-compatible defaults
- Single import point via src/ai/index.ts simplifies integration
- Zero new dependencies -- continues minimal-dependency pattern

---
*Phase: 06-ai-service-foundation*
*Completed: 2026-02-07*

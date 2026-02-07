---
phase: 08-full-telemetry
plan: 02
subsystem: telemetry
tags: [pricing, cost-estimation, telemetry, file-tracking, zod]

# Dependency graph
requires:
  - phase: 08-01
    provides: "Cost estimation engine (estimateCost, lookupPricing, ModelPricing, CostSource)"
provides:
  - "TelemetryEntry with thinking, filesRead, costSource fields"
  - "RunLog.summary with costAvailable, totalFilesRead, uniqueFilesRead"
  - "RunSummary with totalCostUsd, costAvailable, totalFilesRead, uniqueFilesRead"
  - "AIService.call() populates cost via pricing engine"
  - "Config schema with costThresholdUsd and pricing overrides"
  - "Barrel exports for FileRead, CostSource, pricing functions"
affects: [08-03-dashboard-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Post-call metadata attachment via addFilesReadToLastEntry pattern"
    - "Cost provenance tracking (cli-reported, estimated, unavailable)"

key-files:
  created: []
  modified:
    - src/ai/types.ts
    - src/ai/service.ts
    - src/ai/telemetry/logger.ts
    - src/orchestration/types.ts
    - src/orchestration/runner.ts
    - src/config/schema.ts
    - src/ai/index.ts

key-decisions:
  - "thinking field defaults to 'not supported' until backends provide it"
  - "filesRead attached post-call via setFilesReadOnLastEntry (not inline in call())"
  - "Root document tasks leave filesRead empty (aggregated content, no single source file)"
  - "costAvailable is true if at least one entry has costSource !== 'unavailable'"
  - "pricingOverrides and costThresholdUsd are optional to preserve backward compatibility"

patterns-established:
  - "Post-call telemetry enrichment: caller attaches metadata after AI call completes"
  - "Cost provenance chain: AIService.call() -> estimateCost() -> TelemetryEntry.costSource"

# Metrics
duration: 5min
completed: 2026-02-07
---

# Phase 8 Plan 2: Telemetry Wiring Summary

**Extended types, wired pricing engine into AIService, and enabled file-size tracking in CommandRunner with cost provenance across the full telemetry chain**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-07T15:33:38Z
- **Completed:** 2026-02-07T15:38:15Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Every AI call now produces telemetry entries with thinking, filesRead, and cost data with provenance tracking
- RunLog.summary and RunSummary carry costAvailable, totalFilesRead, and uniqueFilesRead for dashboard display
- Config schema supports `ai.telemetry.costThresholdUsd` and `ai.pricing` overrides for user customization
- Barrel exports updated to expose all new types and pricing functions

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types and config schema** - `b7d0492` (feat)
2. **Task 2: Wire pricing into AIService and extend TelemetryLogger** - `d2a660c` (feat)
3. **Task 3: Track file sizes in CommandRunner and populate filesRead** - `24d0aae` (feat)

**Barrel export update:** `dee0c44` (chore)

## Files Created/Modified

- `src/ai/types.ts` - Added FileRead interface, CostSource re-export, thinking/filesRead/costSource on TelemetryEntry, costAvailable/totalFilesRead/uniqueFilesRead on RunLog.summary
- `src/ai/service.ts` - Wired estimateCost into call(), added addFilesReadToLastEntry(), extended AIServiceOptions with pricingOverrides
- `src/ai/telemetry/logger.ts` - Added setFilesReadOnLastEntry(), computed costAvailable/totalFilesRead/uniqueFilesRead in getSummary()
- `src/orchestration/types.ts` - Added totalCostUsd, costAvailable, totalFilesRead, uniqueFilesRead to RunSummary
- `src/orchestration/runner.ts` - Added stat import, file-size tracking after AI calls, populated new RunSummary fields
- `src/config/schema.ts` - Added costThresholdUsd to telemetry config, pricing overrides to AI config
- `src/ai/index.ts` - Exported FileRead, CostSource, pricing functions and types

## Decisions Made

- **thinking defaults to "not supported"**: No backend currently provides thinking/reasoning content. Field exists for future backends.
- **filesRead attached post-call**: The CommandRunner knows which file was processed, not the AIService. So file metadata is attached after the call via `addFilesReadToLastEntry()`.
- **Root tasks get empty filesRead**: Root document tasks (CLAUDE.md, ARCHITECTURE.md) are built from aggregated content across the project, not a single source file. Tracking individual files would be misleading.
- **costAvailable uses any-match**: True if at least one entry has a non-unavailable cost source. This is the simplest useful signal for the dashboard.
- **Optional new fields on AIServiceOptions**: `pricingOverrides` and `costThresholdUsd` are optional so existing call sites (CLI commands) continue working without changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added barrel exports for new types and pricing functions**
- **Found during:** Post-Task 3 verification
- **Issue:** New types (FileRead, CostSource) and pricing functions (estimateCost, lookupPricing, etc.) were not exported from the AI barrel (src/ai/index.ts), making them inaccessible to downstream consumers
- **Fix:** Added exports for FileRead, CostSource, ModelPricing, CostEstimate types and estimateCost, lookupPricing, formatCost, formatTokens functions
- **Files modified:** src/ai/index.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** dee0c44

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for API completeness. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All telemetry fields populated at every call site -- type system enforces completeness
- Config schema ready for costThresholdUsd and pricing override consumption in 08-03
- Dashboard display plan (08-03) can consume RunLog.summary and RunSummary directly
- 25 pricing tests still passing, zero type errors

---
*Phase: 08-full-telemetry*
*Completed: 2026-02-07*

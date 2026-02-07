---
phase: 08-full-telemetry
plan: 03
subsystem: telemetry
tags: [cost-display, pricing, progress-reporter, barrel-export, threshold-warning]

# Dependency graph
requires:
  - phase: 08-full-telemetry/08-01
    provides: pricing engine (formatCost, formatTokens, estimateCost, DEFAULT_MODEL_PRICING)
  - phase: 08-full-telemetry/08-02
    provides: telemetry wiring (RunSummary with cost/filesRead fields, AIService cost tracking)
provides:
  - Enhanced run summary with estimated cost display and files-read counts
  - Cost threshold warning to stderr when exceeded
  - Unknown model pricing warning (once per model per run)
  - DEFAULT_MODEL_PRICING exported from AI barrel
affects: [09-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "stderr for warnings (console.error) to preserve JSON stdout"
    - "once-per-model warning via Set<string> dedup in AIService"

key-files:
  created: []
  modified:
    - src/orchestration/progress.ts
    - src/orchestration/types.ts
    - src/orchestration/runner.ts
    - src/ai/index.ts
    - src/ai/service.ts

key-decisions:
  - "costThresholdUsd added to CommandRunOptions (not AIServiceOptions) because the warning is a display concern"
  - "Unknown model warning uses console.error for stderr output consistency"
  - "DEFAULT_MODEL_PRICING added to barrel export for consumer access to pricing table"

patterns-established:
  - "printSummary accepts optional display config parameters (costThresholdUsd) rather than reading config directly"

# Metrics
duration: 2min
completed: 2026-02-07
---

# Phase 8 Plan 3: Dashboard Display Summary

**Run summary shows estimated cost with token breakdown, files-read with unique dedup, cost threshold warning, and unknown model warning**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-07T15:41:56Z
- **Completed:** 2026-02-07T15:44:15Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Run summary now displays "Estimated cost: $X.XXXX (NK in / NK out)" replacing raw token count lines
- Files-read line shows "Files read: N (M unique)" when file tracking data is present
- Cost threshold warning prints to stderr when run cost exceeds configured limit
- Unknown model pricing warning emitted once per unique model per run to stderr
- DEFAULT_MODEL_PRICING exported from AI barrel for consumer access

## Task Commits

Each task was committed atomically:

1. **Task 1: Enhance summary display with cost and files-read** - `5f71385` (feat)
2. **Task 2: Barrel export, cost threshold in runner, and unknown model warning** - `b89bb84` (feat)

## Files Created/Modified
- `src/orchestration/progress.ts` - Enhanced printSummary with cost display, files-read line, and cost threshold warning
- `src/orchestration/types.ts` - Added costThresholdUsd to CommandRunOptions interface
- `src/orchestration/runner.ts` - Pass costThresholdUsd through to printSummary in both executeGenerate and executeUpdate
- `src/ai/index.ts` - Added DEFAULT_MODEL_PRICING to barrel export
- `src/ai/service.ts` - Added warnedModels Set and unknown model warning after estimateCost

## Decisions Made
- costThresholdUsd added to CommandRunOptions (display-layer concern) rather than only in AIServiceOptions
- Unknown model warning uses console.error (stderr) for consistency with cost threshold warning
- DEFAULT_MODEL_PRICING was missing from barrel export despite other pricing items being present -- added it

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Full telemetry pipeline complete: pricing engine -> telemetry wiring -> dashboard display
- Phase 8 is fully done; ready for Phase 9 (polish)
- Cost and files-read data flows from AI calls through telemetry to the user-facing summary

---
*Phase: 08-full-telemetry*
*Completed: 2026-02-07*

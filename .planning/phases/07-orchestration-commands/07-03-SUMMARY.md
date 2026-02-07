---
phase: 07-orchestration-commands
plan: 03
subsystem: cli
tags: [update-command, ai-execution, concurrent-processing, command-runner, progress-reporter, discover-command]

# Dependency graph
requires:
  - phase: 07-01
    provides: CommandRunner with executeUpdate, ProgressReporter, runPool, RunSummary types
  - phase: 07-02
    provides: Generate command pattern (backend resolution, AIService creation, exit code scheme)
  - phase: 06-03
    provides: AIService, resolveBackend, createBackendRegistry, AIServiceError, getInstallInstructions
provides:
  - Update command rewritten to use AIService for real AI-backed file analysis
  - Concurrent file processing via CommandRunner.executeUpdate with configurable concurrency
  - Streaming progress output with ETA via ProgressReporter
  - Run summary with total calls, tokens in/out, time, error count
  - Consistent exit code scheme (0/1/2) across generate and update commands
  - Discover command cleanup (removed process.exit(0) for clean return)
affects: [08-telemetry-and-cost, 09-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Update command mirrors generate command flow: plan -> resolve backend -> AIService -> CommandRunner -> finalize"
    - "AGENTS.md regeneration is caller responsibility after executeUpdate (Phase 1 only)"

key-files:
  created: []
  modified:
    - src/cli/update.ts
    - src/cli/discover.ts

key-decisions:
  - "Update command delegates to CommandRunner.executeUpdate rather than inline pool logic"
  - "AGENTS.md regeneration happens after executeUpdate with separate ProgressReporter for directory events"
  - "Discover command returns normally instead of process.exit(0) for proper cleanup and test-friendliness"

patterns-established:
  - "All AI-backed commands follow same flow: resolve backend -> create AIService -> create CommandRunner -> execute -> finalize telemetry"
  - "Only error paths call process.exit; success paths return normally"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 7 Plan 03: Update & Discover Command Rewrite Summary

**Update command rewritten from placeholder .sum generation to real AI-backed analysis via CommandRunner.executeUpdate with concurrent processing and streaming progress**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T13:29:10Z
- **Completed:** 2026-02-07T13:32:08Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments
- Replaced placeholder summary generation ("Analysis Pending. Full analysis requires LLM integration.") with real AI-backed analysis through CommandRunner.executeUpdate
- Update command now processes changed files concurrently with configurable concurrency (--concurrency flag)
- Streaming progress output via ProgressReporter shows per-file timing, token counts, and ETA
- Run summary printed at end with total calls, tokens in/out, total time, error count
- Exit codes consistent across generate and update: 0 (all success), 1 (partial failure), 2 (total failure / no CLI)
- Discover command cleaned up: removed process.exit(0) for consistent return behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite update command to use AIService for real analysis** - `fd898f0` (feat)
2. **Task 2: Update discover command and verify full compilation** - `3e13fe8` (refactor)

## Files Created/Modified
- `src/cli/update.ts` - Rewrote from placeholder .sum generation to AIService + CommandRunner pipeline with concurrent processing
- `src/cli/discover.ts` - Removed process.exit(0) and unused Logger type import for consistency

## Decisions Made
- **Delegate to CommandRunner.executeUpdate:** Rather than duplicating the pool/progress/AI-call logic inline, the update command uses the existing CommandRunner.executeUpdate method. This keeps all AI call orchestration in one place.
- **Separate AGENTS.md regeneration:** executeUpdate only runs Phase 1 (file analysis). AGENTS.md regeneration is done by the update command itself after executeUpdate returns, using a separate ProgressReporter instance for directory events.
- **Remove process.exit(0) from discover:** All three commands (generate, update, discover) now return normally on success. Only error paths use process.exit(1) or process.exit(2). This makes commands more testable and consistent.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All three CLI commands (generate, update, discover) are fully wired to the orchestration engine
- Phase 7 (Orchestration & Commands) is complete
- Ready for Phase 8 (Telemetry & Cost) to build on the telemetry data being written by aiService.finalize()
- The full AI pipeline works end-to-end: backend resolution -> AI calls -> .sum files -> AGENTS.md -> run logs

---
*Phase: 07-orchestration-commands*
*Completed: 2026-02-07*

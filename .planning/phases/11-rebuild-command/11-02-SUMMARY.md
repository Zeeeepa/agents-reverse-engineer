---
phase: 11-rebuild-command
plan: 02
subsystem: rebuild
tags: [cli, orchestrator, prompt-template, concurrency-pool, checkpoint, context-accumulation]

# Dependency graph
requires:
  - phase: 11-rebuild-command
    provides: types, spec-reader, output-parser, checkpoint manager from plan 01
  - phase: 10-specify-command
    provides: spec files in specs/ consumed by readSpecFiles
provides:
  - REBUILD_SYSTEM_PROMPT and buildRebuildPrompt for AI-driven project reconstruction
  - executeRebuild orchestrator with order-grouped sequential/concurrent execution
  - CLI rebuild command with --dry-run, --force, --output, --concurrency, --fail-fast, --debug, --trace
  - Context accumulation passing exported type signatures to subsequent order groups
affects: [CLAUDE.md documentation, README examples, hook commands]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Order-grouped execution: Map<number, RebuildUnit[]> with sequential for-loop over sorted keys, concurrent runPool within each group"
    - "Context accumulation: regex-based export line extraction after each order group, passed to subsequent prompts"
    - "CLI handler follows generate.ts pattern: config load -> backend resolve -> AIService create -> execute -> finalize"

key-files:
  created:
    - src/rebuild/prompts.ts
    - src/rebuild/orchestrator.ts
    - src/cli/rebuild.ts
  modified:
    - src/rebuild/index.ts
    - src/cli/index.ts

key-decisions:
  - "15min minimum timeout for rebuild (Math.max(config.ai.timeoutMs, 900_000)) matching specify command pattern"
  - "Standalone executeRebuild function (not method on CommandRunner) to avoid modifying runner.ts"
  - "Best-effort export extraction via regex (not AST) is acceptable since full spec always included in every prompt"
  - "Tracer phase:start/end events emitted per order group for rebuild tracing"

patterns-established:
  - "Order-grouped pool execution: group by order -> sort keys -> for-of with await runPool per group"
  - "Context accumulation: builtContext string grows after each group with exported signatures"

# Metrics
duration: 4min
completed: 2026-02-09
---

# Phase 11 Plan 02: Rebuild Execution Pipeline Summary

**Rebuild orchestrator with order-grouped concurrent execution via runPool, context accumulation from exported signatures, and full CLI command with dry-run/force/checkpoint resume**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-09T19:30:42Z
- **Completed:** 2026-02-09T19:35:12Z
- **Tasks:** 2
- **Files created:** 3
- **Files modified:** 2

## Accomplishments
- Prompt templates: REBUILD_SYSTEM_PROMPT with ===FILE:=== delimiter format and buildRebuildPrompt combining full spec, current phase, and built context
- Rebuild orchestrator: groups units by order value into Map, processes groups sequentially via for-loop, runs concurrent units within each group via runPool, accumulates exported type signatures as context
- Full CLI command handler with all flags: --output, --force, --dry-run, --concurrency, --fail-fast, --debug, --trace
- CLI registration in router with USAGE string, examples, and switch case

## Task Commits

Each task was committed atomically:

1. **Task 1: Prompt Templates and Rebuild Orchestrator** - `b53d1eb` (feat)
2. **Task 2: CLI Command Handler and Registration** - `e66251d` (feat)

## Files Created/Modified
- `src/rebuild/prompts.ts` - REBUILD_SYSTEM_PROMPT and buildRebuildPrompt with builtContext parameter
- `src/rebuild/orchestrator.ts` - executeRebuild with order-grouped execution, checkpoint, progress, tracer integration
- `src/rebuild/index.ts` - Updated barrel with new exports (prompts, orchestrator)
- `src/cli/rebuild.ts` - rebuildCommand handler with 15min timeout, dry-run, force, telemetry finalization
- `src/cli/index.ts` - rebuild command registration: import, USAGE string, switch case, examples

## Decisions Made
- 15min minimum timeout (Math.max 900_000) for rebuild, matching specify command pattern for large AI calls
- Standalone executeRebuild function rather than adding a method to CommandRunner to avoid modifying runner.ts
- Best-effort regex-based export extraction (not AST parsing) is acceptable since the full spec is always included in every prompt -- complex patterns may be missed but won't cause failures
- Tracer events (phase:start/phase:end) emitted per order group, with concurrency and tasksCompleted/tasksFailed fields matching existing trace schema

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed trace event payloads to match TraceEventPayload schema**
- **Found during:** Task 1 (orchestrator implementation)
- **Issue:** Plan's code snippets used `taskCount` for phase:start without `concurrency`, and `taskCount` for phase:end which doesn't exist on PhaseEndEvent
- **Fix:** Added `concurrency` field to phase:start, replaced `taskCount` with `tasksCompleted`/`tasksFailed` on phase:end to match the actual TraceEventPayload union type
- **Files modified:** src/rebuild/orchestrator.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** b53d1eb (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor schema mismatch in plan code snippets. Fix required for TypeScript compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full `are rebuild` command is operational: reads specs, partitions into units, executes AI calls per order group, writes files, tracks via checkpoint
- All 11-rebuild-command plans complete (2/2)
- Phase 11 is fully delivered

---
*Phase: 11-rebuild-command*
*Completed: 2026-02-09*

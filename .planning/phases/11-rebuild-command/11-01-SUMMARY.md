---
phase: 11-rebuild-command
plan: 01
subsystem: rebuild
tags: [zod, checkpoint, sha256, spec-parsing, output-parsing]

# Dependency graph
requires:
  - phase: 10-specify-command
    provides: spec files in specs/ consumed by readSpecFiles
provides:
  - RebuildCheckpoint Zod schema and type for checkpoint persistence
  - RebuildUnit, RebuildPlan, RebuildResult types for rebuild pipeline
  - readSpecFiles and partitionSpec for spec consumption
  - parseModuleOutput for AI multi-file output extraction
  - CheckpointManager with promise-chain serialized writes
affects: [11-02-PLAN, rebuild orchestrator, rebuild CLI command]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CheckpointManager follows PlanTracker promise-chain write serialization"
    - "Spec partitioning uses Build Plan phase headings with Architecture/API context injection"
    - "Multi-format AI output parsing (===FILE:=== delimiters + fenced code block fallback)"

key-files:
  created:
    - src/rebuild/types.ts
    - src/rebuild/spec-reader.ts
    - src/rebuild/output-parser.ts
    - src/rebuild/checkpoint.ts
    - src/rebuild/index.ts
  modified: []

key-decisions:
  - "Zod schema for checkpoint validation on disk load (consistent with config schema pattern)"
  - "Build Plan phases as primary partition strategy with top-level headings as fallback"
  - "Architecture + Public API Surface sections injected as context prefix in each rebuild unit"
  - "Dual output format support: ===FILE:=== delimiters (primary) and fenced code blocks (fallback)"
  - "Checkpoint static factories (load/createFresh) rather than constructor overloading"
  - "Spec drift detection compares both hash values and file count (added/removed files)"

patterns-established:
  - "CheckpointManager.load() factory: try read -> parse -> validate -> drift check -> resume or fresh"
  - "partitionSpec context injection: extract Architecture + Public API Surface and prepend to each unit"

# Metrics
duration: 3min
completed: 2026-02-09
---

# Phase 11 Plan 01: Rebuild Foundation Summary

**Zod-validated checkpoint manager with promise-chain writes, spec partitioner extracting Build Plan phases with architecture context injection, and dual-format AI output parser**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-09T19:23:41Z
- **Completed:** 2026-02-09T19:26:24Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- Complete type system for rebuild module: checkpoint schema (Zod), unit/plan/result interfaces
- Spec reader with Build Plan phase extraction, architecture context injection, and descriptive error handling for malformed specs
- AI output parser supporting both `===FILE:===` delimiter format and markdown fenced code block fallback
- CheckpointManager with load/createFresh factories, spec drift detection via SHA-256, and promise-chain serialized writes

## Task Commits

Each task was committed atomically:

1. **Task 1: Types, Spec Reader, and Output Parser** - `3ba9b7d` (feat)
2. **Task 2: Checkpoint Manager and Barrel Export** - `bddab25` (feat)

## Files Created/Modified
- `src/rebuild/types.ts` - RebuildCheckpointSchema (Zod), RebuildCheckpoint, RebuildUnit, RebuildPlan, RebuildResult
- `src/rebuild/spec-reader.ts` - readSpecFiles (reads specs/ dir) and partitionSpec (Build Plan phases or heading fallback)
- `src/rebuild/output-parser.ts` - parseModuleOutput with ===FILE:=== delimiter and fenced block formats
- `src/rebuild/checkpoint.ts` - CheckpointManager class with load/createFresh/markDone/markFailed/flush/initialize
- `src/rebuild/index.ts` - Barrel re-export of all public types, schema, functions, and classes

## Decisions Made
- Used Zod schema for checkpoint validation (consistent with config schema pattern in `src/config/schema.ts`)
- Build Plan phases are the primary partition strategy; top-level headings are fallback for specs without Build Plan
- Each rebuild unit gets Architecture and Public API Surface sections prepended as context (not just the phase content)
- CheckpointManager uses static factory methods (load/createFresh) instead of constructor overloading for clarity
- Spec drift detection checks both individual hash values and file count to catch added/removed spec files
- Output parser tries delimiter format first, falls back to fenced blocks, returns empty Map if neither matches (caller handles)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All rebuild data-layer types and utilities ready for Plan 02 (prompts, orchestrator, CLI command)
- CheckpointManager ready for integration with rebuild orchestrator
- Spec reader ready for integration with CLI command entry point
- No blockers or concerns

---
*Phase: 11-rebuild-command*
*Completed: 2026-02-09*

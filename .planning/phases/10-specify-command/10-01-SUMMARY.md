---
phase: 10-specify-command
plan: 01
subsystem: generation
tags: [agents-md, collector, refactor, shared-module]

# Dependency graph
requires:
  - phase: none
    provides: existing buildRootPrompt with private collectAgentsMdFiles
provides:
  - "Shared collectAgentsDocs() in src/generation/collector.ts"
  - "AgentsDocs type exported for reuse across modules"
  - "Refactored buildRootPrompt() using shared collector"
affects: [10-specify-command plan 03 (specify command uses collectAgentsDocs)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared collector pattern: extract private walks into reusable module-level functions"

key-files:
  created:
    - src/generation/collector.ts
  modified:
    - src/generation/prompts/builder.ts

key-decisions:
  - "collectAgentsDocs returns Array<{ relativePath, content }> instead of raw file paths for direct consumption"
  - "SKIP_DIRS constant is module-private in collector.ts (not exported) to keep API surface minimal"

patterns-established:
  - "Shared AGENTS.md collection: collectAgentsDocs() is the single source of truth for project-wide AGENTS.md discovery"

# Metrics
duration: 2min
completed: 2026-02-09
---

# Phase 10 Plan 01: Shared AGENTS.md Collector Summary

**Extracted recursive AGENTS.md walk into shared collectAgentsDocs() in collector.ts and refactored buildRootPrompt() to use it**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T11:06:31Z
- **Completed:** 2026-02-09T11:08:36Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `src/generation/collector.ts` with exported `AgentsDocs` type and `collectAgentsDocs()` function
- Refactored `buildRootPrompt()` to import and use the shared collector
- Deleted private `collectAgentsMdFiles()` from builder.ts (49 lines removed, 6 added)
- Build and type-check pass with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared AGENTS.md collector in generation module** - `0489257` (feat)
2. **Task 2: Refactor buildRootPrompt to use shared collector** - `a20cc8d` (refactor)

## Files Created/Modified
- `src/generation/collector.ts` - Shared AGENTS.md recursive collector with AgentsDocs type
- `src/generation/prompts/builder.ts` - Refactored to use shared collector; private walk function deleted

## Decisions Made
- collectAgentsDocs() returns `Array<{ relativePath, content }>` (pre-read content) rather than raw file paths, so callers don't need to do their own readFile loops
- SKIP_DIRS is module-private (not exported) since callers should not need to modify the skip list

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- collectAgentsDocs() is ready for import by the specify command (Plan 03)
- buildRootPrompt() behavior unchanged -- existing generate command works identically
- No blockers for subsequent plans

---
*Phase: 10-specify-command*
*Completed: 2026-02-09*

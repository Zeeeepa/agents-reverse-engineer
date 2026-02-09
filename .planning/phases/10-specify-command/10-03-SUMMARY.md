---
phase: 10-specify-command
plan: 03
subsystem: cli
tags: [specify, cli, ai-service, agents-md, spec-generation, picocolors]

# Dependency graph
requires:
  - phase: 10-specify-command (plan 01)
    provides: collectAgentsDocs shared collector
  - phase: 10-specify-command (plan 02)
    provides: buildSpecPrompt, writeSpec, SpecExistsError
  - phase: 06-ai-service
    provides: AIService, resolveBackend, createBackendRegistry, getInstallInstructions
provides:
  - specifyCommand CLI handler wiring collector, prompts, AI service, and writer
  - CLI entry point registration with full flag support
  - Auto-generate fallback when no AGENTS.md files exist
  - Dry-run mode for input statistics without AI calls
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI command handler pattern: config load, backend resolve, AI call, output write, telemetry finalize"
    - "Extended timeout (min 600s) for long-running spec generation vs file analysis"
    - "Auto-generate fallback: detect missing AGENTS.md, call generateCommand, re-collect"

key-files:
  created:
    - src/cli/specify.ts
  modified:
    - src/cli/index.ts

key-decisions:
  - "Extended timeout uses Math.max(config.ai.timeoutMs, 600_000) to ensure 10min minimum for spec generation"
  - "readPackageSection extracted as standalone async function for clean separation"
  - "Debug output goes to stderr (console.error) to keep stdout clean for piping"
  - "Token estimation uses chars/4 heuristic (same as other parts of codebase)"

patterns-established:
  - "Auto-generate fallback: when prerequisite artifacts are missing, auto-invoke the producing command"

# Metrics
duration: 5min
completed: 2026-02-09
---

# Phase 10 Plan 03: Specify Command CLI Handler Summary

**specifyCommand handler wiring AGENTS.md collection, AI synthesis, and spec output with dry-run, force, multi-file, and auto-generate fallback**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-09T11:12:45Z
- **Completed:** 2026-02-09T11:17:31Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created specifyCommand() handler following established CLI command pattern from generate.ts
- Wired full pipeline: config loading, AGENTS.md collection, AI backend resolution, prompt building, AI call, spec writing, telemetry finalization
- Auto-generate fallback calls generateCommand() when no AGENTS.md files found
- Dry-run mode shows file count, estimated tokens, output path, mode, and context window warning
- Registered specify command in CLI entry point with --output, --force, --dry-run, --multi-file, --debug, --trace flags
- Updated help text with command listing, flag descriptions, and usage examples

## Task Commits

Each task was committed atomically:

1. **Task 1: Create specify command handler** - `94241ea` (feat)
2. **Task 2: Register specify command in CLI entry point** - `c5d2d3b` (feat)

## Files Created/Modified
- `src/cli/specify.ts` - CLI specify command handler with SpecifyOptions, specifyCommand(), readPackageSection()
- `src/cli/index.ts` - Added specify import, switch case, USAGE entries, and examples

## Decisions Made
- Used Math.max(config.ai.timeoutMs, 600_000) for minimum 10-minute timeout since spec generation processes entire project documentation and takes significantly longer than individual file analysis
- Extracted readPackageSection() as a standalone async function rather than inlining in specifyCommand, keeping the main function focused on orchestration flow
- Debug logging uses console.error (stderr) consistently, matching the pattern established in generate.ts
- Token estimation warning threshold at 150K tokens matches typical model context window limits

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed RunLog summary property name**
- **Found during:** Task 1 (specify command handler)
- **Issue:** Plan referenced `summary.totalLatencyMs` but the actual RunLog summary property is `totalDurationMs`
- **Fix:** Changed to `summary.totalDurationMs` to match the actual type definition in ai/telemetry
- **Files modified:** src/cli/specify.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** 94241ea (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor property name correction. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 10 is now complete: all three plans (collector, prompts/writer, CLI handler) are delivered
- The `are specify` command is fully functional end-to-end
- Ready for user testing with `are specify --dry-run` (safe, no AI calls) and `are specify` (full generation)

---
*Phase: 10-specify-command*
*Completed: 2026-02-09*

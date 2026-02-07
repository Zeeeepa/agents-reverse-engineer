---
phase: 07-orchestration-commands
plan: 02
subsystem: cli
tags: [generate-command, ai-execution, cli-flags, picocolors, backward-compatibility, dry-run]

# Dependency graph
requires:
  - phase: 07-01
    provides: CommandRunner with executeGenerate, AIService orchestrator, config schema with concurrency
  - phase: 06-03
    provides: AIService, resolveBackend, createBackendRegistry, AIServiceError, getInstallInstructions
provides:
  - Rewritten generate command that directly executes AI analysis via CommandRunner
  - CLI flags --concurrency, --fail-fast, --debug parsed and passed through
  - Dry-run mode showing file count, directories, root docs, estimated AI calls
  - Backward-compatible --execute and --stream (deprecated) JSON output paths
  - Exit code scheme: 0 success, 1 partial failure, 2 total failure / no CLI
affects: [07-03-update-command, 08-telemetry-and-cost]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Backend resolution before execution: resolveBackend + CLI_NOT_FOUND error handling with install instructions"
    - "Graduated exit codes: 0/1/2 for success/partial/total failure"
    - "Deprecation via stderr warning: deprecated flags still work but print notice"

key-files:
  created: []
  modified:
    - src/cli/generate.ts
    - src/cli/index.ts
    - src/cli/update.ts

key-decisions:
  - "Dry-run builds execution plan without backend resolution -- works without AI CLI installed"
  - "Deprecated flags (--execute, --stream) print notice to stderr, not stdout, to preserve JSON output"
  - "UpdateCommandOptions extended with concurrency/failFast/debug now (Plan 03 will use them)"

patterns-established:
  - "Generate command flow: discover -> plan -> resolve backend -> build execution plan -> CommandRunner.executeGenerate -> finalize telemetry"
  - "CLI flag parsing: value flags via values.get (concurrency, budget), boolean flags via flags.has (fail-fast, debug)"

# Metrics
duration: 2min
completed: 2026-02-07
---

# Phase 7 Plan 02: Generate Command Rewrite Summary

**Generate command rewritten to resolve AI CLI backend and execute concurrent analysis via CommandRunner, with --concurrency/--fail-fast/--debug flags and 0/1/2 exit codes**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-07T13:23:50Z
- **Completed:** 2026-02-07T13:26:25Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments
- Rewrote generate command default path from "output plan for host LLM" to "resolve backend + run AI analysis via CommandRunner"
- Added --concurrency, --fail-fast, --debug flags to CLI with proper parsing (value and boolean)
- Dry-run mode displays execution plan summary (file count, directories, root docs, estimated calls, file list) without requiring AI CLI
- Preserved backward compatibility for --execute and --stream with deprecation notice to stderr
- Exit code scheme: 0 all succeeded, 1 partial failure, 2 total failure or no CLI found

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite generate command to use AIService + CommandRunner** - `d83833b` (feat)
2. **Task 2: Add new CLI flags to cli/index.ts** - `43d8b18` (feat)

## Files Created/Modified
- `src/cli/generate.ts` - Rewrote default behavior from plan output to direct AI execution via CommandRunner
- `src/cli/index.ts` - Added --concurrency, --fail-fast, --debug flags; marked --execute/--stream as deprecated
- `src/cli/update.ts` - Extended UpdateCommandOptions with concurrency, failFast, debug fields (for Plan 03)

## Decisions Made
- **Dry-run before backend resolution:** The dry-run path builds the execution plan and displays the summary before any backend resolution happens, so --dry-run works even without an AI CLI installed. This is intentional for CI/CD preview workflows.
- **Deprecation to stderr:** The deprecation notice for --execute and --stream is printed to stderr so it does not corrupt JSON output on stdout for tools that may still consume it.
- **UpdateCommandOptions pre-extended:** Added concurrency/failFast/debug to the update command options interface now, even though Plan 03 will do the full update command rewrite. This avoids TypeScript errors when parsing the flags.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended UpdateCommandOptions with new fields**
- **Found during:** Task 2 (CLI flags)
- **Issue:** Parsing concurrency/failFast/debug for the update command case would cause TypeScript errors since UpdateCommandOptions lacked those fields
- **Fix:** Added concurrency, failFast, debug optional fields to UpdateCommandOptions interface in update.ts
- **Files modified:** src/cli/update.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** 43d8b18 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal -- added 3 optional fields to an interface. Required for type safety. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Generate command fully wired to AIService + CommandRunner pipeline
- CLI flags parsed and passed through for generate and update commands
- Plan 03 (update command rewrite) can reuse the same pattern: resolve backend, create AIService, use CommandRunner.executeUpdate
- UpdateCommandOptions already has concurrency/failFast/debug fields ready

---
*Phase: 07-orchestration-commands*
*Completed: 2026-02-07*

---
phase: 06-ai-service-foundation
plan: 01
subsystem: ai
tags: [child_process, execFile, subprocess, retry, exponential-backoff, typescript-types]

# Dependency graph
requires: []
provides:
  - AIBackend interface and all shared AI service types
  - Subprocess wrapper with timeout enforcement and stdin piping
  - Retry utility with exponential backoff and jitter
affects: [06-02, 06-03, 07-ai-powered-generation, 08-telemetry-and-cost]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Always-resolve subprocess wrapper (errors in result, not rejections)"
    - "Strategy pattern interface (AIBackend) for multi-CLI abstraction"
    - "Typed error classes with machine-readable codes (AIServiceError)"

key-files:
  created:
    - src/ai/types.ts
    - src/ai/subprocess.ts
    - src/ai/retry.ts
  modified: []

key-decisions:
  - "runSubprocess always resolves -- callers decide how to handle errors via SubprocessResult fields"
  - "AIServiceError uses string literal union codes for typed error branching"
  - "DEFAULT_RETRY_OPTIONS omits isRetryable/onRetry since those are caller-specific"

patterns-established:
  - "Always-resolve pattern: subprocess wrapper never rejects, errors captured in result struct"
  - "ESM .js extension imports maintained for all intra-ai-module references"
  - "JSDoc on every exported type and function with usage examples"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 6 Plan 01: AI Service Foundation Types and Primitives Summary

**Core AI service types (AIBackend, AIResponse, SubprocessResult), subprocess wrapper with timeout/stdin/SIGTERM, and retry utility with exponential backoff + jitter**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T11:55:22Z
- **Completed:** 2026-02-07T11:58:13Z
- **Tasks:** 3/3
- **Files created:** 3

## Accomplishments
- Defined all shared types for the AI service layer (8 exports from types.ts)
- Built subprocess wrapper that always resolves, enforces timeouts with SIGTERM, pipes stdin, and uses 10MB maxBuffer
- Built retry utility with exponential backoff (1s/2s/4s), jitter to prevent thundering herd, and configurable retryability predicate

## Task Commits

Each task was committed atomically:

1. **Task 1: Define AI service types** - `8358a96` (feat)
2. **Task 2: Build subprocess wrapper with timeout and cleanup** - `e434f4e` (feat)
3. **Task 3: Build retry utility with exponential backoff** - `c364323` (feat)

## Files Created/Modified
- `src/ai/types.ts` - All shared types: SubprocessResult, AICallOptions, AIResponse, AIBackend, RetryOptions, TelemetryEntry, RunLog, AIServiceError
- `src/ai/subprocess.ts` - Low-level subprocess spawn with execFile, timeout, stdin piping, zombie prevention
- `src/ai/retry.ts` - withRetry generic function with exponential backoff + jitter, DEFAULT_RETRY_OPTIONS constant

## Decisions Made
- **runSubprocess always resolves:** Errors are captured in SubprocessResult fields (exitCode, timedOut, stderr) rather than throwing. Callers decide how to handle failures. This matches the research recommendation and keeps error handling explicit.
- **AIServiceError with typed codes:** Used a string literal union type (`AIServiceErrorCode`) for machine-readable error branching instead of numeric error codes. Easier to read and less error-prone.
- **DEFAULT_RETRY_OPTIONS partial:** Exports timing defaults without `isRetryable` or `onRetry` since those are always caller-specific. Users spread the defaults and add their predicates.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All foundational types are exported and ready for import by backend adapters (Plan 02)
- Subprocess wrapper ready to be called by backend adapters for CLI invocation
- Retry utility ready to wrap AI service calls in the orchestrator (Plan 03)
- Zero new dependencies added -- continues the project's minimal-dependency pattern

---
*Phase: 06-ai-service-foundation*
*Completed: 2026-02-07*

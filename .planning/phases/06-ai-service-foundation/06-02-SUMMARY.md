---
phase: 06-ai-service-foundation
plan: 02
subsystem: ai
tags: [strategy-pattern, backend-adapter, zod, cli-detection, path-resolution, registry]

# Dependency graph
requires:
  - phase: 06-01
    provides: AIBackend interface, AICallOptions, AIResponse, AIServiceError types
provides:
  - Full Claude CLI backend adapter with Zod-validated JSON response parsing
  - Gemini and OpenCode backend stubs demonstrating extension pattern
  - Backend registry with auto-detection priority (Claude > Gemini > OpenCode)
  - resolveBackend for auto or explicit backend selection
  - isCommandOnPath cross-platform PATH detection utility
affects: [06-03, 07-ai-powered-generation, 08-telemetry-and-cost]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Strategy pattern: AIBackend interface with Claude/Gemini/OpenCode implementations"
    - "Registry + factory pattern for backend lifecycle and selection"
    - "Defensive JSON parsing (find first '{' in stdout)"

key-files:
  created:
    - src/ai/backends/claude.ts
    - src/ai/backends/gemini.ts
    - src/ai/backends/opencode.ts
    - src/ai/registry.ts
  modified: []

key-decisions:
  - "isCommandOnPath exported from claude.ts for reuse by stub backends"
  - "AIServiceError constructor parameter order is (code, message) matching types.ts"
  - "Stub backends throw SUBPROCESS_ERROR code, not a custom NOT_IMPLEMENTED code"

patterns-established:
  - "Backend stubs throw AIServiceError on parseResponse to signal unimplemented"
  - "Registry insertion order determines auto-detection priority"
  - "resolveBackend is the single entry point for backend selection (auto or explicit)"

# Metrics
duration: 2min
completed: 2026-02-07
---

# Phase 6 Plan 02: Backend Adapters and Registry Summary

**Claude backend adapter with Zod response parsing, Gemini/OpenCode stubs, and registry with auto-detection in priority order**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-07T12:00:42Z
- **Completed:** 2026-02-07T12:03:00Z
- **Tasks:** 3/3
- **Files created:** 4

## Accomplishments
- Built full Claude CLI backend adapter with Zod schema validated against Claude CLI v2.1.31 JSON output
- Created Gemini and OpenCode backend stubs that implement AIBackend but throw clear "not implemented" errors
- Built backend registry with factory, auto-detection, explicit resolution, and actionable install instructions
- Cross-platform PATH detection utility handling PATHEXT on Windows

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement Claude backend adapter** - `16b4774` (feat)
2. **Task 2: Create Gemini and OpenCode backend stubs** - `260d58a` (feat)
3. **Task 3: Build backend registry with auto-detection** - `b739294` (feat)

## Files Created/Modified
- `src/ai/backends/claude.ts` - Full Claude CLI adapter: Zod schema, buildArgs, parseResponse, isCommandOnPath utility
- `src/ai/backends/gemini.ts` - Gemini CLI stub implementing AIBackend with not-implemented parseResponse
- `src/ai/backends/opencode.ts` - OpenCode CLI stub implementing AIBackend with not-implemented parseResponse
- `src/ai/registry.ts` - BackendRegistry class, createBackendRegistry factory, detectBackend, resolveBackend, getInstallInstructions

## Decisions Made
- **isCommandOnPath exported from claude.ts:** Rather than creating a separate utility module, the PATH detection function is exported from the Claude backend (which implements it first) and reused by Gemini/OpenCode stubs. Simple and avoids premature abstraction.
- **Stub backends throw SUBPROCESS_ERROR code:** Used existing AIServiceErrorCode rather than adding a new 'NOT_IMPLEMENTED' code. The error message clearly indicates the backend is not yet implemented.
- **resolveBackend as single entry point:** All backend selection goes through resolveBackend which handles both 'auto' detection and explicit name requests, providing consistent error handling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AIServiceError constructor parameter order in stub descriptions**
- **Found during:** Task 2 (Gemini/OpenCode stubs)
- **Issue:** Plan specified `new AIServiceError('message', 'SUBPROCESS_ERROR')` but the actual constructor in types.ts is `new AIServiceError(code, message)`
- **Fix:** Used correct parameter order: `new AIServiceError('SUBPROCESS_ERROR', 'message')`
- **Files modified:** src/ai/backends/gemini.ts, src/ai/backends/opencode.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** `260d58a` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Constructor parameter order fix necessary for correctness. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All backend adapters are ready for the AI service orchestrator (Plan 03)
- Registry provides the backend selection that the service layer needs
- isCommandOnPath and resolveBackend handle all CLI detection scenarios
- Zero new dependencies added -- continues minimal-dependency pattern

---
*Phase: 06-ai-service-foundation*
*Completed: 2026-02-07*

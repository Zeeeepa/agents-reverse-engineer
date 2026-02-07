# Phase 6: AI Service Foundation - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>

## Phase Boundary

A working AI service layer that can spawn CLI subprocesses, capture structured responses, and log per-call telemetry. This phase delivers the backend abstraction, Claude adapter, subprocess management, retry logic, and telemetry logging. It does NOT wire into generate/update commands (Phase 7) or add inconsistency detection (Phase 9).

</domain>

<decisions>

## Implementation Decisions

### Backend scope
- Build the multi-backend abstraction interface (AIBackend, registry, factory) with Claude as the first full implementation
- Include Gemini and OpenCode backends as stubs (throw "not implemented") to demonstrate the extension pattern
- Auto-detect which CLI is available on PATH when no `--backend` flag is passed (priority order: Claude > Gemini > OpenCode)
- When no AI CLI is found, show install instructions for each supported CLI (npm install commands, URLs)

### Failure & retry behavior
- Default to continue-on-failure: process all files, collect failures, show failure summary at end
- Provide `--fail-fast` flag to stop immediately on first permanent failure
- Retry visibility controlled by verbosity: silent by default, "Retrying file X (attempt 2/3)..." shown with `--verbose` / `-v`
- Default 3 retries with exponential backoff, configurable via config or `--retries` flag
- Directory summaries generate with available data when some child files failed (note which files were missing in the summary)

### Telemetry depth
- Log full prompts and responses per call (complete replay capability for debugging)
- One pretty-printed JSON file per run (all calls in an array, with run-level summary)
- Telemetry is for debugging, not regular review: log file path shown only with `--verbose`
- Auto-cleanup: keep N most recent run files, delete older ones

### Cost visibility
- No per-call budget cap (trust the model)
- No per-run budget cap (no abort on cost threshold)
- End-of-run summary always shows total tokens (in/out) and estimated cost
- Running cost total visible during execution with `--verbose`
- Default model: Sonnet (claude-sonnet-4-5-20250929), configurable via `--model` flag or config

### Claude's Discretion
- Exact exponential backoff timing (suggested: 1s, 2s, 4s)
- Telemetry file naming convention
- How many recent telemetry files to keep (N value for auto-cleanup)
- Subprocess timeout value (suggested: 120s)
- How to pass prompts to CLI (stdin vs args)

</decisions>

<specifics>

## Specific Ideas

- Auto-detection should feel seamless: user just runs the command, tool finds the right backend
- Error messages when CLI is missing should be actionable, not generic
- Telemetry should capture everything needed to debug a failed run without re-running it

</specifics>

<deferred>

## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 06-ai-service-foundation*
*Context gathered: 2026-02-07*

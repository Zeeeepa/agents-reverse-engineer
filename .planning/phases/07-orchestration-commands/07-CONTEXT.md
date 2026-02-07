# Phase 7: Orchestration & Commands - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the AI service (Phase 6) into the generate, update, and discover commands so the tool directly orchestrates AI analysis via CLI subprocesses. Commands process files concurrently with visible progress and produce .sum files and AGENTS.md output without requiring a host AI tool.

</domain>

<decisions>
## Implementation Decisions

### Progress & output
- Streaming log style: each file gets a line when it starts and finishes (scrolling build-log output)
- Verbose by default: file path, status, timing, tokens, model per line
- `--quiet` flag suppresses per-file output, only shows final summary
- Multi-line end-of-run summary: files processed, tokens in/out, time, errors, retries

### Concurrency model
- Default parallelism: 5 concurrent files
- Configurable via config file (persistent default) and `--concurrency` CLI flag (per-run override)
- On file failure: continue processing other files by default; `--fail-fast` flag to stop on first error
- Processing order: discovery order (as the file walker finds them)

### Command behavior
- AI is required: `are generate` always uses AI, fails if no AI CLI found (no fallback to v1.0 templates)
- `--dry-run` flag: lists files that would be processed and estimated call count without executing
- Change detection for `are update`: git diff + file timestamps + content hash (all three)
- AI prompts hidden by default; `--debug` flag shows exact prompts sent to the AI CLI

### Error & partial results
- On per-file AI failure (after retries): skip the file, keep existing .sum unchanged, log the failure
- No retry manifest: user re-runs the full command; update mode handles re-processing naturally
- Exit code: non-zero on partial failure (so CI pipelines catch it)
- Backend unreachable: retry with backoff before giving up (leverages Phase 6 retry infrastructure)

### Claude's Discretion
- Exact streaming log format and symbols
- How --dry-run estimates call count
- Internal prompt engineering for AI calls
- Specific non-zero exit code value for partial failures

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-orchestration-commands*
*Context gathered: 2026-02-07*

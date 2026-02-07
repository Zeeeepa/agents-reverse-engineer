# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-07)

**Core value:** Documentation that stays fresh automatically via git-diff-based updates
**Current focus:** v2.0 Phase 8 in progress -- telemetry wiring complete

## Current Position

Phase: 8 of 9 (Full Telemetry)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-07 -- Completed 08-02-PLAN.md (telemetry wiring)

Progress: [████████████████░░░░░░░░] 67% (v2.0 -- 8/12 plans)

**Next:** Plan 08-03 (dashboard display)

## Performance Metrics

**v1.0 Milestone:**
- Total plans completed: 26
- Total execution time: 89 min
- Average duration: 3 min per plan
- Timeline: 8 days (2026-01-25 -> 2026-02-02)

**By Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation & Discovery | 5/5 | 15 min | 3 min |
| 2. Documentation Generation | 6/6 | 21 min | 4 min |
| 3. Incremental Updates | 5/5 | 11 min | 2 min |
| 4. Integration & Commands | 5/5 | 16 min | 3 min |
| 5. Installation Workflow | 5/5 | 26 min | 5 min |

**v2.0 Progress:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 6. AI Service Foundation | 3/3 | 8 min | 3 min |
| 7. Orchestration & Commands | 3/3 | 8 min | 3 min |
| 8. Full Telemetry | 2/3 | 7 min | 4 min |

## Accumulated Context

### Decisions

Key decisions are logged in PROJECT.md Key Decisions table.
v1.0 decisions archived in milestones/v1.0-ROADMAP.md.

v2.0 decisions:
- Tool drives LLM via CLI subprocess (full control over orchestration, telemetry, error handling)
- JSON log files for telemetry (human-readable, one file per run)
- runSubprocess always resolves -- callers decide how to handle errors via SubprocessResult fields
- AIServiceError uses string literal union codes for typed error branching
- DEFAULT_RETRY_OPTIONS omits isRetryable/onRetry since those are caller-specific
- isCommandOnPath exported from claude.ts for reuse by stub backends (avoids premature utility module)
- resolveBackend is the single entry point for all backend selection (auto and explicit)
- Rate-limit detection uses case-insensitive stderr substring matching (rate limit, 429, too many requests, overloaded)
- Telemetry records both successful and failed calls (error entries have zero tokens but actual latency)
- Config ai section uses nested .default({}) for full backward compatibility
- runPool returns sparse results array indexed by task position for easy correlation
- ProgressReporter ETA uses sliding window of 10 recent completions (not global average)
- executeUpdate runs only file analysis phase -- directory AGENTS.md regeneration is caller responsibility
- extractPurpose takes first non-header non-empty line from AI response, truncated to 120 chars
- Dry-run builds execution plan without backend resolution (works without AI CLI installed)
- Deprecated CLI flags (--execute, --stream) print notice to stderr to preserve JSON output on stdout
- Update command delegates to CommandRunner.executeUpdate (not inline pool logic)
- AGENTS.md regeneration after executeUpdate uses separate ProgressReporter for directory events
- Discover command returns normally (no process.exit(0)) for consistency and testability
- Prefix matching in lookupPricing sorts keys longest-first to avoid ambiguity between model ID prefixes
- Config pricing overrides spread over defaults before lookup so overrides always win
- formatTokens uses parseFloat to strip trailing zeros (1.0M becomes 1M)
- thinking field defaults to "not supported" until backends provide it
- filesRead attached post-call via setFilesReadOnLastEntry (caller knows context, not AIService)
- Root document tasks leave filesRead empty (aggregated content, no single source file)
- costAvailable is true if any entry has costSource !== "unavailable" (any-match semantics)
- pricingOverrides and costThresholdUsd optional on AIServiceOptions for backward compatibility

### Pending Todos

- **OpenCode plugin development**: Create `.opencode/plugin/` based hook for SessionEnd (deferred from v1.0, not in v2.0 scope)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-07
Stopped at: Completed 08-02-PLAN.md (telemetry wiring)
Resume file: None

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-07)

**Core value:** Documentation that stays fresh automatically via git-diff-based updates
**Current focus:** v3.0 Specification Generation -- Phase 10 added

## Current Position

Phase: 10 of 10 (Specify Command)
Plan: 1 of 3
Status: In progress
Last activity: 2026-02-09 -- Completed 10-01-PLAN.md

Progress: [████████░░░░░░░░░░░░░░░░] 33% (v3.0 -- 1/3 plans)

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
| 8. Full Telemetry | 3/3 | 9 min | 3 min |
| 9. Quality Improvements | 3/3 | 8 min | 3 min |

**v2.0 Totals:**
- Plans completed: 12
- Total execution time: 33 min
- Average duration: 3 min per plan

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
- costThresholdUsd on CommandRunOptions (display-layer concern) passed through to printSummary
- Unknown model warning uses console.error (stderr) and warnedModels Set for once-per-model dedup
- DEFAULT_MODEL_PRICING exported from AI barrel for consumer access to pricing table
- Line-anchored regex (^[ \t]*export) to skip commented-out exports without AST parsing
- missingFromCode uses partial match (iface.includes(exportName)) since publicInterface contains signatures
- Single-pass density prompt adaptation (not multi-pass Chain of Density) for cost efficiency
- Contents section links files without descriptions -- full description lives in .sum only
- Findability validator uses case-sensitive string.includes for symbol matching
- checkCodeVsCode operates on caller-scoped file groups to avoid cross-module false positives
- formatReportForCli uses plain text only (no picocolors) keeping the reporter pure and testable
- Inconsistency report prints to stderr to not interfere with JSON output on stdout
- Old .sum cache reads happen before Phase 1 pool processing to capture pre-overwrite state

v3.0 decisions:
- collectAgentsDocs returns Array<{ relativePath, content }> (pre-read content) so callers skip manual readFile loops
- SKIP_DIRS in collector.ts is module-private (not exported) to keep API surface minimal

### Pending Todos

- **OpenCode plugin development**: Create `.opencode/plugin/` based hook for SessionEnd (deferred from v1.0, not in v2.0 scope)
- **Thinking content support**: Raise issue in AI assistant repository requesting thinking/reasoning content in `--output-format json` output. Infrastructure is ready in telemetry layer (TelemetryEntry.thinking field); just needs backend wiring when CLI adds support.

### Roadmap Evolution

- Phase 10 added (2026-02-09): Specify Command -- produce specification artifacts from AGENTS.md for project reconstruction

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-09
Stopped at: Completed 10-01-PLAN.md (shared AGENTS.md collector)
Resume file: None

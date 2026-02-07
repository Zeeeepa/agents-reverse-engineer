# Phase 8: Full Telemetry - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete observability for every AI call -- capture thinking content, files read, and estimated cost. Extends the existing telemetry log entries (from Phase 6) with three new dimensions. Does not change command behavior or orchestration (Phase 7 scope).

</domain>

<decisions>
## Implementation Decisions

### Cost estimation & display
- Cost shown per-call in log entries AND as a total in the run summary
- Summary format: USD with token breakdown (e.g., "$0.1234 (42K in / 8K out)")
- 4-decimal precision for all cost values ($0.1234)
- Configurable cost threshold in config -- tool warns when estimated cost exceeds the limit
- Per-call log entries include their individual estimated cost

### Thinking content capture
- Capture full verbatim thinking/reasoning output -- no truncation
- Stored in a dedicated top-level field in the JSON log entry (same file, separate field for easy filtering)
- Never shown in terminal output -- thinking is log-only
- When the AI backend doesn't support thinking output, field contains an explicit marker value (e.g., "not supported") rather than null/absent

### Files-read tracking
- Track files from both sources: files we sent to the AI as context + any files the AI reports reading
- Record file paths + byte sizes per entry
- Paths are relative to project root (matches git paths)
- Run summary includes files-read count with unique dedup: "23 files read (18 unique)"

### Pricing data management
- Default pricing hardcoded in source, with user override via config file (for custom/private models)
- Ship with pricing for all major models out of the box: Claude, Gemini, GPT-4, etc.
- Separate input and output token rates (input_cost_per_1k, output_cost_per_1k) -- matches how providers charge
- Unknown models: log a warning that pricing is unavailable, show N/A for cost fields

### Claude's Discretion
- Exact config schema for cost threshold and pricing overrides
- How to parse thinking content from different AI CLI output formats
- Which specific model IDs to include in the hardcoded pricing table
- Warning message format for cost threshold and unknown models

</decisions>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 08-full-telemetry*
*Context gathered: 2026-02-07*

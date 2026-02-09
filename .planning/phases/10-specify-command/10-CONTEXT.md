# Phase 10: Specify Command - Context

**Gathered:** 2026-02-09
**Status:** Ready for planning

<domain>
## Phase Boundary

An `are specify` command that reads the generated AGENTS.md hierarchy and produces specification document(s) containing enough architectural, structural, and behavioral detail to reconstruct the project from scratch. The spec is AI-synthesized from existing documentation, not mechanically assembled.

</domain>

<decisions>
## Implementation Decisions

### Output structure
- Single document by default, multi-file output available via flag
- Output to `specs/` directory by default, `--output` flag to override location
- Warn before overwriting existing specs; require `--force` to proceed
- Conceptual grouping for sections (by concern: architecture, data flow, APIs, config) — not mirroring folder structure

### Reconstruction depth
- Full behavioral spec: enough to reproduce exact APIs, function signatures, error handling, and behavioral contracts
- Full implementation detail: patterns, algorithms, data structures — everything needed to write equivalent code
- Dependencies listed with version and rationale for each
- Full config schema with types, defaults, and validation rules documented

### Invocation & scope
- Whole project only — always reads the full AGENTS.md hierarchy
- AI-driven synthesis: AI reads all AGENTS.md/.sum content and produces a coherent, structured specification
- `--dry-run` flag: shows input files and estimated cost without calling AI
- Auto-generates AGENTS.md if missing (runs `are generate` first automatically)

### Spec content & tone
- Primary audience: AI agents (LLMs) — structured, precise, instruction-oriented language
- Includes phased build plan: recommended implementation sequence so an AI can build incrementally
- Includes test contracts: what each module's tests should verify (scenarios, edge cases, expected behaviors)
- Module boundaries described (interfaces and connections) but exact filenames not prescribed — rebuilder has freedom on file organization

### Claude's Discretion
- Exact section layout within conceptual grouping
- How to chunk AGENTS.md content for AI synthesis (single pass vs multi-pass)
- Prompt engineering for spec generation
- How multi-file mode splits content across files

</decisions>

<specifics>
## Specific Ideas

- The spec should be a "recipe" — an AI agent reads it and can rebuild the project without seeing the original code
- Build order is part of the spec: "create this first, then wire it into..."
- Module boundaries over file boundaries: describe what exists and how it connects, not exact filenames

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-specify-command*
*Context gathered: 2026-02-09*

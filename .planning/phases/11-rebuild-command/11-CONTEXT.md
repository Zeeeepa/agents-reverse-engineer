# Phase 11: Rebuild Command - Context

**Gathered:** 2026-02-09
**Status:** Ready for planning

<domain>
## Phase Boundary

An `are rebuild` command that reads specification files from `specs/` and reconstructs the project into an output folder, with checkpoint-based progress tracking enabling multi-session execution. This phase delivers the reconstruction pipeline only — spec generation is Phase 10, quality validation of rebuilt output is out of scope.

</domain>

<decisions>
## Implementation Decisions

### Rebuild scope & ordering
- Full project rebuild: source code + config files (package.json, tsconfig, build config) + dependency declarations — everything needed to `npm install && npm run build`
- Spec-driven ordering: process spec files in their natural order, each spec section becomes a rebuild unit
- Full rebuild only — no selective/subset mode (no --file or --section flags)
- One module/directory per AI call: each subprocess generates all files for a directory/module

### Session continuity
- Auto-detect resume: `are rebuild` checks for existing checkpoint file and auto-resumes where it left off, no explicit --resume flag needed
- Spec drift invalidates checkpoint: if spec files changed since last checkpoint, discard checkpoint and start fresh automatically
- Checkpoint lives inside `rebuild/` (e.g., `rebuild/.rebuild-checkpoint`) — deleting `rebuild/` clears all state
- `--force` flag wipes `rebuild/` and starts from scratch

### Output expectations
- Functionally equivalent: same behavior and capabilities as original but structure may differ — AI interprets the spec freely
- Must compile: the rebuilt project should at minimum compile/build without errors
- Production code only — no test files generated. Tests are a separate concern
- Configurable output directory: default `rebuild/` but `--output <dir>` flag for custom location

### Progress & control
- Module-level progress: show which module is being rebuilt, X of Y complete, ETA — same pattern as `are generate`
- Concurrent execution: use the same worker pool pattern as `are generate` with configurable concurrency
- Default: skip failed modules and continue (log failure, checkpoint as failed, user retries later). `--fail-fast` flag stops on first failure
- `--dry-run` mode: show the rebuild plan (modules, order, estimated calls) without executing AI calls

### Claude's Discretion
- Checkpoint file format and structure
- How spec content is partitioned into per-module prompts
- Prompt engineering for reconstruction (system prompt, context assembly)
- How "must compile" is validated (build step after rebuild, or trust AI output)
- Exact spec drift detection mechanism (hash comparison, timestamp, etc.)
- File writing order within a module
- How already-rebuilt modules provide context to subsequent modules

</decisions>

<specifics>
## Specific Ideas

- Reuse existing `are generate` patterns: worker pool from `src/orchestration/pool.ts`, progress reporter, trace emission, telemetry logging
- The `--dry-run`, `--fail-fast`, `--trace`, `--concurrency`, `--debug` flags should work the same as in other ARE commands
- Progress log at `.agents-reverse-engineer/progress.log` for monitoring via `tail -f`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-rebuild-command*
*Context gathered: 2026-02-09*

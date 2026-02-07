# Roadmap: Agents Reverse

## Milestones

- [x] **v1.0 MVP** - Phases 1-5 (shipped 2026-02-02)
- [ ] **v2.0 AI Service & Quality** - Phases 6-9 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-5) - SHIPPED 2026-02-02</summary>

### Phase 1: Foundation & Discovery
**Goal**: File discovery system with exclusion patterns
**Plans**: 5/5 complete

### Phase 2: Documentation Generation
**Goal**: Generate .sum files and AGENTS.md hierarchy
**Plans**: 6/6 complete

### Phase 3: Incremental Updates
**Goal**: Git diff-based change detection and selective regeneration
**Plans**: 5/5 complete

### Phase 4: Integration & Commands
**Goal**: Multi-runtime commands and session hooks
**Plans**: 5/5 complete

### Phase 5: Installation Workflow
**Goal**: Interactive npx installer with runtime selection
**Plans**: 5/5 complete

</details>

## v2.0 AI Service & Quality

**Milestone Goal:** The tool directly orchestrates AI analysis via CLI subprocesses, with full telemetry and improved output quality.

**Phase Numbering:**
- Integer phases (6, 7, 8, 9): Planned milestone work
- Decimal phases (7.1, 7.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 6: AI Service Foundation** - Subprocess layer that spawns AI CLIs, captures responses, and logs telemetry
- [x] **Phase 7: Orchestration & Commands** - Wire AI service into generate/update/discover commands with concurrency and progress
- [x] **Phase 8: Full Telemetry** - Complete observability with thinking capture, file tracking, and cost estimation
- [ ] **Phase 9: Quality Improvements** - Inconsistency detection and higher-density documentation output

## Phase Details

### Phase 6: AI Service Foundation
**Goal**: A working AI service layer that can spawn CLI subprocesses, capture structured responses, and log per-call telemetry
**Depends on**: v1.0 complete (Phase 5)
**Requirements**: AISVC-01, AISVC-02, AISVC-03, AISVC-05, AISVC-06, TELEM-01, TELEM-06
**Success Criteria** (what must be TRUE):
  1. Running `claude -p --output-format json "summarize this file"` via the AI service returns parsed structured output (response text, token counts, model)
  2. When Claude CLI is not installed, the tool detects this and reports a clear error instead of crashing
  3. When a subprocess hangs beyond timeout, the tool kills it cleanly with no zombie processes left behind
  4. When a transient failure occurs (rate limit, timeout), the tool retries automatically with backoff and succeeds on retry
  5. Each AI call produces a JSON log entry in `.agents-reverse/logs/` containing prompt, response, tokens, latency, and exit code
**Plans**: 3/3 complete

Plans:
- [x] 06-01-PLAN.md -- Types, subprocess wrapper, and retry utility (Wave 1)
- [x] 06-02-PLAN.md -- Claude backend, Gemini/OpenCode stubs, registry + auto-detection (Wave 2)
- [x] 06-03-PLAN.md -- Telemetry subsystem, AIService orchestrator, config extension, barrel export (Wave 3)

### Phase 7: Orchestration & Commands
**Goal**: The generate, update, and discover commands use the AI service to execute analysis directly, with concurrent processing and visible progress
**Depends on**: Phase 6
**Requirements**: AISVC-04, CMD-01, CMD-02, CMD-03, CMD-04, TELEM-04
**Success Criteria** (what must be TRUE):
  1. Running `are generate` on a project spawns AI CLI subprocesses and produces .sum files and AGENTS.md output without requiring a host AI tool to execute plans
  2. Running `are update` on a project with changed files analyzes only the changed files via the AI service and updates their documentation
  3. Multiple files are processed concurrently (observable via interleaved progress output), respecting a configurable parallelism limit
  4. During execution, the terminal shows progress: current file name, X of Y complete, and estimated time remaining
  5. After a run completes, a summary line shows total calls, total tokens (in/out), total time, and error count
**Plans**: 3/3 complete

Plans:
- [x] 07-01-PLAN.md -- Orchestration engine: concurrency pool, progress reporter, command runner, config extension (Wave 1)
- [x] 07-02-PLAN.md -- Generate command rewrite + CLI flags (Wave 2)
- [x] 07-03-PLAN.md -- Update command rewrite + discover cleanup (Wave 3)

### Phase 8: Full Telemetry
**Goal**: Complete observability -- every AI call captures thinking content, files read, and estimated cost
**Depends on**: Phase 7
**Requirements**: TELEM-02, TELEM-03, TELEM-05
**Success Criteria** (what must be TRUE):
  1. When the AI CLI returns reasoning/thinking content, it appears in the telemetry log entry for that call
  2. Files read by the AI during a call are tracked and recorded in the telemetry log entry
  3. After a run completes, the summary includes estimated cost in USD based on model and token counts
**Plans**: 3/3 complete

Plans:
- [x] 08-01-PLAN.md -- Cost estimation engine with pricing table and tests (TDD, Wave 1)
- [x] 08-02-PLAN.md -- Type extensions, telemetry wiring, config schema (Wave 2)
- [x] 08-03-PLAN.md -- Summary display, barrel export, cost threshold warnings (Wave 3)

### Phase 9: Quality Improvements
**Goal**: The tool detects inconsistencies during analysis and produces higher-density, more useful documentation
**Depends on**: Phase 7 (can run parallel with Phase 8)
**Requirements**: INCON-01, INCON-02, INCON-03, DENSE-01, DENSE-02, DENSE-03, DENSE-04
**Success Criteria** (what must be TRUE):
  1. When existing .sum content contradicts current code semantics, the tool flags it as a code-vs-doc inconsistency with file location and description
  2. When conflicting patterns or duplicated logic exist across files, the tool flags code-vs-code inconsistencies
  3. After a run with detected inconsistencies, a structured report lists all flagged issues
  4. Generated .sum files are measurably more information-dense -- key function names, class names, and concepts are preserved while filler text is eliminated
  5. Parent AGENTS.md files do not repeat information already present in child summaries -- each level adds unique value
**Plans**: 3 plans

Plans:
- [ ] 09-01-PLAN.md -- Quality types and code-vs-doc inconsistency detection (TDD, Wave 1)
- [ ] 09-02-PLAN.md -- Density-aware prompts, hierarchical dedup, findability validator (Wave 1)
- [ ] 09-03-PLAN.md -- Code-vs-code detection, report builder, CLI pipeline wiring (Wave 2)

## Progress

**Execution Order:**
Phases execute in numeric order: 6 -> 7 -> 8 -> 9
Phase 9 can start after Phase 7 completes (independent of Phase 8).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-5 | v1.0 | 26/26 | Complete | 2026-02-02 |
| 6. AI Service Foundation | v2.0 | 3/3 | Complete | 2026-02-07 |
| 7. Orchestration & Commands | v2.0 | 3/3 | Complete | 2026-02-07 |
| 8. Full Telemetry | v2.0 | 3/3 | Complete | 2026-02-07 |
| 9. Quality Improvements | v2.0 | 0/3 | Not started | - |

---
*Roadmap created: 2026-02-07*
*Last updated: 2026-02-07 (Phase 9 planned)*

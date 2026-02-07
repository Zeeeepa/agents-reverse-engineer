# Requirements: Agents Reverse v2.0

**Defined:** 2026-02-07
**Core Value:** Documentation that stays fresh automatically -- now with tool-driven orchestration and full observability

## v2.0 Requirements

Requirements for the AI Service & Quality milestone. Each maps to roadmap phases.

### AI Service

- [x] **AISVC-01**: Tool spawns AI CLI (claude) as subprocess with prompt via stdin and captures JSON response from stdout
- [x] **AISVC-02**: Backend interface abstracts CLI differences -- implementations for Claude (primary), Gemini (experimental), OpenCode (experimental)
- [x] **AISVC-03**: Subprocess lifecycle management -- timeout, graceful kill, zombie prevention, exit code handling
- [ ] **AISVC-04**: Concurrent execution of multiple AI calls with configurable parallelism limit
- [x] **AISVC-05**: Automatic retry with exponential backoff on transient failures (rate limits, timeouts)
- [x] **AISVC-06**: Runtime detection -- auto-detect which AI CLIs are available on the system

### Telemetry

- [x] **TELEM-01**: Per-call JSON log entry capturing: prompt sent, response received, model used, input/output tokens, latency, exit code
- [ ] **TELEM-02**: Thinking/reasoning content captured when available from CLI output
- [ ] **TELEM-03**: Files read by the AI tracked per call (from CLI output metadata)
- [ ] **TELEM-04**: Per-run summary log: total calls, total tokens (in/out), total time, error count, files processed
- [ ] **TELEM-05**: Cost estimation per run based on model and token counts
- [x] **TELEM-06**: JSON log files stored per run in `.agents-reverse/logs/` with timestamped filenames

### Command Refactors

- [ ] **CMD-01**: Generate command uses AI service to execute analysis tasks directly (replaces JSON plan output)
- [ ] **CMD-02**: Update command uses AI service for incremental analysis of changed files
- [ ] **CMD-03**: Discover command tree processing improvements (restructured for AI service pipeline)
- [ ] **CMD-04**: Progress reporting during execution -- current file, X of Y complete, estimated time remaining

### Inconsistency Detection

- [ ] **INCON-01**: Detect code-vs-doc inconsistencies -- flag when existing .sum content doesn't match current code semantics
- [ ] **INCON-02**: Detect code-vs-code inconsistencies -- flag conflicting patterns, duplicated logic, or contradictory implementations across files
- [ ] **INCON-03**: Inconsistency report output -- structured summary of flagged issues with file locations and descriptions

### Context Density

- [ ] **DENSE-01**: Revised prompts producing higher information density in .sum files -- more compressed, less filler
- [ ] **DENSE-02**: Anchor term preservation -- key function names, class names, and concepts survive all summarization levels
- [ ] **DENSE-03**: Hierarchical deduplication -- parent AGENTS.md doesn't repeat information already in child summaries
- [ ] **DENSE-04**: Information-dense AGENTS.md format validated against "can an AI find the right file?" test

## Future Requirements

Deferred to later milestones.

### Multi-Assistant Output

- **MULTI-01**: Generate Cursor `.cursor/rules/*.mdc` context files
- **MULTI-02**: Generate GitHub Copilot `copilot-instructions.md`
- **MULTI-03**: Generate Aider `CONVENTIONS.md`

### Advanced Analysis

- **AST-01**: AST-based code structure extraction
- **XREF-01**: Cross-reference detection between files
- **DEP-01**: Dependency graph visualization

### Multi-Language Support

- **LANG-01**: Support package manifests beyond package.json (pyproject.toml, go.mod, Cargo.toml, etc.)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Direct LLM API calls (HTTP to Anthropic/Google APIs) | Uses CLI tools which handle auth and API access |
| Web dashboard for telemetry | CLI-only tool; JSON logs can be consumed by external tools |
| Real-time file watching | Git-diff-based is sufficient |
| Auto-commit generated docs | User controls git commits |
| GUI or web interface | CLI-only for v2 |
| OpenCode plugin/hook system (#8) | Deferred -- OpenCode plugin architecture needs separate research |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AISVC-01 | Phase 6 | Complete |
| AISVC-02 | Phase 6 | Complete |
| AISVC-03 | Phase 6 | Complete |
| AISVC-04 | Phase 7 | Pending |
| AISVC-05 | Phase 6 | Complete |
| AISVC-06 | Phase 6 | Complete |
| TELEM-01 | Phase 6 | Complete |
| TELEM-02 | Phase 8 | Pending |
| TELEM-03 | Phase 8 | Pending |
| TELEM-04 | Phase 7 | Pending |
| TELEM-05 | Phase 8 | Pending |
| TELEM-06 | Phase 6 | Complete |
| CMD-01 | Phase 7 | Pending |
| CMD-02 | Phase 7 | Pending |
| CMD-03 | Phase 7 | Pending |
| CMD-04 | Phase 7 | Pending |
| INCON-01 | Phase 9 | Pending |
| INCON-02 | Phase 9 | Pending |
| INCON-03 | Phase 9 | Pending |
| DENSE-01 | Phase 9 | Pending |
| DENSE-02 | Phase 9 | Pending |
| DENSE-03 | Phase 9 | Pending |
| DENSE-04 | Phase 9 | Pending |

**Coverage:**
- v2.0 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-02-07*
*Last updated: 2026-02-07 (Phase 6 complete)*

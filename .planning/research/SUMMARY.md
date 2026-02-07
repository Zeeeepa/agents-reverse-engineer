# Project Research Summary

**Project:** agents-reverse-engineer v2.0
**Domain:** AI CLI subprocess orchestration, telemetry, inconsistency detection, context density optimization
**Researched:** 2026-02-07
**Confidence:** HIGH (codebase analysis, Claude CLI verified) / MEDIUM (architecture patterns) / LOW (Gemini/OpenCode CLI details)

## Executive Summary

The v2.0 milestone transforms agents-reverse-engineer from a plan generator into a direct orchestrator. Currently, the tool outputs execution plans that host AI tools (Claude Code, OpenCode, Gemini CLI) execute. v2.0 inverts this: ARE spawns AI CLIs as subprocesses, captures their output, logs comprehensive telemetry, detects inconsistencies, and optimizes for information-dense documentation.

The research reveals a clear path forward: **build a subprocess adapter layer using zero new dependencies**. Node.js `child_process.spawn()` provides everything needed. Claude CLI has mature non-interactive support with `--print --output-format json` flags (verified locally). The existing `ExecutionPlan` interface already contains everything needed (prompts, dependencies, output paths) — the AI service layer simply consumes this plan by spawning CLI processes instead of outputting markdown. No fundamental architecture changes required; this is an execution strategy swap.

The critical risk is subprocess management complexity: stdout deadlocks, zombie processes, shell injection, and timeout handling. The mitigation is to get process lifecycle management right from Phase 1. Testing with real CLIs (not mocks) and long-running files (>50KB) must happen early. Telemetry provides the observability layer to measure success and optimize. The finding from Vercel's research validates the approach: embedded compressed docs achieve 100% task completion versus 79% for retrieval-based systems — but only if the docs are genuinely dense, not verbose.

## Key Findings

### Recommended Stack

**Zero new production dependencies needed.** Everything required exists in Node.js stdlib and the project's existing dependencies.

**Core technologies:**
- **Node.js `child_process.spawn()`** — subprocess spawning; already used in hooks; handles streaming, timeout, signal handling
- **Node.js `fs/promises`** — NDJSON log file writes; append-only telemetry with zero complexity
- **Existing `ExecutionPlan` interface** — already defines tasks with prompts, dependencies, output paths; no refactor needed
- **Zod (existing)** — runtime validation of CLI JSON output schemas; critical for handling CLI version drift
- **Claude CLI with `--print --output-format json`** — mature non-interactive mode; verified flags from local `claude --help` output
- **Gemini CLI** — secondary target; non-interactive mode needs verification; treat as experimental in v2.0
- **OpenCode** — tertiary; TUI-first design may lack batch mode; consider skipping CLI subprocess support

**Critical finding:** Claude CLI `--output-format json` returns structured JSON with response text, token counts, model used, cost data. The JSON schema is NOT formally versioned, requiring runtime validation with zod to handle CLI updates gracefully.

**Version requirements:**
- Node.js 18+ (already required)
- TypeScript 5.5+ (already 5.7.3)
- Claude CLI (user-installed, latest version recommended)
- Gemini CLI (optional, user-installed)

### Expected Features

**Must have (table stakes for v2.0):**
- **CLI subprocess spawn + capture** — core mechanism; spawn `claude`/`gemini`/`opencode` as child processes
- **Multi-CLI abstraction** — single interface for all three CLIs; user picks runtime via config or auto-detect
- **Print mode / non-interactive** — force CLIs into non-interactive mode (`--print`) to avoid TTY issues
- **Per-call JSON telemetry** — log input, output, tokens, timing, exit code for every LLM call
- **Run-level JSONL log file** — one log file per `are generate` run; newline-delimited JSON for streaming reads
- **Timing + token counts** — latency_ms, input_tokens, output_tokens; track actual vs estimated
- **Status + error capture** — success/failure/timeout; stderr for debugging
- **Refactored generate/update pipeline** — wire existing orchestrator → executor → new AI runner → writers

**Should have (differentiators for v2.0):**
- **Run summary statistics** — total calls, tokens, cost, success rate printed at end and saved to summary.json
- **Progress reporting** — show "File 15/58: src/cli/generate.ts [3.2s, 2450 tokens]" as calls complete
- **Retry with backoff** — auto-retry failed calls with exponential backoff + jitter
- **Concurrency control** — process N files in parallel (configurable, default 5); respects rate limits
- **Orphan + staleness detection** — flag .sum files with no source, source files with no .sum, outdated docs
- **Concise output prompts** — revise prompts to target information density over word count
- **Hierarchical deduplication** — ensure directory AGENTS.md adds value beyond file .sum content

**Defer (v2.1+):**
- **LLM-driven inconsistency check** — during update, compare code vs existing .sum and flag mismatches
- **Cost estimation** — calculate USD cost per run from token counts + pricing table
- **Agent-actionable sections** — include "How to modify", "How to test" in AGENTS.md
- **Compression ratio targeting** — aim for specific tokens-per-source-line ratio
- **Quality scoring** — score each .sum by density metrics (identifiers-per-token)
- **Gemini/OpenCode full support** — verify non-interactive modes; currently experimental

**Explicitly out of scope:**
- Direct API integration (use CLIs which manage auth)
- Streaming response parsing (collect full stdout, simpler and reliable)
- Multi-turn conversation (each file analysis is one-shot)
- External telemetry services (local JSONL files, user can forward if desired)
- AST-based inconsistency detection (contradicts LLM-driven philosophy)

### Architecture Approach

**Add a new `src/ai/` layer between executor and writers.** The existing orchestrator and executor remain unchanged — they already produce the perfect input (ExecutionPlan with prompts, dependencies, output paths). The AI service layer consumes this plan by spawning CLI subprocesses instead of outputting markdown.

**Major components:**

1. **AI Backend Interface (`src/ai/backend.ts`)** — abstract interface: `isAvailable()`, `execute(request) -> response`, `shutdown()`; implemented by Claude/Gemini/OpenCode adapters
2. **Backend Registry (`src/ai/backends/index.ts`)** — factory pattern; auto-detect available CLIs; create appropriate adapter
3. **AI Runner (`src/ai/runner.ts`)** — consumes ExecutionPlan; executes phases (files → directories → root) with bounded concurrency; handles retry, timeout, progress reporting
4. **Response Parser (`src/ai/parser.ts`)** — translates raw LLM text into structured data for existing writers; bridges AI layer and writer layer
5. **Telemetry Logger (`src/ai/telemetry.ts`)** — writes per-call NDJSON entries + run summary JSON; write-ahead logging for crash safety
6. **Subprocess Utility (`src/ai/spawn.ts`)** — wrapper around `child_process.spawn` with timeout, stream collection, error handling

**Data flow:** User runs `are generate` → Discovery (unchanged) → Orchestrator (unchanged) → Executor (unchanged) → **NEW: AI Runner** → spawns CLI subprocesses → captures output → **NEW: Parser** → existing writers (sum, agents-md, supplementary) → **NEW: Telemetry Logger**

**Key architectural decisions:**
- Backends are "dumb adapters" — accept prompt, return text; no knowledge of .sum files or AGENTS.md
- Parser handles all domain logic — knows about .sum format, AGENTS.md structure
- Runner owns concurrency, retry, timeout — backends are single-call only
- Telemetry is a side-effect collector — does not block execution flow
- Existing components (discovery, orchestration, writers) are untouched — this is an execution strategy swap, not a rewrite

**Integration points:**
- `src/cli/generate.ts` — refactored to add AI runner path; preserve existing `--execute` and `--stream` modes for backward compatibility
- `src/config/schema.ts` — extend with `ai: { backend, concurrency, timeoutSeconds, telemetry, detectInconsistencies }`
- `src/output/logger.ts` — add progress methods: `taskStart()`, `taskComplete()`, `taskFailed()`, `phaseStart()`, `phaseComplete()`

### Critical Pitfalls

1. **stdout Buffer Deadlock on Large LLM Responses** — when LLM outputs 10-50KB JSON (response + metadata), OS pipe buffer (64KB Linux, 4KB macOS) fills; if parent waits for process exit before draining stdout, process blocks on write, classic deadlock. **Prevention:** Use `spawn()` with stdout/stderr `data` listeners attached BEFORE spawning; collect chunks incrementally; set timeout to kill stuck processes.

2. **Claude CLI `--output-format json` Response Parsing Fragility** — JSON schema is not versioned; CLI updates can change field names/nesting; hardcoded expectations silently fail. **Prevention:** Parse inside try/catch; validate with zod at runtime; define minimal expected interface; fall back to text mode if JSON parsing fails; log raw output before parsing for debugging.

3. **Missing or Broken Timeout Management Leading to Zombie Processes** — LLM calls hang (network issue, API overload); without proper timeout, processes accumulate; naive `child.kill()` may fail (child ignores SIGTERM, has its own children, Windows behavior differs). **Prevention:** Use `AbortController` with signal option; implement two-phase kill (SIGTERM, wait 5s, SIGKILL); track all spawned processes; kill all on parent exit; adaptive timeouts based on file size.

4. **Shell Injection via Prompt Content in CLI Arguments** — file content or paths with shell metacharacters (`$`, `` ` ``, `"`, `|`) break commands or enable injection when using `exec()` or `spawn({shell: true})`. **Prevention:** ALWAYS use `spawn()` with argument arrays; pass prompts via stdin, not CLI args; never use `{shell: true}`; validate/escape paths before including in prompts.

5. **Telemetry Log File Growth Consuming Disk Space** — logging full prompts + responses for 5,000-file projects with 10-50KB prompts = 80-400MB per run; multiple runs accumulate. **Prevention:** Use NDJSON (newline-delimited JSON), not giant JSON array; log levels (METADATA vs FULL); default to metadata-only (timing, tokens, file path, exit code); full prompt/response opt-in; rotation when log exceeds 50MB; auto-prune logs older than 7 days.

**Additional key pitfalls:**
- Incomplete telemetry on crash — use write-ahead logging (STARTED entry before call, COMPLETED after)
- Multi-CLI output format divergence — define strict internal interface first; CLI-specific details isolated in adapters
- Claude CLI permission mode causing interactive prompts — use `--print` + `--permission-mode bypassPermissions` or `--allowedTools "Read"`
- Concurrency cascading failures — use semaphore pattern, not raw Promise.all; adaptive concurrency on rate limit errors
- Context density over-compression — preserve identifiers (function names, types), structured frontmatter; compress prose only

## Implications for Roadmap

Based on research, v2.0 should be delivered in 4-5 phases with clear dependency order:

### Phase 1: AI Service Foundation (P0 — Must Ship)
**Rationale:** All other v2.0 features depend on the AI service layer. Without it, there is nothing to instrument with telemetry, no subprocess output to optimize for density, no LLM calls to detect inconsistencies. This must be rock-solid before building on top.

**Delivers:**
- Backend interface + Claude adapter (verified working, includes JSON output parsing)
- Subprocess spawn utility with timeout, stream handling, error capture
- Backend registry with auto-detection
- Basic telemetry (timing, tokens, exit codes) — metadata level only
- Config schema extension for AI service settings

**Addresses pitfalls:**
- Pitfall 1 (stdout deadlock) — spawn with stream listeners
- Pitfall 3 (zombie processes) — AbortController, process tracking
- Pitfall 4 (shell injection) — stdin piping, no shell mode
- Pitfall 8 (permission mode) — explicit permission bypass flags

**Stack elements:** Node.js `child_process`, zod for validation, Claude CLI `--print --output-format json`

**Research flags:** No deeper research needed — Claude CLI flags verified locally; Node.js spawn patterns well-documented. Build and test against real Claude CLI early.

---

### Phase 2: Orchestration Engine (P0 — Must Ship)
**Rationale:** Connects the existing execution plan system to the new AI service layer. This is the "wiring phase" that makes the tool actually work end-to-end. Depends on Phase 1 being complete and stable.

**Delivers:**
- AI Runner that executes ExecutionPlan via backends
- Concurrency control (semaphore pattern, configurable limit)
- Retry with exponential backoff + jitter
- Response Parser that translates LLM text → .sum files, AGENTS.md
- Generate command refactor: add direct execution mode, preserve legacy modes
- Logger progress methods (taskStart, phaseComplete, etc.)

**Addresses features:**
- Multi-CLI abstraction (complete)
- Refactored generate pipeline (complete)
- Concurrency control (bounded parallelism)
- Retry logic (transient failure recovery)
- Progress reporting (task-level visibility)

**Addresses pitfalls:**
- Pitfall 9 (concurrency cascading failures) — semaphore + adaptive concurrency
- Pitfall 18 (breaking v1.0 flow) — strategy pattern, ExecutionPlan unchanged

**Research flags:** Integration testing critical — run on real projects (50-200 files) against Claude CLI to validate concurrency, retry, parser robustness. Monitor for deadlocks, memory pressure.

---

### Phase 3: Full Telemetry + Secondary CLI Support (P1 — Should Ship)
**Rationale:** Phase 2 ships with basic telemetry (timing, tokens). Phase 3 completes the observability story with full logging (prompts, responses, thinking), run summaries, and cost estimation. Also adds Gemini CLI adapter (after verifying non-interactive capabilities).

**Delivers:**
- Full telemetry level (log complete prompts, responses, thinking content)
- Run summary statistics (aggregate tokens, costs, success rate)
- Log rotation + cleanup (max size 50MB, auto-prune older than 7 days)
- Cost estimation based on token counts + pricing table
- Gemini CLI adapter (after verification)
- OpenCode adapter investigation (may be skipped if batch mode unavailable)

**Addresses features:**
- Run summary statistics (complete)
- Cost estimation (complete)
- Gemini/OpenCode experimental support (partial)

**Addresses pitfalls:**
- Pitfall 5 (log file growth) — rotation, levels, pruning
- Pitfall 6 (incomplete telemetry on crash) — write-ahead logging
- Pitfall 7 (multi-CLI divergence) — normalize output formats
- Pitfall 13 (exit code semantics) — per-adapter validation

**Research flags:** MUST verify Gemini CLI non-interactive mode before implementing adapter. If Gemini lacks `--print` equivalent, document as limitation and skip. OpenCode likely skipped unless TUI-to-batch bridge discovered.

---

### Phase 4: Inconsistency Detection + Context Density (P1-P2 — Should Ship or v2.1)
**Rationale:** These are quality improvements on top of the working orchestration system. Can be iterated independently. Inconsistency detection requires the AI service to make additional LLM calls during updates. Context density requires prompt template revisions and quality metrics.

**Delivers:**
- Orphan detection (source file deleted, .sum remains)
- Staleness flagging (source changed, .sum outdated via hash)
- Missing doc detection (source has no .sum, directory has no AGENTS.md)
- Revised prompt templates targeting information density
- Hierarchical deduplication prompts (directory AGENTS.md adds value, no duplication)
- Inconsistency report output (INCONSISTENCIES.md or append to CONCERNS.md)

**Addresses features:**
- Orphan + staleness detection (complete)
- Concise output prompts (complete)
- Hierarchical deduplication (complete)

**Addresses pitfalls:**
- Pitfall 10 (over-compression) — preserve identifiers, structured frontmatter
- Pitfall 11 (false positives) — start with high-confidence checks only
- Pitfall 19 (performance impact) — static checks (fast), semantic checks deferred to v2.1

**Research flags:** Standard patterns — git diff-based staleness already implemented in v1.0. Prompt revision is iterative experimentation, not research-heavy. LLM-driven semantic inconsistency checks (code vs .sum comparison) deferred to v2.1 due to complexity and false positive risk.

---

### Phase 5: Update Command Refactor (P2 — Can Ship in v2.1)
**Rationale:** The `are update` command currently uses git diff to determine which files changed, then regenerates their .sum files. Phase 5 refactors it to use the AI service layer (like generate does). This is lower priority because the existing update flow works; refactor is for consistency and to unlock telemetry on updates.

**Delivers:**
- Update command using AI service layer
- Incremental update telemetry
- Inconsistency detection during updates (optional)

**Addresses:** Internal consistency (update and generate use same execution path)

**Research flags:** No new research needed — reuses Phase 2 orchestration engine.

---

### Phase Ordering Rationale

- **Phase 1 before Phase 2:** Cannot wire orchestration without working backends
- **Phase 2 before Phase 3:** Need working end-to-end pipeline before adding full telemetry
- **Phase 3 before Phase 4:** Inconsistency detection requires subprocess layer; cost estimation requires telemetry
- **Phase 4 can be parallel with Phase 3:** Output quality improvements are independent of telemetry completion
- **Phase 5 last:** Update refactor is incremental improvement, not core to v2.0 value

**Dependency graph:**
```
Phase 1 (AI Service Foundation)
    ↓
Phase 2 (Orchestration Engine) ← Core v2.0 value delivered here
    ↓
Phase 3 (Telemetry + Secondary CLIs) ← Completes observability
    ↓
Phase 4 (Quality Improvements) ← Can be iterative/parallel
    ↓
Phase 5 (Update Refactor) ← Optional for v2.0
```

**Minimum viable v2.0:** Ship after Phase 2. Phases 3-5 are enhancements.

### Research Flags

**Phases with standard patterns (low/no additional research needed):**
- **Phase 1:** Node.js subprocess patterns well-documented; Claude CLI flags verified locally
- **Phase 2:** Existing ExecutionPlan interface is the contract; orchestration is standard promise concurrency patterns
- **Phase 4:** Git diff-based staleness already implemented; prompt revision is iterative testing, not research

**Phases needing validation/testing:**
- **Phase 1:** Test Claude CLI JSON output schema with real invocations; document exact response structure
- **Phase 3:** Verify Gemini CLI non-interactive mode (`gemini --help`) before implementation; if batch mode unavailable, document and skip
- **Phase 3:** Investigate OpenCode batch capabilities; likely skip if TUI-only
- **Phase 4:** A/B test prompt revisions on sample projects to validate density improvements without over-compression

**Open questions to resolve during implementation (not blocking):**
- Does Claude CLI `--output-format json` include cost_usd in response? (affects cost estimation — may need to calculate from tokens + pricing)
- What is max stdin size for Claude CLI? (affects large file handling — test with 100KB+ files)
- Does Gemini CLI report token usage in output? (affects telemetry completeness — may be estimation-only)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | Zero new production dependencies; Claude CLI flags verified from `claude --help` output; Node.js child_process well-documented; existing codebase analyzed in depth |
| **Features** | HIGH | Table stakes features are subprocess fundamentals (spawn, capture, log); differentiators are standard patterns (concurrency, retry, telemetry); no novel unknowns |
| **Architecture** | HIGH | Integration points clearly mapped; existing ExecutionPlan interface is perfect fit; new AI layer slots in between executor and writers without refactoring existing code |
| **Pitfalls** | MEDIUM-HIGH | Critical pitfalls (deadlock, zombies, injection, log growth) are well-known subprocess issues with documented mitigations; Claude CLI permission mode verified; multi-CLI divergence flagged as risk with mitigation strategy |

**Overall confidence:** HIGH for Phase 1-2 (core v2.0); MEDIUM for Phase 3 (Gemini CLI details unknown); MEDIUM for Phase 4 (output quality is iterative experimentation).

### Gaps to Address

**Must resolve before Phase 1 complete:**
- **Claude CLI JSON schema** — capture actual JSON output from `claude -p --output-format json "test prompt"` and validate structure; define zod schema based on observed reality, not assumptions
- **Stdin size limits** — test with 100KB+ prompts to verify no truncation or errors; document max safe size
- **Permission bypass behavior** — verify `--permission-mode bypassPermissions` or `--dangerously-skip-permissions` works in non-interactive context without hanging

**Must resolve before Phase 3 starts:**
- **Gemini CLI non-interactive mode** — run `gemini --help` to check for `--print` or equivalent; if absent, mark Gemini support as "deferred to v2.1"
- **OpenCode batch mode** — run `opencode --help` to check for non-interactive flags; likely TUI-only, in which case continue using v1.0 integration pattern (OpenCode hosts ARE, not vice versa)

**Can be resolved iteratively during Phase 4:**
- **Context density metrics** — how to measure "information density" objectively? Define metrics: identifiers per 100 tokens, action verbs per paragraph, unique-to-parent-summary ratio
- **Prompt template effectiveness** — A/B test old prompts vs compressed prompts; measure findability (given query, can AI find right file using only summaries?)

**No blocking gaps.** All critical unknowns have clear resolution paths (test real CLI, validate JSON output, measure output quality). Research provides sufficient foundation to begin implementation.

## Sources

### PRIMARY (HIGH confidence)
- **Codebase analysis:** Direct reading of `src/generation/orchestrator.ts`, `executor.ts`, `prompts/`, `writers/`, `config/schema.ts`, `integration/detect.ts`, `change-detection/` — all architecture integration points verified
- **Claude CLI flags:** Output of `claude --help` captured locally on 2026-02-07 — all flags (`--print`, `--output-format`, `--system-prompt`, `--permission-mode`, etc.) verified
- **Node.js `child_process` API:** Training data (January 2025) — spawn, streams, signals, timeout behavior
- **PROJECT.md:** `.planning/PROJECT.md` — v2.0 requirements, constraints, tech stack, validated v1.0 achievements

### SECONDARY (MEDIUM confidence)
- **LLM observability patterns:** Training data on LangSmith, Helicone, Braintrust, Langfuse — common telemetry fields (tokens, latency, cost, status)
- **Vercel embedded docs research:** Training data from LinkedIn engineering posts — 100% task completion with embedded compressed docs vs 79% with retrieval
- **GitHub AGENTS.md analysis:** Training data from GitHub engineering blog — effective vs verbose documentation patterns
- **Node.js best practices:** Subprocess management, NDJSON logging, concurrency patterns — established patterns from training data

### TERTIARY (LOW confidence — needs verification)
- **Gemini CLI interface:** Training data only (January 2025) — non-interactive mode, JSON output, flags — MUST verify with `gemini --help` before Phase 3
- **OpenCode CLI capabilities:** Training data (January 2025) — described as TUI-first; batch mode unclear — MUST verify before attempting subprocess adapter
- **Claude CLI JSON output exact schema:** Inferred from flags; exact field names, nesting, optional fields need runtime validation
- **LLM pricing:** Training data (January 2025) — Claude Sonnet 4, Haiku 3.5, Gemini 2.0 Flash, Gemini 2.5 Pro prices — MUST update from current provider pricing pages for accurate cost estimation

---

*Research completed: 2026-02-07*
*Ready for roadmap: YES*
*Minimum viable v2.0: Phase 1 + Phase 2*
*Recommended full v2.0: Phase 1 + Phase 2 + Phase 3*

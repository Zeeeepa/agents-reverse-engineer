# Feature Landscape: v2.0 AI Service, Telemetry & Quality

**Domain:** AI CLI orchestration, LLM call telemetry, inconsistency detection, high-density context files
**Researched:** 2026-02-07
**Overall confidence:** MEDIUM (training knowledge, no live verification available; flagged where LOW)

## Executive Summary

v2.0 transforms agents-reverse-engineer from a plan-generator (host LLM executes) into an orchestrator (tool spawns LLM CLIs as subprocesses and drives analysis directly). This unlocks four connected capabilities: (1) the tool controls execution flow, (2) every LLM call can be instrumented with telemetry, (3) analysis passes can detect inconsistencies between code and docs, and (4) output quality can be systematically improved toward information-dense context files.

The key insight from Vercel's AI SDK research (cited in LinkedIn engineering posts): **embedded compressed documentation outperforms retrieval-based documentation**. Vercel found their AI assistant achieved 100% task completion with inline compressed docs versus 79% with retrieval-based approaches. This directly validates the AGENTS.md model over MCP/RAG approaches -- but only if the AGENTS.md content is genuinely dense, not padded prose.

---

## Feature Domain 1: AI CLI Orchestration Service

### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **Spawn CLI as subprocess** | Core mechanism; tool must invoke `claude`, `gemini`, or `opencode` as child process | MEDIUM | Node.js `child_process.spawn()`, existing `EnvironmentType` detection |
| **Pass prompt via stdin/file** | Must transmit system+user prompt to CLI; most AI CLIs accept `-p` flag or stdin piping | LOW | Prompt builder (exists) |
| **Capture stdout/stderr** | Must collect LLM response text from subprocess output | LOW | Node.js streams |
| **Process exit code handling** | Must detect success/failure/timeout of subprocess | LOW | Standard subprocess management |
| **Configurable CLI path** | User may have `claude` in non-standard location or use aliases | LOW | Config schema (exists) |
| **Timeout per call** | Prevent hung subprocesses; LLM calls can stall indefinitely | LOW | `AbortController` or `setTimeout` + `kill()` |
| **Sequential execution** | Files must be processed in dependency order (post-order traversal already exists) | LOW | `ExecutionPlan` ordering (exists) |

### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **Multi-CLI abstraction** | Single interface for Claude CLI, Gemini CLI, OpenCode; user picks runtime, tool handles differences | MEDIUM | CLI detection per runtime; command-line flag differences |
| **Print mode / non-interactive** | Force CLI into non-interactive print mode (`claude -p`, `gemini -p`) to avoid TTY issues | LOW | Per-runtime CLI flag knowledge |
| **Retry with backoff** | Auto-retry failed calls (rate limits, transient errors) with exponential backoff | MEDIUM | Error classification (retryable vs fatal) |
| **Concurrency control** | Process N files in parallel (configurable); respects rate limits | HIGH | Semaphore/pool pattern; post-order dependency ordering |
| **Model selection passthrough** | Let user specify model (`--model sonnet`, `--model flash`) passed through to CLI | LOW | CLI flag mapping per runtime |
| **Prompt caching awareness** | Structure prompts so system prompt stays constant across calls (enables provider-side caching) | LOW | Prompt builder refactor; keep system prompt identical across file-type calls |
| **Dry-run mode** | Show what would be executed without actually calling LLMs | LOW | Print commands instead of spawning |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Direct API integration** | Requires API keys, billing setup, SDK dependencies; CLIs handle auth already | Use installed CLIs which manage their own authentication |
| **Custom HTTP client to providers** | Duplicates what CLIs do; maintenance burden tracking API changes | Leverage CLI tools as stable interface |
| **Streaming response parsing** | Over-engineering; for doc generation, complete responses are fine | Collect full stdout after process exits |
| **Multi-turn conversation** | Unnecessary complexity; each file analysis is independent one-shot | Single prompt per file/directory |
| **Background daemon process** | Complexity of IPC, lifecycle management; ARE runs as foreground tool | Run-to-completion model |

---

## Feature Domain 2: LLM Call Telemetry & Observability

### What Observability Tools Capture (Confidence: MEDIUM)

Based on analysis of LangSmith, Helicone, Braintrust, Langfuse, and OpenLLMetry patterns:

**Universal fields across all major LLM observability platforms:**

| Field | Description | LangSmith | Helicone | Braintrust | Langfuse |
|-------|-------------|-----------|----------|------------|----------|
| `id` | Unique call identifier | trace_id | request_id | span_id | trace_id |
| `timestamp` | When call was initiated | yes | yes | yes | yes |
| `model` | Model identifier (e.g., "claude-sonnet-4-20250514") | yes | yes | yes | yes |
| `provider` | LLM provider name | implicit | yes | yes | yes |
| `input` / `prompt` | Full prompt sent (system + user) | yes | yes | yes | yes |
| `output` / `completion` | Full response received | yes | yes | yes | yes |
| `input_tokens` | Tokens in prompt | yes | yes | yes | yes |
| `output_tokens` | Tokens in response | yes | yes | yes | yes |
| `total_tokens` | Sum of input + output | yes | yes | yes | yes |
| `latency_ms` | End-to-end call duration | yes | yes | yes | yes |
| `status` | Success/error/timeout | yes | yes | yes | yes |
| `error` | Error message if failed | yes | yes | yes | yes |
| `cost` | Estimated USD cost | no (separate) | yes | yes | yes |
| `metadata` | Arbitrary key-value tags | yes | yes | yes | yes |

**Extended fields (common in advanced platforms):**

| Field | Description | Who Has It |
|-------|-------------|------------|
| `ttft_ms` | Time to first token | Helicone, Langfuse |
| `thinking` | Chain-of-thought / extended thinking content | LangSmith (tool calls) |
| `cache_hit` | Whether prompt cache was used | Helicone |
| `temperature` | Sampling temperature | All |
| `max_tokens` | Token limit set | All |
| `stop_reason` | Why generation stopped (length, stop token, etc.) | All |
| `parent_id` | For nested spans / trace hierarchy | LangSmith, Langfuse |
| `tags` | Categorical labels | All |
| `scores` | Quality evaluations | Braintrust, Langfuse |

### Recommended Telemetry Schema for ARE

**Per-call log entry (JSON):**

```json
{
  "id": "uuid-v4",
  "run_id": "uuid-v4 (shared across all calls in one run)",
  "timestamp": "ISO-8601",
  "sequence": 1,

  "call": {
    "type": "file | chunk | synthesis | directory-summary | root-doc",
    "target": "relative/path/to/file.ts",
    "task_id": "file:src/index.ts"
  },

  "model": {
    "provider": "claude | gemini | opencode",
    "model_id": "claude-sonnet-4-20250514",
    "cli_command": "claude -p --model sonnet"
  },

  "input": {
    "system_prompt": "full system prompt text",
    "user_prompt": "full user prompt text",
    "input_tokens": 2450,
    "files_read": ["src/index.ts"]
  },

  "output": {
    "response": "full response text",
    "output_tokens": 380,
    "thinking": "extended thinking content if available"
  },

  "timing": {
    "start_ms": 1707300000000,
    "end_ms": 1707300003200,
    "latency_ms": 3200,
    "ttft_ms": 890
  },

  "status": "success | error | timeout | retry",
  "error": null,
  "retry_count": 0,

  "cost": {
    "input_cost_usd": 0.007,
    "output_cost_usd": 0.005,
    "total_cost_usd": 0.012
  },

  "context": {
    "project_root": "/path/to/project",
    "are_version": "2.0.0",
    "run_mode": "generate | update"
  }
}
```

### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **Per-call JSON log entry** | Basic observability; must know what was sent and received | LOW | AI service (Domain 1) emitting events |
| **Run-level log file** | One JSON file per `are generate` / `are update` run; all calls in sequence | LOW | File I/O; `run_id` generation |
| **Timing (latency_ms)** | Essential for performance understanding; every observability tool tracks this | LOW | `Date.now()` before/after subprocess |
| **Token counts** | Must track input/output tokens; already have `gpt-tokenizer` for estimation | LOW | Existing `countTokens()` + parse CLI output for actuals |
| **Success/error status** | Must know which calls failed and why | LOW | Exit code + stderr capture |
| **Input/output capture** | Must record prompt and response for debugging/quality review | LOW | Already have prompts; capture stdout |
| **Target file path** | Must know which file each call was for | LOW | Already in `AnalysisTask.filePath` |

### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **Cost estimation** | Show total cost of a generate/update run; users care about LLM costs | MEDIUM | Per-model pricing table; token counts |
| **Run summary statistics** | Total calls, total tokens, total time, total cost, success rate -- printed at end | LOW | Aggregate log entries |
| **Thinking/reasoning capture** | Capture extended thinking if CLI outputs it; valuable for debugging quality issues | MEDIUM | CLI-specific parsing (Claude's `--output-format json` includes thinking) |
| **Structured output format from CLI** | Use `--output-format json` when available to get structured response with metadata | MEDIUM | Per-CLI format flag support |
| **Log rotation/management** | Keep last N runs, compress old logs, configurable retention | LOW | Glob old files, delete/compress |
| **Queryable log format** | JSONL (one entry per line) for easy grep/jq analysis | LOW | `appendFileSync` per entry |
| **Progress reporting during run** | Show "File 15/58: src/cli/generate.ts [3.2s, 2450 tokens]" as calls complete | LOW | Console output from telemetry events |
| **Diff between runs** | Compare telemetry across runs to detect regression (e.g., output getting shorter) | HIGH | Log analysis tooling |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **External telemetry service integration** | Adds dependency, requires accounts, privacy concerns for code content | Local JSON files; user can forward to LangSmith/Helicone if they want |
| **OpenTelemetry SDK** | Massive dependency for a CLI tool; designed for distributed systems | Simple JSON logging; OTEL is overkill for single-process CLI |
| **Database for logs** | SQLite already used for state; adding another DB concern for logs is unnecessary | JSONL files in `.agents-reverse-engineer/logs/` |
| **Real-time dashboard** | GUI complexity; CLI tool users expect terminal output | Terminal summary + JSONL files for post-hoc analysis |
| **Prompt content in metrics** | Mixing observability with content storage; prompts can be huge | Log files capture content; summary metrics are separate |

---

## Feature Domain 3: Code-Documentation Inconsistency Detection

### How Inconsistency Detection Works (Confidence: MEDIUM)

Inconsistency detection in code documentation falls into three categories:

**Category 1: Structural inconsistencies (easiest)**
- File exists but no `.sum` file
- `.sum` file exists but source file was deleted (orphan)
- AGENTS.md references files that no longer exist
- Exported functions/classes not mentioned in documentation
- Documentation mentions functions/classes that no longer exist

**Category 2: Semantic inconsistencies (medium difficulty)**
- Code's actual behavior contradicts its documentation description
- Function signature changed but `.sum` still describes old signature
- New dependencies added but not mentioned in docs
- File's purpose changed substantially but summary is stale
- Error handling behavior differs from documented behavior

**Category 3: Cross-reference inconsistencies (hardest)**
- File A's docs say it depends on File B, but import was removed
- Architecture doc describes a pattern the code no longer follows
- AGENTS.md groups files by purpose, but a file moved to a different purpose
- STACK.md lists a dependency that was removed from package.json

### Detection Approaches

**Approach 1: Hash-based staleness (structural)**
Already partially implemented via git change detection. If a file changed since its `.sum` was generated, the `.sum` is potentially stale.
- Confidence: HIGH (already proven in v1.0)
- What it catches: Temporal staleness
- What it misses: Content-level inconsistencies

**Approach 2: LLM-driven comparison (semantic)**
During analysis, the LLM receives both the current code AND the existing `.sum` file. The prompt asks: "Does this summary accurately describe this code? Flag any inconsistencies."
- Confidence: MEDIUM (standard LLM pattern; quality depends on prompt)
- What it catches: Semantic drift, behavioral changes
- What it misses: Subtle nuances the LLM also misses

**Approach 3: AST-based structural comparison (structural + semantic)**
Parse code to extract exports, function signatures, imports. Compare against what the `.sum` file claims. Purely mechanical check.
- Confidence: LOW (requires language-specific parsers; contradicts project philosophy of "LLM figures out the language")
- What it catches: Signature changes, export drift, import changes
- What it misses: Behavioral/semantic changes

**Recommended approach: Combine 1 + 2.** Use hash-based staleness to identify WHICH files to check, then use LLM-driven comparison to detect WHAT is inconsistent. This leverages the existing architecture (hash tracking + LLM analysis) without adding AST parsers.

### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **Orphan detection** | `.sum` files with no source file; AGENTS.md referencing deleted files | LOW | File system comparison; already in `update` pipeline |
| **Staleness flagging** | Mark `.sum` files where source changed since generation | LOW | Git change detection (exists); hash comparison (exists) |
| **Missing documentation** | Source files with no `.sum`; directories with no AGENTS.md | LOW | Discovery result vs. existing docs comparison |
| **Report output** | List of inconsistencies found, categorized by type and severity | LOW | Formatter for inconsistency results |

### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **LLM-driven semantic comparison** | During update, compare new code against existing `.sum` and flag mismatches | MEDIUM | AI service (Domain 1); modified prompt that includes existing `.sum` |
| **Inconsistency severity levels** | Categorize: CRITICAL (wrong info), STALE (outdated), MINOR (cosmetic) | LOW | Classification logic in prompt or post-processing |
| **Auto-fix mode** | When inconsistency detected, automatically regenerate the `.sum` | LOW | Already have regeneration capability; just trigger it |
| **Inconsistency report file** | Write `INCONSISTENCIES.md` or append to CONCERNS.md | LOW | File writer |
| **Cross-file reference validation** | Check that "Related Files" in `.sum` still exist and are still related | MEDIUM | Parse `.sum` metadata, validate paths exist |
| **Code-vs-code inconsistency** | Flag when two files that should agree (e.g., types.ts and schema.ts) diverge | HIGH | Requires understanding of file relationships; LLM analysis of pairs |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Language-specific AST parsing** | Adds per-language dependencies; contradicts LLM-driven philosophy | Let LLM detect inconsistencies during analysis |
| **Real-time file watching for drift** | Performance cost, complexity; git-diff batch model is proven | Check on `update` runs, not continuously |
| **Automated code fixes** | Way out of scope; ARE documents code, does not modify it | Flag inconsistencies for developer action |
| **Compliance/audit trail** | Enterprise feature; over-engineering for open-source CLI | Simple log of what was detected and when |

---

## Feature Domain 4: Information-Dense Context Files (AGENTS.md Quality)

### What Makes AGENTS.md Files Dense vs. Verbose

**Key findings from GitHub's analysis of 2,500+ repositories (Confidence: MEDIUM -- based on training data of the GitHub blog post):**

1. **Effective AGENTS.md files are compressed knowledge, not prose.** They use terse, high-signal sentences rather than explanatory paragraphs. Compare:
   - VERBOSE: "The authentication module is responsible for handling user authentication using JSON Web Tokens. It provides functions for generating tokens, validating tokens, and refreshing expired tokens."
   - DENSE: "Auth: JWT-based. `authenticate(token) -> User`, `generateToken(user) -> string`. Tokens expire 24h, client handles refresh."

2. **Structure over narrative.** Best AGENTS.md files use:
   - Bullet points, not paragraphs
   - Tables for multi-item comparison
   - Code references (backticks) for every identifier
   - Headers that match directory structure

3. **Actionable instructions over descriptions.** From GitHub's analysis:
   - BAD: "This directory contains utility functions."
   - GOOD: "When adding a new utility: export from `index.ts`, add tests in `__tests__/`, follow pure-function pattern (no side effects)."

4. **Anti-patterns found across 2,500+ repos:**
   - Restating what's obvious from file names
   - Including full code examples (use references instead)
   - Documenting implementation details that change frequently
   - Using generic language ("various", "different", "several")

### The Embedded > Retrieved Insight (Confidence: MEDIUM)

**Vercel's finding (cited across multiple engineering discussions):** When comparing approaches for giving AI assistants codebase knowledge:

- **Embedded compressed docs** (AGENTS.md-style, baked into project files): **100% task completion**
- **Retrieval-based docs** (RAG/MCP dynamic lookup): **79% task completion**

The reason: embedded docs are always in context, require no tool calls, and have no retrieval latency or relevance errors. The tradeoff is they must be compact (context window budget) and current (staleness risk).

**Implication for ARE:** The documentation ARE generates IS the primary context mechanism. Quality and density directly impact AI assistant effectiveness. Every token of padding reduces the budget available for actual code context. This is not a nice-to-have quality improvement -- it is the core value proposition.

### Information Density Strategies

**Strategy 1: Structured compression**
Replace prose with structured formats that convey more per token:
- `Purpose | Exports | Dependencies | Patterns` as headers
- Pipe-delimited inline tables for simple lists
- Eliminate articles ("the", "a", "an") and filler words
- Use abbreviations where unambiguous (fn, arg, ret, cfg, impl, dep)

**Strategy 2: Referential compression**
Instead of describing content, point to it:
- "See `src/auth/jwt.ts:authenticate()` for token validation" instead of explaining the validation logic
- File paths as hyperlinks to actual code, not prose descriptions of what code does
- Use `.sum` file excerpts rather than re-describing

**Strategy 3: Hierarchical compression**
Each level adds value, never repeats child content:
- `.sum` files: Full detail for one file
- Directory AGENTS.md: Relationships between files, directory purpose, patterns -- NOT file-by-file summaries
- Root AGENTS.md: Architecture overview, entry points, conventions -- NOT directory-by-directory summaries

**Strategy 4: Agent-actionable content**
Content that directly helps an AI agent accomplish tasks:
- "To modify auth flow: edit `src/auth/middleware.ts`, test with `npm test -- auth`"
- "Error types in `src/types/errors.ts`; thrown from services, caught in `src/api/error-handler.ts`"
- "Config loaded via `src/config/loader.ts` from `.agents-reverse-engineer/config.yaml`"

### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **Concise `.sum` output** | Current prompts request 300-500 words; many files need less | LOW | Prompt template updates |
| **No redundancy across levels** | Directory AGENTS.md should not repeat what `.sum` files say | MEDIUM | Modified directory-summary prompts; hierarchical prompt strategy |
| **Code identifier preservation** | Every function, class, type, and export should be backtick-referenced | LOW | Prompt instructions emphasizing identifier preservation |
| **Structured output format** | Consistent headers, bullet format, not free-form prose | LOW | Prompt template enforcement |

### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **Compression ratio targeting** | Aim for specific tokens-per-source-line ratio; measure and optimize | MEDIUM | Token counting (exists); quality metrics; prompt iteration |
| **Agent-actionable sections** | Include "How to modify", "How to test", "Common tasks" in AGENTS.md | MEDIUM | Modified directory/root prompts |
| **Abbreviated notation** | Use terse notation for function signatures: `fn(arg: Type) -> Ret` | LOW | Prompt instructions |
| **Hierarchical deduplication** | Each level explicitly told "do NOT repeat child summaries; ADD relationship and context" | MEDIUM | Multi-pass prompting or hierarchical prompt context |
| **Per-file token budget** | Enforce max output tokens per file type (config: 100 tokens, test: 150, service: 300) | MEDIUM | Output token limits in CLI flags or post-processing truncation |
| **Quality scoring** | Score each `.sum` by density metrics: identifiers-per-token, actionability, uniqueness | HIGH | Post-generation analysis pass; LLM-as-judge or heuristic |
| **Template evolution** | Different summary templates based on what the LLM previously found effective | HIGH | Feedback loop; A/B comparison across runs |
| **AGENTS.md spec compliance** | Follow agents.md spec precisely (title, description, conventions sections) | LOW | Spec-aware prompt templates |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Verbose explanations** | Waste context tokens; AI assistants parse structure better than prose | Use structured bullet points and tables |
| **Full code examples in docs** | Quickly outdated; duplicates actual code; wastes tokens | Reference file:line instead |
| **Implementation details** | Change frequently; stale docs are worse than no docs | Document interface and purpose, not implementation |
| **Generic descriptions** | "Contains various utilities" conveys zero information | Name specific exports and their use cases |
| **Nested summaries** | Directory doc summarizing file docs summarizing code = triple redundancy | Each level adds unique value: relationships, patterns, entry points |

---

## Feature Dependencies

```
                    +---------------------+
                    | AI Service Layer    |
                    | (Domain 1)          |
                    | spawn CLI, capture  |
                    +----------+----------+
                               |
                    depends on |
                               |
              +----------------+----------------+
              |                                 |
    +---------v---------+           +-----------v-----------+
    | Telemetry Layer   |           | Refactored Pipeline   |
    | (Domain 2)        |           | discover + generate   |
    | log every call    |           | using AI service      |
    +---------+---------+           +-----------+-----------+
              |                                 |
              |                    depends on   |
              |                                 |
              |                  +--------------v-----------+
              |                  | Inconsistency Detection  |
              |                  | (Domain 3)               |
              |                  | compare code vs .sum     |
              |                  +--------------+-----------+
              |                                 |
              |                    depends on   |
              |                                 |
              |                  +--------------v-----------+
              |                  | Improved Prompts         |
              |                  | (Domain 4)               |
              |                  | dense, structured output |
              +------------------+--------------------------+


Existing codebase dependencies:
  AI Service depends on:
    - EnvironmentType detection (exists in src/integration/detect.ts)
    - Prompt building (exists in src/generation/prompts/)
    - Execution plan (exists in src/generation/executor.ts)

  Telemetry depends on:
    - AI Service (must wrap every call)
    - Config schema (add telemetry config section)

  Inconsistency Detection depends on:
    - AI Service (for LLM comparison calls)
    - Change detection (exists in src/change-detection/)
    - Discovery results (exists)

  Output Quality depends on:
    - Prompt templates (exists, needs modification)
    - AI Service (for testing new prompts)
    - Telemetry (for measuring output quality)
```

### Critical Dependency: AI Service is Foundation

All other v2.0 features depend on the AI service layer. Without it:
- Telemetry has nothing to instrument
- Inconsistency detection cannot make LLM calls
- Output quality cannot be tested systematically

**Recommendation:** Build AI Service first, then layer Telemetry, then Inconsistency Detection and Output Quality in parallel.

---

## Telemetry Schema: Complete Specification

### Log File Structure

```
.agents-reverse-engineer/
  logs/
    2026-02-07T14-30-00-generate.jsonl    # One JSONL file per run
    2026-02-07T15-45-00-update.jsonl
    summary.json                           # Latest run summary
```

### JSONL Entry Schema (one per line, one per LLM call)

```typescript
interface TelemetryEntry {
  // Identity
  id: string;                    // UUID v4 for this call
  run_id: string;                // UUID v4 shared across entire run
  sequence: number;              // 1-indexed call order within run
  timestamp: string;             // ISO-8601

  // What was called
  call: {
    type: 'file' | 'chunk' | 'synthesis' | 'directory-summary' | 'root-doc' | 'inconsistency-check';
    target: string;              // Relative file/directory path
    task_id: string;             // From ExecutionTask.id
  };

  // How it was called
  model: {
    provider: 'claude' | 'gemini' | 'opencode';
    cli_command: string;         // Actual command executed (redacted paths)
    model_id?: string;           // If detectable from CLI output
  };

  // What went in
  input: {
    system_prompt: string;
    user_prompt: string;
    estimated_input_tokens: number;  // Our estimate from gpt-tokenizer
    actual_input_tokens?: number;    // From CLI structured output if available
    files_referenced: string[];      // Files mentioned in prompt
  };

  // What came out
  output: {
    response: string;
    estimated_output_tokens: number;
    actual_output_tokens?: number;
    thinking?: string;               // Extended thinking content if available
    output_file: string;             // Path where output was written
  };

  // Performance
  timing: {
    queued_at: number;               // ms timestamp when queued
    started_at: number;              // ms timestamp when subprocess spawned
    completed_at: number;            // ms timestamp when subprocess exited
    latency_ms: number;              // completed - started
    queue_wait_ms: number;           // started - queued
  };

  // Result
  status: 'success' | 'error' | 'timeout' | 'skipped';
  error?: {
    message: string;
    exit_code?: number;
    stderr?: string;
  };
  retry_count: number;

  // Cost (estimated)
  cost?: {
    input_cost_usd: number;
    output_cost_usd: number;
    total_cost_usd: number;
    pricing_model: string;           // e.g., "claude-sonnet-4-20250514-2026-01"
  };
}
```

### Run Summary Schema

```typescript
interface RunSummary {
  run_id: string;
  started_at: string;              // ISO-8601
  completed_at: string;
  duration_seconds: number;
  mode: 'generate' | 'update';

  provider: string;
  model_id?: string;

  counts: {
    total_calls: number;
    successful: number;
    failed: number;
    retried: number;
    skipped: number;
  };

  tokens: {
    total_input: number;
    total_output: number;
    total: number;
  };

  cost: {
    total_usd: number;
  };

  timing: {
    total_latency_ms: number;
    avg_latency_ms: number;
    p50_latency_ms: number;
    p95_latency_ms: number;
    max_latency_ms: number;
  };

  files: {
    total_processed: number;
    total_skipped: number;
    inconsistencies_found: number;
  };

  are_version: string;
  project_root: string;
  log_file: string;                // Path to detailed JSONL
}
```

### Cost Estimation Table (Confidence: LOW -- prices change frequently)

Must be configurable and overridable via config. Default pricing as of training data:

```yaml
pricing:
  claude-sonnet-4:
    input_per_mtok: 3.00
    output_per_mtok: 15.00
  claude-haiku-3.5:
    input_per_mtok: 0.80
    output_per_mtok: 4.00
  gemini-2.0-flash:
    input_per_mtok: 0.10
    output_per_mtok: 0.40
  gemini-2.5-pro:
    input_per_mtok: 1.25
    output_per_mtok: 10.00
```

**Flag for validation:** These prices MUST be verified against current provider pricing pages before implementation. Prices change frequently.

---

## Feature Priority Matrix

| Feature | Domain | Type | User Value | Cost | Priority |
|---------|--------|------|-----------|------|----------|
| CLI subprocess spawn + capture | 1 | Table Stakes | HIGH | MEDIUM | **P0** |
| Multi-CLI abstraction (claude/gemini/opencode) | 1 | Table Stakes | HIGH | MEDIUM | **P0** |
| Print mode / non-interactive flags | 1 | Table Stakes | HIGH | LOW | **P0** |
| Per-call JSON telemetry | 2 | Table Stakes | HIGH | LOW | **P0** |
| Run-level JSONL log file | 2 | Table Stakes | HIGH | LOW | **P0** |
| Timing + token counts | 2 | Table Stakes | MEDIUM | LOW | **P0** |
| Status + error capture | 2 | Table Stakes | HIGH | LOW | **P0** |
| Refactored generate pipeline | 1+2 | Table Stakes | HIGH | HIGH | **P0** |
| Refactored update pipeline | 1+2 | Table Stakes | HIGH | HIGH | **P0** |
| Orphan + staleness detection | 3 | Table Stakes | MEDIUM | LOW | **P1** |
| Missing doc detection | 3 | Table Stakes | MEDIUM | LOW | **P1** |
| Concise output prompts | 4 | Table Stakes | HIGH | LOW | **P1** |
| Structured output format | 4 | Table Stakes | HIGH | LOW | **P1** |
| Hierarchical deduplication | 4 | Differentiator | HIGH | MEDIUM | **P1** |
| Run summary statistics | 2 | Differentiator | MEDIUM | LOW | **P1** |
| Progress reporting | 2 | Differentiator | MEDIUM | LOW | **P1** |
| Retry with backoff | 1 | Differentiator | MEDIUM | MEDIUM | **P1** |
| Timeout handling | 1 | Table Stakes | MEDIUM | LOW | **P1** |
| LLM-driven inconsistency check | 3 | Differentiator | HIGH | MEDIUM | **P2** |
| Cost estimation | 2 | Differentiator | MEDIUM | MEDIUM | **P2** |
| Concurrency control | 1 | Differentiator | MEDIUM | HIGH | **P2** |
| Agent-actionable sections | 4 | Differentiator | HIGH | MEDIUM | **P2** |
| Inconsistency severity levels | 3 | Differentiator | LOW | LOW | **P2** |
| Cross-file reference validation | 3 | Differentiator | MEDIUM | MEDIUM | **P3** |
| Quality scoring | 4 | Differentiator | LOW | HIGH | **P3** |
| Code-vs-code inconsistency | 3 | Differentiator | LOW | HIGH | **P3** |

**Priority key:**
- **P0:** Must ship with v2.0 (core execution model change)
- **P1:** Should ship with v2.0 (immediate value)
- **P2:** Can ship in v2.x follow-up
- **P3:** Future consideration

---

## CLI Subprocess Patterns by Runtime

### Claude CLI (Confidence: MEDIUM)

```bash
# Basic prompt mode (non-interactive)
claude -p "analyze this code" --model sonnet

# With system prompt
claude -p "user prompt" --system-prompt "system prompt"

# Pipe content via stdin
echo "code content" | claude -p "analyze this"

# Structured JSON output (includes metadata)
claude -p "prompt" --output-format json

# With max tokens
claude -p "prompt" --max-tokens 1024
```

Key flags: `-p` (print/non-interactive), `--model`, `--output-format json`, `--system-prompt`, `--max-tokens`

JSON output format (when `--output-format json`):
```json
{
  "result": "response text",
  "model": "claude-sonnet-4-20250514",
  "input_tokens": 2450,
  "output_tokens": 380,
  "stop_reason": "end_turn"
}
```

**Flag for validation:** Claude CLI flags and JSON output format must be verified against current `claude --help` output.

### Gemini CLI (Confidence: LOW)

```bash
# Non-interactive mode
gemini -p "analyze this code"

# With model selection
gemini -p "prompt" --model gemini-2.5-pro
```

**Flag for validation:** Gemini CLI interface is less stable than Claude's. Must verify current flags before implementation.

### OpenCode (Confidence: LOW)

OpenCode may not have a non-interactive pipe mode suitable for subprocess orchestration. The primary interaction model may be interactive TUI.

**Flag for validation:** Must verify if OpenCode supports non-interactive prompt mode before including in AI service abstraction.

---

## Inconsistency Detection: Prompt Strategy

### During Update Analysis

When re-analyzing a file that has an existing `.sum`, modify the prompt to include:

```
## Existing Documentation
The following summary was previously generated for this file:

---
{existing .sum content}
---

## Your Task
1. Analyze the current code (provided below)
2. Generate an updated summary
3. ADDITIONALLY, flag any inconsistencies between the old summary and the current code:
   - Functions/exports mentioned in old summary that no longer exist
   - New exports not in old summary
   - Changed signatures or behavior
   - Dependency changes

Format inconsistencies as:
### Inconsistencies Found
- [STALE] `functionName` signature changed: was `fn(a: string)`, now `fn(a: string, b?: number)`
- [REMOVED] `helperUtil` no longer exported
- [NEW] `processAsync` added but not in previous summary
- [SEMANTIC] Purpose changed from "handles auth" to "handles auth + session management"
```

This piggybacks on the existing analysis pass -- no extra LLM calls needed for basic inconsistency detection.

---

## Output Quality: Prompt Improvements

### Current Problem

Current prompts request "300-500 words" which produces verbose output. For a 50-line utility file, 500 words of documentation is overkill and wastes context tokens.

### Proposed Prompt Changes

**File-level prompts:**
```
Guidelines:
- Be maximally concise. Every token must earn its place.
- Target: 1 line per export, 1 line for purpose, 1 line for key dependency
- Use backtick notation for ALL identifiers: `functionName`, `ClassName`, `TYPE`
- Format signatures tersely: `fn(arg: Type) -> ReturnType`
- NO articles (the, a, an), NO filler words (various, different, several)
- NO implementation details that change frequently
- Include ONLY: purpose, public interface, dependencies, patterns
```

**Directory-level prompts:**
```
Guidelines:
- DO NOT summarize individual files (their .sum files exist for that)
- INSTEAD describe: why these files are grouped, how they relate, patterns they share
- Include: entry points, common modification patterns, testing approach
- Format: bullet points, not paragraphs
- Max 5 lines for directories with < 5 files; max 10 lines for larger directories
```

**Root-level prompts:**
```
Guidelines:
- This is the FIRST document an AI assistant reads. Optimize for orientation.
- Include: project purpose (1 line), architecture (diagram if complex), entry points, conventions
- Reference subdirectory AGENTS.md files, don't duplicate their content
- Include "How to" section: how to add a feature, how to test, how to deploy
```

---

## Sources and Confidence

### HIGH Confidence (verified against codebase)
- Existing architecture: `src/generation/orchestrator.ts`, `executor.ts`, `prompts/`
- Existing types: `src/generation/types.ts`, `src/integration/types.ts`
- Existing config: `src/config/schema.ts`
- Existing change detection: `src/change-detection/detector.ts`
- Project constraints: `.planning/PROJECT.md`

### MEDIUM Confidence (training knowledge, multiple sources agree)
- LLM observability field patterns (LangSmith, Helicone, Braintrust, Langfuse all capture similar fields)
- GitHub AGENTS.md analysis (blog post from GitHub engineering team, widely referenced)
- Vercel embedded vs. retrieved docs finding (cited across multiple engineering discussions)
- Claude CLI `-p` flag and basic usage patterns
- Subprocess orchestration patterns in Node.js
- Code-documentation inconsistency detection approaches

### LOW Confidence (needs validation before implementation)
- Exact Claude CLI `--output-format json` response shape
- Gemini CLI non-interactive mode flags
- OpenCode subprocess compatibility
- Current LLM pricing (changes frequently)
- Specific token counts for prompt overhead estimates
- TTFT (time to first token) availability from CLI output

---

*Feature research for: v2.0 AI Service, Telemetry & Quality*
*Researched: 2026-02-07*
*Replaces: v1.0 feature research (2026-01-25)*

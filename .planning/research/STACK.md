# Stack Research: AI CLI Subprocess Orchestration & Telemetry

**Project:** agents-reverse-engineer v2.0
**Domain:** Spawning AI CLI tools as subprocesses, capturing output, logging telemetry
**Researched:** 2026-02-07
**Overall confidence:** MEDIUM (mixed HIGH/LOW - see per-section ratings)

---

## Executive Summary

v1.0 explicitly avoided direct LLM interaction: "the host tool handles LLM orchestration." v2.0 inverts this -- ARE itself will spawn `claude`, `gemini`, and `opencode` CLI tools as child processes, capture their structured output, and log telemetry per run.

The key architectural shift: ARE becomes the **orchestrator** rather than the **orchestrated**. The execution plan (already built by `buildExecutionPlan()`) now drives actual subprocess invocations instead of being output as markdown for human-in-the-loop execution.

**Critical finding:** Claude CLI has mature non-interactive JSON output support (`--print --output-format json`). Gemini CLI and OpenCode have less mature programmatic interfaces. The recommended approach is to build an abstraction layer that normalizes all three CLIs into a common invocation/response interface, with Claude CLI as the primary/best-supported target.

---

## Part 1: AI CLI Invocation Patterns

### Claude CLI (HIGH confidence -- from local `claude --help` output)

Claude CLI has first-class non-interactive mode designed for exactly this use case.

**Key flags for subprocess usage:**

| Flag | Purpose | Example |
|------|---------|---------|
| `-p, --print` | Non-interactive mode: print response and exit | `claude -p "summarize this file"` |
| `--output-format <format>` | Output format (only with `--print`) | `--output-format json` |
| `--system-prompt <prompt>` | Override system prompt | `--system-prompt "You are a code analyst"` |
| `--model <model>` | Model selection (alias or full name) | `--model sonnet` or `--model claude-sonnet-4-5-20250929` |
| `--max-budget-usd <amount>` | Cost cap per invocation (only with `--print`) | `--max-budget-usd 0.50` |
| `--allowedTools <tools...>` | Restrict available tools | `--allowedTools "Read"` |
| `--no-session-persistence` | Don't save session to disk (only with `--print`) | For ephemeral subprocess calls |
| `--json-schema <schema>` | Enforce structured output via JSON Schema | `--json-schema '{"type":"object",...}'` |
| `--permission-mode <mode>` | Permission behavior | `--permission-mode bypassPermissions` |
| `--dangerously-skip-permissions` | Skip all permission checks | For sandboxed environments |
| `--include-partial-messages` | Stream partial chunks (with `--output-format stream-json`) | For real-time progress |

**Output format options (with `--print`):**

1. **`text`** (default): Plain text response only
2. **`json`**: Single JSON object with full metadata including:
   - Response content
   - Token usage (input/output)
   - Model used
   - Cost information
   - Session metadata
3. **`stream-json`**: Newline-delimited JSON objects streamed in real-time:
   - Each chunk arrives as a separate JSON line
   - Includes partial message content
   - Final message includes usage statistics

**Recommended invocation for ARE:**

```bash
# Single-shot file analysis with JSON output
claude -p \
  --output-format json \
  --system-prompt "You are a code analyst generating .sum file documentation." \
  --model sonnet \
  --max-budget-usd 0.10 \
  --no-session-persistence \
  --allowedTools "Read" \
  "Analyze the file at /path/to/file.ts and generate a summary."

# Streaming invocation for long-running tasks
claude -p \
  --output-format stream-json \
  --include-partial-messages \
  --system-prompt "..." \
  --model sonnet \
  "..."
```

**JSON output schema (MEDIUM confidence -- inferred from flags, needs runtime validation):**

```typescript
// Expected JSON output structure (verify at runtime)
interface ClaudeJsonOutput {
  result: string;           // The response text
  model: string;            // Model that was used
  session_id: string;       // Session identifier
  usage: {
    input_tokens: number;   // Tokens in prompt
    output_tokens: number;  // Tokens in response
    cache_read_tokens?: number;
    cache_write_tokens?: number;
  };
  cost_usd?: number;        // Cost of this call
  duration_ms?: number;     // Wall clock time
}
```

**Important limitations:**
- `--print` is required for all programmatic flags (`--output-format`, `--max-budget-usd`, etc.)
- `--dangerously-skip-permissions` should only be used in sandboxed environments
- `--no-session-persistence` prevents disk writes for ephemeral calls (recommended for subprocess use)
- The tool needs the user to have Claude CLI installed and authenticated

**Confidence:** HIGH for flags/options (captured from actual `claude --help`). MEDIUM for JSON output schema (inferred, must verify at runtime).

---

### Gemini CLI (LOW confidence -- training data only, WebSearch/WebFetch unavailable)

**WARNING:** The following is based on training data as of May 2025. Gemini CLI is actively evolving. Verify all claims before implementation.

Gemini CLI (`gemini`) is a Node.js-based CLI tool by Google for interacting with Gemini models.

**Expected non-interactive invocation:**

```bash
# Pipe input for non-interactive mode
echo "Analyze this file" | gemini

# Or use prompt argument
gemini -p "Analyze this file"
```

**Expected flags (LOW confidence):**

| Flag | Purpose | Confidence |
|------|---------|------------|
| `-p` or `--prompt` | Non-interactive single prompt | LOW |
| `--model` | Model selection | LOW |
| `--json` or `--output-format json` | JSON output mode | LOW |
| `--system-instruction` | System prompt | LOW |

**Key uncertainty:** Gemini CLI's non-interactive mode and structured output support were immature as of early 2025. The project already integrates with Gemini at the hook/command level (`.gemini/commands/are/` with TOML files), but spawning Gemini CLI as a subprocess with JSON output capture is a different use case that needs runtime verification.

**Recommended approach:** Treat Gemini CLI as a secondary target. Build the abstraction layer around Claude CLI first, then add Gemini support when its non-interactive capabilities can be verified.

**Action needed:** Before implementation, run `gemini --help` and verify:
1. Does it have a `--print`/`-p` equivalent for non-interactive mode?
2. Does it support JSON output format?
3. Does it report token usage in output?

---

### OpenCode CLI (LOW confidence -- training data only)

**WARNING:** Same caveat as Gemini CLI. OpenCode is built by the SST team and is actively evolving.

OpenCode is a Go-based terminal UI application. As of training data, it is primarily an **interactive TUI** application, not a CLI tool designed for subprocess invocation.

**Expected invocation patterns (LOW confidence):**

```bash
# OpenCode may not have a non-interactive mode
# It is primarily a TUI (terminal user interface)
opencode  # Opens interactive TUI
```

**Key concern:** OpenCode's architecture as a TUI makes it fundamentally different from Claude CLI's `--print` mode. It may not be suitable for subprocess spawning without significant workarounds.

**Possible alternatives for OpenCode integration:**
1. **Skip subprocess spawning** -- Continue using OpenCode as a command/plugin host (current v1.0 approach)
2. **Use its underlying API** -- If OpenCode exposes an API or SDK, use that instead of the CLI
3. **Direct API calls** -- For the model providers OpenCode supports, call APIs directly

**Action needed:** Before implementation, verify:
1. Does `opencode --help` show any non-interactive/batch mode?
2. Is there a programmatic API or SDK?
3. Can it accept piped input?

**Recommendation:** Deprioritize OpenCode CLI subprocess support. Focus on Claude CLI (proven) and Gemini CLI (likely achievable). Provide OpenCode support through the existing command/plugin pattern instead.

---

## Part 2: Node.js Subprocess Libraries

### Recommendation: Node.js built-in `child_process` (not execa)

**Rationale:** The existing codebase already uses `child_process` (see `hooks/are-session-end.js` using `execSync` and `spawn`). Adding execa would introduce a new dependency for marginal benefit in this specific use case.

### Option Analysis

#### `node:child_process` (RECOMMENDED)

**Confidence:** HIGH (built-in Node.js module)

| Aspect | Assessment |
|--------|------------|
| Already used in project | YES (`hooks/are-session-end.js`) |
| ESM compatible | YES (native Node.js) |
| TypeScript types | YES (via `@types/node`, already a devDep) |
| Streaming support | YES (`spawn` returns streams) |
| JSON parsing | Manual (parse stdout yourself) |
| Zero dependencies | YES |

**Key APIs for this use case:**

```typescript
import { spawn, type ChildProcess } from 'node:child_process';

// For JSON output mode (collect all output, parse at end)
function spawnClaude(prompt: string, systemPrompt: string): Promise<ClaudeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', [
      '-p',
      '--output-format', 'json',
      '--system-prompt', systemPrompt,
      '--model', 'sonnet',
      '--no-session-persistence',
      prompt,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000, // 2 minute timeout
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Failed to parse claude JSON output: ${stdout.slice(0, 200)}`));
      }
    });

    child.on('error', reject);
  });
}

// For streaming mode (process chunks in real-time)
function spawnClaudeStreaming(
  prompt: string,
  systemPrompt: string,
  onChunk: (chunk: unknown) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', [
      '-p',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--system-prompt', systemPrompt,
      '--model', 'sonnet',
      '--no-session-persistence',
      prompt,
    ]);

    let buffer = '';
    child.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) {
          try { onChunk(JSON.parse(line)); } catch { /* skip malformed */ }
        }
      }
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`claude streaming exited with code ${code}`));
    });

    child.on('error', reject);
  });
}
```

#### `execa` (NOT RECOMMENDED for this project)

**Confidence:** MEDIUM (training data -- version may have changed)

| Aspect | Assessment |
|--------|------------|
| Latest version | ~9.x (as of training data, ESM-only since v6) |
| ESM compatible | YES (ESM-only since v6) |
| TypeScript types | YES (built-in) |
| Value-add over child_process | Nicer API, better error handling, promise-based |
| Concerns | Extra dependency, project already uses child_process |

**Why NOT for this project:**

1. **Already using child_process** -- Introducing execa creates inconsistency. The existing `hooks/are-session-end.js` uses `execSync` and `spawn`.
2. **Marginal benefit** -- The wrapper functions above provide the same ergonomics with zero new dependencies.
3. **Dependency philosophy** -- The project is lean (9 production deps). Adding execa for subprocess spawning when `child_process` works fine contradicts the project's minimalist approach.
4. **ESM-only since v6** -- While the project is ESM, execa's aggressive ESM-only stance has caused issues in the ecosystem.

**When to reconsider:** If subprocess management becomes complex (dozens of concurrent processes with complex lifecycle management), execa's process management features would justify the dependency.

#### `zx` (NOT RECOMMENDED)

Google's shell scripting library. Overkill for structured subprocess invocation. Designed for shell scripts, not programmatic process management.

---

## Part 3: Structured Telemetry Logging

### Recommendation: Raw JSON file writes with `node:fs` (not pino, not winston)

**Rationale:** Telemetry logging for this use case is append-only JSON files per run. The requirements are:
1. Write structured JSON records (one per CLI invocation)
2. Write a run-level summary file
3. Human-readable for debugging
4. Machine-parseable for future analytics

This is **file I/O**, not application logging. pino and winston are designed for application log streams (stdout, log rotation, transports). Using them for structured telemetry files is architectural mismatch.

### Option Analysis

#### Raw JSON writes (RECOMMENDED)

```typescript
import { writeFile, appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

interface TelemetryRecord {
  timestamp: string;
  taskId: string;
  cli: 'claude' | 'gemini' | 'opencode';
  model: string;
  prompt: {
    systemTokens: number;
    userTokens: number;
  };
  response: {
    outputTokens: number;
    durationMs: number;
    exitCode: number;
    success: boolean;
  };
  cost?: {
    inputCostUsd: number;
    outputCostUsd: number;
    totalCostUsd: number;
  };
  error?: string;
}

interface RunSummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  cli: string;
  model: string;
  tasks: {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  tokens: {
    totalInput: number;
    totalOutput: number;
  };
  cost: {
    totalUsd: number;
  };
  durationMs: number;
}

// Write per-invocation records as NDJSON (newline-delimited JSON)
async function appendTelemetry(
  logDir: string,
  runId: string,
  record: TelemetryRecord,
): Promise<void> {
  const logFile = join(logDir, `${runId}.ndjson`);
  await appendFile(logFile, JSON.stringify(record) + '\n', 'utf-8');
}

// Write run summary as pretty JSON
async function writeRunSummary(
  logDir: string,
  summary: RunSummary,
): Promise<void> {
  const summaryFile = join(logDir, `${summary.runId}.summary.json`);
  await writeFile(summaryFile, JSON.stringify(summary, null, 2), 'utf-8');
}
```

**File structure:**

```
.agents-reverse-engineer/
  telemetry/
    2026-02-07T10-30-00-abc123.ndjson    # Per-invocation records (NDJSON)
    2026-02-07T10-30-00-abc123.summary.json  # Run summary
    2026-02-07T14-15-00-def456.ndjson
    2026-02-07T14-15-00-def456.summary.json
```

**Why NDJSON for per-invocation records:**
- Append-friendly (no need to read/rewrite the whole file)
- Each line is independently parseable
- Standard format (used by Elasticsearch, BigQuery, etc.)
- Can be streamed/tailed during execution
- Survives process crashes (completed records are already written)

**Why pretty JSON for summaries:**
- Human-readable at a glance
- Single-read file (not appended to)
- Small file (one object per run)

#### pino (NOT RECOMMENDED)

**Confidence:** MEDIUM (training data)

| Aspect | Assessment |
|--------|------------|
| Latest version | ~9.x |
| Purpose | High-performance application logging |
| Structured output | YES (JSON by default) |
| File transport | Via `pino-file` or `pino.destination()` |

**Why NOT:**
1. **Wrong abstraction** -- pino is for application logging (log levels, transports, child loggers). We need structured telemetry files.
2. **Unnecessary complexity** -- pino's value is high-throughput logging (100K+ logs/sec). We write ~1-100 records per run.
3. **Transport overhead** -- Writing to files with pino requires either `pino.destination()` (lower-level than raw `fs`) or `pino-file` transport (extra dependency).
4. **Log format mismatch** -- pino adds `level`, `time`, `pid`, `hostname` fields to every record. These are noise for telemetry.

#### winston (NOT RECOMMENDED)

**Confidence:** MEDIUM (training data)

Similar reasoning to pino but even more overkill. Winston's transport architecture is designed for routing logs to multiple destinations (console, file, HTTP, database). This project needs one destination: a JSON file per run.

### What about the existing Logger?

The existing `src/output/logger.ts` handles **user-facing terminal output** (info, warn, error, file discovery messages). It should remain as-is for terminal output.

The telemetry system is a **separate concern**:
- Terminal logger -> human-readable console output (picocolors, verbosity modes)
- Telemetry writer -> machine-readable JSON files (structured records)

Do NOT merge these. They serve different audiences and have different requirements.

---

## Part 4: Concurrency & Process Management

### Recommendation: Built-in `Promise.allSettled` with configurable concurrency limiter

The execution plan already defines task dependencies (`ExecutionTask.dependencies`). The subprocess orchestrator needs to:

1. Run independent tasks in parallel (file tasks have no dependencies)
2. Respect a concurrency limit (avoid spawning 500 claude processes)
3. Wait for dependencies before running dependent tasks (directory tasks wait for file tasks)

**Do NOT add a task queue library.** The execution plan already encodes the dependency graph. A simple semaphore pattern suffices:

```typescript
/**
 * Simple concurrency limiter. No external dependency needed.
 */
class ConcurrencyLimiter {
  private running = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly maxConcurrency: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.maxConcurrency) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}

// Usage:
const limiter = new ConcurrencyLimiter(5); // 5 concurrent claude processes
const results = await Promise.allSettled(
  fileTasks.map((task) => limiter.run(() => invokeCli(task)))
);
```

**Why 5 concurrent processes?** Claude CLI may have its own rate limiting. Start conservative, make configurable. The `--max-budget-usd` flag on each invocation provides per-call cost protection.

---

## Part 5: Integration with Existing Stack

### New modules needed

```
src/
  subprocess/
    types.ts           # CliInvocation, CliResult, TelemetryRecord interfaces
    claude.ts           # Claude CLI subprocess adapter
    gemini.ts           # Gemini CLI subprocess adapter (stub initially)
    opencode.ts         # OpenCode CLI subprocess adapter (stub initially)
    adapter.ts          # Unified interface dispatching to correct CLI
    runner.ts           # Concurrency limiter + task execution engine
    telemetry.ts        # NDJSON + summary JSON file writing
    index.ts            # Public API
```

### Interface design (using existing zod for validation)

```typescript
import { z } from 'zod';

// CLI adapter interface -- each CLI implements this
interface CliAdapter {
  readonly name: 'claude' | 'gemini' | 'opencode';

  /** Check if CLI is available (which + --version) */
  isAvailable(): Promise<boolean>;

  /** Invoke CLI with structured input, return structured output */
  invoke(params: CliInvocationParams): Promise<CliResult>;
}

const CliInvocationParamsSchema = z.object({
  systemPrompt: z.string(),
  userPrompt: z.string(),
  model: z.string().optional(),
  maxBudgetUsd: z.number().optional(),
  timeoutMs: z.number().default(120_000),
  allowedTools: z.array(z.string()).optional(),
});

const CliResultSchema = z.object({
  success: z.boolean(),
  content: z.string(),
  exitCode: z.number(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
  }).optional(),
  costUsd: z.number().optional(),
  durationMs: z.number(),
  model: z.string().optional(),
  rawOutput: z.string(), // Full stdout for debugging
  stderr: z.string(),    // stderr for error analysis
});
```

### Connections to existing code

| Existing Module | Connection Point |
|-----------------|-----------------|
| `generation/executor.ts` | `ExecutionTask` feeds into `CliInvocationParams` -- systemPrompt/userPrompt map directly |
| `generation/orchestrator.ts` | `GenerationPlan` drives the overall execution sequence |
| `output/logger.ts` | Terminal progress reporting during subprocess execution |
| `generation/budget/tracker.ts` | Track actual token usage from CLI responses vs budgeted |
| `config/schema.ts` | Add CLI configuration (which CLI, model, concurrency, budget) |
| `generation/writers/sum.ts` | Write CLI response content as .sum files |

### Configuration additions (extend existing zod schema)

```typescript
// Additions to config/schema.ts
const subprocessConfigSchema = z.object({
  /** Which CLI to use for AI invocations */
  cli: z.enum(['claude', 'gemini', 'opencode']).default('claude'),

  /** Model to use (CLI-specific; defaults to best available) */
  model: z.string().optional(),

  /** Maximum concurrent CLI processes */
  concurrency: z.number().min(1).max(20).default(5),

  /** Per-invocation cost cap in USD */
  maxBudgetPerCallUsd: z.number().default(0.10),

  /** Per-run total cost cap in USD */
  maxBudgetPerRunUsd: z.number().default(5.00),

  /** Timeout per invocation in milliseconds */
  timeoutMs: z.number().default(120_000),

  /** Enable telemetry logging */
  telemetry: z.boolean().default(true),

  /** Telemetry output directory (relative to project root) */
  telemetryDir: z.string().default('.agents-reverse-engineer/telemetry'),

  /** Permission mode for Claude CLI */
  permissionMode: z.enum([
    'default',
    'plan',
    'acceptEdits',
    'bypassPermissions',
  ]).default('plan'),
});
```

---

## Part 6: What NOT to Add

| Library | Why NOT | Use Instead |
|---------|---------|-------------|
| `execa` | Already using child_process; marginal benefit; extra dependency | `node:child_process` spawn |
| `pino` | Application logger, not telemetry writer; adds noise fields | Raw `fs.appendFile` with NDJSON |
| `winston` | Even more overkill than pino for simple file writes | Raw `fs.writeFile` |
| `p-queue` / `p-limit` | Simple concurrency limiter is ~20 lines; not worth dependency | Custom `ConcurrencyLimiter` class |
| `@anthropic-ai/sdk` | We call the CLI, not the API; the CLI handles auth/API | `claude -p` via child_process |
| `@google/generative-ai` | Same reasoning as Anthropic SDK | `gemini` CLI via child_process |
| `tree-kill` | Only needed if CLI processes hang; start without it | `child.kill()` with timeout |
| `strip-ansi` | Claude `--output-format json` output should not contain ANSI | Parse JSON directly |

**Philosophy:** The existing project has 9 production dependencies. Subprocess orchestration requires ZERO new production dependencies. Everything needed is in `node:child_process` and `node:fs`.

---

## Part 7: Markdown Context Density (Secondary Research)

This was a secondary question. Brief findings:

**Current approach (adequate):** The project already generates structured markdown with YAML frontmatter (`.sum` files) and hierarchical AGENTS.md. The token budgeting system (`gpt-tokenizer`) already manages density.

**Potential improvements (LOW priority):**

| Technique | Description | Value for ARE |
|-----------|-------------|---------------|
| Structured YAML frontmatter | Already implemented in .sum format | N/A (done) |
| Markdown tables over prose | More token-dense than paragraphs | MEDIUM - consider for AGENTS.md file listings |
| XML-like section markers | `<purpose>...</purpose>` tags for AI parsing | LOW - markdown sections work fine |
| Anchor term preservation | Keep key identifiers across summary levels | HIGH - already identified in PITFALLS.md |
| Hierarchical references | `## src/cli/ -> see src/cli/AGENTS.md` | MEDIUM - reduces duplication |

**No new libraries needed.** Context density is a prompt engineering concern, not a library concern. The existing `gpt-tokenizer` + markdown generation is sufficient.

---

## Part 8: CLI Availability Detection

Before spawning any CLI, ARE must verify it exists and is authenticated:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function detectCli(
  name: 'claude' | 'gemini' | 'opencode'
): Promise<{ available: boolean; version?: string; error?: string }> {
  try {
    const { stdout } = await execFileAsync(name, ['--version'], {
      timeout: 5_000,
    });
    return { available: true, version: stdout.trim() };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Pre-flight check before any run
async function preflight(cli: string): Promise<void> {
  const result = await detectCli(cli as 'claude' | 'gemini' | 'opencode');
  if (!result.available) {
    throw new Error(
      `CLI "${cli}" is not available. Install it first.\n` +
      `  Claude: npm install -g @anthropic-ai/claude-code\n` +
      `  Gemini: npm install -g @anthropic-ai/gemini-cli\n` + // URL needs verification
      `  OpenCode: See https://opencode.ai\n` +
      `Error: ${result.error}`
    );
  }
}
```

---

## Summary: New Dependencies Required

### Production Dependencies

**NONE.** Zero new production dependencies needed.

Everything is built on:
- `node:child_process` (spawn CLI subprocesses)
- `node:fs/promises` (write telemetry files)
- `node:path` (file paths)
- `node:util` (promisify for convenience)
- `zod` (already installed -- validate CLI output schemas)

### Dev Dependencies

No new dev dependencies either. Existing `vitest` + `@types/node` cover testing needs.

---

## Version/Compatibility Matrix

| Component | Required | Already in Project | Notes |
|-----------|----------|--------------------|-------|
| Node.js 22+ | YES | YES (engines: >=18, but targeting 22) | `child_process` fully stable |
| TypeScript 5.5+ | YES | YES (5.7.3) | No changes needed |
| zod | YES (output validation) | YES (^3.24.1) | Extend existing schemas |
| `@types/node` | YES (child_process types) | YES (^22.10.7) | Already has subprocess types |
| `claude` CLI | YES (primary target) | External (user must install) | Verified on this machine |
| `gemini` CLI | OPTIONAL (secondary) | External (user must install) | Needs runtime verification |
| `opencode` CLI | OPTIONAL (tertiary) | External (found at ~/.opencode/bin) | TUI-first, may lack batch mode |

---

## Confidence Assessment

| Area | Confidence | Basis | Notes |
|------|------------|-------|-------|
| Claude CLI flags | HIGH | Local `claude --help` output captured | All flags verified from actual binary |
| Claude CLI JSON schema | MEDIUM | Inferred from flags | Must validate actual JSON output at runtime |
| Gemini CLI | LOW | Training data only | WebSearch/WebFetch unavailable; needs verification |
| OpenCode CLI | LOW | Training data + `which` output | Likely TUI-only; may not support batch mode |
| Node.js child_process | HIGH | Built-in, well-documented | Used in existing codebase |
| No-new-deps approach | HIGH | Existing codebase analysis | Project philosophy is minimal deps |
| Telemetry approach | HIGH | Standard NDJSON pattern | No novel design decisions |
| Concurrency pattern | HIGH | Well-known semaphore pattern | Simple, proven |

---

## Open Questions for Phase Planning

1. **Claude CLI JSON output exact schema** -- Need to do a test invocation of `claude -p --output-format json "hello"` and capture the exact output structure. This should be the FIRST task in the implementation phase.

2. **Gemini CLI batch mode** -- Does `gemini` support a `--print` equivalent? If not, fallback to piping stdin or skip Gemini subprocess support entirely.

3. **OpenCode batch mode** -- Same question. OpenCode appears to be TUI-focused. May need to skip CLI subprocess support and use API-based integration instead.

4. **Claude CLI authentication in subprocess context** -- When `claude` is spawned as a child process, does it inherit the parent's authentication? Almost certainly yes (environment variables), but verify.

5. **Streaming vs collect-all tradeoff** -- For large file analysis, should we stream (`stream-json`) or collect all output (`json`)? Streaming gives better progress UX but adds parsing complexity. Recommend starting with `json` (simpler) and adding `stream-json` as enhancement.

6. **Cost tracking accuracy** -- Does Claude CLI JSON output include actual cost? If not, we need to estimate from token counts using published pricing.

---

## Roadmap Implications

1. **Phase 1: CLI Adapter Foundation** -- Build the Claude CLI adapter first (highest confidence), validate JSON output schema, implement telemetry writer. This phase should include a "discovery spike" to capture actual JSON output from each CLI.

2. **Phase 2: Orchestration Engine** -- Connect execution plan to CLI adapters, implement concurrency limiter, wire up telemetry. This builds on the existing `ExecutionPlan` architecture.

3. **Phase 3: Secondary CLI Support** -- Add Gemini CLI adapter (after verifying capabilities). OpenCode only if batch mode is confirmed.

4. **Phase 4: Refinement** -- Streaming support, progress reporting, cost tracking, error recovery.

**Critical dependency:** Phase 1 MUST include runtime validation of CLI output schemas. Do not assume the JSON output format -- capture it empirically.

---

*Stack research for: agents-reverse-engineer v2.0 -- AI CLI Subprocess Orchestration*
*Researched: 2026-02-07*
*Research tools available: Read, Glob, Grep, Bash (intermittent), local `claude --help` output*
*Research tools unavailable: WebSearch, WebFetch (permissions denied)*

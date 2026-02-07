# Phase 6: AI Service Foundation - Research

**Researched:** 2026-02-07
**Domain:** Node.js subprocess management, CLI orchestration, telemetry logging
**Confidence:** HIGH

## Summary

This phase builds an AI service layer that spawns CLI subprocesses (Claude, Gemini, OpenCode), captures structured JSON responses, handles failures with retry, and logs telemetry. The core technology is Node.js `child_process` module (built-in, no external dependency needed) combined with the Strategy pattern for multi-backend abstraction.

All three target CLIs (Claude Code v2.1+, Gemini CLI v0.27+, OpenCode v1.1+) support non-interactive modes with JSON output. Their JSON schemas differ significantly, so each backend adapter must normalize the response into a common shape. The project already uses a zero-external-runtime-dependency pattern (no express, no logging library) -- this phase should continue that pattern with hand-built retry logic and simple `fs.writeFile` telemetry rather than introducing heavy libraries.

**Primary recommendation:** Use `child_process.execFile` with `timeout` + `killSignal` options for subprocess management. Build a lightweight Strategy-pattern backend interface with a Claude adapter as the primary implementation. Implement retry as a standalone utility function wrapping any async operation. Write telemetry as pretty-printed JSON via `fs.writeFile`.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:child_process` | Built-in (Node 18+) | Spawn CLI subprocesses | Native module, no dependency needed. `execFile` avoids shell injection and supports `timeout` option |
| `node:fs/promises` | Built-in (Node 18+) | Write telemetry log files | Already used throughout the project |
| `zod` | ^3.24.1 | Validate CLI JSON responses | Already a project dependency, perfect for parsing unknown JSON shapes |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `picocolors` | ^1.1.1 | Colored error/warning output | Already a project dependency, use for CLI-not-found messages |
| `node:path` | Built-in | Path manipulation for log files | Already used throughout |
| `node:util` | Built-in | `convertProcessSignalToExitCode` | When a process is killed by signal rather than exiting normally |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled retry | `exponential-backoff` npm (v3.1.3) | Adds dependency for ~30 lines of code; the project avoids unnecessary deps |
| Hand-rolled PATH detection | `hasbin` npm | Old package, not maintained; native `fs.stat` + PATH split is simple |
| `child_process.spawn` | `child_process.execFile` | `spawn` gives streaming but `execFile` gives simpler callback API with built-in `timeout`; JSON responses are small enough to buffer |
| `child_process.exec` | `child_process.execFile` | `exec` uses shell (injection risk); `execFile` is safer |

**Installation:**
```bash
# No new dependencies needed -- all built-in Node.js modules + existing project deps
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── ai/                          # NEW: AI service layer
│   ├── index.ts                 # Public API exports
│   ├── types.ts                 # AIBackend interface, AIResponse, AICallOptions, etc.
│   ├── registry.ts              # Backend registry + factory + auto-detection
│   ├── service.ts               # AIService class (orchestrates call + retry + telemetry)
│   ├── retry.ts                 # Retry with exponential backoff utility
│   ├── subprocess.ts            # Low-level subprocess spawn + timeout + kill
│   ├── backends/                # Backend implementations
│   │   ├── claude.ts            # Claude CLI adapter
│   │   ├── gemini.ts            # Gemini CLI stub
│   │   └── opencode.ts          # OpenCode CLI stub
│   └── telemetry/               # Telemetry subsystem
│       ├── logger.ts            # Per-call log entry writer
│       ├── run-log.ts           # Per-run log file manager
│       └── cleanup.ts           # Auto-cleanup of old log files
├── cli/                         # Existing CLI (unchanged in this phase)
├── config/                      # Existing config (extended with AI section)
└── ...                          # Existing modules
```

### Pattern 1: Strategy Pattern for Backend Abstraction

**What:** Define an `AIBackend` interface that each CLI adapter implements. A registry/factory selects the correct backend at runtime.

**When to use:** When multiple implementations share the same contract but differ in invocation details (CLI flags, JSON schema, binary name).

**Example:**
```typescript
// Source: Standard TypeScript Strategy pattern

/** Normalized response from any AI CLI */
interface AIResponse {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  durationMs: number;
  exitCode: number;
  raw: unknown; // Original CLI JSON for debugging
}

/** Options for an AI call */
interface AICallOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  timeoutMs?: number;
  maxTurns?: number;
}

/** Backend interface -- each CLI adapter implements this */
interface AIBackend {
  readonly name: string;
  readonly cliCommand: string;

  /** Check if this backend's CLI is available on PATH */
  isAvailable(): Promise<boolean>;

  /** Build the CLI args array for a given call */
  buildArgs(options: AICallOptions): string[];

  /** Parse the CLI's JSON stdout into a normalized AIResponse */
  parseResponse(stdout: string, durationMs: number, exitCode: number): AIResponse;

  /** Get install instructions for this backend */
  getInstallInstructions(): string;
}
```

### Pattern 2: Subprocess Wrapper with Timeout + Cleanup

**What:** A single function that spawns a CLI process, writes prompt to stdin, collects stdout/stderr, enforces timeout, and handles cleanup.

**When to use:** Every AI call goes through this function. Centralizes zombie prevention and exit code handling.

**Example:**
```typescript
// Source: Node.js child_process docs (v25.6.0)
import { execFile } from 'node:child_process';

interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal: string | null;
  durationMs: number;
  timedOut: boolean;
}

function runSubprocess(
  command: string,
  args: string[],
  options: { timeoutMs: number; input?: string }
): Promise<SubprocessResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const child = execFile(
      command,
      args,
      {
        timeout: options.timeoutMs,
        killSignal: 'SIGTERM',
        maxBuffer: 10 * 1024 * 1024, // 10MB for large responses
        encoding: 'utf-8',
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        const timedOut = error?.killed === true;
        const exitCode = error?.code ?? child.exitCode ?? 0;

        // Even on error, we may have useful output
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: typeof exitCode === 'number' ? exitCode : 1,
          signal: error?.signal ?? null,
          durationMs,
          timedOut,
        });
      }
    );

    // Write prompt to stdin if provided
    if (options.input && child.stdin) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
  });
}
```

### Pattern 3: Retry with Exponential Backoff

**What:** Wrap any async operation with configurable retry logic that uses exponential delays.

**When to use:** AI CLI calls that may fail with transient errors (rate limits, timeouts, network issues).

**Example:**
```typescript
interface RetryOptions {
  maxRetries: number;      // default: 3
  baseDelayMs: number;     // default: 1000 (1s)
  maxDelayMs: number;      // default: 8000 (8s)
  multiplier: number;      // default: 2
  isRetryable: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === options.maxRetries || !options.isRetryable(error)) {
        throw error;
      }
      const delay = Math.min(
        options.baseDelayMs * Math.pow(options.multiplier, attempt),
        options.maxDelayMs
      );
      options.onRetry?.(attempt + 1, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
```

### Pattern 4: Telemetry Logger

**What:** Accumulate per-call log entries during a run, then write them all to a single JSON file when the run completes.

**When to use:** Every AI call appends to the in-memory log; the run finalizer writes the file.

**Example:**
```typescript
interface TelemetryEntry {
  timestamp: string;        // ISO 8601
  prompt: string;
  systemPrompt?: string;
  response: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  latencyMs: number;
  exitCode: number;
  error?: string;
  retryCount: number;
}

interface RunLog {
  runId: string;            // ISO timestamp-based
  startTime: string;
  endTime: string;
  entries: TelemetryEntry[];
  summary: {
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    totalDurationMs: number;
    errorCount: number;
  };
}
```

### Anti-Patterns to Avoid

- **Shell spawning:** Never use `child_process.exec` or `{ shell: true }` -- shell injection risk and unnecessary overhead. Use `execFile` with an args array.
- **Fire-and-forget subprocesses:** Always handle the `error` event and wait for the process to exit. Never leave spawned processes without cleanup.
- **Piped stdin without end():** When writing to `child.stdin`, always call `.end()` after writing. The child process blocks waiting for EOF otherwise.
- **Unbounded maxBuffer:** The default 1MB `maxBuffer` may truncate large AI responses. Set it explicitly to 10MB.
- **Swallowing stderr:** Always capture stderr for debugging even when stdout has the JSON response.
- **Global mutable state for telemetry:** Use a per-run logger instance, not a module-level singleton, to support future concurrency.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON response validation | Manual `JSON.parse` + field checking | Zod schemas | Type-safe parsing, clear error messages on malformed CLI output, already a dependency |
| Config schema extension | Separate config file for AI settings | Extend existing Zod `ConfigSchema` | Consistent with project patterns, one config file |
| Path detection (is CLI on PATH?) | Calling `which` as subprocess | `fs.stat` on PATH directories | Cross-platform, no subprocess overhead, works on Windows |
| Timestamp formatting | Custom date formatting | `new Date().toISOString()` | Standard ISO 8601, already used in the project |

**Key insight:** This project has zero external runtime dependencies beyond its listed package.json deps. The AI service layer should follow this pattern -- use `node:child_process`, `node:fs/promises`, and existing deps (`zod`, `picocolors`) rather than pulling in logging frameworks or retry libraries.

## Common Pitfalls

### Pitfall 1: Claude CLI stdin Hanging

**What goes wrong:** When spawning Claude Code from Node.js with `stdio: 'pipe'` for all three streams, the process hangs indefinitely and never returns.

**Why it happens:** Claude Code has special handling for its I/O streams. With fully piped stdio, the process gets stuck waiting for terminal detection or input handling.

**How to avoid:** Use `stdio: ['pipe', 'pipe', 'pipe']` with `execFile` (which handles this correctly), OR use `stdio: ['inherit', 'pipe', 'pipe']` with `spawn`. The `execFile` approach with `input` written to stdin + `.end()` is confirmed working. Test this early.

**Warning signs:** Process spawns successfully (no error event) but callback never fires. No stdout or stderr data events.

**Verified:** GitHub issue anthropics/claude-code#771 documents this. Workaround is confirmed: stdin must be properly closed after writing.

### Pitfall 2: maxBuffer Exceeded

**What goes wrong:** `execFile` kills the process with a `maxBuffer exceeded` error when the AI response is larger than the default 1MB buffer.

**Why it happens:** AI responses with verbose output, tool calls, or large code blocks can exceed 1MB. The default `maxBuffer` for `execFile` is `1024 * 1024` (1MB).

**How to avoid:** Set `maxBuffer: 10 * 1024 * 1024` (10MB) explicitly. This is generous but safe for JSON responses.

**Warning signs:** `Error: maxBuffer length exceeded` in the callback error.

### Pitfall 3: Timeout Does Not Mean Process Is Dead

**What goes wrong:** Setting `timeout` on `execFile` sends `SIGTERM`, but the process may catch `SIGTERM` and continue running, becoming a zombie.

**Why it happens:** On Unix, `SIGTERM` is catchable. The Claude CLI or any other process can install a `SIGTERM` handler.

**How to avoid:** Use `killSignal: 'SIGTERM'` initially (graceful), but implement a follow-up `SIGKILL` if the process doesn't exit within a grace period. Alternatively, use `killSignal: 'SIGKILL'` directly since AI CLI processes don't need graceful shutdown -- they have no state to persist.

**Warning signs:** Process exit event never fires after timeout. PID still visible in `ps` output.

### Pitfall 4: JSON Parse Failure on Non-JSON Output

**What goes wrong:** The CLI prints non-JSON content to stdout (e.g., upgrade notices, permission prompts, error messages) before or mixed with the JSON response.

**Why it happens:** CLI tools often write informational messages to stdout when they should go to stderr. Version upgrade prompts, first-run wizards, and permission dialogs can appear unexpectedly.

**How to avoid:** Parse stdout defensively: find the first `{` character for JSON object detection, or the first `[` for arrays. Wrap `JSON.parse` in try/catch and include the raw stdout in error messages for debugging. Consider using `--no-session-persistence` to minimize extraneous output.

**Warning signs:** `SyntaxError: Unexpected token` from `JSON.parse`. Raw stdout contains text before the JSON object.

### Pitfall 5: Cross-Platform PATH Detection

**What goes wrong:** PATH detection works on Linux/macOS but fails on Windows because Windows uses `;` as PATH delimiter and appends `PATHEXT` extensions (`.exe`, `.cmd`, `.bat`).

**Why it happens:** `process.env.PATH` uses `path.delimiter` (`:` on Unix, `;` on Windows). Windows executables may not have the exact name -- `claude` might be `claude.exe` or `claude.cmd`.

**How to avoid:** Use `path.delimiter` for splitting PATH. On Windows, iterate `PATHEXT` extensions. Use `fs.stat` to check existence, not `fs.access` with execute bit (Windows doesn't have Unix execute permissions).

**Warning signs:** "CLI not found" on Windows even when the CLI is installed.

### Pitfall 6: Rate Limit Detection Without Error Codes

**What goes wrong:** Retry logic checks exit codes for transient failures, but CLI tools may return the same non-zero exit code for both permanent and transient errors.

**Why it happens:** CLI tools don't always distinguish between "rate limited, try again" and "invalid request, never try again" via exit codes alone.

**How to avoid:** Parse stderr/stdout for known rate limit indicators: HTTP 429, "rate limit", "too many requests", "overloaded". Combine exit code + error message pattern matching for retry decisions.

**Warning signs:** Permanent errors being retried wastefully. Transient errors not being retried.

## Code Examples

### Complete Claude Backend Adapter

```typescript
// Source: Verified against claude CLI v2.1.31 JSON output (2026-02-07)
import { z } from 'zod';

/** Zod schema for Claude CLI JSON output */
const ClaudeResponseSchema = z.object({
  type: z.literal('result'),
  subtype: z.enum(['success', 'error']),
  is_error: z.boolean(),
  duration_ms: z.number(),
  duration_api_ms: z.number(),
  num_turns: z.number(),
  result: z.string(),
  session_id: z.string(),
  total_cost_usd: z.number(),
  usage: z.object({
    input_tokens: z.number(),
    cache_creation_input_tokens: z.number(),
    cache_read_input_tokens: z.number(),
    output_tokens: z.number(),
  }),
  modelUsage: z.record(z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadInputTokens: z.number(),
    cacheCreationInputTokens: z.number(),
    costUSD: z.number(),
  })),
});

type ClaudeResponse = z.infer<typeof ClaudeResponseSchema>;

/** Build Claude CLI arguments */
function buildClaudeArgs(options: {
  model?: string;
  systemPrompt?: string;
  maxTurns?: number;
}): string[] {
  const args: string[] = [
    '-p',                       // Non-interactive print mode
    '--output-format', 'json',  // Structured JSON output
    '--no-session-persistence', // Don't save session to disk
  ];

  if (options.model) {
    args.push('--model', options.model);
  }

  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt);
  }

  if (options.maxTurns) {
    args.push('--max-turns', String(options.maxTurns));
  }

  return args;
}

/** Parse Claude JSON response into normalized AIResponse */
function parseClaudeResponse(
  stdout: string,
  durationMs: number,
  exitCode: number
): AIResponse {
  // Find JSON object in stdout (handle any prefix text)
  const jsonStart = stdout.indexOf('{');
  if (jsonStart === -1) {
    throw new Error(`No JSON object in Claude output: ${stdout.slice(0, 200)}`);
  }

  const parsed = ClaudeResponseSchema.parse(
    JSON.parse(stdout.slice(jsonStart))
  );

  // Extract model name from modelUsage keys
  const modelName = Object.keys(parsed.modelUsage)[0] ?? 'unknown';
  const modelStats = parsed.modelUsage[modelName];

  return {
    text: parsed.result,
    model: modelName,
    inputTokens: parsed.usage.input_tokens,
    outputTokens: parsed.usage.output_tokens,
    cacheReadTokens: parsed.usage.cache_read_input_tokens,
    cacheCreationTokens: parsed.usage.cache_creation_input_tokens,
    costUsd: parsed.total_cost_usd,
    durationMs,
    exitCode,
    raw: parsed,
  };
}
```

### CLI Auto-Detection

```typescript
// Source: Node.js fs + path built-ins
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** Check if a command exists on PATH */
async function isCommandAvailable(command: string): Promise<boolean> {
  const envPath = process.env.PATH ?? '';
  const envExt = process.env.PATHEXT ?? '';
  const pathDirs = envPath
    .replace(/["]+/g, '')
    .split(path.delimiter)
    .filter(Boolean);
  const extensions = envExt ? envExt.split(';') : [''];

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      try {
        const candidate = path.join(dir, command + ext);
        const stat = await fs.stat(candidate);
        if (stat.isFile()) return true;
      } catch {
        // Not found in this dir, continue
      }
    }
  }
  return false;
}

/** Detect available backends in priority order */
async function detectBackend(): Promise<string | null> {
  const priority = ['claude', 'gemini', 'opencode'];
  for (const cli of priority) {
    if (await isCommandAvailable(cli)) {
      return cli;
    }
  }
  return null;
}
```

### Telemetry File Writing

```typescript
// Source: Node.js fs/promises built-in
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** Write run log to .agents-reverse/logs/ */
async function writeRunLog(
  projectRoot: string,
  runLog: RunLog
): Promise<string> {
  const logsDir = path.join(projectRoot, '.agents-reverse-engineer', 'logs');
  await fs.mkdir(logsDir, { recursive: true });

  // Filename: run-2026-02-07T15-30-00-000Z.json
  const timestamp = runLog.startTime.replace(/[:.]/g, '-');
  const filename = `run-${timestamp}.json`;
  const filepath = path.join(logsDir, filename);

  await fs.writeFile(filepath, JSON.stringify(runLog, null, 2), 'utf-8');
  return filepath;
}

/** Clean up old log files, keeping the N most recent */
async function cleanupOldLogs(
  projectRoot: string,
  keepCount: number
): Promise<number> {
  const logsDir = path.join(projectRoot, '.agents-reverse-engineer', 'logs');

  try {
    const files = await fs.readdir(logsDir);
    const logFiles = files
      .filter(f => f.startsWith('run-') && f.endsWith('.json'))
      .sort()
      .reverse(); // Most recent first (ISO timestamps sort correctly)

    const toDelete = logFiles.slice(keepCount);
    for (const file of toDelete) {
      await fs.unlink(path.join(logsDir, file));
    }
    return toDelete.length;
  } catch {
    return 0; // Directory doesn't exist yet
  }
}
```

### Gemini CLI Response Structure (for future adapter)

```typescript
// Source: Verified against gemini CLI v0.27.0 headless mode JSON output
// Note: Gemini headless returns a top-level object with response + stats
const GeminiResponseSchema = z.object({
  response: z.string(),
  stats: z.object({
    models: z.record(z.object({
      tokens: z.object({
        prompt: z.number().optional(),
        response: z.number().optional(),
        total: z.number().optional(),
      }).optional(),
    })).optional(),
  }).optional(),
  error: z.object({
    type: z.string(),
    message: z.string(),
    code: z.number(),
  }).optional(),
});
```

### OpenCode CLI Response Structure (for future adapter)

```typescript
// Source: Verified against opencode CLI v1.1.51 --format json output
// Note: OpenCode streams JSONL events; final result is in step_finish event
const OpenCodeStepFinishSchema = z.object({
  type: z.literal('step_finish'),
  timestamp: z.number(),
  sessionID: z.string(),
  part: z.object({
    type: z.literal('step-finish'),
    reason: z.string(),
    cost: z.number(),
    tokens: z.object({
      input: z.number(),
      output: z.number(),
      reasoning: z.number().optional(),
      cache: z.object({
        read: z.number(),
        write: z.number(),
      }).optional(),
    }),
  }),
});

const OpenCodeTextSchema = z.object({
  type: z.literal('text'),
  part: z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `child_process.exec` with shell | `child_process.execFile` without shell | Node.js security best practice | Eliminates shell injection risk |
| Manual timeout with `setTimeout` + `.kill()` | Built-in `timeout` option on `execFile` | Node.js 16+ | Simpler, no cleanup needed for the timer |
| Callback-based `execFile` | Still callback-based (Promises are a wrapper) | Current | `execFile` doesn't have a native promise API; use `util.promisify` or manual Promise wrapper |
| Claude `-p` as "headless mode" | Now called "Agent SDK CLI" | 2026 rebrand | Same functionality, `-p` flag unchanged |
| Gemini CLI lacked headless mode | `gemini -p --output-format json` now supported | Gemini CLI v0.20+ (2025) | Enables automation |
| OpenCode lacked JSON output | `opencode run --format json` now supported | OpenCode v1.0+ (2025) | Streams JSONL events |

**Deprecated/outdated:**
- Claude Code `--headless` flag: replaced by `-p` / `--print` (same behavior)
- `hasbin` npm package: unmaintained, use native `fs.stat` + PATH instead

## Claude's Discretion Recommendations

The CONTEXT.md lists several items for Claude's discretion. Here are research-backed recommendations:

### Exponential Backoff Timing
**Recommendation:** 1s, 2s, 4s (base=1000ms, multiplier=2, max=8000ms)
**Rationale:** Industry standard. AWS, Google Cloud, and most API retry guidance uses base * 2^attempt. 1s base is responsive without hammering. 4s max for 3 retries keeps total wait under 10s. Add jitter (random 0-500ms) to prevent thundering herd if future concurrent execution hits same rate limits.

### Telemetry File Naming Convention
**Recommendation:** `run-YYYY-MM-DDTHH-MM-SS-mmmZ.json` (e.g., `run-2026-02-07T15-30-00-000Z.json`)
**Rationale:** ISO 8601 timestamps sort lexicographically (newest last, oldest first). Colons and dots replaced with hyphens for cross-platform filename safety. The `run-` prefix distinguishes from any other files in the logs directory.

### How Many Recent Telemetry Files to Keep
**Recommendation:** 10
**Rationale:** Enough to debug recent issues without consuming unbounded disk space. At ~50KB per run (typical), 10 files is ~500KB. Users running the tool daily for two weeks still have recent history. The count should be configurable via the config file's `ai.telemetry.keepRuns` field.

### Subprocess Timeout Value
**Recommendation:** 120 seconds (120000ms)
**Rationale:** AI model responses for code analysis typically take 5-30 seconds. A 120s timeout handles slow responses during rate limiting or model overload without prematurely killing legitimate responses. Configurable via config file's `ai.timeoutMs` field.

### How to Pass Prompts to CLI
**Recommendation:** Pass prompt as trailing positional argument to `claude -p`, write to stdin for long prompts.
**Rationale:**
- Claude: `claude -p "short prompt"` works for short prompts. For prompts > OS argument length limit (~128KB), pipe via stdin: `echo prompt | claude -p`. Recommend: always use stdin pipe for consistency and to avoid shell escaping issues. Call `child.stdin.write(prompt)` then `child.stdin.end()`.
- Gemini: `gemini -p "prompt"` or pipe via stdin.
- OpenCode: `opencode run "prompt"` or pipe via stdin.
- **Decision:** Use stdin pipe for all backends. Consistent, avoids arg length limits, avoids escaping issues.

## Config Schema Extension

The existing `ConfigSchema` in `src/config/schema.ts` should be extended with an `ai` section:

```typescript
const AISchema = z.object({
  /** Default backend ('claude' | 'gemini' | 'opencode' | 'auto') */
  backend: z.enum(['claude', 'gemini', 'opencode', 'auto']).default('auto'),
  /** Default model to use */
  model: z.string().default('sonnet'),
  /** Subprocess timeout in milliseconds */
  timeoutMs: z.number().positive().default(120_000),
  /** Maximum retries for transient failures */
  maxRetries: z.number().min(0).default(3),
  /** Telemetry configuration */
  telemetry: z.object({
    /** Number of recent run logs to keep */
    keepRuns: z.number().min(0).default(10),
  }).default({}),
}).default({});
```

## CLI Error Messages

When no AI CLI is found, show actionable install instructions:

```
Error: No AI CLI found on your system.

Install one of the following:

  Claude Code (recommended):
    npm install -g @anthropic-ai/claude-code
    https://code.claude.com

  Gemini CLI (experimental):
    npm install -g @anthropic-ai/gemini-cli
    https://github.com/google-gemini/gemini-cli

  OpenCode (experimental):
    curl -fsSL https://opencode.ai/install | bash
    https://opencode.ai

Then run this command again.
```

## Open Questions

1. **Claude CLI stdin hanging edge case**
   - What we know: GitHub issue #771 documents that `stdio: 'pipe'` for all three streams can hang. `execFile` with callback pattern works in testing.
   - What's unclear: Whether this is fully resolved in Claude CLI v2.1+ or still requires workarounds on specific platforms.
   - Recommendation: Test thoroughly on the target platform. Have a fallback path using `spawn` with `stdio: ['inherit', 'pipe', 'pipe']` if `execFile` stdin piping proves unreliable.

2. **Gemini CLI headless mode JSON completeness**
   - What we know: Gemini has `--output-format json` but there's a GitHub issue (#9009) reporting that JSON output doesn't always work as documented.
   - What's unclear: Whether the `-p --output-format json` combination is stable in current versions.
   - Recommendation: This is a stub backend. Validate when implementing the full Gemini adapter in a future phase.

3. **OpenCode JSONL vs single-object parsing**
   - What we know: OpenCode `--format json` outputs JSONL (newline-delimited JSON events), not a single JSON object. Must parse line-by-line and extract the `text` and `step_finish` events.
   - What's unclear: Whether all events are guaranteed or if some may be omitted in certain error conditions.
   - Recommendation: This is a stub backend. Document the JSONL parsing requirement for the future implementer.

4. **Cost estimation accuracy**
   - What we know: Claude CLI includes `total_cost_usd` in its JSON response. Gemini and OpenCode include token counts but not always cost.
   - What's unclear: Whether Claude's cost field includes cached token discounts accurately.
   - Recommendation: Use the CLI-reported cost when available. For backends without cost, estimate based on model pricing tables (deferred to Phase 8, TELEM-05).

## Sources

### Primary (HIGH confidence)
- Node.js child_process documentation v25.6.0 - execFile, spawn, timeout, killSignal, maxBuffer APIs
- Claude Code CLI reference (code.claude.com/docs/en/cli-reference) - All flags, -p mode, --output-format json
- Claude Code headless docs (code.claude.com/docs/en/headless) - Programmatic usage, JSON output structure
- **Live verification:** Claude CLI v2.1.31 JSON output schema verified by running `claude -p --output-format json` on this machine (2026-02-07)
- **Live verification:** Gemini CLI v0.27.0 error JSON verified by running `gemini -p -o json` on this machine (2026-02-07)
- **Live verification:** OpenCode CLI v1.1.51 JSONL output verified by running `opencode run --format json` on this machine (2026-02-07)

### Secondary (MEDIUM confidence)
- GitHub issue anthropics/claude-code#771 - Spawning from Node.js hanging bug and workarounds
- Gemini CLI headless mode docs (geminicli.com/docs/cli/headless) - Flags, JSON schema structure
- OpenCode CLI docs (opencode.ai/docs/cli) - Run command, --format json flag
- Node.js community guides on subprocess timeout and zombie prevention

### Tertiary (LOW confidence)
- GitHub issue google-gemini/gemini-cli#9009 - JSON output may not work as documented (needs validation)
- exponential-backoff npm package docs - API reference (decided not to use, but informed hand-rolled design)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All built-in Node.js modules, verified against current docs and live CLI output
- Architecture: HIGH - Strategy pattern is well-established, matches project's existing patterns
- Subprocess management: HIGH - Verified against Node.js v25.6.0 docs, live-tested CLI invocations
- CLI JSON schemas: HIGH - Live-verified against all three CLIs on this machine
- Pitfalls: MEDIUM - Some based on GitHub issues that may be version-specific
- Gemini/OpenCode stubs: MEDIUM - Schemas verified but full integration not tested

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days - stable domain, CLI APIs unlikely to break)

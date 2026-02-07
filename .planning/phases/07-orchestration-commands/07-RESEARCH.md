# Phase 7: Orchestration & Commands - Research

**Researched:** 2026-02-07
**Domain:** CLI command orchestration, concurrent AI subprocess execution, progress reporting, change detection
**Confidence:** HIGH

## Summary

This phase wires the Phase 6 AI service layer into the existing generate, update, and discover commands so the tool directly orchestrates AI analysis via CLI subprocesses. The core challenge is threefold: (1) concurrent execution of multiple AI calls with configurable parallelism, (2) real-time progress reporting as files are processed, and (3) replacing the current placeholder analysis in commands with actual AI-driven analysis.

The existing codebase already has all the building blocks: `AIService.call()` for making AI calls with retry and telemetry, `ExecutionPlan` with a dependency graph (file tasks, directory tasks, root tasks), prompt templates for every file type, `.sum` file writers, `AGENTS.md` generators, and a config schema with AI settings. The key gap is that `generate` currently outputs a plan for a host LLM to execute, and `update` creates placeholder `.sum` files. Phase 7 replaces both with direct AI execution.

The concurrency model uses a zero-dependency iterator-based worker pool pattern (consistent with the project's no-unnecessary-deps philosophy). Progress output uses a streaming build-log style with `console.log` lines (not spinners or progress bars), matching the CONTEXT.md decision. The project already has `picocolors` for colored output and `simple-git` for change detection.

**Primary recommendation:** Build a `ConcurrencyPool<T>` utility using the shared-iterator/worker pattern with `Promise.allSettled`. Wire it into a new `CommandRunner` class that takes an `ExecutionPlan` and an `AIService`, processes file tasks concurrently, then directory tasks, then root tasks. Use `console.log`-based streaming progress (one line per file start/finish). Add `--concurrency`, `--fail-fast`, `--dry-run`, and `--quiet` CLI flags.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `src/ai/service.ts` (AIService) | Phase 6 | AI call orchestration with retry + telemetry | Already built and tested; single entry point for all AI calls |
| `src/generation/executor.ts` (ExecutionPlan) | Phase 5 | Dependency graph of file/directory/root tasks | Already has the task structure with dependencies and post-order traversal |
| `src/generation/prompts/` | Phase 4 | Prompt templates for all 11 file types | Already produces system + user prompt pairs per file |
| `src/generation/writers/sum.ts` | Phase 4 | `.sum` file writer/reader with frontmatter | Already handles content hash storage for change detection |
| `src/generation/writers/agents-md.ts` | Phase 4 | AGENTS.md generation from `.sum` files | Already synthesizes directory docs from file summaries |
| `picocolors` | ^1.1.1 | Colored terminal output | Already a project dependency, used throughout |
| `simple-git` | ^3.27.0 | Git operations for change detection | Already a project dependency, used by update command |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` | Built-in | SHA-256 content hashing | Change detection in update command (already used via `computeContentHash`) |
| `node:fs/promises` | Built-in | File I/O | Reading source files, writing outputs |
| `node:path` | Built-in | Path manipulation | Already used everywhere |
| `zod` | ^3.24.1 | Config schema validation | Already used for config; extend with concurrency settings |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled concurrency pool | `p-limit` (v7.0.0, 80M weekly downloads) | Adds dependency for ~30 lines of code; project avoids unnecessary deps |
| Hand-rolled concurrency pool | `p-queue` (v8.0.1) | Much more than needed -- full queue with priorities, pausing; overkill |
| `console.log` streaming output | `ora` spinner (already in package.json) | CONTEXT.md explicitly chose "streaming log style" over spinners; `ora` not imported anywhere |
| `console.log` streaming output | `cli-progress` progress bar | CONTEXT.md chose scrolling build-log style, not progress bars |
| `console.log` streaming output | `listr2` task runner | Heavy dependency, complex API; project wants simple scrolling logs |

**Installation:**
```bash
# No new dependencies needed -- all built-in Node.js modules + existing project deps
# Consider removing unused `ora` from package.json during this phase
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── ai/                          # Phase 6 (unchanged)
│   ├── index.ts
│   ├── service.ts               # AIService.call(), AIService.finalize()
│   └── ...
├── cli/                         # MODIFIED: commands wire in AI service
│   ├── index.ts                 # Add --concurrency, --fail-fast flags
│   ├── generate.ts              # REWRITE: use CommandRunner + AIService
│   ├── update.ts                # REWRITE: use AIService for analysis
│   └── discover.ts              # MINOR: restructure for AI service pipeline
├── orchestration/               # NEW: concurrent execution engine
│   ├── index.ts                 # Public API exports
│   ├── pool.ts                  # ConcurrencyPool<T> utility
│   ├── runner.ts                # CommandRunner: plan + AIService -> execution
│   ├── progress.ts              # ProgressReporter: streaming log output
│   └── types.ts                 # FileResult, RunSummary, ProgressEvent
├── generation/                  # EXTENDED: AI-driven analysis
│   ├── orchestrator.ts          # Existing plan creation (unchanged)
│   ├── executor.ts              # Existing ExecutionPlan (unchanged)
│   ├── prompts/                 # Existing prompt templates (unchanged)
│   └── writers/                 # Existing file writers (unchanged)
├── update/                      # MODIFIED: use AIService for analysis
│   └── orchestrator.ts          # Wire in AI-backed analyzeFile
└── config/
    └── schema.ts                # EXTENDED: add concurrency config
```

### Pattern 1: Iterator-Based Concurrency Pool

**What:** A zero-dependency concurrency limiter using shared iterators across N worker coroutines. Workers pull from a shared iterator so exactly N tasks execute concurrently, with new tasks starting as previous ones complete.

**When to use:** Processing the file task array from ExecutionPlan with configurable parallelism (default 5).

**Example:**
```typescript
// Source: Standard JavaScript shared-iterator pattern
// Verified: https://maximorlov.com/parallel-tasks-with-pure-javascript/

interface PoolResult<T> {
  index: number;
  value?: T;
  error?: Error;
}

async function runPool<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  onTaskComplete?: (index: number, result: PoolResult<T>) => void,
): Promise<PoolResult<T>[]> {
  const results: PoolResult<T>[] = [];

  async function worker(iterator: IterableIterator<[number, () => Promise<T>]>) {
    for (const [index, task] of iterator) {
      try {
        const value = await task();
        const result: PoolResult<T> = { index, value };
        results[index] = result;
        onTaskComplete?.(index, result);
      } catch (error) {
        const result: PoolResult<T> = {
          index,
          error: error instanceof Error ? error : new Error(String(error)),
        };
        results[index] = result;
        onTaskComplete?.(index, result);
      }
    }
  }

  const iterator = tasks.entries();
  const workers = new Array(concurrency).fill(iterator).map(worker);
  await Promise.allSettled(workers);

  return results;
}
```

### Pattern 2: Streaming Build-Log Progress Reporter

**What:** A class that receives progress events (file started, file completed, file failed) and writes one line per event to stdout. Shows X of Y progress, file path, timing, and tokens used.

**When to use:** During concurrent AI execution to give the user real-time feedback.

**Example:**
```typescript
// Source: CONTEXT.md decision -- streaming log style
import pc from 'picocolors';

interface ProgressEvent {
  type: 'start' | 'done' | 'error';
  filePath: string;
  index: number;
  total: number;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  model?: string;
  error?: string;
}

function formatProgress(event: ProgressEvent): string {
  const counter = pc.dim(`[${event.index + 1}/${event.total}]`);

  if (event.type === 'start') {
    return `${counter} ${pc.cyan('ANALYZING')} ${event.filePath}`;
  }

  if (event.type === 'done') {
    const time = pc.dim(`${(event.durationMs! / 1000).toFixed(1)}s`);
    const tokens = pc.dim(`${event.tokensIn}/${event.tokensOut} tok`);
    return `${counter} ${pc.green('DONE')} ${event.filePath} ${time} ${tokens}`;
  }

  // error
  return `${counter} ${pc.red('FAIL')} ${event.filePath} ${pc.dim(event.error ?? 'unknown')}`;
}
```

### Pattern 3: Three-Phase Execution Pipeline

**What:** Commands execute in three sequential phases matching the ExecutionPlan dependency graph: (1) file tasks in parallel with concurrency limit, (2) directory tasks in post-order (deepest first), (3) root document tasks. Each phase waits for the previous to complete.

**When to use:** The `generate` command follows this pipeline. The `update` command uses only phase 1 (file analysis) plus directory regeneration.

**Example:**
```typescript
// Phase 1: File analysis (concurrent)
const fileResults = await runPool(
  fileTasks.map(task => () => analyzeFile(aiService, task)),
  concurrency,
  (index, result) => reporter.report(/* ... */),
);

// Phase 2: Directory AGENTS.md (sequential, post-order)
for (const dirTask of directoryTasks) {
  await generateDirectoryDoc(aiService, dirTask);
  reporter.report(/* ... */);
}

// Phase 3: Root documents (sequential)
for (const rootTask of rootTasks) {
  await generateRootDoc(aiService, rootTask);
  reporter.report(/* ... */);
}
```

### Pattern 4: Parse AI Response into SumFileContent

**What:** Take the AI response text and construct the `SumFileContent` object for `.sum` file writing. The AI response is the summary text; metadata is extracted from the response or filled from known file analysis data.

**When to use:** After each successful AI call for a file task, before writing the `.sum` file.

**Example:**
```typescript
async function processFileTask(
  aiService: AIService,
  task: ExecutionTask,
  projectRoot: string,
): Promise<FileTaskResult> {
  const response = await aiService.call({
    prompt: task.userPrompt,
    systemPrompt: task.systemPrompt,
  });

  const contentHash = await computeContentHash(task.absolutePath);

  const sumContent: SumFileContent = {
    summary: response.text,
    metadata: {
      purpose: extractPurpose(response.text),
      publicInterface: [],
      dependencies: [],
      patterns: [],
    },
    fileType: task.metadata.fileType ?? 'generic',
    generatedAt: new Date().toISOString(),
    contentHash,
  };

  await writeSumFile(task.absolutePath, sumContent);

  return {
    path: task.path,
    success: true,
    tokensIn: response.inputTokens,
    tokensOut: response.outputTokens,
    durationMs: response.durationMs,
    model: response.model,
  };
}
```

### Pattern 5: ETA Calculation via Moving Average

**What:** Calculate estimated time remaining using a moving average of per-file completion times. More stable than instantaneous rate.

**When to use:** In the progress reporter, after at least 2 files complete.

**Example:**
```typescript
class ETACalculator {
  private completionTimes: number[] = [];
  private readonly windowSize: number;

  constructor(windowSize = 10) {
    this.windowSize = windowSize;
  }

  recordCompletion(durationMs: number): void {
    this.completionTimes.push(durationMs);
    if (this.completionTimes.length > this.windowSize) {
      this.completionTimes.shift();
    }
  }

  getETA(remaining: number): number | null {
    if (this.completionTimes.length < 2) return null;
    const avg = this.completionTimes.reduce((a, b) => a + b, 0) / this.completionTimes.length;
    return Math.round(avg * remaining);
  }

  formatETA(remaining: number): string {
    const eta = this.getETA(remaining);
    if (eta === null) return '';
    const seconds = Math.round(eta / 1000);
    if (seconds < 60) return `~${seconds}s remaining`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `~${minutes}m ${secs}s remaining`;
  }
}
```

### Anti-Patterns to Avoid

- **Batching instead of pooling:** Using `Promise.all` on chunks of N tasks waits for the slowest in each batch. The shared-iterator pool keeps all N slots busy continuously.
- **Modifying the file walker for concurrency:** The discovery/walker module should remain unchanged. Concurrency applies to AI calls, not file discovery.
- **Global mutable state for progress:** Each command run should create its own progress reporter and concurrency pool. No module-level singletons.
- **Retrying at the pool level:** Retry is already handled inside `AIService.call()`. The pool should NOT add another retry layer -- that would cause retry-of-retry cascading.
- **Blocking on progress output:** `console.log` is synchronous and non-blocking for stdout. Do not use `process.stdout.write` with cursor manipulation for concurrent output -- it corrupts when multiple workers write simultaneously. Simple line-based logging is correct.
- **Modifying ExecutionPlan structure:** The execution plan already has the right dependency graph. Phase 7 consumes it, not modifies it.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AI call + retry + telemetry | Custom subprocess logic in commands | `AIService.call()` from Phase 6 | Already handles timeout, rate limit retry, error telemetry, response parsing |
| Backend detection (is CLI available?) | Per-command CLI detection | `resolveBackend()` from Phase 6 | Single entry point, actionable install instructions on failure |
| Run-level telemetry summary | Custom token counting | `AIService.finalize()` + `AIService.getSummary()` | Already computes totals for calls, tokens, cost, duration, errors |
| Prompt generation per file | Custom prompt strings | `buildPrompt()` / `buildChunkPrompt()` from generation/prompts | Already has 11 templates with file type detection |
| .sum file writing | Custom YAML/markdown formatting | `writeSumFile()` from generation/writers | Already handles frontmatter, content hash, metadata arrays |
| AGENTS.md generation | Custom directory doc builder | `writeAgentsMd()` from generation/writers | Already reads .sum files, groups by category, synthesizes description |
| Change detection | Custom git diff parsing | `computeContentHash()` + `readSumFile()` from existing modules | Content hash comparison already implemented in update orchestrator |
| Config parsing | Manual flag-to-config mapping | `loadConfig()` + Zod schema defaults | Already validates and provides defaults for all settings |

**Key insight:** Phase 7's main job is WIRING, not building. The AI service, prompt generation, file writing, and change detection all exist. The new code is: (1) a concurrency pool, (2) a progress reporter, (3) command rewrites that connect these pieces.

## Common Pitfalls

### Pitfall 1: Concurrent Writes to Same Directory

**What goes wrong:** Multiple workers try to write `.sum` files to the same directory simultaneously, and `mkdir({ recursive: true })` races with file writes.

**Why it happens:** Two files in the same directory finish AI analysis at the same moment. Both call `writeSumFile` which calls `mkdir`.

**How to avoid:** `mkdir({ recursive: true })` is safe to call concurrently on the same path -- Node.js handles this gracefully (it's a no-op if the directory already exists). The `.sum` files themselves have unique names (one per source file), so there's no write collision. This is a non-issue, but verify it early.

**Warning signs:** `EEXIST` errors from `mkdir`. (Should not happen with `recursive: true`.)

### Pitfall 2: Interleaved Progress Output

**What goes wrong:** Progress lines from concurrent workers get interleaved, making output hard to read.

**Why it happens:** Multiple AI calls complete near-simultaneously, triggering multiple `console.log` calls.

**How to avoid:** This is actually the DESIRED behavior per CONTEXT.md ("streaming log style, scrolling build-log output"). Each line is atomic (single `console.log` call), so lines won't be corrupted. The interleaved order simply reflects actual parallel execution. Do NOT try to batch or serialize output.

**Warning signs:** N/A -- interleaved output is the design choice.

### Pitfall 3: Fail-Fast Not Cancelling In-Flight Tasks

**What goes wrong:** With `--fail-fast`, a file failure should stop processing, but N-1 in-flight AI calls continue running until they complete.

**Why it happens:** The shared-iterator pattern processes tasks one at a time per worker, but in-flight calls (already started) cannot be cancelled.

**How to avoid:** Use a shared `aborted` flag. Workers check the flag before pulling the next task from the iterator. In-flight calls finish naturally (they've already incurred the API cost). After all workers exit, report that remaining tasks were skipped.

**Warning signs:** `--fail-fast` appears to ignore the flag because in-flight tasks still produce output.

### Pitfall 4: Update Command Double-Processing

**What goes wrong:** The update command's current change detection (frontmatter content hash comparison) identifies files to re-analyze, but if the AI analysis fails and the old `.sum` is kept, the next `are update` run will try the same file again.

**Why it happens:** By design -- CONTEXT.md says "on per-file AI failure: skip the file, keep existing .sum unchanged." The content hash still mismatches, so it's re-detected next run.

**How to avoid:** This is actually the correct behavior (natural retry on next run). Document it in the command output: "N files failed, re-run to retry." Do NOT add a retry manifest.

**Warning signs:** Users seeing the same files on every update run. The solution is to fix the underlying AI failure, not suppress the retry detection.

### Pitfall 5: Non-Zero Exit Code Design

**What goes wrong:** Inconsistent exit codes confuse CI pipelines.

**Why it happens:** Multiple failure modes: all files fail, some files fail, AI CLI not found, config errors.

**How to avoid:** Define a clear exit code scheme:
- `0`: All files processed successfully
- `1`: Partial failure (some files failed, some succeeded)
- `2`: Complete failure (no files processed, or AI CLI not found)
This is Claude's Discretion per CONTEXT.md -- recommend this scheme.

**Warning signs:** CI pipelines not catching partial failures, or treating all non-zero as the same error.

### Pitfall 6: Prompt Size Exceeding AI Context Window

**What goes wrong:** Sending a 50,000-token file content as a prompt overwhelms the AI model's context window, causing timeouts or truncated responses.

**Why it happens:** The existing prompt builder includes the full file content in the user prompt. For large files, the chunking system is supposed to split them.

**How to avoid:** The existing `needsChunking()` function in `generation/budget/` already detects large files and the orchestrator creates chunk tasks. Ensure the concurrency runner processes chunk tasks sequentially for the same file (chunks 1, 2, 3 then synthesis). The ExecutionPlan already encodes this via task types.

**Warning signs:** AI timeouts or `PARSE_ERROR` on large files that should have been chunked.

### Pitfall 7: Concurrency Exhausting API Rate Limits

**What goes wrong:** With concurrency 5, five simultaneous AI calls all get rate-limited, causing cascading retries that amplify the problem.

**Why it happens:** The default concurrency (5) multiplied by the retry attempts (3) means up to 15 near-simultaneous calls when rate-limited.

**How to avoid:** The `AIService.call()` retry already uses exponential backoff with jitter, which naturally spreads out retries. The concurrency pool itself doesn't retry -- only AIService does. If rate limits are persistent, lower `--concurrency` to 2-3. Consider logging a warning when multiple concurrent calls hit rate limits ("Consider lowering --concurrency").

**Warning signs:** Most files failing with `RATE_LIMIT` errors. The telemetry summary will show a high retry count.

## Code Examples

### Complete Concurrency Pool Implementation

```typescript
// Source: Standard shared-iterator pattern
// Adapted for TypeScript with generics and abort support

export interface PoolOptions {
  /** Maximum concurrent workers */
  concurrency: number;
  /** Stop pulling new tasks on first error */
  failFast?: boolean;
}

export interface TaskResult<T> {
  index: number;
  success: boolean;
  value?: T;
  error?: Error;
}

export async function runPool<T>(
  tasks: Array<() => Promise<T>>,
  options: PoolOptions,
  onComplete?: (result: TaskResult<T>) => void,
): Promise<TaskResult<T>[]> {
  const results: TaskResult<T>[] = [];
  let aborted = false;

  async function worker(
    iterator: IterableIterator<[number, () => Promise<T>]>,
  ): Promise<void> {
    for (const [index, task] of iterator) {
      if (aborted) break;

      try {
        const value = await task();
        const result: TaskResult<T> = { index, success: true, value };
        results[index] = result;
        onComplete?.(result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const result: TaskResult<T> = { index, success: false, error };
        results[index] = result;
        onComplete?.(result);

        if (options.failFast) {
          aborted = true;
          break;
        }
      }
    }
  }

  const effectiveConcurrency = Math.min(options.concurrency, tasks.length);
  const iterator = tasks.entries();
  const workers = new Array(effectiveConcurrency)
    .fill(iterator)
    .map(worker);

  await Promise.allSettled(workers);
  return results;
}
```

### Command Runner Skeleton

```typescript
// Wire ExecutionPlan + AIService + ConcurrencyPool

import { AIService } from '../ai/index.js';
import type { ExecutionPlan, ExecutionTask } from '../generation/executor.js';
import { writeSumFile } from '../generation/writers/sum.js';
import { writeAgentsMd } from '../generation/writers/agents-md.js';
import { computeContentHash } from '../change-detection/index.js';
import { runPool, type PoolOptions } from './pool.js';

interface RunOptions extends PoolOptions {
  quiet?: boolean;
  debug?: boolean;
}

async function executeGeneratePlan(
  plan: ExecutionPlan,
  aiService: AIService,
  options: RunOptions,
): Promise<void> {
  const reporter = new ProgressReporter(plan.tasks.length, options.quiet);

  // Phase 1: File analysis (concurrent)
  const fileTasks = plan.fileTasks.map((task) => async () => {
    reporter.onStart(task);
    const response = await aiService.call({
      prompt: task.userPrompt,
      systemPrompt: task.systemPrompt,
    });
    const contentHash = await computeContentHash(task.absolutePath);
    await writeSumFile(task.absolutePath, {
      summary: response.text,
      metadata: { purpose: '', publicInterface: [], dependencies: [], patterns: [] },
      fileType: task.metadata.fileType ?? 'generic',
      generatedAt: new Date().toISOString(),
      contentHash,
    });
    return response;
  });

  await runPool(fileTasks, options, (result) => {
    reporter.onComplete(plan.fileTasks[result.index], result);
  });

  // Phase 2: Directory docs (sequential, post-order)
  for (const dirTask of plan.directoryTasks) {
    await writeAgentsMd(dirTask.absolutePath, plan.projectRoot);
    reporter.onDirectoryComplete(dirTask);
  }

  // Phase 3: Root documents (sequential)
  for (const rootTask of plan.rootTasks) {
    const response = await aiService.call({
      prompt: rootTask.userPrompt,
      systemPrompt: rootTask.systemPrompt,
    });
    // Write to rootTask.outputPath
    reporter.onRootComplete(rootTask);
  }

  // Finalize telemetry
  const { summary } = await aiService.finalize(plan.projectRoot);
  reporter.onRunComplete(summary);
}
```

### Progress Reporter with ETA

```typescript
import pc from 'picocolors';
import type { RunLog } from '../ai/types.js';

class ProgressReporter {
  private completed = 0;
  private failed = 0;
  private readonly total: number;
  private readonly quiet: boolean;
  private readonly startTime: number;
  private readonly completionTimes: number[] = [];

  constructor(total: number, quiet = false) {
    this.total = total;
    this.quiet = quiet;
    this.startTime = Date.now();
  }

  onStart(task: { path: string }): void {
    if (this.quiet) return;
    const counter = pc.dim(`[${this.completed + 1}/${this.total}]`);
    console.log(`${counter} ${pc.cyan('ANALYZING')} ${task.path}`);
  }

  onComplete(task: { path: string }, result: { success: boolean; value?: { durationMs: number; inputTokens: number; outputTokens: number; model: string } }): void {
    if (result.success && result.value) {
      this.completed++;
      this.completionTimes.push(result.value.durationMs);
      if (this.quiet) return;
      const counter = pc.dim(`[${this.completed}/${this.total}]`);
      const time = pc.dim(`${(result.value.durationMs / 1000).toFixed(1)}s`);
      const tokens = pc.dim(`${result.value.inputTokens}in/${result.value.outputTokens}out`);
      const eta = this.formatETA();
      console.log(`${counter} ${pc.green('DONE')} ${task.path} ${time} ${tokens}${eta}`);
    } else {
      this.failed++;
      if (this.quiet) return;
      const counter = pc.dim(`[${this.completed + this.failed}/${this.total}]`);
      console.log(`${counter} ${pc.red('FAIL')} ${task.path}`);
    }
  }

  onRunComplete(summary: RunLog['summary']): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log('');
    console.log(pc.bold('=== Run Summary ==='));
    console.log(`  Files processed: ${pc.green(String(this.completed))}`);
    if (this.failed > 0) {
      console.log(`  Files failed:    ${pc.red(String(this.failed))}`);
    }
    console.log(`  Total calls:     ${summary.totalCalls}`);
    console.log(`  Tokens in:       ${summary.totalInputTokens.toLocaleString()}`);
    console.log(`  Tokens out:      ${summary.totalOutputTokens.toLocaleString()}`);
    console.log(`  Total time:      ${elapsed}s`);
    console.log(`  Errors:          ${summary.errorCount}`);
  }

  private formatETA(): string {
    if (this.completionTimes.length < 2) return '';
    const recent = this.completionTimes.slice(-10);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const remaining = this.total - this.completed - this.failed;
    const etaMs = avg * remaining;
    const seconds = Math.round(etaMs / 1000);
    if (seconds < 60) return pc.dim(` ~${seconds}s remaining`);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return pc.dim(` ~${minutes}m${secs}s remaining`);
  }
}
```

### Config Schema Extension for Concurrency

```typescript
// Extend the existing GenerationSchema or add to root ConfigSchema
const ConcurrencyDefaults = {
  parallelism: 5,  // Default concurrent AI calls
};

// In ConfigSchema, extend the ai section:
const AISchema = z.object({
  // ... existing fields ...
  /** Default parallelism for concurrent AI calls */
  concurrency: z.number().min(1).max(20).default(5),
}).default({});
```

### Dry-Run Output Format

```typescript
// --dry-run lists files and estimated calls
function formatDryRun(plan: ExecutionPlan): string {
  const lines: string[] = [];
  lines.push(pc.bold('=== Dry Run ==='));
  lines.push(`Files to analyze: ${plan.fileTasks.length}`);
  lines.push(`Directories to document: ${plan.directoryTasks.length}`);
  lines.push(`Root documents: ${plan.rootTasks.length}`);
  lines.push(`Estimated AI calls: ${plan.tasks.length}`);
  lines.push('');

  for (const task of plan.fileTasks) {
    lines.push(`  ${pc.dim('+')} ${task.path} (${task.metadata.fileType})`);
  }

  return lines.join('\n');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tool outputs JSON plan for host LLM | Tool executes AI calls directly | Phase 7 (this phase) | No host AI required; tool is self-contained |
| Sequential file processing | Concurrent pool with configurable limit | Phase 7 (this phase) | 3-5x faster for multi-file projects |
| Placeholder summaries in update | AI-generated summaries via CLI subprocess | Phase 7 (this phase) | Real analysis instead of stub content |
| `--execute` flag for JSON output | Direct execution as default behavior | Phase 7 (this phase) | Simpler UX; `--execute`/`--stream` become legacy |
| No progress output | Streaming build-log with ETA | Phase 7 (this phase) | Users can monitor long-running analysis |

**Deprecated/outdated after Phase 7:**
- `--execute` flag: No longer needed; commands execute directly
- `--stream` flag: No longer needed; progress is built-in
- Placeholder summary text in update command: Replaced by real AI analysis
- "The host LLM will process each file" messaging: Tool does it now

## Open Questions

1. **Whether to keep `--execute` and `--stream` flags for backward compatibility**
   - What we know: These flags are part of the current CLI interface. Some users/scripts may depend on them.
   - What's unclear: Whether any real users depend on JSON plan output.
   - Recommendation: Keep them but mark as deprecated in `--help` output. They still work, but the default behavior is now direct execution.

2. **How to parse AI response text into structured metadata fields**
   - What we know: The `.sum` file needs `metadata.purpose`, `metadata.publicInterface`, etc. The AI response is free-form text.
   - What's unclear: Whether to ask the AI for structured output (JSON) or parse the markdown.
   - Recommendation: Instruct the AI via system prompt to include a metadata section at the end in a parseable format. Fall back to empty arrays if parsing fails. The summary text is the primary value; structured metadata is secondary.

3. **Whether directory-summary tasks should use AI or remain rule-based**
   - What we know: The current `writeAgentsMd` synthesizes directory descriptions from `.sum` metadata without AI. The ExecutionPlan has `directory-summary` tasks that could use AI.
   - What's unclear: Whether AI-generated directory summaries are worth the cost per directory.
   - Recommendation: For Phase 7, keep `writeAgentsMd` rule-based (no AI cost per directory). The AI-generated `.sum` files provide much richer metadata than the current placeholders, so the rule-based synthesis will already produce better results. AI directory summaries can be a future enhancement.

4. **Root document generation strategy**
   - What we know: CLAUDE.md, ARCHITECTURE.md, and supplementary docs are currently generated via static templates in `generation/writers/supplementary.ts`. The ExecutionPlan has `root-doc` tasks with AI prompts.
   - What's unclear: Whether root docs should use AI (one call per doc, each reading all AGENTS.md) or remain template-based.
   - Recommendation: Use AI for CLAUDE.md and ARCHITECTURE.md (high-value synthesis tasks). Keep supplementary docs (STACK.md, TESTING.md, etc.) template-based for Phase 7 since they analyze `package.json` and project structure rather than file content. AI-powered supplementary docs can come later.

5. **Whether `are discover` needs changes**
   - What we know: CONTEXT.md mentions CMD-03 (discover command improvements). The current discover command outputs file lists and optionally writes GENERATION-PLAN.md.
   - What's unclear: What "restructured for AI service pipeline" means specifically.
   - Recommendation: Minimal changes to discover: add the `--concurrency` flag parsing (for consistency), but the core behavior stays the same. Discover doesn't make AI calls -- it feeds the plan to generate.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: All source files in `src/ai/`, `src/cli/`, `src/generation/`, `src/update/`, `src/change-detection/`, `src/config/`, `src/output/` read and analyzed
- Phase 6 RESEARCH.md and PLAN files: Documented AI service architecture decisions
- Phase 7 CONTEXT.md: Locked decisions on progress style, concurrency model, error handling, command behavior
- Node.js `child_process` documentation: Verified subprocess patterns from Phase 6
- [Maxim Orlov - Parallel Tasks with Pure JavaScript](https://maximorlov.com/parallel-tasks-with-pure-javascript/) - Iterator-based concurrency pool pattern
- [Antoine Vastel - Task Pool No Deps NodeJS](https://antoinevastel.com/nodejs/2022/02/26/task-pool-no-deps-nodejs.html) - Pool class implementation

### Secondary (MEDIUM confidence)
- [p-limit npm](https://www.npmjs.com/package/p-limit) - Reviewed for API comparison (decided not to use, hand-roll instead)
- [p-queue npm](https://www.npmjs.com/package/p-queue) - Reviewed for API comparison (decided not to use, too heavy)
- [cli-progress npm](https://www.npmjs.com/package/cli-progress) - Reviewed for ETA calculation approach (decided to hand-roll per CONTEXT.md)
- [MDN Promise.allSettled](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled) - Standard reference for settled promise handling

### Tertiary (LOW confidence)
- Web search results for concurrent TypeScript patterns (multiple blog posts, cross-referenced with official docs)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All existing project modules verified by reading source code; no new dependencies needed
- Architecture: HIGH - Pattern follows directly from existing ExecutionPlan structure and CONTEXT.md decisions
- Concurrency pool: HIGH - Well-established pattern verified against multiple sources; simple enough to hand-roll
- Progress reporting: HIGH - CONTEXT.md locks the design (streaming logs); implementation is straightforward `console.log`
- Integration points: HIGH - All interfaces verified by reading actual source code (AIService.call, writeSumFile, writeAgentsMd, etc.)
- Pitfalls: MEDIUM - Some based on reasoning about concurrent execution; verify with testing
- Open questions: MEDIUM - Some design decisions need resolution during planning

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days - stable domain, all integration points are internal code)

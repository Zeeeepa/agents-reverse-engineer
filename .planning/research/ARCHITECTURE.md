# Architecture Research: AI Service Integration

**Domain:** AI service abstraction layer for CLI subprocess orchestration
**Researched:** 2026-02-07
**Confidence:** HIGH (based on thorough codebase analysis; MEDIUM for external CLI interface details due to unavailable web search)

## Executive Summary

The current architecture produces execution plans (JSON/streaming) that a host AI tool interprets and executes. The v2.0 change inverts this: ARE itself becomes the orchestrator, spawning AI CLI tools (claude, gemini, opencode) as subprocesses. This requires a new `src/ai/` service layer that sits between the existing orchestrator/executor and the file system writers, plus a telemetry system and a refactored `generate` command.

The key architectural insight is that the existing `ExecutionTask` interface already contains everything needed to drive an AI CLI -- system prompt, user prompt, output path, and dependencies. The AI service layer's job is to translate each `ExecutionTask` into a subprocess invocation, capture the output, and feed it to the existing writers.

---

## Current Architecture (v1.x)

### Data Flow: Before

```
User runs: are generate --execute
    |
    v
[CLI: generate.ts]
    |
    v
[Discovery] --> walkDirectory + applyFilters --> file list
    |
    v
[Orchestrator] --> createPlan() --> GenerationPlan
    |                                (files, tasks, budget, complexity)
    v
[Executor] --> buildExecutionPlan() --> ExecutionPlan
    |                                   (fileTasks, directoryTasks, rootTasks)
    v
[JSON Output] --> console.log(formatExecutionPlanAsJson())
    |
    v
HOST AI TOOL reads JSON, executes tasks, writes files
```

### Key Interfaces (Existing)

```typescript
// orchestrator.ts - Analysis task with prompts ready for LLM
interface AnalysisTask {
  type: 'file' | 'chunk' | 'synthesis' | 'directory-summary';
  filePath: string;
  systemPrompt: string;
  userPrompt: string;
  estimatedTokens: number;
  chunkInfo?: { index: number; total: number; startLine: number; endLine: number; };
  directoryInfo?: { sumFiles: string[]; fileCount: number; };
}

// executor.ts - Execution-ready task with dependencies
interface ExecutionTask {
  id: string;
  type: 'file' | 'chunk' | 'synthesis' | 'directory' | 'root-doc';
  path: string;
  absolutePath: string;
  systemPrompt: string;
  userPrompt: string;
  dependencies: string[];
  outputPath: string;
  metadata: { fileType?: string; chunkInfo?: {...}; directoryFiles?: string[]; depth?: number; packageRoot?: string; };
}

// executor.ts - Full plan with dependency graph
interface ExecutionPlan {
  projectRoot: string;
  tasks: ExecutionTask[];
  fileTasks: ExecutionTask[];        // Phase 1: parallel
  directoryTasks: ExecutionTask[];   // Phase 2: post-order
  rootTasks: ExecutionTask[];        // Phase 3: depends on dirs
  directoryFileMap: Record<string, string[]>;
}
```

### Component Map (Existing, Unchanged)

| Component | File | Responsibility | Status in v2.0 |
|-----------|------|----------------|-----------------|
| CLI Entry | `src/cli/index.ts` | Arg parsing, command routing | MODIFY (add flags) |
| Generate Command | `src/cli/generate.ts` | Discovery + plan + output | MAJOR REFACTOR |
| Update Command | `src/cli/update.ts` | Incremental updates | MODIFY LATER |
| Orchestrator | `src/generation/orchestrator.ts` | Create analysis plan | UNCHANGED |
| Executor | `src/generation/executor.ts` | Build dependency graph | UNCHANGED |
| Prompt Builder | `src/generation/prompts/builder.ts` | Build LLM prompts | UNCHANGED |
| Budget Tracker | `src/generation/budget/` | Token counting | UNCHANGED |
| Writers (sum) | `src/generation/writers/sum.ts` | Write .sum files | UNCHANGED |
| Writers (agents-md) | `src/generation/writers/agents-md.ts` | Write AGENTS.md | UNCHANGED |
| Writers (supplementary) | `src/generation/writers/supplementary.ts` | Write STACK.md etc. | UNCHANGED |
| Config | `src/config/schema.ts` | Zod config validation | EXTEND |
| Logger | `src/output/logger.ts` | Terminal output | EXTEND |
| Integration Detect | `src/integration/detect.ts` | Detect AI runtimes | REUSE |
| Change Detection | `src/change-detection/` | Git diff, content hash | UNCHANGED |

---

## Proposed Architecture (v2.0)

### Data Flow: After

```
User runs: are generate (no --execute needed)
    |
    v
[CLI: generate.ts] -- refactored, new flags: --backend, --concurrency
    |
    v
[Discovery] --> walkDirectory + applyFilters --> file list
    |              (UNCHANGED)
    v
[Orchestrator] --> createPlan() --> GenerationPlan
    |              (UNCHANGED)
    v
[Executor] --> buildExecutionPlan() --> ExecutionPlan
    |              (UNCHANGED)
    v
[NEW: AI Runner] --> Consumes ExecutionPlan
    |                 Respects dependency graph
    |                 Runs phases: files -> dirs -> root
    |
    |--- For each task in phase:
    |       |
    |       v
    |    [NEW: AI Backend] --> Spawns CLI subprocess
    |       |                  (claude, gemini, opencode)
    |       |                  Passes system prompt + user prompt
    |       |                  Captures stdout as LLM response
    |       |
    |       v
    |    [NEW: Response Parser] --> Extracts structured data
    |       |                       from LLM text output
    |       v
    |    [Existing Writers] --> writeSumFile(), writeAgentsMd(), etc.
    |       |
    |       v
    |    [NEW: Telemetry Logger] --> Records call metadata
    |
    v
[Output] --> .sum files, AGENTS.md hierarchy, telemetry logs
```

### New Component Inventory

| Component | Proposed Path | Responsibility | Dependencies |
|-----------|---------------|----------------|--------------|
| AI Backend Interface | `src/ai/backend.ts` | Abstract interface for AI CLI tools | None (pure types) |
| Claude Backend | `src/ai/backends/claude.ts` | Spawn `claude` CLI subprocess | `backend.ts`, `child_process` |
| Gemini Backend | `src/ai/backends/gemini.ts` | Spawn `gemini` CLI subprocess | `backend.ts`, `child_process` |
| OpenCode Backend | `src/ai/backends/opencode.ts` | Spawn `opencode` CLI subprocess | `backend.ts`, `child_process` |
| Backend Registry | `src/ai/backends/index.ts` | Backend discovery + factory | All backends, `integration/detect.ts` |
| AI Runner | `src/ai/runner.ts` | Execute plan via backends (concurrency, deps) | `backend.ts`, executor types |
| Response Parser | `src/ai/parser.ts` | Parse LLM text output into structured data | Writer types |
| Telemetry Logger | `src/ai/telemetry.ts` | Log per-call metrics as JSON | None |
| Inconsistency Detector | `src/ai/inconsistency.ts` | Detect code-vs-code and code-vs-doc issues | Writer types, prompts |

---

## Component Designs

### 1. AI Backend Interface (`src/ai/backend.ts`)

The abstraction that all CLI backends implement. The key design decision: backends accept a prompt and return text. They do NOT know about ExecutionTasks, .sum files, or AGENTS.md. That separation keeps backends simple and testable.

```typescript
/**
 * Configuration for an AI backend.
 */
export interface BackendConfig {
  /** CLI executable name (e.g., 'claude', 'gemini', 'opencode') */
  command: string;
  /** Maximum concurrent subprocess calls */
  maxConcurrency: number;
  /** Timeout per call in milliseconds */
  timeoutMs: number;
  /** Additional CLI flags */
  extraArgs?: string[];
}

/**
 * Input to an AI call.
 */
export interface AIRequest {
  /** System-level instructions */
  systemPrompt: string;
  /** User-level prompt (the actual question) */
  userPrompt: string;
  /** Task identifier for telemetry correlation */
  taskId: string;
  /** Files the LLM should read (absolute paths) */
  filesToRead?: string[];
}

/**
 * Output from an AI call.
 */
export interface AIResponse {
  /** Raw text output from the LLM */
  text: string;
  /** Whether the call succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Telemetry data captured during the call */
  telemetry: CallTelemetry;
}

/**
 * Per-call telemetry.
 */
export interface CallTelemetry {
  taskId: string;
  backend: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  exitCode: number;
  /** Full prompt sent (for debugging) */
  promptLength: number;
  /** Response length */
  responseLength: number;
}

/**
 * Abstract backend that all AI CLI adapters implement.
 */
export interface AIBackend {
  /** Backend name for display and telemetry */
  readonly name: string;
  /** Check if the CLI tool is available on PATH */
  isAvailable(): Promise<boolean>;
  /** Execute a single prompt and return the response */
  execute(request: AIRequest): Promise<AIResponse>;
  /** Gracefully shut down (kill any pending subprocesses) */
  shutdown(): Promise<void>;
}
```

**Why this interface shape:**
- `isAvailable()` lets the runner auto-detect which backend to use (reuses existing `integration/detect.ts` patterns)
- `execute()` is a single-call abstraction. The runner handles concurrency, batching, and retry logic externally
- `shutdown()` handles cleanup if the user Ctrl-C's mid-run
- `filesToRead` is optional; some backends (like Claude) support reading files directly via flags, while for others the content must be inlined in the prompt

### 2. Claude Backend (`src/ai/backends/claude.ts`)

Claude CLI supports a non-interactive `--print` mode (based on training knowledge; flag name may need verification):

```typescript
// Conceptual implementation
export class ClaudeBackend implements AIBackend {
  readonly name = 'claude';

  async isAvailable(): Promise<boolean> {
    // Check: which claude || claude --version
    return commandExists('claude');
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    const startedAt = new Date().toISOString();
    const start = performance.now();

    // Build command:
    // claude --print --system-prompt "..." "user prompt here"
    // OR pipe: echo "prompt" | claude --print --system-prompt "..."
    //
    // NOTE: Exact flags need verification against current Claude CLI docs.
    // The --print flag outputs response text to stdout without interactive UI.
    const args = buildClaudeArgs(request);

    const { stdout, stderr, exitCode } = await spawnAsync('claude', args, {
      timeout: this.config.timeoutMs,
      // Pass user prompt via stdin to avoid shell escaping issues
      input: request.userPrompt,
    });

    const durationMs = performance.now() - start;

    return {
      text: stdout,
      success: exitCode === 0,
      error: exitCode !== 0 ? stderr : undefined,
      telemetry: {
        taskId: request.taskId,
        backend: this.name,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        exitCode,
        promptLength: request.systemPrompt.length + request.userPrompt.length,
        responseLength: stdout.length,
        // Token counts parsed from stderr if available
      },
    };
  }
}
```

**IMPORTANT: CLI flag verification needed.** The exact flags for non-interactive mode differ between Claude CLI, Gemini CLI, and OpenCode. This is flagged as a research gap that must be resolved in the implementation phase. Known patterns from training data:

| Backend | Non-interactive flag (hypothesis) | Input method | Confidence |
|---------|-----------------------------------|--------------|------------|
| Claude CLI | `--print` or `-p` | stdin pipe or `--prompt` arg | MEDIUM |
| Gemini CLI | Unknown | Likely stdin pipe | LOW |
| OpenCode | Unknown | Unknown | LOW |

### 3. Gemini and OpenCode Backends

Same interface, different CLI invocation details. Each backend in `src/ai/backends/` follows the same pattern:

```
src/ai/backends/
  claude.ts     -- ClaudeBackend implements AIBackend
  gemini.ts     -- GeminiBackend implements AIBackend
  opencode.ts   -- OpenCodeBackend implements AIBackend
  index.ts      -- createBackend(name), detectAvailableBackends()
```

The `index.ts` factory uses the existing `integration/detect.ts` patterns for runtime detection:

```typescript
export async function detectAvailableBackends(): Promise<string[]> {
  const backends = [new ClaudeBackend(), new GeminiBackend(), new OpenCodeBackend()];
  const available: string[] = [];
  for (const b of backends) {
    if (await b.isAvailable()) available.push(b.name);
  }
  return available;
}

export function createBackend(name: string, config?: Partial<BackendConfig>): AIBackend {
  switch (name) {
    case 'claude': return new ClaudeBackend(config);
    case 'gemini': return new GeminiBackend(config);
    case 'opencode': return new OpenCodeBackend(config);
    default: throw new Error(`Unknown backend: ${name}`);
  }
}
```

### 4. AI Runner (`src/ai/runner.ts`)

The runner is the core orchestration component. It takes an `ExecutionPlan` and an `AIBackend`, then executes all tasks respecting the dependency graph.

```typescript
export interface RunnerOptions {
  /** Maximum parallel tasks per phase */
  concurrency: number;
  /** Retry failed tasks this many times */
  retries: number;
  /** Callback for progress reporting */
  onProgress?: (event: ProgressEvent) => void;
  /** Callback for telemetry capture */
  onTelemetry?: (entry: CallTelemetry) => void;
}

export interface RunResult {
  /** Tasks that completed successfully */
  succeeded: string[];
  /** Tasks that failed after retries */
  failed: Array<{ taskId: string; error: string }>;
  /** Total duration */
  durationMs: number;
  /** Aggregate telemetry */
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export class AIRunner {
  constructor(
    private backend: AIBackend,
    private parser: ResponseParser,
    private telemetry: TelemetryLogger,
    private options: RunnerOptions,
  ) {}

  /**
   * Execute a full plan: files -> directories -> root docs.
   *
   * Phases execute sequentially; within each phase, tasks run
   * with bounded concurrency.
   */
  async executePlan(plan: ExecutionPlan): Promise<RunResult> {
    // Phase 1: File tasks (parallel, no dependencies)
    await this.executePhase(plan.fileTasks, 'file-analysis');

    // Phase 2: Directory tasks (post-order, deepest first)
    // Within same depth, tasks can run in parallel
    await this.executePhase(plan.directoryTasks, 'directory-synthesis');

    // Phase 3: Root document tasks (depends on all dirs)
    await this.executePhase(plan.rootTasks, 'root-docs');
  }

  /**
   * Execute a set of tasks with bounded concurrency.
   */
  private async executePhase(tasks: ExecutionTask[], phaseName: string): Promise<void> {
    const semaphore = new Semaphore(this.options.concurrency);

    const promises = tasks.map(async (task) => {
      await semaphore.acquire();
      try {
        await this.executeTask(task);
      } finally {
        semaphore.release();
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Execute a single task: call backend -> parse response -> write output.
   */
  private async executeTask(task: ExecutionTask): Promise<void> {
    const request: AIRequest = {
      systemPrompt: task.systemPrompt,
      userPrompt: task.userPrompt,
      taskId: task.id,
      filesToRead: task.type === 'file' ? [task.absolutePath] : undefined,
    };

    const response = await this.backend.execute(request);
    this.telemetry.log(response.telemetry);

    if (!response.success) {
      throw new Error(`Task ${task.id} failed: ${response.error}`);
    }

    // Parse LLM response and write to appropriate output
    await this.parser.parseAndWrite(task, response.text);
  }
}
```

**Concurrency model:** A simple semaphore pattern rather than a work-stealing queue. File tasks are fully parallel (bounded). Directory tasks are already sorted deepest-first by the executor, so running them with concurrency works naturally -- a parent directory task will not start until its dependencies (child tasks) have been queued and completed first. This leverages the existing post-order sort in `executor.ts` without needing a separate dependency resolution step in the runner.

**Retry strategy:** Exponential backoff with jitter. AI CLI tools can fail due to rate limits, transient network errors, or process crashes. Three retries with 1s/2s/4s delays covers most transient failures.

### 5. Response Parser (`src/ai/parser.ts`)

Transforms raw LLM text output into structured data for the existing writers. This is the bridge between the new AI layer and the existing writer system.

```typescript
export class ResponseParser {
  /**
   * Parse LLM response and write to the appropriate output file.
   */
  async parseAndWrite(task: ExecutionTask, responseText: string): Promise<void> {
    switch (task.type) {
      case 'file':
      case 'chunk':
        return this.writeSum(task, responseText);
      case 'directory':
        return this.writeAgentsMd(task, responseText);
      case 'root-doc':
        return this.writeRootDoc(task, responseText);
    }
  }

  /**
   * Parse .sum content from LLM response.
   *
   * The LLM is prompted to output in .sum format (YAML frontmatter + prose).
   * This parser extracts the structured data and calls writeSumFile().
   */
  private async writeSum(task: ExecutionTask, responseText: string): Promise<void> {
    // Extract frontmatter fields from response
    // The existing prompts in prompts/templates.ts instruct the LLM
    // to output in .sum format. The parser validates and normalizes.
    const sumContent = this.parseSumResponse(responseText, task);
    await writeSumFile(task.absolutePath, sumContent);
  }

  /**
   * Write AGENTS.md from LLM-generated directory overview.
   */
  private async writeAgentsMd(task: ExecutionTask, responseText: string): Promise<void> {
    // For directory tasks, the LLM generates the full AGENTS.md content.
    // We wrap it with our generated marker for update detection.
    await writeFile(task.outputPath, wrapWithMarker(responseText));
  }

  /**
   * Write root document (CLAUDE.md, ARCHITECTURE.md, STACK.md, etc.)
   */
  private async writeRootDoc(task: ExecutionTask, responseText: string): Promise<void> {
    await writeFile(task.outputPath, wrapWithMarker(responseText));
  }
}
```

**Design consideration:** The parser must handle imperfect LLM output. The LLM may not produce valid YAML frontmatter every time. The parser should:
1. Try strict parsing first (exact .sum format)
2. Fall back to lenient parsing (extract fields with regex)
3. Fall back to raw text (wrap in minimal frontmatter with a warning)

This graceful degradation ensures the pipeline does not fail on a single malformed response.

### 6. Telemetry Logger (`src/ai/telemetry.ts`)

Writes one JSON log file per run with an entry per LLM call.

```typescript
export interface TelemetryRun {
  runId: string;
  startedAt: string;
  completedAt: string;
  backend: string;
  projectRoot: string;
  totalTasks: number;
  succeeded: number;
  failed: number;
  totalDurationMs: number;
  calls: CallTelemetry[];
}

export class TelemetryLogger {
  private calls: CallTelemetry[] = [];
  private runStart: number;

  constructor(
    private outputDir: string,  // e.g., .agents-reverse-engineer/telemetry/
    private backend: string,
  ) {
    this.runStart = performance.now();
  }

  log(entry: CallTelemetry): void {
    this.calls.push(entry);
  }

  async flush(succeeded: number, failed: number): Promise<string> {
    const run: TelemetryRun = {
      runId: crypto.randomUUID(),
      startedAt: new Date(Date.now() - (performance.now() - this.runStart)).toISOString(),
      completedAt: new Date().toISOString(),
      backend: this.backend,
      projectRoot: process.cwd(),
      totalTasks: this.calls.length,
      succeeded,
      failed,
      totalDurationMs: performance.now() - this.runStart,
      calls: this.calls,
    };

    const filename = `run-${run.startedAt.replace(/[:.]/g, '-')}.json`;
    const outputPath = path.join(this.outputDir, filename);
    await mkdir(this.outputDir, { recursive: true });
    await writeFile(outputPath, JSON.stringify(run, null, 2));
    return outputPath;
  }
}
```

**Storage location:** `.agents-reverse-engineer/telemetry/run-YYYY-MM-DDTHH-MM-SS.json`. One file per run. This directory should be added to `.gitignore` by default (telemetry is local debugging, not committed).

### 7. Inconsistency Detector (`src/ai/inconsistency.ts`)

Hooks into the analysis pipeline by augmenting prompts and parsing additional structured output from the LLM response.

```typescript
export interface Inconsistency {
  type: 'code-vs-code' | 'code-vs-doc';
  severity: 'info' | 'warning' | 'error';
  file: string;
  description: string;
  relatedFile?: string;
}

/**
 * Augment a system prompt with inconsistency detection instructions.
 */
export function augmentPromptForInconsistency(systemPrompt: string): string {
  return `${systemPrompt}

## Additional: Inconsistency Detection

While analyzing this file, look for inconsistencies:

**Code vs Code:**
- Function signatures that don't match their callers
- Imports of non-existent exports
- Type mismatches between interfaces and implementations
- Dead code or unreachable branches

**Code vs Documentation:**
- Comments that describe behavior different from the code
- README references to non-existent files or APIs
- JSDoc @param that don't match function parameters
- Outdated examples in documentation files

If you find any, include a section at the end of your response:

---INCONSISTENCIES---
[{"type":"code-vs-code","severity":"warning","description":"..."}]
---END-INCONSISTENCIES---

If no inconsistencies found, omit this section.`;
}

/**
 * Extract inconsistencies from LLM response text.
 */
export function extractInconsistencies(responseText: string, filePath: string): Inconsistency[] {
  const match = responseText.match(/---INCONSISTENCIES---\n([\s\S]*?)\n---END-INCONSISTENCIES---/);
  if (!match) return [];

  try {
    const items = JSON.parse(match[1]);
    return items.map((item: any) => ({ ...item, file: filePath }));
  } catch {
    return [];
  }
}
```

**Integration point:** The inconsistency detector is a prompt augmenter and response post-processor. It does NOT change the pipeline structure. The runner optionally calls `augmentPromptForInconsistency()` before sending to the backend, and `extractInconsistencies()` after receiving the response.

**Output:** Inconsistencies are collected per-run and written to `.agents-reverse-engineer/inconsistencies.json` alongside telemetry. They can also be surfaced in the terminal output via the logger.

---

## Integration Points with Existing Code

### 1. Generate Command Refactor (`src/cli/generate.ts`)

The generate command is the primary integration point. Currently it has three modes:
- Default: Print plan summary + instructions for host AI
- `--execute`: Output full JSON execution plan
- `--stream`: Output tasks as streaming JSON

v2.0 adds a new default mode (direct execution) while preserving existing modes for backward compatibility:

```
generate [path]
  Default (NEW):     Discover -> Plan -> Execute via AI backend
  --execute:         Discover -> Plan -> JSON output (PRESERVED)
  --stream:          Discover -> Plan -> Streaming JSON (PRESERVED)
  --dry-run:         Discover -> Plan -> Display summary (PRESERVED)
  --backend <name>:  Choose AI backend (claude/gemini/opencode/auto)
  --concurrency <n>: Max parallel tasks (default: 5)
  --no-telemetry:    Skip telemetry logging
  --detect-inconsistencies: Enable inconsistency detection
```

The refactored command follows this flow:

```typescript
// Simplified pseudocode for the refactored generate command
export async function generateCommand(targetPath: string, options: GenerateOptions): Promise<void> {
  // Steps 1-4 are IDENTICAL to current implementation
  const config = await loadConfig(absolutePath);
  const discoveryResult = await discover(absolutePath, config);
  const plan = await createOrchestrator(config, absolutePath, files.length).createPlan(discoveryResult);
  const executionPlan = buildExecutionPlan(plan, absolutePath);

  // Legacy modes preserved
  if (options.execute) { console.log(formatExecutionPlanAsJson(executionPlan)); return; }
  if (options.stream) { for (const line of streamTasks(executionPlan)) console.log(line); return; }
  if (options.dryRun) { console.log(formatPlan(plan)); return; }

  // NEW: Direct execution mode
  const backend = await resolveBackend(options.backend);
  const telemetry = new TelemetryLogger(telemetryDir, backend.name);
  const parser = new ResponseParser();
  const runner = new AIRunner(backend, parser, telemetry, {
    concurrency: options.concurrency ?? 5,
    retries: 3,
    onProgress: (event) => logger.info(formatProgress(event)),
    onTelemetry: (entry) => telemetry.log(entry),
  });

  const result = await runner.executePlan(executionPlan);
  await telemetry.flush(result.succeeded.length, result.failed.length);

  logger.info(`Done: ${result.succeeded.length} succeeded, ${result.failed.length} failed`);
}
```

### 2. Config Schema Extension (`src/config/schema.ts`)

Add AI service configuration to the existing Zod schema:

```typescript
const AIServiceSchema = z.object({
  /** Preferred backend: 'claude' | 'gemini' | 'opencode' | 'auto' */
  backend: z.enum(['claude', 'gemini', 'opencode', 'auto']).default('auto'),
  /** Max concurrent AI calls */
  concurrency: z.number().positive().default(5),
  /** Timeout per call in seconds */
  timeoutSeconds: z.number().positive().default(120),
  /** Enable telemetry logging */
  telemetry: z.boolean().default(true),
  /** Enable inconsistency detection */
  detectInconsistencies: z.boolean().default(false),
}).default({});

// Added to ConfigSchema
const ConfigSchema = z.object({
  exclude: ExcludeSchema,
  options: OptionsSchema,
  output: OutputSchema,
  generation: GenerationSchema,
  ai: AIServiceSchema,            // NEW
}).default({});
```

### 3. Logger Extension (`src/output/logger.ts`)

Add methods for AI execution progress:

```typescript
export interface Logger {
  // Existing methods...
  info(message: string): void;
  file(path: string): void;
  excluded(path: string, reason: string, filter: string): void;
  summary(included: number, excluded: number): void;
  warn(message: string): void;
  error(message: string): void;

  // New methods for AI execution
  taskStart(taskId: string, type: string): void;
  taskComplete(taskId: string, durationMs: number): void;
  taskFailed(taskId: string, error: string): void;
  phaseStart(phaseName: string, taskCount: number): void;
  phaseComplete(phaseName: string, succeeded: number, failed: number): void;
  inconsistency(item: Inconsistency): void;
}
```

### 4. Integration Detection Reuse (`src/integration/detect.ts`)

The existing `detectEnvironments()` function checks for `.claude/`, `.opencode/`, `.aider/` directories. The backend registry reuses this logic but also checks PATH availability:

```typescript
// src/ai/backends/index.ts
import { detectEnvironments } from '../../integration/detect.js';

export async function resolveBackend(preference: string): Promise<AIBackend> {
  if (preference !== 'auto') {
    const backend = createBackend(preference);
    if (await backend.isAvailable()) return backend;
    throw new Error(`Backend '${preference}' not found on PATH`);
  }

  // Auto-detect: try each in preference order
  const order = ['claude', 'gemini', 'opencode'];
  for (const name of order) {
    const backend = createBackend(name);
    if (await backend.isAvailable()) return backend;
  }

  throw new Error('No AI backend found. Install claude, gemini, or opencode CLI.');
}
```

---

## Streaming vs Batch Output Handling

### The Challenge

Different AI CLI tools produce output differently:

| Backend | Output behavior (hypothesis) | Confidence |
|---------|------------------------------|------------|
| Claude CLI | Likely streams to stdout line-by-line | MEDIUM |
| Gemini CLI | Unknown; may buffer or stream | LOW |
| OpenCode | Unknown | LOW |

### Recommended Approach: Capture Full Output

For v2.0, collect the complete stdout after the subprocess exits rather than streaming. Rationale:

1. **Simplicity:** All backends produce a string. No need for streaming parsers.
2. **Reliability:** The response parser needs the full text to extract frontmatter. Partial parsing is fragile.
3. **Telemetry accuracy:** Duration and token counts are only known after completion.
4. **Progress reporting:** Report task-level progress (started/completed) rather than token-level streaming.

```typescript
// Simple subprocess helper
async function spawnAsync(
  command: string,
  args: string[],
  options: { timeout: number; input?: string }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options.timeout,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    if (options.input) {
      proc.stdin.write(options.input);
      proc.stdin.end();
    }

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on('error', reject);
  });
}
```

**Future optimization:** If streaming becomes necessary (for very long responses or progress indication), add an optional `onChunk` callback to the backend interface. But defer this until there is a concrete need.

---

## File Structure: New and Modified

### New Files

```
src/ai/
  backend.ts              # AIBackend interface, AIRequest, AIResponse, CallTelemetry
  runner.ts               # AIRunner: plan execution with concurrency
  parser.ts               # ResponseParser: LLM text -> structured data -> writers
  telemetry.ts            # TelemetryLogger: per-run JSON log files
  inconsistency.ts        # Prompt augmentation + response extraction
  spawn.ts                # Subprocess helper (spawnAsync)
  backends/
    index.ts              # Backend factory + auto-detection
    claude.ts             # ClaudeBackend
    gemini.ts             # GeminiBackend
    opencode.ts           # OpenCodeBackend
```

### Modified Files

```
src/cli/generate.ts       # Refactor: add direct execution mode
src/cli/index.ts          # Add new flags: --backend, --concurrency, --no-telemetry
src/config/schema.ts      # Add ai: AIServiceSchema
src/output/logger.ts      # Add AI execution progress methods
```

### Unchanged Files

All files in:
- `src/discovery/` (walker, filters)
- `src/generation/orchestrator.ts`
- `src/generation/executor.ts`
- `src/generation/prompts/` (builder, templates, types)
- `src/generation/budget/` (tracker, counter, chunker)
- `src/generation/writers/` (sum, agents-md, supplementary)
- `src/generation/detection/` (detector, patterns)
- `src/generation/complexity.ts`
- `src/change-detection/` (detector, types)
- `src/integration/` (detect, generate, templates, types)
- `src/types/index.ts`
- `src/update/` (orchestrator, orphan-cleaner, types)

---

## Dependency Graph: Build Order

```
                 backend.ts (pure types)
                    |
        +-----------+-----------+
        |           |           |
   claude.ts    gemini.ts  opencode.ts
        |           |           |
        +-----------+-----------+
                    |
              backends/index.ts
                    |
        +-----------+-----------+
        |           |           |
    spawn.ts    parser.ts  telemetry.ts
        |           |           |
        +-----------+-----------+
                    |
              inconsistency.ts (optional augmenter)
                    |
                runner.ts (depends on all above)
                    |
              cli/generate.ts (refactored, depends on runner)
```

### Suggested Build Phases

**Phase 1: Foundation (no AI calls yet)**
1. `src/ai/backend.ts` -- Interface definitions only
2. `src/ai/spawn.ts` -- Subprocess utility
3. `src/ai/telemetry.ts` -- JSON logging (can test independently)
4. `src/config/schema.ts` -- Add `ai` section

**Phase 2: First Backend**
5. `src/ai/backends/claude.ts` -- Implement ClaudeBackend
6. `src/ai/backends/index.ts` -- Factory with just Claude
7. Integration test: verify Claude CLI subprocess works

**Phase 3: Parser + Runner**
8. `src/ai/parser.ts` -- Parse LLM responses into writer-compatible structures
9. `src/ai/runner.ts` -- Execute plans with concurrency
10. `src/output/logger.ts` -- Add progress methods
11. Integration test: end-to-end with Claude on a small project

**Phase 4: Generate Refactor**
12. `src/cli/generate.ts` -- Add direct execution mode
13. `src/cli/index.ts` -- Add new CLI flags
14. End-to-end test: `are generate` with auto-detected backend

**Phase 5: Additional Backends**
15. `src/ai/backends/gemini.ts`
16. `src/ai/backends/opencode.ts`
17. Cross-backend testing

**Phase 6: Inconsistency Detection**
18. `src/ai/inconsistency.ts`
19. Integrate into runner as optional augmenter
20. Add `--detect-inconsistencies` flag

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Backend Knows About Task Types

**Trap:** Putting .sum file parsing or AGENTS.md generation logic inside the backend.

**Why bad:** Backends should be generic "send prompt, get text" adapters. If a backend knows about .sum files, it cannot be reused for other purposes (like inconsistency detection or future features).

**Instead:** Backends return raw text. The `ResponseParser` handles all domain-specific parsing.

### Anti-Pattern 2: Inlining File Content in Prompts

**Trap:** Reading the source file and embedding it in the prompt text sent to the CLI subprocess.

**Why bad:** Large files can exceed command-line argument limits or stdin buffer sizes. Some CLIs have native file-reading capabilities that are more efficient.

**Instead:** Check if the backend supports a `--file` or `--read` flag. If yes, pass the file path as an argument. If no, use stdin piping with chunked writes. The `filesToRead` field in `AIRequest` supports this.

### Anti-Pattern 3: Global Mutable State for Concurrency

**Trap:** Using a global counter or shared queue for concurrency control.

**Why bad:** Makes testing impossible and creates race conditions.

**Instead:** The `AIRunner` owns a `Semaphore` instance per phase. The semaphore is local to the runner and passed explicitly.

### Anti-Pattern 4: Blocking on Individual Task Completion for Progress

**Trap:** Using a serial loop `for (const task of tasks) { await execute(task); }` for progress reporting.

**Why bad:** Destroys parallelism. A project with 200 files would take 200 sequential LLM calls instead of 200/concurrency parallel batches.

**Instead:** Use `Promise.allSettled()` with semaphore-gated execution. Report progress via callbacks (`onProgress`) that fire when tasks complete.

### Anti-Pattern 5: Tight Coupling to CLI Flag Syntax

**Trap:** Hardcoding `--print`, `--system-prompt`, etc. directly in the runner or command layer.

**Why bad:** CLI flag syntax changes between versions. A minor Claude CLI update could break everything.

**Instead:** Each backend encapsulates its own CLI argument construction. The runner only knows about the `AIBackend` interface, never about specific flags.

---

## Scalability Considerations

| Scale | Approach | Configuration |
|-------|----------|---------------|
| Small (<50 files) | concurrency=3, no batching | Default config works |
| Medium (50-500 files) | concurrency=5-10, telemetry for optimization | Increase concurrency in config |
| Large (500+ files) | concurrency=10+, consider rate limit backoff | May need backend-specific rate config |

### Rate Limiting

AI CLI tools may have built-in rate limiting. The runner should detect rate-limit signals:
- Exit code indicating rate limit (e.g., exit code 429 or specific error message)
- Automatic backoff: double wait time on rate limit, up to 60s
- Per-backend configuration for rate limit patterns

### Memory

Each concurrent task holds:
- The full file content in the prompt (~average 10KB)
- The full LLM response in stdout (~average 2KB)
- Telemetry entry (~0.5KB)

At concurrency=10, peak memory for task data is ~125KB. Negligible compared to Node.js baseline. The main memory concern is the `ExecutionPlan` itself, which holds all prompts. For very large projects (1000+ files), consider lazily building prompts.

---

## Open Questions and Research Gaps

| Question | Impact | How to Resolve |
|----------|--------|----------------|
| Exact Claude CLI non-interactive flags | HIGH -- needed for first backend | Test `claude --help` or read official docs during implementation |
| Gemini CLI subprocess interface | MEDIUM -- needed for second backend | Test `gemini --help` during Phase 5 |
| OpenCode CLI subprocess interface | MEDIUM -- needed for third backend | Test `opencode --help` during Phase 5 |
| Token count extraction from CLI output | LOW -- nice for telemetry | Check if CLIs report usage to stderr |
| Maximum stdin size for CLI tools | MEDIUM -- affects large file handling | Test empirically during integration tests |
| Rate limiting behavior per CLI | MEDIUM -- affects concurrency config | Test empirically, add adaptive backoff |

---

## Sources

- **Codebase analysis:** Direct reading of all source files in `src/` (HIGH confidence)
- **v1.0 Architecture Research:** `.planning/research/ARCHITECTURE.md` from 2026-01-25 (HIGH confidence for project patterns)
- **PROJECT.md:** `.planning/PROJECT.md` (HIGH confidence for v2.0 requirements)
- **CLI interface details for claude/gemini/opencode:** Based on training data only (MEDIUM-LOW confidence, needs verification)
- **Node.js child_process patterns:** Based on training data (HIGH confidence, stable API)

---

*Architecture research for: AI Service Integration into agents-reverse-engineer v2.0*
*Researched: 2026-02-07*

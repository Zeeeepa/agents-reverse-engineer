# Project Specification: agents-reverse-engineer

## 1. Project Overview

**Purpose:** Automate brownfield codebase documentation for AI coding assistants through parallel file analysis, hierarchical aggregation, and platform-specific synthesis.

**Core Value Proposition:** Solves AI assistant session amnesia by generating persistent, AI-optimized documentation corpus (`.sum` summaries, `AGENTS.md` hierarchies, root integration documents) from arbitrary codebases without manual annotation.

**Problem Solved:** Eliminates repetitive codebase re-explanation across AI assistant sessions by maintaining incremental documentation synchronized with source changes via SHA-256 content hashing.

**Technology Stack:**
- **Runtime:** Node.js ≥18.0.0 (native ES modules, `import.meta.url`, top-level await)
- **Language:** TypeScript 5.7.3 (ES2022 target, NodeNext module resolution, strict mode)
- **Core Libraries:**
  - `fast-glob` 3.x — file discovery with glob patterns and dotfile support
  - `ignore` 5.x — gitignore parsing engine
  - `isbinaryfile` 5.x — content-based binary detection
  - `simple-git` 3.x — git diff parsing with rename detection
  - `yaml` 2.x — YAML serialization without comments
  - `zod` 3.x — runtime schema validation with type inference
  - `ora` 8.x — terminal spinner UI
  - `picocolors` 1.x — ANSI color codes without dependencies
- **Development:** `tsx` (watch mode), `vitest` (testing), `@types/node` (type definitions)
- **Distribution:** npm with provenance attestation via GitHub Actions OIDC

## 2. Architecture

### System Design: Three-Phase Recursive Language Model (RLM) Pipeline

**Phase 1: Concurrent File Analysis**
- Worker pool executes file-level analysis tasks in parallel (configurable concurrency: 2-20)
- Each worker invokes AI CLI subprocess via `execFile()` with prompt containing source code and import context
- Subprocess returns markdown summary parsed from JSON response
- Results written to `.sum` files with YAML frontmatter embedding SHA-256 content hash

**Phase 2: Post-Order Directory Aggregation**
- Directories sorted by depth descending (deepest first) for bottom-up traversal
- Aggregation waits for all child `.sum` files to exist before processing directory
- Prompts include child summaries, manifest detection (9 package managers), import maps
- Outputs `AGENTS.md` files preserving user content via `AGENTS.local.md` prepending

**Phase 3: Sequential Root Synthesis**
- Collects all `AGENTS.md` files via recursive traversal
- Generates platform-specific integration documents (Claude, Gemini, OpenCode)
- Enforces synthesis-only constraint: no invention, all claims traceable to source documents

### Module Boundaries

**`src/cli/`** — Command routing and argument parsing, creates orchestrators, threads trace writers and progress loggers
**`src/ai/`** — Backend-agnostic subprocess management, retry logic, telemetry accumulation
**`src/discovery/`** — File walking with composable filter chain (gitignore → vendor → binary → custom)
**`src/generation/`** — Prompt construction, task dependency resolution, YAML frontmatter serialization
**`src/orchestration/`** — Iterator-based worker pool, progress tracking, NDJSON trace emission
**`src/update/`** — Hash-based change detection, orphan cleanup, affected directory propagation
**`src/quality/`** — Post-generation validators for code-doc consistency, duplicate symbols, phantom paths
**`src/config/`** — Zod schema validation, YAML parsing, resource-aware concurrency defaults
**`src/imports/`** — Regex-based import extraction, classification into internal/external
**`src/installer/`** — npx-driven command installation with hook registration mutating settings.json
**`src/integration/`** — Platform detection and template generation for IDE command systems

### Data Flow Patterns

**Discovery → Planning → Execution:**
```
discoverFiles() → ExecutionPlan → runPool() → writeSumFile()
                              ↓
                     buildExecutionPlan() (dependency ordering)
                              ↓
                     Phase 1: fileTasks (concurrent)
                     Phase 2: directoryTasks (post-order by depth)
                     Phase 3: rootTasks (sequential)
```

**Incremental Update:**
```
preparePlan() → readSumFile(content_hash) → computeContentHash()
            ↓
  filesToAnalyze (hash mismatch/missing)
  filesToSkip (hash match)
  orphans (deleted/renamed sources)
            ↓
  regenerate .sum → regenerate AGENTS.md → cleanupOrphans()
```

**Subprocess Invocation:**
```
AIService.call() → withRetry() → runSubprocess() → execFile()
                                              ↓
                              stdin.write(prompt) → parse JSON response
                                              ↓
                          TelemetryLogger.addEntry() → TraceWriter.emit()
```

### Key Design Decisions

**1. Iterator-Based Pool Over Batch Processing**
- **Decision:** Single shared `tasks.entries()` iterator across N workers
- **Rationale:** Prevents batch anti-pattern where workers idle waiting for slowest batch member
- **Alternative Rejected:** Pre-partitioning tasks into N batches (inefficient slot utilization)

**2. Hash-Based Change Detection Over Git Diffing**
- **Decision:** SHA-256 content hashes embedded in `.sum` YAML frontmatter
- **Rationale:** Stateless operation without external database, works in non-git environments
- **Alternative Rejected:** Git diff comparison (requires versioned repository, complex merge handling)

**3. Subprocess Per File Over Single Long-Running Process**
- **Decision:** Spawn AI CLI subprocess for each file analysis
- **Rationale:** Isolates crashes, enforces memory limits, prevents context leakage
- **Alternative Rejected:** Persistent subprocess with JSON-RPC (complex state management, memory accumulation)

**4. Promise-Chain Serialization Over Locks**
- **Decision:** `writeQueue = writeQueue.then(() => writeFile())` pattern
- **Rationale:** Async-friendly serialization without blocking primitives, preserves NDJSON line order
- **Alternative Rejected:** Mutex-based locking (blocking, no async/await support in Node.js stdlib)

**5. Regex-Based Import Extraction Over AST Parsing**
- **Decision:** Single regex pattern with five capture groups
- **Rationale:** Fast, zero-dependency, covers 95% of CommonJS/ESM patterns
- **Alternative Rejected:** Full AST parsing (heavy dependencies, performance overhead for metadata-only use case)

## 3. Public API Surface

### CLI Commands

**`are init`**
```typescript
function initCommand(args: ParsedArgs): Promise<void>
// Creates .agents-reverse-engineer/config.yaml
// Exits with code 1 on permission errors (EACCES/EPERM)
```

**`are discover`**
```typescript
function discoverCommand(args: ParsedArgs): Promise<void>
// Writes GENERATION-PLAN.md with three-phase breakdown
// Emits discovery:start/end trace events
```

**`are generate`**
```typescript
function generateCommand(args: ParsedArgs): Promise<void>
// Exit codes: 0 (success), 1 (partial failure), 2 (total failure)
// Flags: --dry-run, --concurrency N, --debug, --trace, --fail-fast
```

**`are update`**
```typescript
function updateCommand(args: ParsedArgs): Promise<void>
// Flags: --uncommitted (include working tree changes)
// Returns UpdateResult with analyzedFiles[], skippedFiles[], cleanup
```

**`are specify`**
```typescript
function specifyCommand(args: ParsedArgs): Promise<void>
// Flags: --multi-file, --force, --output <path>
// Throws SpecExistsError when target exists without --force
```

**`are clean`**
```typescript
function cleanCommand(args: ParsedArgs): Promise<void>
// Deletes .sum, AGENTS.md (generated only), CLAUDE.md, GENERATION-PLAN.md
// Restores AGENTS.local.md → AGENTS.md
```

### Core Types

**`Config`**
```typescript
interface Config {
  exclude: {
    patterns: string[];          // Gitignore-style globs
    vendorDirs: string[];        // Third-party directory names
    binaryExtensions: string[];  // File extensions without leading dot
  };
  options: {
    followSymlinks: boolean;     // Default: false
    maxFileSize: number;         // Bytes, default: 1048576 (1MB)
  };
  output: {
    colors: boolean;             // ANSI color codes, default: true
  };
  ai: {
    backend: 'claude' | 'gemini' | 'opencode' | 'auto';
    model: string | null;        // Override backend default
    timeoutMs: number;           // Subprocess timeout, min: 1
    maxRetries: number;          // Exponential backoff attempts, min: 0
    concurrency: number;         // Worker pool size, range: [1, 20]
    telemetry: {
      enabled: boolean;
      keepRuns: number;          // Retention limit, min: 0
      costThresholdUsd: number;  // Warning threshold
    };
    pricing: {
      [backend: string]: {
        inputCostPer1kTokens: number;
        outputCostPer1kTokens: number;
        cacheReadCostPer1kTokens: number;
        cacheCreationCostPer1kTokens: number;
      };
    };
  };
}
```

**`AIBackend`**
```typescript
interface AIBackend {
  name: string;                  // 'claude' | 'gemini' | 'opencode'
  cliCommand: string;            // Executable name for PATH resolution
  isAvailable(): Promise<boolean>;
  buildArgs(options: AICallOptions): string[];
  parseResponse(stdout: string, durationMs: number, exitCode: number): AIResponse;
  getInstallInstructions(): string;
}
```

**`AICallOptions`**
```typescript
interface AICallOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  timeoutMs?: number;
  maxTurns?: number;
  taskLabel?: string;           // For trace correlation
}
```

**`AIResponse`**
```typescript
interface AIResponse {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  durationMs: number;
  exitCode: number;
  raw: string;                  // Unparsed stdout
}
```

**`FileChange`**
```typescript
type FileChange = 
  | { status: 'added'; path: string }
  | { status: 'modified'; path: string }
  | { status: 'deleted'; path: string }
  | { status: 'renamed'; path: string; oldPath: string };
```

**`ExecutionPlan`**
```typescript
interface ExecutionPlan {
  tasks: ExecutionTask[];
  fileTasks: ExecutionTask[];
  directoryTasks: ExecutionTask[];
  rootTasks: ExecutionTask[];
  directoryFileMap: Record<string, string[]>;
}

interface ExecutionTask {
  id: string;                   // 'file:path' | 'dir:path' | 'root:CLAUDE.md'
  type: 'file' | 'directory' | 'root';
  dependencies: string[];        // Task IDs
  systemPrompt: string;
  userPrompt: string;
  outputPath: string;
  metadata?: {
    depth?: number;
    directoryFiles?: string[];
  };
}
```

**`SumFileContent`**
```typescript
interface SumFileContent {
  generatedAt: string;          // ISO 8601 timestamp
  contentHash: string;          // SHA-256 hex digest
  purpose: string;
  criticalTodos?: string[];
  relatedFiles?: string[];
  summary: string;              // Markdown content after frontmatter
}
```

**`TraceEvent`** (discriminated union with 14 types)
```typescript
type TraceEvent = 
  | { type: 'phase:start'; phase: string; taskCount: number; concurrency: number }
  | { type: 'phase:end'; phase: string; tasksCompleted: number; tasksFailed: number; durationMs: number }
  | { type: 'worker:start'; workerId: number }
  | { type: 'worker:end'; workerId: number; tasksExecuted: number; durationMs: number }
  | { type: 'task:pickup'; taskIndex: number; taskLabel: string; activeTasks: number }
  | { type: 'task:done'; taskIndex: number; taskLabel: string; success: boolean; activeTasks: number; durationMs: number }
  | { type: 'task:start'; taskLabel: string; phase: string }
  | { type: 'subprocess:spawn'; childPid: number; command: string; args: string[] }
  | { type: 'subprocess:exit'; childPid: number; exitCode: number; signal: string | null; timedOut: boolean; durationMs: number }
  | { type: 'retry'; attempt: number; taskLabel: string; errorCode: string; delayMs: number }
  | { type: 'discovery:start' }
  | { type: 'discovery:end'; filesIncluded: number; filesExcluded: number; durationMs: number }
  | { type: 'filter:applied'; filterName: string; filesMatched: number; filesRejected: number }
  | { type: 'plan:created'; planType: string; fileCount: number }
  | { type: 'config:loaded'; configPath: string; model: string; concurrency: number };

// All events automatically enriched with:
interface TraceEventBase {
  seq: number;                  // Monotonic counter
  ts: string;                   // ISO 8601 timestamp
  pid: number;                  // process.pid
  elapsedMs: number;            // High-resolution delta from start
}
```

### Exported Functions

**Discovery:**
```typescript
function discoverFiles(root: string, config: DiscoveryConfig, options?: { tracer?: ITraceWriter; debug?: boolean }): Promise<FilterResult>

interface FilterResult {
  included: string[];           // Absolute paths passing all filters
  excluded: ExcludedFile[];     // { path, reason, filter }
}
```

**Configuration:**
```typescript
function loadConfig(root: string, options?: { tracer?: ITraceWriter; debug?: boolean }): Promise<Config>
function configExists(root: string): Promise<boolean>
function writeDefaultConfig(root: string): Promise<void>
function getDefaultConcurrency(): number  // CPU/memory-aware calculation
```

**Generation:**
```typescript
function buildFilePrompt(context: PromptContext): { systemPrompt: string; userPrompt: string }
function buildDirectoryPrompt(directoryPath: string, projectRoot: string, existingAgentsMd?: string): Promise<{ systemPrompt: string; userPrompt: string }>
function buildRootPrompt(projectRoot: string): Promise<{ systemPrompt: string; userPrompt: string }>

interface PromptContext {
  filePath: string;
  content: string;
  contextFiles?: Array<{ path: string; content: string }>;
  projectPlan?: string;
  existingSum?: string;         // Triggers update-specific prompt
}
```

**Writers:**
```typescript
function writeSumFile(filePath: string, summary: string, metadata: SummaryMetadata): Promise<void>
function readSumFile(sumPath: string): SumFileContent | null
function getSumPath(filePath: string): string
function sumFileExists(filePath: string): boolean
function writeAgentsMd(directoryPath: string, content: string): Promise<void>
```

**Change Detection:**
```typescript
function getChangedFiles(baseCommit: string, options?: { includeUncommitted?: boolean }): Promise<ChangeDetectionResult>
function computeContentHash(filePath: string): Promise<string>
function computeContentHashFromString(content: string): string

interface ChangeDetectionResult {
  changes: FileChange[];
  baseCommit: string;
  currentCommit: string;
  includesUncommitted: boolean;
}
```

**Pool Execution:**
```typescript
function runPool<T>(
  tasks: Array<() => Promise<T>>, 
  options: PoolOptions, 
  onComplete?: (result: TaskResult<T>) => void
): Promise<TaskResult<T>[]>

interface PoolOptions {
  concurrency: number;
  failFast?: boolean;
  tracer?: ITraceWriter;
  debug?: boolean;
}

type TaskResult<T> = 
  | { index: number; success: true; result: T }
  | { index: number; success: false; error: Error };
```

**Quality Validation:**
```typescript
function checkCodeVsDoc(sourceContent: string, sumContent: SumFileContent, filePath: string): CodeDocInconsistency | null
function checkCodeVsCode(files: Array<{ path: string; content: string }>): CodeCodeInconsistency[]
function checkPhantomPaths(agentsMdPath: string, content: string, projectRoot: string): PhantomPathInconsistency[]
function buildInconsistencyReport(issues: Inconsistency[], metadata: { projectRoot: string; filesChecked: number; durationMs: number }): InconsistencyReport
```

**Installer:**
```typescript
function runInstaller(args: InstallerArgs): Promise<InstallerResult[]>

interface InstallerArgs {
  runtime?: 'claude' | 'opencode' | 'gemini' | 'all';
  global?: boolean;             // Install to ~/.claude, etc.
  local?: boolean;              // Install to .claude, etc.
  uninstall?: boolean;
  force?: boolean;              // Overwrite existing files
  help?: boolean;
  quiet?: boolean;
}

interface InstallerResult {
  success: boolean;
  runtime: string;
  location: 'global' | 'local';
  filesCreated: string[];
  filesSkipped: string[];
  errors: string[];
  hookRegistered: boolean;
  versionWritten: boolean;
}
```

## 4. Data Structures & State

### YAML Frontmatter Schema

**.sum files:**
```yaml
---
generated_at: 2026-02-09T12:34:56.789Z
content_hash: a3f5d8e9b4c7f1e2d6a8b3c5e4f9a1d7  # SHA-256 hex (64 chars)
purpose: One-line purpose statement
critical_todos:
  - Security issue requiring immediate attention
  - Performance bottleneck in hot path
related_files:
  - src/related/module.ts
  - tests/integration/suite.test.ts
---

Markdown summary content...
```

### Configuration State

**Default vendor directories (18 entries):**
```
node_modules, .git, dist, build, coverage, .next, .nuxt, out, vendor, 
target, __pycache__, venv, .venv, .gradle, .cargo, .planning, .claude, .pytest_cache
```

**Default exclude patterns (32 globs):**
```
AGENTS.md, CLAUDE.md, GEMINI.md, OPENCODE.md, SPEC.md, *.lock, 
package-lock.json, yarn.lock, .env, .env.*, *.log, *.sum, 
GENERATION-PLAN.md, .DS_Store, Thumbs.db, **/.git/**, **/node_modules/**, 
**/dist/**, **/.agents-reverse-engineer/**, **/SKILL.md, **/.claude/**, 
**/.opencode/**, **/.gemini/**, **/.aider/**, etc.
```

**Default binary extensions (26 types):**
```
.png, .jpg, .jpeg, .gif, .bmp, .svg, .ico, .pdf, .zip, .tar, 
.gz, .bz2, .7z, .rar, .exe, .dll, .so, .dylib, .bin, .woff, 
.woff2, .ttf, .otf, .eot, .mp4, .mp3
```

### In-Memory State

**TelemetryLogger:**
```typescript
class TelemetryLogger {
  private entries: TelemetryEntry[] = [];
  private runId: string;        // ISO 8601 timestamp
  
  addEntry(entry: TelemetryEntry): void
  setFilesReadOnLastEntry(filesRead: FileRead[]): void
  getSummary(): { totalInputTokens, totalOutputTokens, errorCount, uniqueFilesRead, ... }
  toRunLog(): RunLog
}
```

**TraceWriter:**
```typescript
class TraceWriter implements ITraceWriter {
  private writeQueue: Promise<void> = Promise.resolve();
  private eventCounter = 0;
  private startTime: bigint;
  
  emit(event: TraceEventPayload): void  // Promise-chain serialization
  finalize(): Promise<void>             // Await queue drain
}
```

**ProgressReporter:**
```typescript
class ProgressReporter {
  private completionTimes: number[] = [];      // Sliding window (last 10)
  private dirCompletionTimes: number[] = [];
  
  onFileStart(filePath: string, index: number, total: number): void
  onFileDone(filePath: string, durationMs: number, tokensIn: number, tokensOut: number): void
  printSummary(summary: RunSummary): void
}
```

**BackendRegistry:**
```typescript
class BackendRegistry {
  private backends: AIBackend[] = [];   // Insertion-order preservation
  
  register(backend: AIBackend): void
  get(name: string): AIBackend | undefined
  getAll(): AIBackend[]
}
```

### Serialization Formats

**Run Log JSON:**
```json
{
  "runId": "2026-02-09T12-00-00-000Z",
  "startTime": "2026-02-09T12:00:00.000Z",
  "endTime": "2026-02-09T12:05:30.123Z",
  "entries": [
    {
      "timestamp": "2026-02-09T12:00:01.234Z",
      "prompt": "Analyze this file...",
      "response": "This module exports...",
      "model": "claude-sonnet-4",
      "inputTokens": 1500,
      "outputTokens": 300,
      "cacheReadTokens": 800,
      "cacheCreationTokens": 1500,
      "latencyMs": 2300,
      "exitCode": 0,
      "retryCount": 0,
      "thinking": false,
      "filesRead": [
        { "path": "src/module.ts", "sizeBytes": 4096 }
      ]
    }
  ],
  "summary": {
    "totalInputTokens": 45000,
    "totalOutputTokens": 9000,
    "totalCacheReadTokens": 24000,
    "totalCacheCreationTokens": 45000,
    "totalLatencyMs": 69000,
    "errorCount": 2,
    "uniqueFilesRead": 15
  }
}
```

**Trace NDJSON:**
```jsonl
{"seq":1,"ts":"2026-02-09T12:00:00.001Z","pid":12345,"elapsedMs":1,"type":"phase:start","phase":"phase-1-files","taskCount":50,"concurrency":5}
{"seq":2,"ts":"2026-02-09T12:00:00.012Z","pid":12345,"elapsedMs":12,"type":"worker:start","workerId":0}
{"seq":3,"ts":"2026-02-09T12:00:00.015Z","pid":12345,"elapsedMs":15,"type":"task:pickup","taskIndex":0,"taskLabel":"src/index.ts","activeTasks":1}
{"seq":4,"ts":"2026-02-09T12:00:00.020Z","pid":12345,"elapsedMs":20,"type":"subprocess:spawn","childPid":12346,"command":"claude","args":["-p","--output-format","json"]}
```

## 5. Configuration

### Config File Location

`.agents-reverse-engineer/config.yaml` at project root

### Schema Validation

All fields validated via Zod with these constraints:

**Numeric Constraints:**
- `ai.concurrency`: `.min(1).max(20)` — worker pool size
- `ai.timeoutMs`: `.positive()` — subprocess timeout
- `ai.maxRetries`: `.min(0)` — retry attempts
- `options.maxFileSize`: `.positive()` — binary detection threshold

**Enum Validation:**
- `ai.backend`: `z.enum(['claude', 'gemini', 'opencode', 'auto'])`

**Array Defaults:**
- `exclude.patterns`: spreads `DEFAULT_EXCLUDE_PATTERNS` (32 globs)
- `exclude.vendorDirs`: spreads `DEFAULT_VENDOR_DIRS` (18 directories)
- `exclude.binaryExtensions`: spreads `DEFAULT_BINARY_EXTENSIONS` (26 extensions)

### Environment Variable Overrides

**IDE Config Directories:**
- `CLAUDE_CONFIG_DIR` — overrides `~/.claude`
- `OPENCODE_CONFIG_DIR` — overrides `~/.config/opencode` (with `XDG_CONFIG_HOME` fallback)
- `GEMINI_CONFIG_DIR` — overrides `~/.gemini`

**Hook Disabling:**
- `ARE_DISABLE_HOOK=1` — disables session hooks via early exit in hook scripts

### Dynamic Defaults

**Concurrency Calculation:**
```typescript
function getDefaultConcurrency(): number {
  const cores = os.cpus().length;
  const totalMemGB = os.totalmem() / (1024 ** 3);
  
  const cpuBased = cores * 5;
  const memoryBased = Math.floor(totalMemGB * 0.5 / 0.512);  // 512MB per subprocess
  
  return Math.max(MIN_CONCURRENCY, Math.min(cpuBased, memoryBased, MAX_CONCURRENCY));
}
// MIN_CONCURRENCY=2, MAX_CONCURRENCY=20
```

### Complete Config Example

```yaml
exclude:
  patterns:
    - "*.test.ts"
    - "**/__tests__/**"
    - "*.config.js"
  vendorDirs:
    - node_modules
    - .git
    - dist
  binaryExtensions:
    - .png
    - .zip
    - .pdf

options:
  followSymlinks: false
  maxFileSize: 1048576

output:
  colors: true

ai:
  backend: auto
  model: null
  timeoutMs: 120000
  maxRetries: 3
  concurrency: 5
  
  telemetry:
    enabled: true
    keepRuns: 50
    costThresholdUsd: 10
  
  pricing:
    claude:
      inputCostPer1kTokens: 0.003
      outputCostPer1kTokens: 0.015
      cacheReadCostPer1kTokens: 0.0003
      cacheCreationCostPer1kTokens: 0.00375
```

## 6. Dependencies

### Production Dependencies

**`fast-glob` ^3.3.2**
- **Purpose:** File discovery with glob patterns, dotfile support, symlink control
- **Rationale:** Fastest glob library with native ignore support, replaces recursive fs.readdir
- **Usage:** `fast-glob('**/*', { onlyFiles: true, dot: true, ignore: ['.git/**'] })`

**`ignore` ^5.3.1**
- **Purpose:** Gitignore pattern matching engine
- **Rationale:** Canonical implementation matching git behavior exactly
- **Usage:** `ig.add(patterns).ignores(relativePath)`

**`isbinaryfile` ^5.0.2**
- **Purpose:** Content-based binary file detection
- **Rationale:** Prevents LLM context pollution with non-text content
- **Usage:** `await isBinaryFile(absolutePath)` for unknown extensions

**`simple-git` ^3.24.0**
- **Purpose:** Git diff parsing with rename detection
- **Rationale:** Enables incremental updates by detecting changed files
- **Usage:** `git diff --name-status -M <baseCommit>..HEAD`

**`yaml` ^2.4.1**
- **Purpose:** YAML parsing without comment preservation
- **Rationale:** Lightweight, spec-compliant, no dependencies
- **Usage:** `yaml.parse(configContent)` for config loading

**`zod` ^3.22.4**
- **Purpose:** Runtime schema validation with TypeScript inference
- **Rationale:** Type-safe config validation, detailed error messages
- **Usage:** `ConfigSchema.parse(rawConfig)` throws ZodError with formatted issues

**`ora` ^8.0.1**
- **Purpose:** Terminal spinner UI with color support
- **Rationale:** Provides visual feedback during long-running operations
- **Usage:** `ora('Analyzing files...').start()` / `.succeed()` / `.fail()`

**`picocolors` ^1.0.0**
- **Purpose:** ANSI color codes without dependencies
- **Rationale:** Zero-dependency alternative to chalk, 14x smaller
- **Usage:** `pc.green('✓')`, `pc.red('✗')`, `pc.dim('...')`

### Development Dependencies

**`typescript` ^5.7.3**
- **Purpose:** Static type checking, ES2022 code generation
- **Rationale:** Industry standard for Node.js type safety
- **Configuration:** NodeNext module resolution, strict mode

**`tsx` ^4.7.1**
- **Purpose:** Hot-reload TypeScript execution
- **Rationale:** Fast development iteration without tsc compilation
- **Usage:** `tsx watch src/cli/index.ts`

**`@types/node` ^20.11.0**
- **Purpose:** Node.js stdlib type definitions
- **Rationale:** Enables IDE autocomplete for fs, path, child_process

**`vitest` (implicit, not in package.json)**
- **Purpose:** Unit testing framework
- **Rationale:** Fast, TypeScript-native, Jest-compatible API

### Peer Dependencies (Implicit)

**AI CLI Tools (at least one required):**
- `@anthropic-ai/claude-code` — Claude Code CLI (`claude` command)
- Gemini CLI — Google Gemini assistant (`gemini` command)
- OpenCode CLI — OpenCode assistant (`opencode` command)

### Dependency Graph

```
CLI Commands (src/cli/)
  ↓
CommandRunner (src/orchestration/runner.ts)
  ↓
├── AIService (src/ai/service.ts)
│   └── Backends (src/ai/backends/)
│       └── runSubprocess() → child_process.execFile
├── Discovery (src/discovery/run.ts)
│   ├── fast-glob
│   ├── ignore (gitignore parsing)
│   └── isbinaryfile
├── Quality (src/quality/)
│   └── Node.js stdlib (fs, path)
├── Config (src/config/loader.ts)
│   ├── yaml
│   └── zod
└── Update (src/update/orchestrator.ts)
    └── simple-git
```

## 7. Behavioral Contracts

### Error Handling Strategy

**Error Types:**
```typescript
class AIServiceError extends Error {
  code: 'CLI_NOT_FOUND' | 'TIMEOUT' | 'PARSE_ERROR' | 'SUBPROCESS_ERROR' | 'RATE_LIMIT';
  details?: Record<string, unknown>;
}

class ConfigError extends Error {
  filePath: string;
  cause?: Error;
}

class SpecExistsError extends Error {
  paths: string[];
}
```

**Error Propagation:**
- Subprocess failures: `AIServiceError` with `code: 'SUBPROCESS_ERROR'` if exitCode !== 0
- Rate limits: `AIServiceError` with `code: 'RATE_LIMIT'` if stderr matches patterns `['rate limit', '429', 'too many requests', 'overloaded']`
- Timeouts: `AIServiceError` with `code: 'TIMEOUT'` if subprocess exceeds `timeoutMs`
- Parse failures: `AIServiceError` with `code: 'PARSE_ERROR'` if JSON.parse() throws
- Missing CLI: `AIServiceError` with `code: 'CLI_NOT_FOUND'` if no backend available

**Exit Codes:**
- `0` — All tasks succeeded or no files to process
- `1` — Partial failure (`filesProcessed > 0` and `filesFailed > 0`), or permission denied
- `2` — Total failure (`filesProcessed === 0` and `filesFailed > 0`), or no backend available

### Retry Logic

**Exponential Backoff:**
```typescript
function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>

interface RetryOptions {
  maxRetries: number;           // Default: 3
  baseDelayMs: number;          // Default: 1000
  maxDelayMs: number;           // Default: 8000
  multiplier: number;           // Default: 2
  isRetryable: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

// Formula: delay = min(baseDelayMs * multiplier^attempt, maxDelayMs) + jitter
// jitter = Math.random() * 500
```

**Retryable Conditions:**
- `AIServiceError` with `code === 'RATE_LIMIT'`
- Network timeouts from fetch (if backend supports)

**Non-Retryable Conditions:**
- `AIServiceError` with `code === 'TIMEOUT'` (subprocess timeout)
- `AIServiceError` with `code === 'PARSE_ERROR'` (invalid response)
- `AIServiceError` with `code === 'CLI_NOT_FOUND'` (missing executable)
- All other error types

### Concurrency Model

**Worker Pool Pattern:**
- Shared iterator across N workers prevents batch anti-pattern
- Iterator protocol ensures atomic task consumption
- Workers execute until iterator exhausted
- Fail-fast mode aborts all workers on first error

**Resource Limits Per Subprocess:**
```typescript
const env = {
  NODE_OPTIONS: '--max-old-space-size=512',          // 512MB heap
  UV_THREADPOOL_SIZE: '4',                           // 4 libuv threads
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',         // No background spawns
};
const args = [...backendArgs, '--disallowedTools', 'Task'];
```

**Timeout Enforcement:**
1. SIGTERM sent at `timeoutMs`
2. 5-second grace period for cleanup
3. SIGKILL escalation if still running
4. Process group killing via `kill(-pid)` to terminate subprocess tree

### Lifecycle Hooks

**Session Lifecycle (Claude/Gemini/OpenCode):**

**SessionStart Hook (`are-check-update.js`):**
```javascript
// Spawns detached process
// Queries: npm view agents-reverse-engineer version
// Compares: cached ARE-VERSION file
// Writes: ~/.claude/cache/are-update-check.json
// Exit: 0 (silent failure on errors)
```

**SessionEnd Hook (`are-session-end.js`):**
```javascript
// Guards: ARE_DISABLE_HOOK='1' or config 'hook_enabled: false'
// Checks: git status --porcelain (non-empty = uncommitted changes)
// Spawns: npx agents-reverse-engineer@latest update --quiet (detached)
// Exit: 0 (silent failure on errors/non-git repos)
```

**Hook Disable Mechanisms:**
1. Environment variable: `ARE_DISABLE_HOOK=1`
2. Config substring: `.agents-reverse-engineer.yaml` contains `hook_enabled: false`

### Resource Management

**File Handles:**
- `ProgressLog` opens `.agents-reverse-engineer/progress.log` in truncate mode ('w')
- `TraceWriter` opens `.agents-reverse-engineer/traces/trace-<timestamp>.ndjson` in append mode ('a')
- Both closed via `finalize()` after queue drain

**Memory Management:**
- `GenerationOrchestrator.prepareFiles()` clears file content after task creation: `(file as { content: string }).content = ''`
- Subprocess heap limited to 512MB prevents OOM
- Default concurrency computed from system memory: `floor(totalMemGB * 0.5 / 0.512)`

**Process Management:**
- Active subprocess tracking via `activeSubprocesses: Map<number, { pid, command, args }>`
- Process group killing ensures no orphaned subprocesses
- Unref'd timeout handles prevent event loop blocking

### State Persistence

**Stateless Incremental Updates:**
- No external database required
- SHA-256 hash embedded in `.sum` YAML frontmatter
- Hash comparison determines regeneration scope
- Works in non-git environments

**Telemetry Retention:**
- Run logs: kept last `config.ai.telemetry.keepRuns` (default 50)
- Traces: kept last 500 via `cleanupOldTraces(keepCount=500)`
- Cleanup triggered after each run via lexicographic sort descending

## 8. Test Contracts

### `src/ai/` Module Tests

**Subprocess Management:**
- SHOULD spawn subprocess with correct environment variables (NODE_OPTIONS, UV_THREADPOOL_SIZE)
- SHOULD send prompt via stdin and close with EOF
- SHOULD enforce timeout with SIGTERM → SIGKILL escalation
- SHOULD kill process group via `kill(-pid)`
- SHOULD track active subprocesses in Map
- SHOULD unref timeout handles

**Retry Logic:**
- SHOULD retry rate limit errors with exponential backoff
- SHOULD NOT retry timeout errors
- SHOULD NOT retry parse errors
- SHOULD invoke onRetry callback with attempt number
- SHOULD add jitter (0-500ms) to delay calculation
- SHOULD respect maxRetries limit

**Backend Registry:**
- SHOULD register backends in insertion order
- SHOULD detect first available backend for 'auto' mode
- SHOULD throw CLI_NOT_FOUND when no backend available
- SHOULD return installation instructions for all backends

**Telemetry:**
- SHOULD accumulate entries with token counts
- SHOULD compute summary with unique file count
- SHOULD write run log with sanitized timestamp
- SHOULD clean up old logs beyond retention limit

### `src/discovery/` Module Tests

**Filter Chain:**
- SHOULD execute filters in order: gitignore → vendor → binary → custom
- SHOULD short-circuit on first filter match
- SHOULD emit filter:applied trace events with counts
- SHOULD respect maxFileSize threshold for binary detection
- SHOULD match vendor directories anywhere in path
- SHOULD handle multi-segment vendor patterns

**Gitignore Integration:**
- SHOULD parse .gitignore with ignore library
- SHOULD convert absolute paths to relative before matching
- SHOULD return false for external paths (starting with ..)
- SHOULD handle missing .gitignore gracefully

**Binary Detection:**
- SHOULD match known extensions via fast-path lookup
- SHOULD enforce size threshold via fs.stat()
- SHOULD use isbinaryfile for unknown extensions
- SHOULD return true on fs.stat() errors

### `src/generation/` Module Tests

**Prompt Construction:**
- SHOULD inject import map from extractDirectoryImports()
- SHOULD switch to update prompts when existingSum present
- SHOULD detect 9 manifest types (package.json, Cargo.toml, etc.)
- SHOULD preserve user content via AGENTS.local.md prepending
- SHOULD strip GENERATED_MARKER from LLM output

**Execution Plan:**
- SHOULD sort directories by depth descending
- SHOULD construct dependency graph: files → directories → root
- SHOULD wait for child .sum files via isDirectoryComplete()
- SHOULD compute directory file map for metadata

**YAML Frontmatter:**
- SHOULD serialize inline arrays when ≤3 items <40 chars
- SHOULD serialize multi-line arrays otherwise
- SHOULD embed SHA-256 content_hash
- SHOULD parse frontmatter via regex extraction
- SHOULD return null on parse failure

### `src/orchestration/` Module Tests

**Worker Pool:**
- SHOULD share single iterator across workers
- SHOULD prevent over-allocation when tasks < concurrency
- SHOULD abort all workers on fail-fast error
- SHOULD emit worker:start/end events
- SHOULD emit task:pickup/done events with activeTasks counter
- SHOULD preserve original task order in results

**Progress Tracking:**
- SHOULD compute ETA via moving average of last 10 durations
- SHOULD show ETA after 2+ completions
- SHOULD format as seconds below 60s, minutes+seconds above
- SHOULD mirror output to progress.log
- SHOULD strip ANSI codes before file write

**Trace Emission:**
- SHOULD auto-populate seq, ts, pid, elapsedMs fields
- SHOULD serialize writes via promise chain
- SHOULD preserve NDJSON line order despite concurrent emissions
- SHOULD clean up old traces beyond 500 retention limit

**Plan Tracking:**
- SHOULD mark checkboxes in GENERATION-PLAN.md
- SHOULD serialize writes via promise chain
- SHOULD flush queue on finalize()

### `src/update/` Module Tests

**Hash Comparison:**
- SHOULD read content_hash from .sum frontmatter
- SHOULD compute current hash via SHA-256
- SHOULD classify as filesToAnalyze on hash mismatch
- SHOULD classify as filesToSkip on hash match
- SHOULD detect missing .sum as added files

**Orphan Cleanup:**
- SHOULD delete .sum files for deleted sources
- SHOULD delete .sum files for renamed oldPath
- SHOULD remove AGENTS.md when directory has no source files
- SHOULD preserve AGENTS.md when source files remain
- SHOULD exclude hidden files from empty check
- SHOULD exclude .sum files from empty check

**Affected Directories:**
- SHOULD walk parent directory tree to root
- SHOULD include all parent directories in set
- SHOULD return unique directory paths

### `src/quality/` Module Tests

**Code-vs-Doc:**
- SHOULD extract exports via regex pattern
- SHOULD detect missing exports in summary
- SHOULD return null when all exports documented
- SHOULD populate missingFromDoc array

**Code-vs-Code:**
- SHOULD build symbol-to-paths map
- SHOULD detect duplicates when paths.length > 1
- SHOULD return empty array when no duplicates
- SHOULD include all files in CodeCodeInconsistency

**Phantom Paths:**
- SHOULD extract paths via three regex patterns
- SHOULD skip patterns matching SKIP_PATTERNS
- SHOULD resolve relative to AGENTS.md directory
- SHOULD resolve relative to project root
- SHOULD try .ts fallback for .js imports
- SHOULD deduplicate via seen Set

**Report Building:**
- SHOULD aggregate inconsistencies by type
- SHOULD compute severity counts
- SHOULD format CLI output with severity tags

### `src/config/` Module Tests

**Schema Validation:**
- SHOULD enforce concurrency range [1, 20]
- SHOULD enforce positive timeoutMs
- SHOULD validate backend enum values
- SHOULD spread default arrays
- SHOULD throw ConfigError on ZodError

**Concurrency Calculation:**
- SHOULD compute CPU-based limit (cores * 5)
- SHOULD compute memory-based limit (totalMemGB * 0.5 / 0.512)
- SHOULD return min(cpuBased, memoryBased) clamped to [2, 20]

**Config Writing:**
- SHOULD generate YAML with inline comments
- SHOULD apply yamlScalar() quoting for globs
- SHOULD create parent directory if missing

### `src/installer/` Module Tests

**Hook Registration:**
- SHOULD append hooks to settings.hooks.SessionStart/SessionEnd arrays
- SHOULD check duplicates via command string match
- SHOULD use nested format for Claude
- SHOULD use flat format for Gemini

**Permission Registration:**
- SHOULD append ARE_PERMISSIONS patterns to settings.permissions.allow
- SHOULD deduplicate via includes() check

**Hook Deregistration:**
- SHOULD filter arrays removing matching command patterns
- SHOULD clean empty arrays/objects
- SHOULD handle both current and legacy formats

**Template Writing:**
- SHOULD write templates to runtime-specific paths
- SHOULD create parent directories
- SHOULD skip existing files unless force=true
- SHOULD return filesCreated/filesSkipped arrays

## 9. Build Plan

### Phase 1: Core Infrastructure (no dependencies)

**Goal:** Establish configuration, logging, and type foundations

**Modules:**
1. `src/types/` — Shared interfaces (ExcludedFile, DiscoveryResult, DiscoveryStats)
2. `src/output/logger.ts` — Terminal formatting with picocolors
3. `src/config/schema.ts` — Zod validation schemas
4. `src/config/defaults.ts` — Default arrays and concurrency calculation
5. `src/config/loader.ts` — YAML parsing with loadConfig()/writeDefaultConfig()
6. `src/version.ts` — Package version extraction

**Verification:**
- Config loads with valid YAML
- Default concurrency computes based on system resources
- Logger produces colored output when colors=true

**Enables:** All subsequent phases depend on Config and Logger

---

### Phase 2: File Discovery (depends: Phase 1)

**Goal:** Implement gitignore-aware file walking with composable filters

**Modules:**
1. `src/discovery/types.ts` — FileFilter interface, WalkerOptions
2. `src/discovery/walker.ts` — fast-glob integration with .git/** exclusion
3. `src/discovery/filters/binary.ts` — Extension + size + content detection
4. `src/discovery/filters/vendor.ts` — Single/multi-segment directory matching
5. `src/discovery/filters/gitignore.ts` — ignore library wrapper
6. `src/discovery/filters/custom.ts` — User-defined glob patterns
7. `src/discovery/filters/index.ts` — applyFilters() with worker pool
8. `src/discovery/run.ts` — discoverFiles() orchestrator

**Verification:**
- Discovers files respecting .gitignore
- Excludes node_modules, .git, dist
- Detects binary files via extension/size/content
- Returns FilterResult with included/excluded arrays

**Enables:** Phase 4 (Generation) requires file lists, Phase 6 (Update) requires discovery

---

### Phase 3: AI Service Layer (depends: Phase 1)

**Goal:** Backend-agnostic subprocess management with retry and telemetry

**Modules:**
1. `src/ai/types.ts` — AIBackend, AICallOptions, AIResponse, TelemetryEntry
2. `src/ai/subprocess.ts` — runSubprocess() with resource limits and timeout
3. `src/ai/retry.ts` — withRetry() exponential backoff
4. `src/ai/backends/claude.ts` — ClaudeBackend with JSON parsing
5. `src/ai/backends/gemini.ts` — GeminiBackend stub
6. `src/ai/backends/opencode.ts` — OpenCodeBackend stub
7. `src/ai/registry.ts` — Backend registration and auto-detection
8. `src/ai/service.ts` — AIService orchestrating call()/finalize()
9. `src/ai/telemetry/logger.ts` — TelemetryLogger with addEntry()/getSummary()
10. `src/ai/telemetry/run-log.ts` — writeRunLog() with timestamp sanitization
11. `src/ai/telemetry/cleanup.ts` — cleanupOldLogs() retention enforcement

**Verification:**
- Spawns Claude CLI subprocess with correct args
- Parses JSON response extracting tokens/cost
- Retries rate limits with exponential backoff
- Writes run logs to .agents-reverse-engineer/logs/
- Cleans up logs beyond retention limit

**Enables:** Phase 4 (Generation) requires AI calls

---

### Phase 4: Generation Pipeline (depends: Phases 1-3)

**Goal:** Three-phase documentation generation with prompts, writers, collectors

**Modules:**
1. `src/imports/types.ts` — ImportEntry, FileImports
2. `src/imports/extractor.ts` — extractImports(), extractDirectoryImports()
3. `src/generation/types.ts` — AnalysisResult, SummaryOptions
4. `src/generation/prompts/types.ts` — PromptContext, SUMMARY_GUIDELINES
5. `src/generation/prompts/templates.ts` — FILE/DIRECTORY/ROOT system/user prompts
6. `src/generation/prompts/builder.ts` — buildFilePrompt()/buildDirectoryPrompt()/buildRootPrompt()
7. `src/generation/writers/sum.ts` — writeSumFile()/readSumFile() with YAML frontmatter
8. `src/generation/writers/agents-md.ts` — writeAgentsMd() with user content preservation
9. `src/generation/collector.ts` — collectAgentsDocs() recursive traversal
10. `src/generation/complexity.ts` — analyzeComplexity() with depth calculation
11. `src/generation/orchestrator.ts` — GenerationOrchestrator.createPlan()
12. `src/generation/executor.ts` — buildExecutionPlan() with dependency ordering

**Verification:**
- Builds file prompts with import context
- Writes .sum files with SHA-256 content_hash
- Builds directory prompts aggregating child .sum files
- Writes AGENTS.md preserving AGENTS.local.md
- Builds root prompts collecting all AGENTS.md
- Execution plan sorts directories by depth descending

**Enables:** Phase 5 (Orchestration) requires tasks, Phase 7 (Update) requires writers

---

### Phase 5: Orchestration & Progress (depends: Phases 1, 3, 4)

**Goal:** Worker pool execution with trace emission and progress tracking

**Modules:**
1. `src/orchestration/types.ts` — FileTaskResult, RunSummary, ProgressEvent, TraceEvent
2. `src/orchestration/trace.ts` — TraceWriter with promise-chain serialization
3. `src/orchestration/pool.ts` — runPool() shared-iterator pattern
4. `src/orchestration/progress.ts` — ProgressReporter with ETA calculation
5. `src/orchestration/plan-tracker.ts` — PlanTracker for GENERATION-PLAN.md
6. `src/orchestration/runner.ts` — CommandRunner.executeGenerate()/executeUpdate()

**Verification:**
- Workers share iterator preventing over-allocation
- Trace events emitted with seq/ts/pid/elapsedMs
- ETA computed from moving average of last 10 durations
- Progress mirrored to .agents-reverse-engineer/progress.log
- Plan tracker marks checkboxes on task completion

**Enables:** Phase 8 (CLI) requires CommandRunner

---

### Phase 6: Change Detection (depends: Phase 1)

**Goal:** Git diff parsing and SHA-256 hashing for incremental updates

**Modules:**
1. `src/change-detection/types.ts` — ChangeType, FileChange, ChangeDetectionResult
2. `src/change-detection/detector.ts` — getChangedFiles(), computeContentHash()

**Verification:**
- Parses git diff --name-status -M with rename detection
- Merges uncommitted changes when includeUncommitted=true
- Computes SHA-256 hex digest for file content

**Enables:** Phase 7 (Update) requires change detection

---

### Phase 7: Incremental Updates (depends: Phases 1, 4, 6)

**Goal:** Hash-based regeneration with orphan cleanup

**Modules:**
1. `src/update/types.ts` — UpdateOptions, UpdateResult, CleanupResult
2. `src/update/orphan-cleaner.ts` — cleanupOrphans()/getAffectedDirectories()
3. `src/update/orchestrator.ts` — UpdateOrchestrator.preparePlan()

**Verification:**
- Reads content_hash from .sum frontmatter
- Classifies files into filesToAnalyze vs filesToSkip
- Deletes orphaned .sum files for deleted/renamed sources
- Removes AGENTS.md from empty directories
- Computes affected directories via parent tree walk

**Enables:** Phase 8 (CLI update command)

---

### Phase 8: Quality Validation (depends: Phases 1, 4)

**Goal:** Post-generation consistency checks

**Modules:**
1. `src/quality/types.ts` — Inconsistency discriminated union
2. `src/quality/inconsistency/code-vs-doc.ts` — extractExports(), checkCodeVsDoc()
3. `src/quality/inconsistency/code-vs-code.ts` — checkCodeVsCode()
4. `src/quality/inconsistency/reporter.ts` — buildInconsistencyReport()
5. `src/quality/phantom-paths/validator.ts` — checkPhantomPaths()
6. `src/quality/density/validator.ts` — validateFindability() stub

**Verification:**
- Extracts exports via regex
- Detects missing exports in summaries
- Detects duplicate symbols across files
- Resolves phantom paths with .ts fallback
- Formats report with severity tags

**Enables:** Phase 9 (CLI) reports quality metrics

---

### Phase 9: CLI Commands (depends: Phases 1-8)

**Goal:** User-facing command interface

**Modules:**
1. `src/cli/index.ts` — Argument parsing and routing
2. `src/cli/init.ts` — Config initialization
3. `src/cli/discover.ts` — Discovery preview
4. `src/cli/generate.ts` — Three-phase generation
5. `src/cli/update.ts` — Incremental regeneration
6. `src/cli/clean.ts` — Artifact deletion
7. `src/cli/specify.ts` — Specification synthesis

**Verification:**
- are init creates .agents-reverse-engineer/config.yaml
- are discover writes GENERATION-PLAN.md
- are generate executes three phases
- are update regenerates only changed files
- are clean deletes .sum/AGENTS.md/CLAUDE.md
- are specify synthesizes specs/SPEC.md

**Enables:** Phase 10 (Installer) requires CLI

---

### Phase 10: Integration & Installer (depends: Phases 1, 9)

**Goal:** IDE command installation with hook registration

**Modules:**
1. `src/integration/types.ts` — EnvironmentType, DetectedEnvironment
2. `src/integration/detect.ts` — detectEnvironments() via filesystem markers
3. `src/integration/templates.ts` — getClaudeTemplates()/getOpenCodeTemplates()/getGeminiTemplates()
4. `src/integration/generate.ts` — generateIntegrationFiles()
5. `src/installer/types.ts` — Runtime, InstallerArgs, InstallerResult
6. `src/installer/paths.ts` — getRuntimePaths() with environment overrides
7. `src/installer/prompts.ts` — selectRuntime()/selectLocation() with TTY detection
8. `src/installer/operations.ts` — installFiles()/registerHooks()/registerPermissions()
9. `src/installer/uninstall.ts` — uninstallFiles()/unregisterHooks()
10. `src/installer/banner.ts` — displayBanner()/showNextSteps()
11. `hooks/` — Session lifecycle scripts (4 files: Claude/Gemini/OpenCode pairs)
12. `scripts/build-hooks.js` — Prepublish hook copying to hooks/dist/

**Verification:**
- Detects Claude/OpenCode/Gemini environments
- Writes command templates to ~/.claude/skills/, etc.
- Installs hooks to ~/.claude/hooks/
- Registers hooks in settings.json (nested for Claude, flat for Gemini)
- Registers permissions for auto-approval
- Uninstalls templates and deregisters hooks
- Copies hooks to hooks/dist/ during prepublish

**Enables:** Complete end-to-end workflow

---

### Phase 11: Specification Synthesis (depends: Phases 1, 3, 4)

**Goal:** Generate project specifications from AGENTS.md corpus

**Modules:**
1. `src/specify/prompts.ts` — buildSpecPrompt() with SPEC_SYSTEM_PROMPT
2. `src/specify/writer.ts` — writeSpec() with single/multi-file modes
3. `src/specify/index.ts` — Barrel export

**Verification:**
- Prompts enforce concern-based organization
- Single-file mode writes specs/SPEC.md
- Multi-file mode splits on top-level headings
- Throws SpecExistsError without --force

**Enables:** Complete feature set

---

### Phase 12: Build & Distribution (depends: all phases)

**Goal:** Package for npm with provenance attestation

**Modules:**
1. `package.json` — Binary entry points, scripts, dependencies
2. `tsconfig.json` — ES2022 target, NodeNext resolution
3. `.github/workflows/publish.yml` — CI/CD with OIDC provenance

**Verification:**
- tsc compiles src/ → dist/ without errors
- npm pack includes dist/, hooks/dist/, LICENSE, README.md
- Binary entry points resolve to dist/cli/index.js
- GitHub Actions publishes with provenance on release

**Deliverable:** Published npm package
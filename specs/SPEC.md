# agents-reverse-engineer Project Specification

## 1. Project Overview

**agents-reverse-engineer (ARE)** automates brownfield codebase documentation for AI coding assistants through a three-phase Recursive Language Model (RLM) pipeline: concurrent `.sum` file generation via AI CLI subprocesses with resource-bounded worker pools, post-order `AGENTS.md` directory aggregation consuming child summaries, and platform-specific root document synthesis (`CLAUDE.md`/`GEMINI.md`/`OPENCODE.md`) with gitignore-aware discovery and SHA-256 incremental updates.

**Core Value Proposition:** Transforms undocumented codebases into AI-navigable documentation by analyzing source files concurrently, synthesizing directory-level overviews bottom-up, and generating platform-tailored integration documents—enabling AI assistants to reconstruct project architecture, understand module boundaries, and locate relevant code without reading entire repositories.

**Problem Solved:** Eliminates manual documentation maintenance burden for brownfield projects by automating generation from source code through AI analysis, detecting code-documentation inconsistencies through quality validators, and supporting incremental updates via content hash comparison to minimize regeneration costs.

**Technology Stack:**
- **Runtime:** Node.js ≥18.0.0 (ES modules, `type: "module"` in package.json)
- **Language:** TypeScript 5.7.3 (target ES2022, module NodeNext, strict mode)
- **Build:** TypeScript compiler (`tsc`) emitting to `dist/`, npm scripts for lifecycle hooks
- **Dependencies:**
  - `fast-glob` ^3.3.2 — glob pattern file discovery
  - `ignore` ^7.0.0 — gitignore parsing
  - `isbinaryfile` ^5.0.4 — binary file detection
  - `simple-git` ^3.27.0 — git diff parsing for change detection
  - `yaml` ^2.7.0 — config file serialization
  - `zod` ^3.24.1 — schema validation
  - `ora` ^8.1.1 — terminal spinner UI
  - `picocolors` ^1.1.1 — ANSI color formatting
- **AI Backends:** Claude Code CLI (`@anthropic-ai/claude-code`), Gemini CLI (stub), OpenCode CLI (stub)
- **Distribution:** npm package with binary entry points (`are`, `agents-reverse-engineer`), GitHub Actions workflow for provenance attestation

**Version:** 0.6.6  
**License:** MIT (GeoloeG-IsT, 2026)

## 2. Architecture

### Module Boundaries

**Discovery Layer** (`src/discovery/`): Gitignore-aware file traversal composing four-stage filter chain (gitignore → vendor → binary → custom) over `fast-glob` results. Returns `DiscoveryResult` with `included: string[]` and `excluded: ExcludedFile[]`.

**AI Service Layer** (`src/ai/`): Backend-agnostic abstraction with `AIBackend` adapter registry supporting Claude/Gemini/OpenCode. Manages subprocess lifecycle via `execFile()`, implements exponential backoff retry on rate limits, enforces resource constraints (512MB heap, 4-thread libuv pool), tracks token costs via `TelemetryLogger`.

**Generation Layer** (`src/generation/`): Orchestrates three-phase pipeline. `GenerationOrchestrator` prepares files, creates tasks with embedded prompts. `buildExecutionPlan()` constructs dependency graph (files → directories → roots) with post-order depth sorting. Phase 1 writes `.sum` files with YAML frontmatter. Phase 2 writes `AGENTS.md` consuming child summaries. Phase 3 writes platform-specific root documents.

**Orchestration Layer** (`src/orchestration/`): Iterator-based worker pool sharing `tasks.entries()` across N workers to prevent over-allocation. `CommandRunner` executes three-phase pipeline invoking `AIService.call()` per task. `ProgressReporter` streams console output with ETA calculation via moving average. `PlanTracker` serializes `GENERATION-PLAN.md` checkbox updates via promise chains. `TraceWriter` emits NDJSON events with auto-populated `seq`/`ts`/`pid`/`elapsedMs`.

**Quality Layer** (`src/quality/`): Post-generation validators extracting exports via regex, comparing against `.sum` summaries (code-vs-doc), detecting duplicate symbols (code-vs-code), resolving path references in `AGENTS.md` (phantom-paths). Returns `InconsistencyReport` with discriminated union issues.

**Change Detection Layer** (`src/change-detection/`): Computes SHA-256 content hashes for incremental updates. Parses `git diff --name-status -M` for rename detection. Maps status codes (`A`/`M`/`D`/`R*`) to `FileChange` discriminated union.

**Update Layer** (`src/update/`): Compares `.sum` frontmatter `content_hash` against current file hash. Returns `UpdatePlan` with `filesToAnalyze` (hash mismatch), `filesToSkip` (match), `cleanup` (orphans), `affectedDirs` (depth-sorted). `cleanupOrphans()` deletes stale `.sum`/`.annex.md`. `getAffectedDirectories()` walks parent chains.

**Config Layer** (`src/config/`): Loads `.agents-reverse-engineer/config.yaml` with Zod validation. Computes memory-aware concurrency via `clamp(cores × 5, MIN=2, min(memCap, MAX=20))` where `memCap = floor((totalMemGB × 0.5) / 0.512)`.

**Installer Layer** (`src/installer/`): npx-based orchestration installing commands/hooks to `~/.claude/`, `~/.config/opencode/`, `~/.gemini/`. Resolves paths via environment overrides (`CLAUDE_CONFIG_DIR`, `OPENCODE_CONFIG_DIR`, `GEMINI_CONFIG_DIR`). Modifies `settings.json` for hook registration and bash permissions.

**Integration Layer** (`src/integration/`): Generates platform-specific command templates with progress-monitoring patterns (background execution, 15s poll intervals, `progress.log` tailing). Detects environments via marker files (`.claude/`, `.opencode/`, `.gemini/`, `.aider/`).

**CLI Layer** (`src/cli/`): Command entry points (init/discover/generate/update/clean/specify) parsing args, loading config, invoking orchestrators. Exit codes: 0 (success), 1 (partial failure or config exists), 2 (total failure or CLI not found).

### Data Flow Patterns

**Generation Pipeline:**
1. `discoverFiles()` walks directory, applies filter chain, returns `DiscoveryResult`
2. `GenerationOrchestrator.createPlan()` reads source files, embeds into prompts, returns `GenerationPlan` with `tasks[]`
3. `buildExecutionPlan()` constructs dependency graph, sorts by depth descending (deepest first)
4. `CommandRunner.executeGenerate()` invokes Phase 1 pool with `runPool()`, Phase 2 depth-grouped sequential, Phase 3 sequential
5. Each task calls `AIService.call()` → `runSubprocess()` → `execFile()` spawning AI CLI
6. Writers call `writeSumFile()` (YAML frontmatter + markdown), `writeAgentsMd()` (marker + user content preservation), `writeFile()` (root docs)
7. Post-generation validators call `checkCodeVsDoc()`/`checkCodeVsCode()`/`checkPhantomPaths()` at concurrency=10
8. `TelemetryLogger.toRunLog()` serializes to `.agents-reverse-engineer/logs/run-{timestamp}.json`

**Incremental Update Flow:**
1. `UpdateOrchestrator.preparePlan()` discovers files, reads `.sum` frontmatter
2. Compares `content_hash` against `computeContentHash()` current file SHA-256
3. Populates `filesToAnalyze` (added/modified), `filesToSkip` (unchanged)
4. `cleanupOrphans()` deletes stale `.sum`/`.annex.md` for deleted/renamed files
5. `getAffectedDirectories()` walks parent chains, sorts by depth descending
6. `CommandRunner.executeUpdate()` regenerates `.sum` for `filesToAnalyze` via Phase 1 pool
7. CLI loops `affectedDirs` calling `buildDirectoryPrompt()` + `writeAgentsMd()` sequentially

**Subprocess Resource Management:**
1. `runPool()` shares `tasks.entries()` iterator across N workers
2. Each worker calls `AIService.call()` → `runSubprocess()`
3. `execFile()` spawns child with env vars: `NODE_OPTIONS='--max-old-space-size=512'`, `UV_THREADPOOL_SIZE='4'`, `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS='1'`
4. Timeout timer sends SIGTERM at `timeoutMs`, schedules SIGKILL at `timeoutMs + 5000`
5. Process group killing via `kill(-pid)` terminates subprocess tree
6. `withRetry()` implements exponential backoff on rate-limit errors (stderr pattern matching)

### Key Design Decisions

**Iterator-Based Pool Over Batch Chunking:** Prevents idle workers waiting for slowest task in batch. Shared iterator ensures workers race to pull tasks atomically via iterator protocol.

**Promise-Chain Write Serialization:** `PlanTracker`, `ProgressLog`, `TraceWriter` serialize concurrent writes via `this.writeQueue = this.writeQueue.then(() => writeOp())` pattern. Prevents NDJSON corruption from parallel worker writes.

**Post-Order Directory Traversal:** Depth-descending sort (`getDirectoryDepth(dirB) - getDirectoryDepth(dirA)`) ensures child `.sum` files exist before parent `AGENTS.md` generation. `isDirectoryComplete()` predicate gates directory task execution.

**Memory-Aware Concurrency:** Default formula `clamp(cores × 5, MIN=2, min(memCap, MAX=20))` prevents RAM exhaustion where `cores × 5` spawns too many 512MB subprocesses. WSL environments default to concurrency=2.

**Frontmatter-Based Change Detection Over Git:** SHA-256 `content_hash` in `.sum` YAML frontmatter enables incremental updates without git dependency. Supports non-git workflows while git integration provides rename detection via `git diff -M`.

**User Content Preservation Via Rename:** Existing `AGENTS.md` lacking `<!-- Generated by agents-reverse-engineer -->` marker renamed to `AGENTS.local.md`, prepended above generated content with `---` separator.

**Stub Backends Throwing Errors:** Gemini/OpenCode adapters throw `AIServiceError('SUBPROCESS_ERROR')` until JSON output stabilizes, demonstrating extension pattern without blocking Claude backend usage.

## 3. Public API Surface

### CLI Commands (`src/cli/index.ts`)

```typescript
function parseArgs(args: string[]): {
  command?: string;
  positional: string[];
  flags: Set<string>;
  values: Map<string, string>;
}

function runInstaller(): Promise<void>
```

### Discovery (`src/discovery/run.ts`)

```typescript
interface DiscoveryResult {
  files: string[];
  excluded: ExcludedFile[];
}

interface ExcludedFile {
  path: string;
  reason: string;
}

async function discoverFiles(
  rootPath: string,
  config: DiscoveryConfig,
  logger: Logger,
  options?: DiscoverFilesOptions
): Promise<DiscoveryResult>
```

### Generation (`src/generation/orchestrator.ts`)

```typescript
interface GenerationPlan {
  projectRoot: string;
  files: PreparedFile[];
  tasks: ExecutionTask[];
  projectStructure?: string;
  complexity: ComplexityMetrics;
}

interface ExecutionPlan {
  projectRoot: string;
  projectStructure?: string;
  fileTasks: ExecutionTask[];
  directoryTasks: ExecutionTask[];
  rootTasks: ExecutionTask[];
}

class GenerationOrchestrator {
  constructor(projectRoot: string, config: Config, tracer?: ITraceWriter);
  async createPlan(discoveryResult: DiscoveryResult): Promise<GenerationPlan>;
}

function buildExecutionPlan(plan: GenerationPlan): ExecutionPlan
```

### AI Service (`src/ai/service.ts`)

```typescript
interface AICallOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  timeoutMs?: number;
  maxTurns?: number;
  taskLabel?: string;
}

interface AIResponse {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  durationMs: number;
  exitCode: number;
  raw: unknown;
}

class AIService {
  constructor(backend: AIBackend, options: AIServiceOptions);
  async call(options: AICallOptions): Promise<AIResponse>;
  setDebug(enabled: boolean): void;
  setTracer(tracer: ITraceWriter): void;
  addFilesReadToLastEntry(files: FileRead[]): void;
  getSummary(): TelemetrySummary;
  async finalize(projectRoot: string): Promise<void>;
}
```

### AI Backend Registry (`src/ai/registry.ts`)

```typescript
interface AIBackend {
  isAvailable(): Promise<boolean>;
  buildArgs(options: AICallOptions): string[];
  parseResponse(stdout: string, durationMs: number, exitCode: number): AIResponse;
  getInstallInstructions(): string;
}

class BackendRegistry {
  register(name: string, backend: AIBackend): void;
  get(name: string): AIBackend | undefined;
  getAll(): Map<string, AIBackend>;
}

function createBackendRegistry(): BackendRegistry

async function resolveBackend(
  registry: BackendRegistry,
  requested: string
): Promise<AIBackend>
```

### Orchestration (`src/orchestration/runner.ts`)

```typescript
interface CommandRunOptions {
  concurrency: number;
  failFast?: boolean;
  debug?: boolean;
  dryRun?: boolean;
  tracer?: ITraceWriter;
  progressLog?: ProgressLog;
}

interface RunSummary {
  version: string;
  filesProcessed: number;
  filesFailed: number;
  filesSkipped: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens?: number;
  totalCacheCreationTokens?: number;
  totalDurationMs: number;
  errorCount: number;
  retryCount: number;
  totalFilesRead: number;
  uniqueFilesRead: number;
  inconsistenciesCodeVsDoc?: number;
  inconsistenciesCodeVsCode?: number;
  phantomPaths?: number;
  inconsistencyReport?: InconsistencyReport;
}

class CommandRunner {
  constructor(aiService: AIService, options: CommandRunOptions);
  async executeGenerate(plan: ExecutionPlan): Promise<RunSummary>;
  async executeUpdate(
    filesToAnalyze: FileChange[],
    projectRoot: string,
    config: Config
  ): Promise<RunSummary>;
}
```

### Worker Pool (`src/orchestration/pool.ts`)

```typescript
interface PoolOptions {
  concurrency: number;
  failFast?: boolean;
  tracer?: ITraceWriter;
  phaseLabel?: string;
  taskLabels?: string[];
}

interface TaskResult<T> {
  index: number;
  success: boolean;
  value?: T;
  error?: Error;
}

async function runPool<T>(
  tasks: Array<() => Promise<T>>,
  options: PoolOptions,
  onComplete?: (result: TaskResult<T>) => void
): Promise<Array<TaskResult<T>>>
```

### Configuration (`src/config/loader.ts`)

```typescript
interface Config {
  exclude: ExcludeConfig;
  options: OptionsConfig;
  output: OutputConfig;
  ai: AIConfig;
}

async function loadConfig(
  root: string,
  options?: { tracer?: ITraceWriter }
): Promise<Config>

async function writeDefaultConfig(root: string): Promise<void>

function configExists(root: string): boolean
```

### Change Detection (`src/change-detection/detector.ts`)

```typescript
type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

interface FileChange {
  path: string;
  status: ChangeType;
  oldPath?: string;
}

interface ChangeDetectionResult {
  changes: FileChange[];
  baseCommit: string | null;
  currentCommit: string | null;
}

async function isGitRepo(projectRoot: string): Promise<boolean>

async function getCurrentCommit(projectRoot: string): Promise<string | null>

async function getChangedFiles(
  projectRoot: string,
  options?: ChangeDetectionOptions
): Promise<ChangeDetectionResult>

async function computeContentHash(filePath: string): Promise<string>

function computeContentHashFromString(content: string): string
```

### Update Orchestration (`src/update/orchestrator.ts`)

```typescript
interface UpdatePlan {
  filesToAnalyze: FileChange[];
  filesToSkip: string[];
  cleanup: CleanupResult;
  affectedDirs: string[];
  isFirstRun: boolean;
}

class UpdateOrchestrator {
  constructor(projectRoot: string, config: Config, tracer?: ITraceWriter);
  async preparePlan(
    discoveryResult: DiscoveryResult,
    options: UpdateOptions
  ): Promise<UpdatePlan>;
  isFirstRun(): boolean;
}

function createUpdateOrchestrator(
  projectRoot: string,
  config: Config,
  tracer?: ITraceWriter
): UpdateOrchestrator
```

### Quality Validation (`src/quality/index.ts`)

```typescript
type Inconsistency = 
  | CodeDocInconsistency 
  | CodeCodeInconsistency 
  | PhantomPathInconsistency;

interface InconsistencyReport {
  metadata: {
    timestamp: string;
    projectRoot: string;
    filesChecked: number;
    durationMs: number;
  };
  issues: Inconsistency[];
  summary: {
    total: number;
    codeVsDoc: number;
    codeVsCode: number;
    phantomPath: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
}

function extractExports(sourceContent: string): string[]

function checkCodeVsDoc(
  sourceContent: string,
  sumFile: SumFileContent,
  filePath: string
): CodeDocInconsistency | null

function checkCodeVsCode(
  files: Array<{ path: string; content: string }>
): CodeCodeInconsistency[]

function checkPhantomPaths(
  agentsMdPath: string,
  content: string,
  projectRoot: string
): PhantomPathInconsistency[]

function buildInconsistencyReport(
  issues: Inconsistency[],
  metadata: Partial<InconsistencyReport['metadata']>
): InconsistencyReport

function formatReportForCli(report: InconsistencyReport): string
```

### Writers (`src/generation/writers/sum.ts`, `src/generation/writers/agents-md.ts`)

```typescript
interface SumFileContent {
  summary: string;
  metadata: {
    purpose: string;
    criticalTodos?: string[];
    relatedFiles?: string[];
  };
  generatedAt: string;
  contentHash: string;
}

async function writeSumFile(
  sourcePath: string,
  content: SumFileContent
): Promise<void>

async function readSumFile(
  sumPath: string
): Promise<SumFileContent | null>

function getSumPath(sourcePath: string): string

async function sumFileExists(sourcePath: string): Promise<boolean>

async function writeAnnexFile(
  sourcePath: string,
  sourceContent: string
): Promise<void>

function getAnnexPath(sourcePath: string): string

async function writeAgentsMd(
  dirPath: string,
  projectRoot: string,
  content: string
): Promise<void>

function isGeneratedAgentsMd(agentsMdPath: string): boolean

const GENERATED_MARKER = '<!-- Generated by agents-reverse-engineer -->';
```

### Installer (`src/installer/index.ts`)

```typescript
type Runtime = 'claude' | 'opencode' | 'gemini' | 'all';
type Location = 'global' | 'local';

interface InstallerArgs {
  runtime?: Runtime;
  global: boolean;
  local: boolean;
  uninstall: boolean;
  force: boolean;
  help: boolean;
  quiet: boolean;
}

interface InstallerResult {
  success: boolean;
  runtime: Exclude<Runtime, 'all'>;
  location: Location;
  filesCreated: string[];
  filesSkipped: string[];
  errors: string[];
  hookRegistered?: boolean;
  versionWritten?: boolean;
}

function parseInstallerArgs(args: string[]): InstallerArgs

async function runInstaller(): Promise<void>

async function runInstall(args: InstallerArgs): Promise<InstallerResult[]>

async function runUninstall(args: InstallerArgs): Promise<InstallerResult[]>
```

### Trace Infrastructure (`src/orchestration/trace.ts`)

```typescript
type TraceEventType = 
  | 'phase:start' | 'phase:end'
  | 'worker:start' | 'worker:end'
  | 'task:pickup' | 'task:done' | 'task:start'
  | 'subprocess:spawn' | 'subprocess:exit'
  | 'retry'
  | 'discovery:start' | 'discovery:end'
  | 'filter:applied'
  | 'plan:created'
  | 'config:loaded';

interface ITraceWriter {
  emit(event: TraceEventPayload): void;
  finalize(): Promise<void>;
}

function createTraceWriter(
  projectRoot: string,
  enabled: boolean
): ITraceWriter

async function cleanupOldTraces(
  projectRoot: string,
  keepCount?: number
): Promise<number>
```

## 4. Data Structures & State

### Configuration Schema (`src/config/schema.ts`)

```typescript
interface ExcludeConfig {
  patterns: string[];
  vendorDirs: string[];
  binaryExtensions: string[];
}

interface OptionsConfig {
  followSymlinks: boolean;
  maxFileSize: number;
}

interface OutputConfig {
  colors: boolean;
}

interface AIConfig {
  backend: 'claude' | 'gemini' | 'opencode' | 'auto';
  model: string | null;
  timeoutMs: number;
  maxRetries: number;
  concurrency: number;
  telemetry: {
    enabled: boolean;
    keepRuns: number;
    costThresholdUsd: number;
  };
  pricing: {
    claude: TokenPricing;
    gemini: TokenPricing;
    opencode: TokenPricing;
  };
}

interface TokenPricing {
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
  cacheReadCostPer1kTokens: number;
  cacheCreationCostPer1kTokens: number;
}
```

### Execution Plan Types (`src/generation/executor.ts`)

```typescript
interface ExecutionTask {
  id: string;
  type: 'file' | 'directory' | 'root';
  path: string;
  absolutePath: string;
  outputPath: string;
  systemPrompt: string;
  userPrompt: string;
  dependencies: string[];
  metadata: Record<string, unknown>;
}

interface ComplexityMetrics {
  fileCount: number;
  directoryDepth: number;
  directories: Set<string>;
  files: string[];
}
```

### Telemetry Types (`src/ai/telemetry/logger.ts`)

```typescript
interface TelemetryEntry {
  timestamp: string;
  prompt: string;
  response: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  durationMs: number;
  exitCode: number;
  retryCount: number;
  filesRead?: FileRead[];
}

interface FileRead {
  path: string;
  sizeBytes: number;
  linesRead?: number;
}

interface RunLog {
  runId: string;
  startTime: string;
  endTime: string;
  entries: TelemetryEntry[];
  summary: {
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
    totalDurationMs: number;
    errorCount: number;
    uniqueFilesRead: number;
  };
}
```

### Quality Report Types (`src/quality/types.ts`)

```typescript
interface CodeDocInconsistency {
  type: 'code-vs-doc';
  severity: 'error';
  filePath: string;
  description: string;
  missingFromDoc: string[];
}

interface CodeCodeInconsistency {
  type: 'code-vs-code';
  severity: 'warning';
  symbol: string;
  pattern: 'duplicate-export';
  files: string[];
  description: string;
}

interface PhantomPathInconsistency {
  type: 'phantom-path';
  severity: 'warning';
  agentsMdPath: string;
  description: string;
  details: {
    referencedPath: string;
    resolvedTo: string;
    context: string;
  };
}
```

### State Management Patterns

**In-Memory Caches:** `CommandRunner` maintains `sourceContentCache: Map<string, string>` during Phase 1, cleared after quality validation to free memory. `oldSumCache: Map<string, SumFileContent>` stores pre-Phase 1 summaries for stale documentation detection.

**Promise-Chain Write Queues:** `PlanTracker.writeQueue`, `ProgressLog.writeQueue`, `TraceWriter.writeQueue` serialize concurrent writes via `this.writeQueue = this.writeQueue.then(() => writeOp())` pattern.

**Shared Iterator State:** `runPool()` creates `tasks.entries()` iterator consumed by N workers via `for (const [index, task] of iterator)` loop. Iterator protocol ensures atomic task pulling without explicit locking.

**Serialized Trace Sequence:** `TraceWriter.seq` increments monotonically on each `emit()` call, auto-populated before NDJSON write.

## 5. Configuration

### Configuration File Schema

**Location:** `.agents-reverse-engineer/config.yaml`

**Schema Definition:** Validated via Zod in `src/config/schema.ts`

```yaml
exclude:
  patterns:              # string[] - Gitignore-style globs
  vendorDirs:           # string[] - Third-party directories
  binaryExtensions:     # string[] - Non-text file extensions

options:
  followSymlinks: false # boolean - Follow symbolic links during discovery
  maxFileSize: 1048576  # number - Binary detection threshold (bytes)

output:
  colors: true          # boolean - Enable ANSI color codes in CLI output

ai:
  backend: 'auto'       # 'claude' | 'gemini' | 'opencode' | 'auto'
  model: null           # string | null - Override backend default model
  timeoutMs: 120000     # number - Subprocess timeout (milliseconds)
  maxRetries: 3         # number - Exponential backoff retry attempts
  concurrency: 2        # number - Worker pool size (1-20)
  
  telemetry:
    enabled: true       # boolean - Write run logs
    keepRuns: 50        # number - Retention limit
    costThresholdUsd: 10  # number - Warning threshold
  
  pricing:              # Per-backend token cost configuration
    claude:
      inputCostPer1kTokens: 0.003
      outputCostPer1kTokens: 0.015
      cacheReadCostPer1kTokens: 0.0003
      cacheCreationCostPer1kTokens: 0.00375
```

### Default Values (`src/config/defaults.ts`)

**Vendor Directories:**
```typescript
DEFAULT_VENDOR_DIRS = [
  'node_modules', '.git', 'dist', 'build', 'target',
  '.next', '__pycache__', 'venv', '.venv', '.cargo',
  '.gradle', '.agents-reverse-engineer', '.agents',
  '.planning', '.claude', '.opencode', '.gemini'
]
```

**Exclude Patterns:**
```typescript
DEFAULT_EXCLUDE_PATTERNS = [
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '**/.*', '**/*.log', '**/*.sum', '**/AGENTS.md',
  '**/CLAUDE.md', '**/GENERATION-PLAN.md'
]
```

**Binary Extensions:**
```typescript
DEFAULT_BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', '.xz', '.tgz',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.msi', '.app', '.dmg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac', '.ogg',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.class', '.pyc', '.pyo', '.o', '.obj', '.a', '.lib', '.wasm',
  '.db', '.sqlite', '.sqlite3', '.mdb'
]
```

**Concurrency Formula:**
```typescript
function getDefaultConcurrency(): number {
  const cores = os.cpus().length;
  const totalMemGB = os.totalmem() / (1024 ** 3);
  const memCap = totalMemGB > 1 
    ? Math.floor((totalMemGB * 0.5) / 0.512)
    : Infinity;
  const computed = cores * 5;
  return clamp(computed, MIN_CONCURRENCY, Math.min(memCap, MAX_CONCURRENCY));
}

const MIN_CONCURRENCY = 2;
const MAX_CONCURRENCY = 20;
```

### Environment Variable Overrides

**Runtime Paths:**
- `CLAUDE_CONFIG_DIR` — Override `~/.claude` default
- `OPENCODE_CONFIG_DIR` — Override `~/.config/opencode` default (takes precedence over `XDG_CONFIG_HOME`)
- `GEMINI_CONFIG_DIR` — Override `~/.gemini` default

**Hook Control:**
- `ARE_DISABLE_HOOK=1` — Disable session lifecycle hooks

### Validation Rules

**Zod Constraints:**
- `ai.concurrency`: `z.number().min(1).max(20)`
- `ai.timeoutMs`: `z.number().positive()`
- `ai.telemetry.keepRuns`: `z.number().min(0)` (0 = unlimited)
- `options.maxFileSize`: `z.number().positive()`
- `ai.backend`: `z.enum(['claude', 'gemini', 'opencode', 'auto'])`

**YAML Metacharacter Quoting:** Patterns containing `[*{}\[\]?,:#&!|>'"%@\`]` double-quoted with backslash escaping (`\` → `\\`, `"` → `\"`).

## 6. Dependencies

### Production Dependencies

**fast-glob** (^3.3.2): Glob pattern file discovery with `absolute: true`, `onlyFiles: true`, `dot: true` options. Chosen for superior performance over alternatives (globby, glob) and native ignore pattern support.

**ignore** (^7.0.0): Gitignore parsing implementing git ignore spec. Used in `createGitignoreFilter()` and `createCustomFilter()` for relative path normalization and pattern matching.

**isbinaryfile** (^5.0.4): Binary file detection via content analysis. Fallback for unknown extensions in `createBinaryFilter()` after extension/size fast paths.

**simple-git** (^3.27.0): Git command wrapper for change detection. Executes `git diff --name-status -M` for rename detection with 50% similarity threshold, `git.status()` for uncommitted changes merge.

**yaml** (^2.7.0): YAML serialization for config file generation. Chosen over `js-yaml` for ESM compatibility and TypeScript types.

**zod** (^3.24.1): Schema validation with type inference. Used in `ConfigSchema` for `.agents-reverse-engineer/config.yaml` validation, Claude CLI response parsing via `ClaudeResponseSchema`.

**ora** (^8.1.1): Terminal spinner UI for progress indication. Displays animated spinners during long-running operations with `spinner.start()`, `spinner.succeed()`, `spinner.fail()`.

**picocolors** (^1.1.1): ANSI color formatting without `chalk` overhead. Used in `createLogger()` for terminal output styling with zero dependencies and <1KB footprint.

### Development Dependencies

**typescript** (^5.7.3): TypeScript compiler with `tsc` build script. Configuration: target ES2022, module NodeNext (native ES modules), strict type-checking enabled.

**tsx** (^4.19.2): TypeScript execution for development mode. Used in `npm run dev` script with `tsx watch src/cli/index.ts` for hot reload.

**@types/node** (^22.10.2): Node.js type definitions for built-in modules (`fs`, `path`, `child_process`, `os`, `crypto`).

### Optional AI Backend Dependencies

**@anthropic-ai/claude-code** (not in package.json): Claude CLI for backend execution. Installed globally via `npm install -g @anthropic-ai/claude-code`, detected by `isCommandOnPath('claude')`.

**Gemini CLI** (not in package.json): Google Gemini CLI (stub backend). Installation instructions: `npm install -g @anthropic-ai/gemini-cli` + https://github.com/google-gemini/gemini-cli.

**OpenCode CLI** (not in package.json): OpenCode CLI (stub backend). Installation: `curl -fsSL https://opencode.ai/install | bash` + https://opencode.ai.

### Rationale for Key Choices

**fast-glob over globby/glob:** 2-5x faster on large codebases, native ignore patterns reduce filter chain complexity.

**simple-git over nodegit:** Pure JavaScript implementation avoids native binding compilation, smaller footprint, sufficient for read-only git operations.

**zod over joi/yup:** Type inference eliminates duplicate type declarations, tree-shakeable ESM exports, superior TypeScript integration.

**picocolors over chalk:** Zero dependencies, 14x smaller bundle size, identical API surface for ANSI styling.

**ignore library over manual parsing:** Battle-tested gitignore spec implementation, handles edge cases (negation patterns, directory-only markers, trailing slashes).

## 7. Behavioral Contracts

### Runtime Behavior

**Error Types and Codes:**

`AIServiceError` discriminated by `code` field:
- `'CLI_NOT_FOUND'` — No available backend detected via PATH scan
- `'TIMEOUT'` — Subprocess exceeded `timeoutMs` (SIGTERM → SIGKILL)
- `'PARSE_ERROR'` — JSON parsing failed on Claude CLI stdout
- `'SUBPROCESS_ERROR'` — Non-zero exit code without timeout
- `'RATE_LIMIT'` — Stderr matches rate limit patterns (retryable)

**Exit Codes:**

CLI commands return:
- `0` — Full success (all tasks completed)
- `1` — Partial failure (some tasks failed, `filesFailed > 0 && filesProcessed > 0`) or config already exists (init)
- `2` — Total failure (`filesProcessed === 0 && filesFailed > 0`) or CLI not found

**Retry Logic:**

Exponential backoff via `withRetry()`:
```typescript
delay = min(baseDelayMs * multiplier^attempt, maxDelayMs) + jitter
```
- `baseDelayMs`: 1000ms
- `maxDelayMs`: 8000ms
- `multiplier`: 2
- `jitter`: uniform random 0-500ms
- `maxRetries`: 3 (configurable)

Rate-limit retry enabled via `isRetryable()` predicate, timeout excluded (resource constraint).

**Concurrency Model:**

Iterator-based worker pool sharing `tasks.entries()` iterator:
```typescript
const effectiveConcurrency = Math.min(options.concurrency, tasks.length);
const workers = Array.from({ length: effectiveConcurrency }, (_, i) => 
  workerFunction(i, tasks.entries())
);
await Promise.all(workers);
```

Workers race to pull tasks via `for (const [index, task] of iterator)` loop. Atomic task pickup prevents over-allocation.

**Lifecycle Hooks:**

Session hooks spawned as detached background processes:
```javascript
spawn(process.execPath, ['-e', scriptString], {
  stdio: 'ignore',
  detached: true,
  windowsHide: true
}).unref()
```

Serialized script strings execute inline logic (version checks, git status, npm spawn). Parent exits immediately, child completes asynchronously.

**Resource Management:**

Subprocess environment variables:
- `NODE_OPTIONS='--max-old-space-size=512'` — 512MB heap limit
- `UV_THREADPOOL_SIZE='4'` — 4-thread libuv pool
- `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS='1'` — Disable background tasks

Timeout enforcement:
```typescript
const timer = setTimeout(() => {
  kill(-child.pid, 'SIGTERM');
  setTimeout(() => kill(-child.pid, 'SIGKILL'), 5000);
}, timeoutMs);
timer.unref();
```

Process group killing via negative PID terminates subprocess tree.

### Implementation Contracts

#### Regex Patterns

**Export Extraction (`src/quality/inconsistency/code-vs-doc.ts`):**
```regex
/^[ \t]*export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/gm
```
Captures identifier from line-start whitespace, `export` keyword, optional `default`, declaration keyword, identifier name.

**Phantom Path Detection (`src/quality/phantom-paths/validator.ts`):**

Markdown links:
```regex
/\[(?:[^\]]*)\]\((\.[^)]+)\)/g
```

Backtick paths:
```regex
/`((?:src\/|\.\.?\/)[^`]+\.[a-z]{1,4})`/g
```

Prose-embedded paths:
```regex
/(?:from|in|by|via|see)\s+`?(src\/[\w\-./]+)`?/gi
```

**Import Extraction (`src/imports/extractor.ts`):**
```regex
/^import\s+(type\s+)?(?:\{([^}]*)\}|(\*\s+as\s+\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/gm
```
Matches static ES module imports with type-only detection, destructured symbols, namespace imports, default imports.

**Preamble Detection (`src/orchestration/runner.ts`):**

Separator pattern:
```typescript
responseText.indexOf('\n---\n') >= 0 && separatorIndex < 500
```

Bold header pattern:
```regex
/^[\s\S]{0,500}?(\*\*[A-Z])/
```
Strips preceding content if match index <300 chars and no `##` markers present.

**Content Splitting (`src/specify/writer.ts`):**
```regex
/^(?=# )/m
```
Matches lines starting with exactly `# ` (top-level headings) for multi-file spec splitting.

#### Format Strings and Output Templates

**YAML Frontmatter Format (`src/generation/writers/sum.ts`):**
```yaml
---
generated_at: 2026-02-09T12:34:56.789Z
content_hash: a3f5d8e9... (SHA-256 hex, 64 chars)
purpose: Single-line description
critical_todos: [item1, item2]  # Inline if <40 chars and ≤3 items
related_files:                  # Multi-line if >40 chars or >3 items
  - path/to/file.ts
---

Markdown summary content...
```

**Trace Filename Pattern (`src/orchestration/trace.ts`):**
```typescript
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const filename = `trace-${timestamp}.ndjson`;
```
Example: `trace-2026-02-09T12-34-56-789Z.ndjson`

**Run Log Filename Pattern (`src/ai/telemetry/run-log.ts`):**
```typescript
const timestamp = runLog.startTime.replace(/:/g, '-').replace(/\./g, '-');
const filename = `run-${timestamp}.json`;
```
Example: `run-2026-02-09T12-34-56-789Z.json`

**Progress Log Line Formats (`src/orchestration/progress.ts`):**
```
[X/Y] ANALYZING path
[X/Y] DONE path Xs in/out tok model ~Ns remaining
[X/Y] FAIL path error
```

**Plan Tracker Checkbox Format (`src/orchestration/plan-tracker.ts`):**
```markdown
- [ ] `relative/path/to/file.ts`
- [x] `relative/path/to/file.ts`  # After completion
```

#### Magic Constants and Sentinel Values

**Timeouts:**
- `DEFAULT_TIMEOUT_MS = 120_000` (2 minutes subprocess timeout)
- `SIGKILL_GRACE_MS = 5_000` (5 seconds SIGKILL escalation)
- `NPM_VERSION_CHECK_TIMEOUT_MS = 10_000` (hooks)

**Concurrency Limits:**
- `MIN_CONCURRENCY = 2` (enforced minimum worker pool size)
- `MAX_CONCURRENCY = 20` (enforced maximum worker pool size)
- `QUALITY_CHECK_CONCURRENCY = 10` (post-generation validation)
- `SUM_CACHE_READ_CONCURRENCY = 20` (pre-Phase 1 old .sum reads)
- `FILTER_CHAIN_CONCURRENCY = 30` (discovery filter application)

**Buffer Sizes:**
- `maxBuffer: 10 * 1024 * 1024` (10MB subprocess stdout/stderr capture)
- `DEFAULT_MAX_FILE_SIZE = 1048576` (1MB binary detection threshold)

**Retention Limits:**
- `DEFAULT_KEEP_RUNS = 50` (telemetry log retention)
- `DEFAULT_KEEP_TRACES = 500` (trace file retention)

**Retry Parameters:**
```typescript
DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
  multiplier: 2
}
```

**ETA Calculation:**
- `ETA_WINDOW_SIZE = 10` (moving average window)
- `ETA_MIN_COMPLETIONS = 2` (minimum samples before displaying)

**Path Length Limits:**
- `PURPOSE_MAX_LENGTH = 120` (truncate with `...` ellipsis)
- `PHANTOM_PATH_CONTEXT_LENGTH = 120` (truncate containing line)

#### Rate Limit Detection Patterns

```typescript
const RATE_LIMIT_PATTERNS = [
  'rate limit',
  '429',
  'too many requests',
  'overloaded'
];
```
Case-insensitive substring matching on stderr for retry eligibility.

#### Environment Variables

**Path Overrides:**
- `CLAUDE_CONFIG_DIR` — Default: `~/.claude`
- `OPENCODE_CONFIG_DIR` — Default: `~/.config/opencode` (overrides `XDG_CONFIG_HOME`)
- `GEMINI_CONFIG_DIR` — Default: `~/.gemini`

**Hook Control:**
- `ARE_DISABLE_HOOK='1'` — Disable session lifecycle hooks

**Subprocess Environment (injected by `runSubprocess()`):**
- `NODE_OPTIONS='--max-old-space-size=512'`
- `UV_THREADPOOL_SIZE='4'`
- `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS='1'`

#### File Format Specifications

**NDJSON Trace Event Schema:**
```typescript
interface TraceEvent {
  seq: number;           // Monotonic sequence
  ts: string;            // ISO 8601 timestamp
  pid: number;           // process.pid
  type: TraceEventType;  // Discriminator
  elapsedMs: number;     // High-resolution delta
  // Type-specific fields
}
```
One JSON object per line, auto-populated base fields, promise-chain serialization.

**Run Log JSON Schema:**
```typescript
interface RunLog {
  runId: string;         // ISO timestamp
  startTime: string;     // ISO 8601
  endTime: string;       // ISO 8601
  entries: TelemetryEntry[];
  summary: {
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
    totalDurationMs: number;
    errorCount: number;
    uniqueFilesRead: number;
  };
}
```
Pretty-printed JSON with 2-space indentation.

**Settings.json Hook Registration Schema (Claude):**
```typescript
interface SettingsJson {
  hooks?: {
    SessionStart?: Array<{
      hooks: Array<{
        type: 'command';
        command: string;
      }>;
    }>;
    SessionEnd?: Array<{
      hooks: Array<{
        type: 'command';
        command: string;
      }>;
    }>;
  };
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
}
```

**Settings.json Hook Registration Schema (Gemini):**
```typescript
interface GeminiSettingsJson {
  hooks?: {
    SessionStart?: Array<{
      name: string;
      type: 'command';
      command: string;
    }>;
    SessionEnd?: Array<{
      name: string;
      type: 'command';
      command: string;
    }>;
  };
}
```

#### Manifest Detection Types

Nine supported manifest formats in `extractDirectoryImports()`:
```typescript
const MANIFEST_TYPES = [
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'pom.xml',
  'build.gradle',
  'Gemfile',
  'composer.json',
  'CMakeLists.txt',
  'Makefile'
];
```

#### Generated File Marker

```typescript
const GENERATED_MARKER = '<!-- Generated by agents-reverse-engineer -->';
```
Substring match (no regex) for user-authored AGENTS.md detection.

#### Preamble Prefix Patterns

```typescript
const PREAMBLE_PREFIXES = [
  'now i', 'perfect', 'based on', 'let me', 'here is',
  'i\'ll', 'i will', 'great', 'okay', 'sure',
  'certainly', 'alright'
];
```
Case-insensitive matching for LLM conversational preamble detection.

#### Bash Permission Patterns

```typescript
const ARE_PERMISSIONS = [
  'Bash(npx agents-reverse-engineer@latest init*)',
  'Bash(npx agents-reverse-engineer@latest discover*)',
  'Bash(npx agents-reverse-engineer@latest generate*)',
  'Bash(npx agents-reverse-engineer@latest update*)',
  'Bash(npx agents-reverse-engineer@latest clean*)',
  'Bash(rm -f .agents-reverse-engineer/progress.log*)',
  'Bash(sleep *)',
];
```
Registered in Claude Code `settings.json` permissions.allow array.

#### Directory Skip Set

```typescript
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.agents-reverse-engineer',
  'vendor', 'dist', 'build', '__pycache__', '.next',
  'venv', '.venv', 'target', '.cargo', '.gradle'
]);
```
Used in `collectAgentsDocs()` recursive traversal.

## 8. Test Contracts

### Discovery Module Tests

**`src/discovery/run.ts` should verify:**
- Empty directory returns `{files: [], excluded: []}`
- Gitignored files appear in `excluded` with `reason: "matched .gitignore pattern: <pattern>"`
- Binary files detected by extension appear in `excluded` with `reason: "binary file"`
- Vendor directories filtered with `reason: "vendor directory"`
- Custom patterns match against relative paths
- Symlink following respects `options.followSymlinks` flag
- Files exceeding `options.maxFileSize` treated as binary

**Edge cases:**
- `.gitignore` missing (graceful fallback)
- Directory with only excluded files (zero included)
- Nested vendor directories (e.g., `node_modules/pkg/node_modules`)
- Hidden dotfiles (`.env`, `.npmrc`) included when not gitignored

### AI Service Tests

**`src/ai/service.ts` should verify:**
- Rate-limit error triggers retry with exponential backoff
- Timeout error throws `AIServiceError('TIMEOUT')` without retry
- Successful call returns normalized `AIResponse` with token counts
- `setDebug(true)` enables subprocess heap/RSS logging to stderr
- `addFilesReadToLastEntry()` populates `filesRead` array in telemetry
- `finalize()` writes run log to `.agents-reverse-engineer/logs/`

**Error scenarios:**
- CLI not found throws `AIServiceError('CLI_NOT_FOUND')` with install instructions
- Non-zero exit code throws `AIServiceError('SUBPROCESS_ERROR')`
- Malformed JSON response throws `AIServiceError('PARSE_ERROR')`
- Stderr containing "rate limit" triggers retry, exhaustion throws with error code

### Subprocess Resource Management Tests

**`src/ai/subprocess.ts` should verify:**
- Environment variables injected (`NODE_OPTIONS`, `UV_THREADPOOL_SIZE`, `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`)
- SIGTERM sent at `timeoutMs`, SIGKILL after 5s grace period
- Process group killing terminates child and descendants via `kill(-pid)`
- `onSpawn(pid)` callback invoked synchronously before `execFile` callback
- `maxBuffer` limit prevents memory exhaustion on excessive stdout

**Edge cases:**
- Child process ignoring SIGTERM (SIGKILL escalation)
- Subprocess spawning grandchildren (process group termination)
- Rapid timeout (SIGKILL before SIGTERM grace period)

### Worker Pool Tests

**`src/orchestration/pool.ts` should verify:**
- Shared iterator prevents duplicate task execution
- Effective concurrency = `min(options.concurrency, tasks.length)`
- `failFast` aborts remaining tasks after first error
- `onComplete` callback invoked per task settlement in completion order
- Worker IDs unique (`0` to `concurrency-1`)
- Trace events emitted: `worker:start`, `worker:end`, `task:pickup`, `task:done`

**Concurrency scenarios:**
- Single worker (`concurrency=1`) executes sequentially
- Workers idle when `tasks.length < concurrency`
- Slow task doesn't block fast tasks in parallel execution

### Quality Validation Tests

**`src/quality/inconsistency/code-vs-doc.ts` should verify:**
- `extractExports()` captures `export function foo`, `export class Bar`, `export const Baz`
- `checkCodeVsDoc()` returns `null` when all exports appear in summary
- `checkCodeVsDoc()` returns `CodeDocInconsistency` with `missingFromDoc` when exports absent
- Regex ignores non-exported symbols and inline comments

**Edge cases:**
- `export default function` (captures `function` keyword)
- Multi-line export statements
- Re-exports `export { foo } from './bar'` (not captured by regex)

**`src/quality/inconsistency/code-vs-code.ts` should verify:**
- Single file with duplicates returns empty array (scope filter required)
- Multiple files with same symbol returns `CodeCodeInconsistency`
- Case-sensitive symbol matching

**`src/quality/phantom-paths/validator.ts` should verify:**
- Markdown link `[text](./file.ts)` resolved relative to AGENTS.md directory
- Backtick path `` `src/foo.ts` `` resolved relative to project root
- Prose-embedded `see src/bar.ts` extracted and validated
- `.js` extension falls back to `.ts` when unresolved
- URLs, template literals, globs filtered before validation

### Change Detection Tests

**`src/change-detection/detector.ts` should verify:**
- `computeContentHash()` returns consistent SHA-256 for same content
- `getChangedFiles()` maps git status codes: `A` → `'added'`, `M` → `'modified'`, `D` → `'deleted'`, `R100` → `'renamed'`
- `includeUncommitted` merges working tree changes via `git.status()`
- Rename detection extracts `oldPath` from `R` status lines
- Non-git directory returns empty changes when `isGitRepo()` false

**Edge cases:**
- Empty git repo (no commits)
- Detached HEAD state
- Git command failure (permission denied)

### Update Orchestration Tests

**`src/update/orchestrator.ts` should verify:**
- `preparePlan()` compares `.sum` frontmatter hash against current file hash
- Hash match adds to `filesToSkip`, mismatch adds to `filesToAnalyze`
- Deleted files detected when `.sum` exists but source missing
- `getAffectedDirectories()` returns depth-sorted set of parent directories
- `cleanupOrphans()` deletes `.sum` and `.annex.md` for deleted/renamed files
- `cleanupEmptyDirectoryDocs()` removes AGENTS.md when zero source files remain

**Edge cases:**
- First run (no `.sum` files) treats all as added
- Renamed files clean old `.sum`, create new at new path
- Directory with only generated files (AGENTS.md, CLAUDE.md) excluded from cleanup

### Configuration Tests

**`src/config/loader.ts` should verify:**
- Missing config file returns defaults without error
- Invalid YAML throws `ConfigError` with formatted Zod issues
- `writeDefaultConfig()` quotes patterns with YAML metacharacters
- `concurrency` clamped to `[1, 20]` range
- `getDefaultConcurrency()` respects memory constraint formula

**Validation edge cases:**
- Negative `timeoutMs` rejected
- Zero `maxFileSize` rejected
- Invalid `backend` enum value rejected

### Installer Tests

**`src/installer/operations.ts` should verify:**
- `installFiles()` copies command templates to runtime-specific paths
- `registerHooks()` appends SessionStart/SessionEnd hooks to settings.json
- `registerPermissions()` adds `ARE_PERMISSIONS` to Claude permissions.allow
- `verifyInstallation()` checks `existsSync()` for all filesCreated
- Existing files skipped when `force=false`, overwritten when `force=true`

**Platform-specific:**
- Claude: nested hook structure with `hooks` array
- Gemini: flat hook structure with `name` field
- OpenCode: plugins as exported async factory functions

**Uninstallation:**
- `unregisterHooks()` filters by current and legacy command patterns
- `cleanupEmptyDirs()` recursively removes empty parents up to runtime root
- `cleanupLegacyGeminiFiles()` deletes obsolete `.md`/`.toml` formats

### Integration Tests

**End-to-end generate workflow:**
1. `discoverFiles()` returns 10 source files
2. Phase 1 generates 10 `.sum` files with YAML frontmatter
3. Phase 2 generates `AGENTS.md` consuming child summaries
4. Phase 3 generates `CLAUDE.md` consuming all `AGENTS.md`
5. Quality validation reports inconsistencies without throwing
6. Telemetry written to `.agents-reverse-engineer/logs/run-*.json`

**End-to-end update workflow:**
1. `preparePlan()` detects 2 modified files via hash comparison
2. Phase 1 regenerates 2 `.sum` files
3. `getAffectedDirectories()` returns 2 parent directories
4. Directory `AGENTS.md` regenerated for affected directories only
5. Orphan cleanup deletes 1 stale `.sum` for deleted file

## 9. Build Plan

### Phase 1: Core Infrastructure (Foundation)

**Goal:** Establish configuration, logging, and file discovery without AI dependencies.

**Tasks:**
1. Implement `src/config/` with Zod schema validation and YAML serialization
2. Implement `src/output/logger.ts` with picocolors ANSI formatting
3. Implement `src/discovery/walker.ts` with fast-glob traversal
4. Implement four discovery filters: gitignore, vendor, binary, custom
5. Implement `src/discovery/filters/index.ts` bounded-concurrency orchestrator
6. Implement `src/cli/init.ts` and `src/cli/discover.ts` commands
7. Add unit tests for config parsing, filter chain, and logger output

**Enables:** Phase 2 (requires file discovery), Phase 4 (requires config/logging)

**Dependencies:** None (pure Node.js built-ins + dependencies)

### Phase 2: AI Service Abstraction Layer

**Goal:** Backend-agnostic AI orchestration with subprocess management and retry logic.

**Tasks:**
1. Implement `src/ai/types.ts` with AIBackend interface and discriminated error types
2. Implement `src/ai/backends/claude.ts` with Zod response validation
3. Implement `src/ai/subprocess.ts` with resource constraints and process group killing
4. Implement `src/ai/retry.ts` with exponential backoff formula
5. Implement `src/ai/service.ts` with rate-limit detection and telemetry accumulation
6. Implement `src/ai/registry.ts` with backend registration and auto-detection
7. Add stub backends for Gemini and OpenCode throwing `SUBPROCESS_ERROR`
8. Add unit tests for retry logic, timeout enforcement, and backend resolution

**Enables:** Phase 3 (requires AI service for prompt execution)

**Dependencies:** Phase 1 (requires config for backend/timeout settings)

### Phase 3: Generation Pipeline Core

**Goal:** Three-phase orchestration with prompt engineering and writer infrastructure.

**Tasks:**
1. Implement `src/generation/types.ts` with AnalysisResult and SummaryMetadata schemas
2. Implement `src/generation/prompts/templates.ts` with six system prompts
3. Implement `src/generation/prompts/builder.ts` with placeholder substitution
4. Implement `src/generation/writers/sum.ts` with YAML frontmatter serialization
5. Implement `src/generation/writers/agents-md.ts` with user content preservation
6. Implement `src/imports/extractor.ts` with regex-based import parsing
7. Implement `src/generation/orchestrator.ts` with file preparation and task creation
8. Implement `src/generation/executor.ts` with dependency graph construction
9. Implement `src/generation/collector.ts` with recursive AGENTS.md traversal
10. Add unit tests for prompt building, frontmatter parsing, and user content detection

**Enables:** Phase 4 (requires generation plan for execution)

**Dependencies:** Phase 2 (requires AI service for LLM calls)

### Phase 4: Worker Pool and Command Runner

**Goal:** Concurrent execution orchestration with progress tracking and trace emission.

**Tasks:**
1. Implement `src/orchestration/pool.ts` with shared iterator pattern
2. Implement `src/orchestration/progress.ts` with ETA calculation via moving average
3. Implement `src/orchestration/plan-tracker.ts` with promise-chain checkbox updates
4. Implement `src/orchestration/trace.ts` with NDJSON serialization
5. Implement `src/orchestration/runner.ts` with three-phase pipeline execution
6. Implement `src/cli/generate.ts` command with dry-run and trace flags
7. Add integration tests for worker pool concurrency and trace event ordering

**Enables:** Phase 5 (requires runner for quality validation timing)

**Dependencies:** Phase 3 (requires generation plan and writers)

### Phase 5: Quality Validation Subsystem

**Goal:** Post-generation inconsistency detection without blocking pipeline.

**Tasks:**
1. Implement `src/quality/types.ts` with discriminated Inconsistency union
2. Implement `src/quality/inconsistency/code-vs-doc.ts` with regex export extraction
3. Implement `src/quality/inconsistency/code-vs-code.ts` with symbol aggregation
4. Implement `src/quality/phantom-paths/validator.ts` with three path extraction patterns
5. Implement `src/quality/inconsistency/reporter.ts` with CLI formatting
6. Integrate quality checks in `CommandRunner.executeGenerate()` after Phase 1 and Phase 2
7. Add unit tests for regex patterns, path resolution, and report formatting

**Enables:** Phase 9 (quality metrics in telemetry)

**Dependencies:** Phase 4 (requires runner execution context)

### Phase 6: Change Detection and Incremental Updates

**Goal:** Hash-based incremental updates with git integration and orphan cleanup.

**Tasks:**
1. Implement `src/change-detection/detector.ts` with SHA-256 hashing and git diff parsing
2. Implement `src/update/orchestrator.ts` with hash comparison and affected directory computation
3. Implement `src/update/orphan-cleaner.ts` with `.sum`/`.annex.md` deletion
4. Implement `CommandRunner.executeUpdate()` with Phase 1-only execution
5. Implement `src/cli/update.ts` with uncommitted flag and delta reporting
6. Add integration tests for rename detection, orphan cleanup, and directory propagation

**Enables:** Phase 8 (session-end hooks invoke update command)

**Dependencies:** Phase 4 (requires runner), Phase 3 (requires writers for hash comparison)

### Phase 7: Project Specification Synthesis

**Goal:** Multi-file spec generation from AGENTS.md corpus with annex support.

**Tasks:**
1. Implement `src/specify/prompts.ts` with 11-section system prompt
2. Implement `src/specify/writer.ts` with content splitting and slugification
3. Implement `src/generation/collector.ts` extension for annex file collection
4. Implement `src/cli/specify.ts` with auto-generation fallback and force override
5. Add unit tests for heading splitting, slug sanitization, and existence checks

**Enables:** None (terminal feature)

**Dependencies:** Phase 3 (requires AGENTS.md collector)

### Phase 8: IDE Integration and Installer

**Goal:** Platform-specific command installation with hook lifecycle management.

**Tasks:**
1. Implement `src/integration/detect.ts` with marker file detection
2. Implement `src/integration/templates.ts` with platform-specific command generation
3. Implement `src/integration/generate.ts` with template instantiation
4. Implement `src/installer/paths.ts` with environment variable overrides
5. Implement `src/installer/prompts.ts` with TTY arrow-key selection and fallback
6. Implement `src/installer/operations.ts` with settings.json modification
7. Implement `src/installer/uninstall.ts` with orphan cleanup
8. Implement hook scripts in `hooks/` (SessionStart version check, SessionEnd auto-update)
9. Implement `scripts/build-hooks.js` copying hooks to `hooks/dist/`
10. Add integration tests for settings.json parsing and hook registration

**Enables:** None (terminal feature)

**Dependencies:** Phase 6 (hooks invoke update command)

### Phase 9: Telemetry and Trace Infrastructure

**Goal:** Comprehensive observability with token cost tracking and retention management.

**Tasks:**
1. Implement `src/ai/telemetry/logger.ts` with TelemetryEntry accumulation
2. Implement `src/ai/telemetry/run-log.ts` with RunLog serialization
3. Implement `src/ai/telemetry/cleanup.ts` with lexicographic retention
4. Implement trace writer finalization in `CommandRunner` after Phase 3
5. Implement `cleanupOldTraces()` and `cleanupOldLogs()` invocations
6. Add unit tests for summary computation and retention enforcement

**Enables:** None (observability enhancement)

**Dependencies:** Phase 5 (quality metrics in run summary)

### Phase 10: CLI Polish and Distribution

**Goal:** Production-ready CLI with help text, error handling, and npm packaging.

**Tasks:**
1. Implement `src/cli/clean.ts` with marker-based AGENTS.md filtering
2. Implement `src/cli/help.ts` with command reference
3. Add shebang and binary entry points in `package.json`
4. Implement `prepublishOnly` npm script with TypeScript build and hook copying
5. Configure `.github/workflows/publish.yml` with provenance attestation
6. Add README.md with installation workflows and command reference
7. Add LICENSE file (MIT)
8. Publish to npm registry

**Enables:** User adoption

**Dependencies:** All phases (final integration)

### Critical Path

Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 9 → Phase 10

Phases 7 and 8 can proceed in parallel after Phase 3 completes.

## 10. Prompt Templates & System Instructions

### File Analysis System Prompt (`src/generation/prompts/templates.ts`)

```
You are analyzing source code to generate documentation for AI coding assistants.

TASK:
Analyze the file and produce a dense, identifier-rich summary. Choose the documentation topics most relevant to THIS specific file. Do not follow a fixed template — adapt your sections to what matters most.

Consider topics such as (choose what applies):
- What this file IS (its role in the project)
- Public interface: exported functions, classes, types, constants with signatures
- Key algorithms, data structures, or state management
- Integration points and coupling with other modules
- Configuration, environment, or runtime requirements
- Error handling strategies or validation boundaries
- Concurrency, lifecycle, or resource management concerns
- Domain-specific patterns (middleware chains, event handlers, schema definitions, factories)
- Behavioral contracts: verbatim regex patterns, format strings, output templates, magic constants, sentinel values, error code strings, environment variable names

DENSITY RULES (MANDATORY):
- Every sentence must reference at least one specific identifier (function name, class name, type name, or constant)
- Never use filler phrases: "this file", "this module", "provides", "responsible for", "is used to", "basically", "essentially", "provides functionality for"
- Use the pattern: "[ExportName] does X" not "The ExportName function is responsible for doing X"
- Use technical shorthand: "exports X, Y, Z" not "this module exports a function called X..."
- Compress descriptions: "parses YAML frontmatter from .sum files" not "responsible for the parsing of YAML-style frontmatter..."

ANCHOR TERM PRESERVATION (MANDATORY):
- All exported function/class/type/const names MUST appear in the summary exactly as written in source
- Key parameter types and return types MUST be mentioned
- Preserve exact casing of identifiers (e.g., buildAgentsMd, not "build agents md")
- Missing any exported identifier is a failure

WHAT TO INCLUDE:
- All exported function/class/type/const names
- Parameter types and return types for public functions
- Key dependencies and what they're used for
- Notable design patterns (name them explicitly: "Strategy pattern", "Builder pattern", etc.)
- Only critical TODOs (security, breaking issues)

WHAT TO EXCLUDE:
- Control flow minutiae (loop structures, variable naming, temporary state)
- Generic descriptions without identifiers
- Filler phrases and transitions

BEHAVIORAL CONTRACTS (NEVER EXCLUDE):
- Regex patterns for parsing/validation/extraction — include the full pattern verbatim in backticks
- Format strings, output templates, serialization structures — show exact format
- Magic constants, sentinel values, numeric thresholds (timeouts, buffer sizes, retry counts)
- Prompt text or template strings that control AI/LLM behavior
- Error message patterns and error code strings used for matching
- Environment variable names and their expected values
- File format specifications (YAML frontmatter schemas, NDJSON line formats)
These define observable behavior that must be reproduced exactly.

REPRODUCTION-CRITICAL CONTENT (ANNEX OVERFLOW):
Some files exist primarily to define large string constants, prompt templates,
configuration arrays, default value sets, or command/IDE template content.
For these files:
- Write a CONCISE summary following the standard density and length rules
- List each constant/export by name with a one-line description of its role
- Do NOT attempt to reproduce multi-line string constants verbatim in the summary
- Instead, end the summary with a dedicated ## Annex References section listing
  each reproduction-critical constant:

  ## Annex References
  - `FILE_SYSTEM_PROMPT` — system prompt for file analysis (250 lines)
  - `DIRECTORY_SYSTEM_PROMPT` — system prompt for AGENTS.md generation (150 lines)

  The pipeline will extract the actual constant values from source code and write
  them to a companion annex file automatically. Your job is to IDENTIFY which
  constants are reproduction-critical, not to reproduce them inline.

For files that are primarily logic (functions, classes, algorithms), ignore this
section — it does not apply.

OUTPUT FORMAT (MANDATORY):
- Start your response DIRECTLY with the purpose statement — a single bold line: **Purpose statement here.**
- Do NOT include any preamble, thinking, or meta-commentary before the purpose statement
- Do NOT say "Here is...", "Now I'll...", "Based on my analysis...", "Let me create...", "Perfect."
- Your response IS the documentation — not a message about the documentation
```

### File Analysis User Prompt Template (`src/generation/prompts/templates.ts`)

```
Analyze this source file and generate a summary that captures what an AI coding assistant needs to know to work with this file effectively.

File: {{FILE_PATH}}

```{{LANG}}
{{CONTENT}}
```
{{PROJECT_PLAN_SECTION}}
Lead with a single bold purpose statement: **[FileName] does X.**
Then use ## headings to organize the remaining content.
Every file MUST include at minimum:
- A purpose statement (first line, bold)
- Exported symbols with signatures (under any appropriate heading)
Choose additional sections based on file content.
```

### File Update System Prompt (`src/generation/prompts/templates.ts`)

```
You are updating an existing file summary for an AI coding assistant. The source code has changed and the summary needs to reflect those changes.

CRITICAL — INCREMENTAL UPDATE RULES:
- You are given the EXISTING summary and the UPDATED source code
- Preserve the structure, section headings, and phrasing of the existing summary wherever the underlying code is unchanged
- Only modify content that is directly affected by the code changes
- If a section describes code that has not changed, keep it VERBATIM — do not rephrase, reorganize, or "improve" stable text
- Add new sections only if the code changes introduce entirely new concepts
- Remove sections only if the code they described has been deleted
- Update signatures, type names, and identifiers to match the current source exactly

BEHAVIORAL CONTRACT PRESERVATION (MANDATORY):
- Regex patterns, format strings, magic constants, and template content from the existing summary MUST be preserved verbatim unless the source code changed them
- If source code changes a regex pattern or constant, update the summary to show the NEW value verbatim
- Never summarize or paraphrase regex patterns — always show the exact pattern in backticks

DENSITY RULES (MANDATORY):
- Every sentence must reference at least one specific identifier (function name, class name, type name, or constant)
- Never use filler phrases: "this file", "this module", "provides", "responsible for", "is used to", "basically", "essentially", "provides functionality for"
- Use the pattern: "[ExportName] does X" not "The ExportName function is responsible for doing X"
- Use technical shorthand: "exports X, Y, Z" not "this module exports a function called X..."

ANCHOR TERM PRESERVATION (MANDATORY):
- All exported function/class/type/const names MUST appear in the summary exactly as written in source
- Key parameter types and return types MUST be mentioned
- Preserve exact casing of identifiers
- Missing any exported identifier is a failure

OUTPUT FORMAT (MANDATORY):
- Start your response DIRECTLY with the purpose statement — a single bold line: **Purpose statement here.**
- Do NOT include any preamble, thinking, or meta-commentary before the purpose statement
- Do NOT say "Here is...", "Now I'll...", "Based on my analysis...", "Let me create...", "Perfect."
- Your response IS the documentation — not a message about the documentation
```

### Directory AGENTS.md System Prompt (`src/generation/prompts/templates.ts`)

```
You are generating an AGENTS.md file — a directory-level overview for AI coding assistants.

CRITICAL: Output ONLY the raw markdown content. No code fences, no preamble, no explanations, no conversational text. Your entire response IS the AGENTS.md file content.

OUTPUT FORMAT:
- First line MUST be exactly: <!-- Generated by agents-reverse-engineer -->
- Use a # heading with the directory name
- Write a one-paragraph purpose statement for the directory
usage
ADAPTIVE SECTIONS:
Analyze the directory contents and choose the most relevant sections. Do NOT use a fixed template. Instead, select sections that best document this specific directory for an AI that needs to reconstruct or extend the project.

Consider these section types (choose what applies):
- **Contents**: Group files by purpose/category under ## headings. For each file: markdown link [filename](./filename) and a one-line description.
- **Subdirectories**: If subdirectories exist, list them with links [dirname/](./dirname/) and brief summaries.
- **Architecture / Data Flow**: If files form a pipeline, request/response chain, or layered architecture, document it.
- **Stack**: If this is a package root (has package.json, Cargo.toml, go.mod, etc.), document the technology stack, key scripts, and entry points.
- **Structure**: If the directory layout follows a convention (feature-sliced, domain-driven, MVC, etc.), document it.
- **Patterns**: If files share recurring design patterns (factory, strategy, middleware, barrel re-export), name and document them.
- **Configuration**: If the directory contains config files, schemas, or environment definitions, document the config surface area.
- **API Surface**: If the directory exports a public API (barrel index, route definitions, SDK), document the interface contract.
- **File Relationships**: How files collaborate, depend on each other, or share state.
- **Behavioral Contracts**: If files contain regex patterns, format specifications, magic constants, or template strings that define observable behavior, collect them in a dedicated section. Preserve verbatim patterns from file summaries — do NOT paraphrase regex into prose. This section is MANDATORY when file summaries contain behavioral artifacts.
- **Reproduction-Critical Constants**: If file summaries reference annex files (via ## Annex References sections), list them with links. Example: "Full prompt template text: [templates.ts.annex.md](./prompts/templates.ts.annex.md)". Do NOT reproduce annex content in AGENTS.md — just link to it.

Choose any relevant sections or create your own based on the directory contents. The goal is to provide a comprehensive overview that captures the essence of the directory's role in the project and how its files work together, with a focus on what an AI coding assistant would need to know to effectively interact with this code.

SCOPE:
- AGENTS.md is a NAVIGATIONAL INDEX — help an AI find the right file quickly
- Focus on: what each file does, how files relate, directory-level patterns
- Do NOT reproduce full architecture sections — those belong in the root CLAUDE.md

PATH ACCURACY (MANDATORY):
- When referencing files or modules outside this directory, use ONLY paths from the "Import Map" section
- Do NOT invent, rename, or guess module paths — if a path isn't in the Import Map, don't reference it
- Use the exact directory names from "Project Directory Structure" — do NOT rename directories
  (e.g., if the directory is called "cli", write "src/cli/", NOT "src/commands/")
- Cross-module references must use the specifier format from actual import statements
  (e.g., "../generation/writers/sum.js", NOT "../fs/sum-file.js")
- If you are unsure about a path, omit the cross-reference rather than guessing

CONSISTENCY (MANDATORY):
- Do not contradict yourself within the same document
- If you describe a technique (e.g., "regex-based"), do not call it something else later (e.g., "AST-based")
- When stating version numbers, engines, or config fields, use ONLY values present in the file summaries

DENSITY RULES (MANDATORY):
- Every sentence must reference at least one specific identifier (function name, class name, type name, or constant)
- Never use filler phrases: "this directory", "this module", "provides", "responsible for", "is used to"
- Use technical shorthand: "exports X, Y, Z" not "this module exports a function called X..."
- Per-file descriptions in Contents sections: 1-2 sentences maximum. Reference key symbols but do not reproduce full summaries.
- Behavioral contracts (regex patterns, format specs, constants) belong in a separate Behavioral Contracts section, not in per-file descriptions.
- Annex file references: link to .annex.md files, do not inline their content. One line per annex reference.
- Subdirectory descriptions: 1-2 sentences maximum. Capture the directory's role, not its full contents.

ANCHOR TERM PRESERVATION (MANDATORY):
- Key exported symbols from file summaries MUST appear in the directory overview
- Preserve exact casing of identifiers

USER NOTES:
- If "User Notes" are provided in the prompt, they contain user-defined instructions that will be automatically prepended to your output
- Do NOT repeat or paraphrase user notes in your generated content — they are included separately
- You may reference information from user notes for context
```

### Directory Update System Prompt (`src/generation/prompts/templates.ts`)

```
You are updating an existing AGENTS.md file — a directory-level overview for AI coding assistants. Some file summaries or subdirectory documents have changed, and AGENTS.md needs to reflect those changes.

CRITICAL — INCREMENTAL UPDATE RULES:
- You are given the EXISTING AGENTS.md and the CURRENT file summaries and subdirectory documents
- Preserve the structure, section headings, and descriptions that are still accurate
- Only modify entries for files or subdirectories whose summaries have changed
- Add entries for new files, remove entries for deleted files
- Do NOT reorganize, rephrase, or restructure sections that are unaffected by changes
- Keep the same section ordering unless files were added/removed in a way that requires regrouping
- Behavioral Contracts section: preserve verbatim regex patterns and constants unless source file summaries show they changed
- Reproduction-Critical Constants: if file summaries reference annex files, preserve the links. Add links for new annexes, remove links for deleted ones.

CRITICAL: Output ONLY the raw markdown content. No code fences, no preamble, no explanations, no conversational text. Your entire response IS the AGENTS.md file content.

OUTPUT FORMAT:
- First line MUST be exactly: <!-- Generated by agents-reverse-engineer -->
- Use a # heading with the directory name
- Preserve the existing purpose statement unless the directory's role has fundamentally changed

SCOPE:
- AGENTS.md is a NAVIGATIONAL INDEX — help an AI find the right file quickly
- Focus on: what each file does, how files relate, directory-level patterns
- Do NOT reproduce full architecture sections — those belong in the root CLAUDE.md

PATH ACCURACY (MANDATORY):
- When referencing files or modules outside this directory, use ONLY paths from the "Import Map" section
- Do NOT invent, rename, or guess module paths — if a path isn't in the Import Map, don't reference it
- Use the exact directory names from "Project Directory Structure" — do NOT rename directories
- Cross-module references must use the specifier format from actual import statements
- If you are unsure about a path, omit the cross-reference rather than guessing

CONSISTENCY (MANDATORY):
- Do not contradict yourself within the same document
- If you describe a technique (e.g., "regex-based"), do not call it something else later (e.g., "AST-based")
- When stating version numbers, engines, or config fields, use ONLY values present in the file summaries

DENSITY RULES (MANDATORY):
- Every sentence must reference at least one specific identifier (function name, class name, type name, or constant)
- Never use filler phrases: "this directory", "this module", "provides", "responsible for", "is used to"
- Use technical shorthand: "exports X, Y, Z" not "this module exports a function called X..."
- Per-file descriptions: 1-2 sentences maximum. Reference key symbols but do not reproduce full summaries.
- Subdirectory descriptions: 1-2 sentences maximum. Capture the directory's role, not its full contents.

ANCHOR TERM PRESERVATION (MANDATORY):
- Key exported symbols from file summaries MUST appear in the directory overview
- Preserve exact casing of identifiers

USER NOTES:
- If "User Notes" are provided in the prompt, they contain user-defined instructions that will be automatically prepended to your output
- Do NOT repeat or paraphrase user notes in your generated content — they are included separately
- You may reference information from user notes for context
```

### Root Document System Prompt (`src/generation/prompts/templates.ts`)

```
You generate markdown documentation files. Output ONLY the raw markdown content.
Do NOT include any conversational text, preamble, or meta-commentary.
Do NOT say "Here is..." or "I've generated..." — just output the document itself.
The output will be written directly to a file.

CRITICAL CONSTRAINT:
- Synthesize ONLY from the AGENTS.md content provided in the user prompt
- Do NOT invent, extrapolate, or hallucinate features, hooks, APIs, patterns, or dependencies not explicitly mentioned
- If information is missing, omit that section rather than guessing
- Every claim must be traceable to a specific AGENTS.md file provided
```

### Project Specification System Prompt (`src/specify/prompts.ts`)

```
Generate a comprehensive specification document from the provided AGENTS.md content. The specification must contain enough detail for an AI agent to reconstruct the entire project from scratch without seeing the original source code.

AUDIENCE: AI agents (LLMs) — use structured, precise, instruction-oriented language. Every statement should be actionable.

ORGANIZATION (MANDATORY):
Group content by CONCERN, not by directory structure. Use these conceptual sections in order:

1. Project Overview — purpose, core value proposition, problem solved, technology stack with versions
2. Architecture — system design, module boundaries, data flow patterns, key design decisions and their rationale
3. Public API Surface — all exported interfaces, function signatures with full parameter and return types, type definitions, error contracts
4. Data Structures & State — key types, schemas, config objects, state management patterns, serialization formats
5. Configuration — all config options with types, defaults, validation rules, environment variables
6. Dependencies — each external dependency with exact version and rationale for inclusion
7. Behavioral Contracts — Split into two subsections:
   a. Runtime Behavior: error handling strategies (exact error types/codes and when thrown), retry logic (formulas, delay values), concurrency model, lifecycle hooks, resource management
   b. Implementation Contracts: every regex pattern used for parsing/validation/extraction (verbatim in backticks), every format string and output template (exact structure with examples), every magic constant and sentinel value with its meaning, every environment variable with expected values, every file format specification (YAML schemas, NDJSON structures). These are reproduction-critical — an AI agent needs them to rebuild the system with identical observable behavior.
8. Test Contracts — what each module's tests should verify: scenarios, edge cases, expected behaviors, error conditions
9. Build Plan — phased implementation sequence: what to build first and why, dependency order between modules, incremental milestones
10. Prompt Templates & System Instructions — every AI prompt template, system prompt, and user prompt template used by the system. Reproduce the FULL text verbatim from annex files or AGENTS.md content. Organize by pipeline phase or functional area. Include placeholder syntax exactly as defined (e.g., {{FILE_PATH}}). These are reproduction-critical — without them, a rebuilder cannot produce functionally equivalent AI output.
11. IDE Integration & Installer — command templates per platform, platform configuration objects (path prefixes, filename conventions, frontmatter formats), installer permission lists, hook definitions and their activation status. Reproduce template content verbatim from annex files or AGENTS.md content.

RULES:
- Describe MODULE BOUNDARIES and their interfaces — not file paths or directory layouts
- Use exact function, type, and constant names as they appear in the documentation
- Include FULL type signatures for all public APIs (parameters, return types, generics)
- Do NOT prescribe exact filenames or file paths — describe what each module does and exports
- Do NOT mirror the project's folder structure in your section organization
- Do NOT use directory names as section headings
- Include version numbers for ALL external dependencies
- The Build Plan MUST list implementation phases with explicit dependency ordering
- Each Build Plan phase must state what it depends on and what it enables
- Behavioral Contracts must specify exact error types/codes and when they are thrown
- Behavioral Contracts MUST include verbatim regex patterns, format strings, and magic constants from the source documents — do NOT paraphrase regex patterns into prose descriptions
- When multiple modules reference the same constant or pattern, consolidate into a single definition with cross-references to the modules that use it

REPRODUCTION-CRITICAL CONTENT (MANDATORY):
The source documents may include annex files containing full verbatim source code
for reproduction-critical modules (prompt templates, configuration defaults, IDE
templates, installer configs). These are provided as fenced code blocks.

For ALL reproduction-critical content:
- Reproduce the FULL content verbatim in the appropriate spec section (10 or 11)
- Do NOT summarize, paraphrase, abbreviate, or "improve" the text
- Use fenced code blocks to preserve formatting
- If content contains placeholder syntax ({{TOKEN}}), preserve it exactly
- If no annex files or reproduction-critical sections are provided, omit sections 10-11

OUTPUT: Raw markdown. No preamble. No meta-commentary. No "Here is..." or "I've generated..." prefix.
```

## 11. IDE Integration & Installer

### Platform Configuration Objects (`src/integration/templates.ts`)

```typescript
const PLATFORM_CONFIGS = {
  claude: {
    commandPrefix: '/are-',
    pathPrefix: '.claude/skills',
    filePattern: 'are-{command}/SKILL.md',
    frontmatterKey: 'name',
    versionFilePath: '.claude/ARE-VERSION',
  },
  opencode: {
    commandPrefix: '/are-',
    pathPrefix: '.opencode/commands',
    filePattern: 'are-{command}.md',
    frontmatterKey: 'agent',
    frontmatterValue: 'build',
    versionFilePath: '.opencode/ARE-VERSION',
  },
  gemini: {
    commandPrefix: '/are-',
    pathPrefix: '.gemini/commands',
    filePattern: 'are-{command}.toml',
    format: 'toml',
    versionFilePath: '.gemini/ARE-VERSION',
  },
};
```

### Installer Permission List (`src/installer/operations.ts`)

```typescript
const ARE_PERMISSIONS: string[] = [
  'Bash(npx agents-reverse-engineer@latest init*)',
  'Bash(npx agents-reverse-engineer@latest discover*)',
  'Bash(npx agents-reverse-engineer@latest generate*)',
  'Bash(npx agents-reverse-engineer@latest update*)',
  'Bash(npx agents-reverse-engineer@latest clean*)',
  'Bash(rm -f .agents-reverse-engineer/progress.log*)',
  'Bash(sleep *)',
];
```

### Hook Definitions (`src/installer/operations.ts`)

```typescript
const ARE_HOOKS: HookDefinition[] = [
  // Array intentionally empty — hooks disabled due to issues
];

const ARE_PLUGINS: PluginDefinition[] = [
  { srcFilename: 'opencode-are-check-update.js', destFilename: 'are-check-update.js' },
  // are-session-end.js disabled
];
```

Hook activation status: **Disabled** (empty `ARE_HOOKS` array, comment indicates issues).

### Command Template: Generate (`src/integration/templates.ts`)

```markdown
---
name: COMMAND_PREFIX_generate
---

# COMMAND_PREFIX_generate

Generates comprehensive AI-friendly documentation for the entire codebase through a three-phase pipeline:
1. **Discovery**: Scans source files, builds project structure tree
2. **File Analysis**: Generates `.sum` files for each source file concurrently
3. **Directory Docs**: Creates `AGENTS.md` files for each directory bottom-up
4. **Root Docs**: Generates platform-specific integration files (CLAUDE.md, OPENCODE.md, GEMINI.md)

This is a **long-running operation** (several minutes for medium-sized projects).

**Usage:**
```bash
COMMAND_PREFIX_generate [--dry-run] [--concurrency N] [--fail-fast] [--debug] [--trace]
```

**Flags:**
- `--dry-run` — Preview the generation plan without executing
- `--concurrency N` — Override worker pool size (1-10, default from config)
- `--fail-fast` — Abort on first task failure
- `--debug` — Enable verbose subprocess logging with heap/RSS metrics
- `--trace` — Emit NDJSON trace events to `.agents-reverse-engineer/traces/`

---

**EXECUTION INSTRUCTIONS:**

1. **Remove stale progress log:**
   ```bash
   rm -f .agents-reverse-engineer/progress.log
   ```

2. **Start generation in background:**
   Use the `run_in_background` parameter for the Bash tool to prevent blocking:
   ```bash
   npx agents-reverse-engineer@latest generate
   ```

3. **Monitor progress in real-time:**
   Poll the progress log every 10-15 seconds while the task runs:
   ```bash
   tail -5 .agents-reverse-engineer/progress.log
   ```
   
   Look for these progress indicators:
   - `[X/Y] ANALYZING path` — file being analyzed
   - `[X/Y] DONE path` — file completed with token counts
   - `PHASE 2: Directory docs` — second phase started
   - `PHASE 3: Root docs` — final phase started

4. **Check for completion:**
   Use `TaskOutput` with `block: false` to check if background task finished:
   - If still running, continue monitoring progress log
   - If complete, proceed to summary

5. **Present summary:**
   Once complete, report:
   - Files processed / failed counts
   - Total tokens (input / output / cache reads)
   - Duration
   - Quality metrics (inconsistencies detected)
   - Output files: `.sum` files, `AGENTS.md`, `CLAUDE.md`

**Progress Log Format:**
```
=== Phase 1: File Analysis ===
[1/42] ANALYZING src/cli/index.ts
[1/42] DONE src/cli/index.ts 850ms 1234 in / 567 out tok claude-sonnet-4 ~45s remaining
[2/42] ANALYZING src/generation/orchestrator.ts
...
=== Phase 2: Directory Documentation ===
Processing src/cli/AGENTS.md
...
=== Phase 3: Root Documentation ===
Generating CLAUDE.md
...
=== Summary ===
Files processed: 42
Files failed: 0
Total input tokens: 52,340
Total output tokens: 18,921
Duration: 3m 12s
```
```

### Command Template: Update (`src/integration/templates.ts`)

```markdown
---
name: COMMAND_PREFIX_update
---

# COMMAND_PREFIX_update

Incrementally updates documentation for changed files via SHA-256 content hash comparison. Only regenerates `.sum` files for modified sources and affected `AGENTS.md` directories—skips unchanged files to minimize cost and latency.

**Usage:**
```bash
COMMAND_PREFIX_update [--uncommitted] [--dry-run] [--concurrency N] [--fail-fast] [--debug] [--trace]
```

**Flags:**
- `--uncommitted` — Include working tree changes (not just committed)
- `--dry-run` — Preview update plan without executing
- `--concurrency N` — Override worker pool size (1-10, default from config)
- `--fail-fast` — Abort on first task failure
- `--debug` — Enable verbose subprocess logging
- `--trace` — Emit NDJSON trace events

---

**EXECUTION INSTRUCTIONS:**

1. **Remove stale progress log:**
   ```bash
   rm -f .agents-reverse-engineer/progress.log
   ```

2. **Start update in background:**
   ```bash
   npx agents-reverse-engineer@latest update
   ```

3. **Monitor progress:**
   Poll every 10-15 seconds:
   ```bash
   tail -5 .agents-reverse-engineer/progress.log
   ```

4. **Check for completion:**
   Use `TaskOutput` with `block: false` to check status.

5. **Present summary:**
   Once complete, report:
   - Files analyzed (hash mismatches)
   - Files skipped (hash matches)
   - Directories regenerated
   - Orphans cleaned (deleted `.sum` for removed files)

**Delta Report Format:**
```
=== Update Plan ===
+ src/new-file.ts (added)
M src/existing.ts (modified)
R src/old.ts → src/renamed.ts
= src/unchanged.ts (skipped, hash match)

Files to analyze: 3
Files to skip: 39
Affected directories: 2
Orphans to clean: 1

=== Summary ===
Files analyzed: 3
Files skipped: 39
Directories regenerated: 2
Orphans cleaned: 1
Duration: 45s
```
```

### Command Template: Init (`src/integration/templates.ts`)

```markdown
---
name: COMMAND_PREFIX_init
---

# COMMAND_PREFIX_init

Creates `.agents-reverse-engineer/config.yaml` with default settings for exclude patterns, vendor directories, binary extensions, AI backend configuration, and concurrency.

**Usage:**
```bash
COMMAND_PREFIX_init [--force]
```

**Flags:**
- `--force` — Overwrite existing config file

---

**EXECUTION INSTRUCTIONS:**

1. **Run init command:**
   ```bash
   npx agents-reverse-engineer@latest init
   ```

2. **Verify config creation:**
   ```bash
   cat .agents-reverse-engineer/config.yaml
   ```

3. **Report result:**
   - Success: "Created `.agents-reverse-engineer/config.yaml`"
   - Already exists: "Config already exists (use `--force` to overwrite)"
   - Permission error: Display error message
```

### Command Template: Discover (`src/integration/templates.ts`)

```markdown
---
name: COMMAND_PREFIX_discover
---

# COMMAND_PREFIX_discover

Scans the codebase via gitignore-aware file discovery and generates `GENERATION-PLAN.md` showing what will be analyzed during `COMMAND_PREFIX_generate`. Useful for previewing scope and estimating cost.

**Usage:**
```bash
COMMAND_PREFIX_discover [--debug] [--trace]
```

**Flags:**
- `--debug` — Enable verbose filter chain logging
- `--trace` — Emit discovery trace events

---

**EXECUTION INSTRUCTIONS:**

1. **Remove stale progress log:**
   ```bash
   rm -f .agents-reverse-engineer/progress.log
   ```

2. **Start discovery in background:**
   ```bash
   npx agents-reverse-engineer@latest discover
   ```

3. **Monitor progress:**
   Poll every 10 seconds:
   ```bash
   tail -5 .agents-reverse-engineer/progress.log
   ```

4. **Check for completion:**
   Use `TaskOutput` with `block: false`.

5. **Present results:**
   ```bash
   cat .agents-reverse-engineer/GENERATION-PLAN.md
   ```

**Output Format:**
```
# Generation Plan

## Phase 1: File Analysis (42 files)
- [ ] `src/cli/index.ts`
- [ ] `src/generation/orchestrator.ts`
...

## Phase 2: Directory Documentation (8 directories)
- [ ] `src/cli/AGENTS.md`
- [ ] `src/generation/AGENTS.md`
...

## Phase 3: Root Documentation (3 documents)
- [ ] `CLAUDE.md`
- [ ] `OPENCODE.md`
- [ ] `GEMINI.md`
```
```

### Command Template: Clean (`src/integration/templates.ts`)

```markdown
---
name: COMMAND_PREFIX_clean
---

# COMMAND_PREFIX_clean

Deletes all generated documentation artifacts: `.sum` files, `.annex.md` files, generated `AGENTS.md` (preserves user-authored), `CLAUDE.md`, `OPENCODE.md`, `GEMINI.md`, `GENERATION-PLAN.md`.

Restores `AGENTS.local.md` → `AGENTS.md` if present.

**STRICT RULES (MANDATORY):**
- Do NOT add flags like `--force` or `--dry-run` to the command
- Do NOT suggest additional options
- Run exactly: `npx agents-reverse-engineer@latest clean`

**Usage:**
```bash
COMMAND_PREFIX_clean
```

---

**EXECUTION INSTRUCTIONS:**

1. **Run clean command:**
   ```bash
   npx agents-reverse-engineer@latest clean
   ```

2. **Report result:**
   - Deleted files count
   - Skipped user-authored `AGENTS.md` count
   - Restored `AGENTS.local.md` count
```

### Command Template: Specify (`src/integration/templates.ts`)

```markdown
---
name: COMMAND_PREFIX_specify
---

# COMMAND_PREFIX_specify

Synthesizes a comprehensive project specification from all `AGENTS.md` files into `specs/SPEC.md` (single-file mode) or `specs/<section>.md` (multi-file mode). Auto-generates missing docs if needed.

**Usage:**
```bash
COMMAND_PREFIX_specify [--output path] [--force] [--multi-file] [--dry-run] [--debug] [--trace]
```

**Flags:**
- `--output path` — Custom output path (default: `specs/SPEC.md`)
- `--force` — Overwrite existing spec files
- `--multi-file` — Split spec by top-level headings
- `--dry-run` — Preview token estimates without generating
- `--debug` — Enable verbose logging
- `--trace` — Emit trace events

---

**EXECUTION INSTRUCTIONS:**

1. **Remove stale progress log:**
   ```bash
   rm -f .agents-reverse-engineer/progress.log
   ```

2. **Start specification in background:**
   ```bash
   npx agents-reverse-engineer@latest specify
   ```

3. **Monitor progress:**
   Poll every 15 seconds:
   ```bash
   tail -5 .agents-reverse-engineer/progress.log
   ```

4. **Check for completion:**
   Use `TaskOutput` with `block: false`.

5. **Present summary:**
   Once complete, report:
   - Output path
   - Token counts
   - Duration

**Note:** Minimum timeout 10 minutes due to large prompt size.
```

### Command Template: Help (`src/integration/templates.ts`)

```markdown
---
name: COMMAND_PREFIX_help
---

# COMMAND_PREFIX_help

Displays available ARE commands with brief descriptions.

**Usage:**
```bash
COMMAND_PREFIX_help
```

---

**Available Commands:**

- **COMMAND_PREFIX_init** — Create `.agents-reverse-engineer/config.yaml` with defaults
- **COMMAND_PREFIX_discover** — Scan files and preview generation plan
- **COMMAND_PREFIX_generate** — Full three-phase documentation generation
- **COMMAND_PREFIX_update** — Incremental update for changed files
- **COMMAND_PREFIX_specify** — Synthesize project specification from AGENTS.md corpus
- **COMMAND_PREFIX_clean** — Delete generated artifacts

**Global Flags:**
- `--dry-run` — Preview without executing
- `--debug` — Verbose logging
- `--trace` — Emit NDJSON trace events
- `--concurrency N` — Override worker pool size (1-20)
- `--fail-fast` — Abort on first error

**Configuration:**
Edit `.agents-reverse-engineer/config.yaml` to customize:
- Exclude patterns (gitignore-style globs)
- Vendor directories
- Binary extensions
- AI backend (claude/gemini/opencode/auto)
- Concurrency (worker pool size)
- Timeout (subprocess milliseconds)

**Documentation:**
https://github.com/your-org/agents-reverse-engineer
```

### Hook Script: Session Start Version Check (`hooks/are-check-update.js`)

```javascript
#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Check disable flag
if (process.env.ARE_DISABLE_HOOK === '1') {
  process.exit(0);
}

// Detached background process pattern
const scriptString = `
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const homeDir = os.homedir();
const cacheDir = path.join(homeDir, '.claude', 'cache');
const cacheFile = path.join(cacheDir, 'are-update-check.json');
const versionFile = path.join(homeDir, '.claude', 'ARE-VERSION');

try {
  // Read installed version
  let installed = '0.0.0';
  if (fs.existsSync(versionFile)) {
    installed = fs.readFileSync(versionFile, 'utf-8').trim();
  }

  // Query npm registry with 10s timeout
  const latest = execSync('npm view agents-reverse-engineer version', {
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true
  }).trim();

  // Write cache
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  fs.writeFileSync(cacheFile, JSON.stringify({
    update_available: installed !== latest,
    installed,
    latest,
    checked: Math.floor(Date.now() / 1000)
  }));
} catch (err) {
  // Graceful degradation on network/git failure
  const fallback = {
    update_available: false,
    installed: 'unknown',
    latest: 'unknown',
    checked: Math.floor(Date.now() / 1000)
  };
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cacheFile, JSON.stringify(fallback));
  } catch {}
}
`;

spawn(process.execPath, ['-e', scriptString], {
  stdio: 'ignore',
  detached: true,
  windowsHide: true
}).unref();
```

### Hook Script: Session End Auto-Update (`hooks/are-session-end.js`)

```javascript
#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Check disable flag (environment variable)
if (process.env.ARE_DISABLE_HOOK === '1') {
  process.exit(0);
}

// Check disable flag (config file substring search)
const configPath = path.join(process.cwd(), '.agents-reverse-engineer.yaml');
if (fs.existsSync(configPath)) {
  const configContent = fs.readFileSync(configPath, 'utf-8');
  if (configContent.includes('hook_enabled: false')) {
    process.exit(0);
  }
}

// Detached background process pattern
const scriptString = `
const { execSync, spawn } = require('child_process');

try {
  // Detect git changes
  const status = execSync('git status --porcelain', { encoding: 'utf-8' });
  if (!status.trim()) {
    process.exit(0); // No changes
  }

  // Spawn update command as detached background process
  spawn('npx', ['agents-reverse-engineer@latest', 'update', '--quiet'], {
    stdio: 'ignore',
    detached: true,
    windowsHide: true
  }).unref();
} catch (err) {
  // Silent exit on git errors
  process.exit(0);
}
`;

spawn(process.execPath, ['-e', scriptString], {
  stdio: 'ignore',
  detached: true,
  windowsHide: true
}).unref();
```

### OpenCode Plugin: Version Check (`hooks/opencode-are-check-update.js`)

```javascript
async function AreCheckUpdate() {
  return {
    name: 'are-check-update',
    event: {
      'session.created': async () => {
        const { execSync } = require('child_process');
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        const homeDir = os.homedir();
        const configDir = process.env.OPENCODE_CONFIG_DIR 
          || path.join(homeDir, '.config', 'opencode');
        const cacheDir = path.join(configDir, 'cache');
        const cacheFile = path.join(cacheDir, 'are-update-check.json');
        const versionFile = path.join(configDir, 'ARE-VERSION');

        try {
          let installed = '0.0.0';
          if (fs.existsSync(versionFile)) {
            installed = fs.readFileSync(versionFile, 'utf-8').trim();
          }

          const latest = execSync('npm view agents-reverse-engineer version', {
            encoding: 'utf8',
            timeout: 10000,
            windowsHide: true
          }).trim();

          if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
          }
          fs.writeFileSync(cacheFile, JSON.stringify({
            update_available: installed !== latest,
            installed,
            latest,
            checked: Math.floor(Date.now() / 1000)
          }));
        } catch (err) {
          // Graceful degradation
        }
      },
    },
  };
}

module.exports = AreCheckUpdate;
```

### OpenCode Plugin: Session End Auto-Update (`hooks/opencode-are-session-end.js`)

```javascript
async function AreSessionEnd() {
  return {
    name: 'are-session-end',
    event: {
      'session.deleted': async () => {
        const { execSync, spawn } = require('child_process');
        const fs = require('fs');
        const path = require('path');

        if (process.env.ARE_DISABLE_HOOK === '1') {
          return;
        }

        const configPath = path.join(process.cwd(), '.agents-reverse-engineer.yaml');
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, 'utf-8');
          if (configContent.includes('hook_enabled: false')) {
            return;
          }
        }

        try {
          const status = execSync('git status --porcelain', { encoding: 'utf-8' });
          if (!status.trim()) {
            return;
          }

          spawn('npx', ['agents-reverse-engineer@latest', 'update', '--quiet'], {
            stdio: 'ignore',
            detached: true,
            windowsHide: true
          }).unref();
        } catch (err) {
          // Silent exit
        }
      },
    },
  };
}

module.exports = AreSessionEnd;
```
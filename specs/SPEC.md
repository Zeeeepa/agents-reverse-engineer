Now I have all the necessary information to generate a comprehensive specification. Let me compile it:

# agents-reverse-engineer Specification

## 1. Project Overview

### Purpose and Value Proposition

agents-reverse-engineer (ARE) is a CLI tool that automates brownfield documentation generation for AI coding assistants. It implements the Recursive Language Model (RLM) algorithm to produce structured documentation that enables AI agents to understand and navigate codebases effectively.

**Problem Solved**: AI coding assistants need comprehensive codebase context to provide accurate assistance. Manual documentation is time-consuming and quickly becomes stale. ARE automates this by analyzing source files via AI CLI subprocesses, generating file summaries (`.sum` files), synthesizing directory overviews (`AGENTS.md`), and producing platform-specific root documents (`CLAUDE.md`, `GEMINI.md`, `OPENCODE.md`).

**Core Capabilities**:
- Parallel file analysis with configurable concurrency pools
- Incremental updates via SHA-256 content hash comparison
- Multi-platform AI backend support (Claude Code, Gemini CLI, OpenCode)
- Gitignore-aware file discovery with binary detection and vendor directory exclusion
- Quality validation detecting code-documentation inconsistencies and phantom path references
- Session lifecycle hooks for automatic documentation refresh
- NDJSON telemetry logging with token cost tracking

### Technology Stack

| Component | Version | Purpose |
|-----------|---------|---------|
| Node.js | ≥18.0.0 | Runtime (ES modules) |
| TypeScript | 5.7.3 | Language (ES2022 target, NodeNext resolution, strict mode) |
| fast-glob | ^3.3.3 | File discovery with glob patterns |
| ignore | ^7.0.3 | Gitignore parsing |
| isbinaryfile | ^5.0.4 | Binary file detection |
| simple-git | ^3.27.0 | Change detection via git diff |
| yaml | ^2.7.0 | Config parsing |
| zod | ^3.24.1 | Schema validation |
| ora | ^8.1.1 | Spinner UI |
| picocolors | ^1.1.1 | Terminal colors |

**Version**: 0.7.1  
**License**: MIT (GeoloeG-IsT, 2026)

---

## 2. Architecture

### Three-Phase Generation Pipeline

The pipeline executes in strict dependency order, with each phase completing before the next begins.

**Phase 1: Concurrent File Analysis**

An iterator-based worker pool shares a single task iterator across N workers. Each worker:
1. Pulls tasks atomically via iterator `.next()` protocol
2. Invokes `AIService.call()` → `runSubprocess()` → `execFile()` spawning AI CLI subprocesses
3. Writes `.sum` files with YAML frontmatter containing SHA-256 content hashes

Resource limits applied to each subprocess:
- `NODE_OPTIONS='--max-old-space-size=512'` (512MB heap limit)
- `UV_THREADPOOL_SIZE='4'` (4 libuv threads)
- `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS='1'` (no background tasks)
- `--disallowedTools Task` (no subagent spawning)

**Phase 2: Post-Order Directory Aggregation**

Directories are sorted by depth descending (deepest first) via `path.relative().split(path.sep).length`. The `isDirectoryComplete()` predicate polls for child `.sum` file existence before processing a directory. Each directory prompt aggregates:
- Child `.sum` content via `readSumFile()`
- Subdirectory `AGENTS.md` files
- Import maps via `extractDirectoryImports()`
- Manifest detection (9 types)

User-authored `AGENTS.md` files are renamed to `AGENTS.local.md` and prepended above generated content.

**Phase 3: Root Document Synthesis**

Sequential execution (concurrency=1) generates `CLAUDE.md`, `GEMINI.md`, `OPENCODE.md`. Prompts consume all `AGENTS.md` files via `collectAgentsDocs()` recursive traversal and enforce synthesis-only constraints (no invention of features not in source documents).

### Module Boundaries

| Module | Responsibility | Key Exports |
|--------|----------------|-------------|
| AI Service | Backend-agnostic AI CLI orchestration with subprocess pooling, retry, telemetry | `AIService`, `AIBackend`, `AIResponse`, `withRetry`, `runSubprocess` |
| Change Detection | Git diff parsing and SHA-256 content hashing | `getChangedFiles`, `computeContentHash`, `isGitRepo` |
| Config | YAML loading with Zod validation | `loadConfig`, `ConfigSchema`, `Config` |
| Discovery | Gitignore-aware file walking with filter chain | `discoverFiles`, `FilterResult`, `FileFilter` |
| Generation | Three-phase orchestration and prompt construction | `GenerationOrchestrator`, `buildFilePrompt`, `buildDirectoryPrompt`, `buildRootPrompt` |
| Orchestration | Worker pool, progress reporting, trace emission | `runPool`, `CommandRunner`, `ProgressReporter`, `TraceWriter` |
| Quality | Code-vs-doc, code-vs-code, phantom-path validation | `checkCodeVsDoc`, `checkCodeVsCode`, `checkPhantomPaths`, `InconsistencyReport` |
| Update | Incremental update workflow | `UpdateOrchestrator`, `cleanupOrphans` |
| Specify | Project specification synthesis | `buildSpecPrompt`, `writeSpec` |
| Rebuild | AI-driven project reconstruction | `executeRebuild`, `CheckpointManager`, `partitionSpec` |
| Installer | IDE command/hook deployment | `runInstaller`, `installFiles` |

### Data Flow Pattern

```
discoverFiles() → GenerationOrchestrator.createPlan() → buildExecutionPlan()
    ↓
runPool(fileTasks) → AIService.call() → writeSumFile()
    ↓
runPool(directoryTasks) → buildDirectoryPrompt() → writeAgentsMd()
    ↓
runPool(rootTasks) → buildRootPrompt() → writeFile()
```

### Key Design Decisions

1. **Iterator-based pool**: Shares single `tasks.entries()` iterator across workers via atomic `.next()` calls, preventing over-allocation and ensuring even work distribution.

2. **Promise-chain serialization**: `PlanTracker`, `ProgressLog`, and `TraceWriter` use `writeQueue = writeQueue.then(...)` pattern to prevent file corruption from concurrent writes.

3. **Memory management**: `PreparedFile.content` is cleared after prompt construction to free heap on large codebases.

4. **Resource-adaptive concurrency**: Formula `clamp(cores * 5, 2, min(20, memCap))` where `memCap = floor(totalMemGB * 0.5 / 0.512)` prevents RAM exhaustion.

---

## 3. Public API Surface

### AI Service Module

```typescript
// AIService class
class AIService {
  constructor(backend: AIBackend, options: { timeoutMs: number; maxRetries: number; model: string; telemetry: { keepRuns: number } })
  call(options: AICallOptions): Promise<AIResponse>
  setTracer(tracer: ITraceWriter): void
  setDebug(enabled: boolean): void
  setSubprocessLogDir(dir: string): void
  addFilesReadToLastEntry(files: FileRead[]): void
  getSummary(): { totalCalls: number; totalInputTokens: number; totalOutputTokens: number; totalCacheReadTokens: number; totalCacheCreationTokens: number; errorCount: number; totalFilesRead: number; uniqueFilesRead: number }
  finalize(projectRoot: string): Promise<void>
}

// Backend interface
interface AIBackend {
  readonly name: string
  readonly cliCommand: string
  isAvailable(): Promise<boolean>
  buildArgs(options: AICallOptions): string[]
  parseResponse(stdout: string, durationMs: number, exitCode: number): AIResponse
  getInstallInstructions(): string
}

// Backend registry
function createBackendRegistry(): BackendRegistry
function resolveBackend(registry: BackendRegistry, backendName: string): AIBackend
function detectBackend(registry: BackendRegistry): AIBackend | undefined
function getInstallInstructions(registry: BackendRegistry): string

// Retry utility
function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T>
const DEFAULT_RETRY_OPTIONS: RetryOptions

// Subprocess utility
function runSubprocess(command: string, args: string[], options: SubprocessOptions): Promise<SubprocessResult>
function isCommandOnPath(command: string): Promise<boolean>

// Error class
class AIServiceError extends Error {
  readonly code: AIServiceErrorCode
  constructor(code: AIServiceErrorCode, message: string)
}
```

### Change Detection Module

```typescript
function isGitRepo(projectRoot: string): Promise<boolean>
function getCurrentCommit(projectRoot: string): Promise<string>
function getChangedFiles(projectRoot: string, baseCommit: string, options?: ChangeDetectionOptions): Promise<ChangeDetectionResult>
function computeContentHash(filePath: string): Promise<string>
function computeContentHashFromString(content: string): string
```

### Config Module

```typescript
function loadConfig(root: string, options?: { tracer?: ITraceWriter; debug?: boolean }): Promise<Config>
function configExists(root: string): Promise<boolean>
function writeDefaultConfig(root: string): Promise<void>
function getDefaultConcurrency(): number

const ConfigSchema: ZodSchema<Config>
const CONFIG_DIR: string  // '.agents-reverse-engineer'
const CONFIG_FILE: string // 'config.yaml'
const DEFAULT_VENDOR_DIRS: readonly string[]
const DEFAULT_EXCLUDE_PATTERNS: readonly string[]
const DEFAULT_BINARY_EXTENSIONS: readonly string[]
const DEFAULT_MAX_FILE_SIZE: number
const DEFAULT_CONFIG: Config
```

### Discovery Module

```typescript
function discoverFiles(root: string, config: DiscoveryConfig, options?: DiscoverFilesOptions): Promise<FilterResult>
function walkDirectory(options: WalkerOptions): Promise<string[]>
function createGitignoreFilter(root: string): Promise<FileFilter>
function createVendorFilter(vendorDirs: string[]): FileFilter
function createBinaryFilter(options?: BinaryFilterOptions): FileFilter
function createCustomFilter(patterns: string[], root: string): FileFilter
function applyFilters(files: string[], filters: FileFilter[], options?: { tracer?: ITraceWriter }): Promise<FilterResult>

interface FileFilter {
  name: string
  shouldExclude(absolutePath: string): boolean | Promise<boolean>
}
```

### Generation Module

```typescript
// Orchestrator
class GenerationOrchestrator {
  createPlan(files: string[], projectRoot: string): Promise<GenerationPlan>
}
function createOrchestrator(config: Config, options?: { tracer?: ITraceWriter; debug?: boolean }): GenerationOrchestrator

// Executor
function buildExecutionPlan(plan: GenerationPlan): ExecutionPlan
function formatExecutionPlanAsMarkdown(plan: ExecutionPlan): string
function isDirectoryComplete(dirPath: string, expectedSums: string[]): Promise<boolean>
function getReadyDirectories(plan: ExecutionPlan): Promise<string[]>
function getDirectoryDepth(dirPath: string): number

// Prompts
function buildFilePrompt(context: PromptContext, debug?: boolean): { system: string; user: string }
function buildDirectoryPrompt(dirPath: string, projectRoot: string, debug?: boolean, knownDirs?: Set<string>, projectStructure?: string): Promise<{ system: string; user: string }>
function buildRootPrompt(projectRoot: string, debug?: boolean): Promise<{ system: string; user: string }>
function detectLanguage(filePath: string): string

// Writers
function writeSumFile(sourcePath: string, content: SumFileContent): Promise<string>
function readSumFile(sumPath: string): Promise<SumFileContent | null>
function getSumPath(sourcePath: string): string
function sumFileExists(sourcePath: string): Promise<boolean>
function writeAnnexFile(sourcePath: string, sourceContent: string): Promise<string>
function getAnnexPath(sourcePath: string): string
function writeAgentsMd(dirPath: string, projectRoot: string, content: string): Promise<void>
function isGeneratedAgentsMd(filePath: string): Promise<boolean>
const GENERATED_MARKER: string

// Collector
function collectAgentsDocs(projectRoot: string): Promise<AgentsDocs>
function collectAnnexFiles(projectRoot: string): Promise<AgentsDocs>
type AgentsDocs = Array<{ relativePath: string; content: string }>
```

### Orchestration Module

```typescript
// Pool
function runPool<T>(tasks: Array<() => Promise<T>>, options: PoolOptions, onComplete?: (result: TaskResult<T>) => void): Promise<Array<TaskResult<T>>>

// Runner
class CommandRunner {
  constructor(aiService: AIService, options: CommandRunOptions)
  executeGenerate(plan: ExecutionPlan): Promise<RunSummary>
  executeUpdate(filesToAnalyze: FileChange[], projectRoot: string, config: Config): Promise<RunSummary>
}

// Progress
class ProgressReporter {
  constructor(totalFiles: number, totalDirs: number, progressLog?: ProgressLog)
  onFileStart(path: string): void
  onFileDone(path: string, durationMs: number, tokensIn: number, tokensOut: number, model: string, cacheReadTokens?: number, cacheCreationTokens?: number): void
  onFileError(path: string, error: string): void
  onDirectoryStart(path: string): void
  onDirectoryDone(path: string, durationMs: number, tokensIn: number, tokensOut: number, model: string, cacheReadTokens?: number, cacheCreationTokens?: number): void
  onRootDone(path: string): void
  printSummary(summary: RunSummary): void
}

class ProgressLog {
  static create(projectRoot: string): Promise<ProgressLog>
  write(message: string): void
  finalize(): Promise<void>
}

// Trace
interface ITraceWriter {
  emit(event: TraceEventPayload): void
  finalize(): Promise<void>
  readonly filePath: string
}
function createTraceWriter(projectRoot: string, enabled: boolean): ITraceWriter
function cleanupOldTraces(projectRoot: string, keepCount?: number): Promise<number>

// Plan Tracker
class PlanTracker {
  constructor(projectRoot: string, initialContent: string)
  initialize(): Promise<void>
  markDone(itemPath: string): void
  flush(): Promise<void>
}
```

### Quality Module

```typescript
function extractExports(sourceContent: string): string[]
function checkCodeVsDoc(sourceContent: string, sumContent: SumFileContent, filePath: string): CodeDocInconsistency | null
function checkCodeVsCode(files: Array<{ path: string; content: string }>): CodeCodeInconsistency[]
function checkPhantomPaths(agentsMdPath: string, content: string, projectRoot: string): PhantomPathInconsistency[]
function buildInconsistencyReport(issues: Inconsistency[], metadata: { projectRoot: string; filesChecked: number; durationMs: number }): InconsistencyReport
function formatReportForCli(report: InconsistencyReport): string
function validateFindability(agentsMdContent: string, sumFiles: Map<string, SumFileContent>): FindabilityResult[]
```

### Update Module

```typescript
class UpdateOrchestrator {
  checkPrerequisites(): Promise<void>
  preparePlan(options: UpdateOptions): Promise<UpdatePlan>
}
function createUpdateOrchestrator(projectRoot: string, config: Config, options?: { tracer?: ITraceWriter }): UpdateOrchestrator
function cleanupOrphans(orphanedFiles: FileChange[], projectRoot: string, dryRun: boolean): Promise<CleanupResult>
function cleanupEmptyDirectoryDocs(projectRoot: string, dryRun: boolean): Promise<string[]>
function getAffectedDirectories(changes: FileChange[], projectRoot: string): string[]
```

### Specify Module

```typescript
function buildSpecPrompt(docs: AgentsDocs, annexFiles?: AgentsDocs): SpecPrompt
function writeSpec(content: string, options: WriteSpecOptions): Promise<string[]>
class SpecExistsError extends Error {
  readonly paths: string[]
}
const SPEC_SYSTEM_PROMPT: string
```

### Rebuild Module

```typescript
function readSpecFiles(specsDir: string): Promise<Array<{ relativePath: string; content: string }>>
function partitionSpec(specFiles: Array<{ relativePath: string; content: string }>): RebuildUnit[]
function parseModuleOutput(aiOutput: string): Map<string, string>
function buildRebuildPrompt(unit: RebuildUnit, fullSpec: string, builtContext?: string): { system: string; user: string }
function executeRebuild(plan: RebuildPlan, aiService: AIService, options: RebuildExecuteOptions): Promise<RebuildResult[]>

class CheckpointManager {
  static load(outputDir: string, specFiles: Array<{ relativePath: string; content: string }>): Promise<{ checkpoint: CheckpointManager; isResume: boolean }>
  isDone(unitName: string): boolean
  markDone(unitName: string, filesWritten: string[]): Promise<void>
  markFailed(unitName: string, error: string): Promise<void>
}

const REBUILD_SYSTEM_PROMPT: string
const RebuildCheckpointSchema: ZodSchema<RebuildCheckpoint>
```

### Installer Module

```typescript
function runInstaller(args: string[]): Promise<void>
function parseInstallerArgs(args: string[]): InstallerArgs
function installFiles(runtime: Runtime, location: Location, options: InstallOptions): InstallerResult[]
function uninstallFiles(runtime: Runtime, location: Location, options: UninstallOptions): InstallerResult[]
function registerHooks(basePath: string, runtime: Runtime, dryRun: boolean): boolean
function registerPermissions(settingsPath: string, dryRun: boolean): boolean
function getPackageVersion(): string
function writeVersionFile(basePath: string, dryRun: boolean): void
```

### Integration Module

```typescript
function detectEnvironments(projectRoot: string): DetectedEnvironment[]
function hasEnvironment(projectRoot: string, type: EnvironmentType): boolean
function generateIntegrationFiles(projectRoot: string, options?: GenerateOptions): Promise<IntegrationResult[]>
function getClaudeTemplates(): IntegrationTemplate[]
function getOpenCodeTemplates(): IntegrationTemplate[]
function getGeminiTemplates(): IntegrationTemplate[]
```

### Imports Module

```typescript
function extractImports(content: string): ImportEntry[]
function extractDirectoryImports(dirPath: string, files: string[]): Promise<FileImports[]>
function formatImportMap(fileImports: FileImports[]): string
```

---

## 4. Data Structures & State

### Core Types

```typescript
// AI Types
interface AICallOptions {
  prompt: string
  systemPrompt?: string
  model?: string
  timeoutMs?: number
  maxTurns?: number
  taskLabel?: string
}

interface AIResponse {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  durationMs: number
  exitCode: number
  raw: unknown
}

interface SubprocessResult {
  stdout: string
  stderr: string
  exitCode: number
  signal: string | null
  durationMs: number
  timedOut: boolean
  childPid?: number
}

interface RetryOptions {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  multiplier: number
  isRetryable: (error: unknown) => boolean
  onRetry?: (attempt: number, error: unknown) => void
}

type AIServiceErrorCode = 'CLI_NOT_FOUND' | 'TIMEOUT' | 'PARSE_ERROR' | 'SUBPROCESS_ERROR' | 'RATE_LIMIT'

// Telemetry Types
interface TelemetryEntry {
  timestamp: string
  prompt: string
  systemPrompt?: string
  response: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  latencyMs: number
  exitCode: number
  error?: string
  retryCount: number
  thinking: string
  filesRead: FileRead[]
}

interface RunLog {
  runId: string
  startTime: string
  endTime: string
  entries: TelemetryEntry[]
  summary: {
    totalCalls: number
    totalInputTokens: number
    totalOutputTokens: number
    totalDurationMs: number
    errorCount: number
    totalCacheReadTokens: number
    totalCacheCreationTokens: number
    totalFilesRead: number
    uniqueFilesRead: number
  }
}

interface FileRead {
  path: string
  sizeBytes: number
}

// Change Detection Types
type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed'

interface FileChange {
  status: ChangeType
  path: string
  oldPath?: string  // Only for 'renamed' status
}

interface ChangeDetectionResult {
  currentCommit: string
  baseCommit: string
  changes: FileChange[]
  includesUncommitted: boolean
}

interface ChangeDetectionOptions {
  includeUncommitted?: boolean
}

// Discovery Types
interface FilterResult {
  included: string[]
  excluded: ExcludedFile[]
}

interface ExcludedFile {
  path: string
  reason: string
  filter: string
}

interface DiscoveryResult {
  files: string[]
  excluded: ExcludedFile[]
}

interface DiscoveryStats {
  totalFiles: number
  includedFiles: number
  excludedFiles: number
  exclusionReasons: Record<string, number>
}

interface WalkerOptions {
  cwd: string
  followSymlinks?: boolean
  dot?: boolean
}

// Generation Types
interface GenerationPlan {
  files: PreparedFile[]
  tasks: AnalysisTask[]
  complexity: ComplexityMetrics
  projectStructure: string
  projectRoot: string
}

interface PreparedFile {
  path: string
  absolutePath: string
  content: string
}

interface AnalysisTask {
  id: string
  path: string
  absolutePath: string
  userPrompt: string
  systemPrompt: string
  dependencies: string[]
}

interface ExecutionTask {
  id: string
  path: string
  absolutePath: string
  outputPath: string
  userPrompt: string
  systemPrompt: string
  dependencies: string[]
  metadata: Record<string, unknown>
}

interface ExecutionPlan {
  projectRoot: string
  projectStructure: string
  fileTasks: ExecutionTask[]
  directoryTasks: ExecutionTask[]
  rootTasks: ExecutionTask[]
}

interface ComplexityMetrics {
  fileCount: number
  directoryDepth: number
  files: string[]
  directories: string[]
}

interface AnalysisResult {
  summary: string
  metadata: SummaryMetadata
}

interface SummaryMetadata {
  purpose: string
  criticalTodos?: string[]
  relatedFiles?: string[]
}

interface SumFileContent {
  summary: string
  metadata: SummaryMetadata
  generatedAt: string
  contentHash: string
}

interface PromptContext {
  filePath: string
  content: string
  contextFiles?: Array<{ path: string; content: string }>
  projectPlan?: string
  existingSum?: string
}

// Orchestration Types
interface PoolOptions {
  concurrency: number
  failFast?: boolean
  tracer?: ITraceWriter
  phaseLabel?: string
  taskLabels?: string[]
}

interface TaskResult<T> {
  index: number
  success: boolean
  value?: T
  error?: Error
}

interface FileTaskResult {
  path: string
  success: boolean
  tokensIn: number
  tokensOut: number
  cacheReadTokens: number
  cacheCreationTokens: number
  durationMs: number
  model: string
  error?: string
}

interface RunSummary {
  version: string
  filesProcessed: number
  filesFailed: number
  filesSkipped: number
  totalCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheCreationTokens: number
  totalDurationMs: number
  errorCount: number
  retryCount: number
  totalFilesRead: number
  uniqueFilesRead: number
  inconsistenciesCodeVsDoc?: number
  inconsistenciesCodeVsCode?: number
  phantomPaths?: number
  inconsistencyReport?: InconsistencyReport
}

interface CommandRunOptions {
  concurrency: number
  failFast?: boolean
  debug?: boolean
  dryRun?: boolean
  tracer?: ITraceWriter
  progressLog?: ProgressLog
}

interface ProgressEvent {
  type: 'start' | 'done' | 'error' | 'dir-done' | 'root-done'
  filePath: string
  index: number
  total: number
  durationMs?: number
  tokensIn?: number
  tokensOut?: number
  model?: string
  error?: string
}

// Quality Types
type InconsistencySeverity = 'info' | 'warning' | 'error'

interface CodeDocInconsistency {
  type: 'code-vs-doc'
  severity: InconsistencySeverity
  filePath: string
  sumPath: string
  description: string
  details: {
    missingFromDoc: string[]
    missingFromCode: string[]
    purposeMismatch?: string
  }
}

interface CodeCodeInconsistency {
  type: 'code-vs-code'
  severity: InconsistencySeverity
  files: string[]
  description: string
  pattern: string
}

interface PhantomPathInconsistency {
  type: 'phantom-path'
  severity: InconsistencySeverity
  agentsMdPath: string
  description: string
  details: {
    referencedPath: string
    resolvedTo: string
    context: string
  }
}

type Inconsistency = CodeDocInconsistency | CodeCodeInconsistency | PhantomPathInconsistency

interface InconsistencyReport {
  metadata: {
    timestamp: string
    projectRoot: string
    filesChecked: number
    durationMs: number
  }
  issues: Inconsistency[]
  summary: {
    total: number
    codeVsDoc: number
    codeVsCode: number
    phantomPaths: number
    errors: number
    warnings: number
    info: number
  }
}

interface FindabilityResult {
  filePath: string
  symbolsTested: number
  symbolsFound: number
  symbolsMissing: string[]
  score: number
}

// Update Types
interface UpdatePlan {
  filesToAnalyze: FileChange[]
  filesToSkip: string[]
  cleanup: FileChange[]
  affectedDirs: string[]
}

interface UpdateOptions {
  includeUncommitted?: boolean
  dryRun?: boolean
}

interface UpdateResult {
  analyzedFiles: number
  skippedFiles: number
  cleanup: CleanupResult
  regeneratedDirs: string[]
  baseCommit: string
  currentCommit: string
}

interface CleanupResult {
  deletedSumFiles: string[]
  deletedAgentsMd: string[]
}

// Rebuild Types
interface RebuildUnit {
  name: string
  specContent: string
  order: number
}

interface RebuildPlan {
  specFiles: Array<{ relativePath: string; content: string }>
  units: RebuildUnit[]
  outputDir: string
}

interface RebuildResult {
  unitName: string
  success: boolean
  filesWritten: string[]
  tokensIn: number
  tokensOut: number
  cacheReadTokens: number
  cacheCreationTokens: number
  durationMs: number
  model: string
  error?: string
}

interface RebuildCheckpoint {
  version: string
  createdAt: string
  updatedAt: string
  outputDir: string
  specHashes: Record<string, string>
  modules: Record<string, {
    status: 'pending' | 'done' | 'failed'
    completedAt?: string
    error?: string
    filesWritten?: string[]
  }>
}

// Installer Types
type Runtime = 'claude' | 'opencode' | 'gemini' | 'all'
type Location = 'global' | 'local'

interface InstallerArgs {
  runtime?: Runtime
  global: boolean
  local: boolean
  uninstall: boolean
  force: boolean
  help: boolean
  quiet: boolean
}

interface InstallerResult {
  success: boolean
  runtime: Exclude<Runtime, 'all'>
  location: Location
  filesCreated: string[]
  filesSkipped: string[]
  errors: string[]
  hookRegistered?: boolean
  versionWritten?: boolean
}

interface RuntimePaths {
  global: string
  local: string
  settingsFile: string
}

interface InstallOptions {
  force: boolean
  dryRun: boolean
}

// Integration Types
type EnvironmentType = 'claude' | 'opencode' | 'aider' | 'gemini'

interface DetectedEnvironment {
  type: EnvironmentType
  configDir: string
  detected: boolean
}

interface IntegrationTemplate {
  filename: string
  path: string
  content: string
}

interface IntegrationResult {
  environment: EnvironmentType
  filesCreated: string[]
  filesSkipped: string[]
}

// Import Types
interface ImportEntry {
  specifier: string
  symbols: string[]
  typeOnly: boolean
}

interface FileImports {
  fileName: string
  externalImports: ImportEntry[]
  internalImports: ImportEntry[]
}

// Specify Types
interface SpecPrompt {
  system: string
  user: string
}

interface WriteSpecOptions {
  outputPath?: string
  force?: boolean
  multiFile?: boolean
}

// Trace Types
type TraceEventPayload = 
  | { type: 'phase:start'; phase: string; taskCount: number; concurrency: number }
  | { type: 'phase:end'; phase: string; durationMs: number; tasksCompleted: number; tasksFailed: number }
  | { type: 'worker:start'; workerId: number; phase: string }
  | { type: 'worker:end'; workerId: number; phase: string; tasksExecuted: number }
  | { type: 'task:pickup'; workerId: number; taskIndex: number; taskLabel: string; activeTasks: number }
  | { type: 'task:done'; workerId: number; taskIndex: number; taskLabel: string; durationMs: number; success: boolean; error?: string; activeTasks: number }
  | { type: 'task:start'; taskLabel: string; phase: string }
  | { type: 'subprocess:spawn'; childPid: number; command: string; taskLabel: string }
  | { type: 'subprocess:exit'; childPid: number; command: string; taskLabel: string; exitCode: number; signal: string | null; durationMs: number; timedOut: boolean }
  | { type: 'retry'; attempt: number; taskLabel: string; errorCode: string }
  | { type: 'discovery:start'; targetPath: string }
  | { type: 'discovery:end'; filesIncluded: number; filesExcluded: number; durationMs: number }
  | { type: 'filter:applied'; filterName: string; filesMatched: number; filesRejected: number }
  | { type: 'plan:created'; planType: 'generate' | 'update'; fileCount: number; taskCount: number }
  | { type: 'config:loaded'; configPath: string; model: string; concurrency: number }
```

### Serialization Formats

**YAML Frontmatter (.sum files)**:
```yaml
---
generated_at: 2026-02-09T12:34:56.789Z
content_hash: a3f5d8e9... (SHA-256 hex, 64 chars)
purpose: One-line purpose statement
critical_todos: [Security issue, Performance bottleneck]
related_files: [../config/schema.ts, ./index.ts]
---

Markdown summary content...
```

**NDJSON (trace files)**: One JSON object per line with fields `seq`, `ts`, `pid`, `elapsedMs`, `type`, plus event-specific fields.

**JSON (checkpoint files)**: See `RebuildCheckpoint` schema.

**JSON (run logs)**: See `RunLog` interface.

---

## 5. Configuration

### Config File Location

`.agents-reverse-engineer/config.yaml`

### Config Schema

```typescript
const ConfigSchema = z.object({
  exclude: z.object({
    patterns: z.array(z.string()).default([...DEFAULT_EXCLUDE_PATTERNS]),
    vendorDirs: z.array(z.string()).default([...DEFAULT_VENDOR_DIRS]),
    binaryExtensions: z.array(z.string()).default([...DEFAULT_BINARY_EXTENSIONS]),
  }).default({}),
  
  options: z.object({
    followSymlinks: z.boolean().default(false),
    maxFileSize: z.number().positive().default(1048576),  // 1MB
  }).default({}),
  
  output: z.object({
    colors: z.boolean().default(true),
  }).default({}),
  
  ai: z.object({
    backend: z.enum(['claude', 'gemini', 'opencode', 'auto']).default('auto'),
    model: z.string().default('sonnet'),
    timeoutMs: z.number().positive().default(300000),  // 5 minutes
    maxRetries: z.number().min(0).default(3),
    concurrency: z.number().min(1).max(20).default(getDefaultConcurrency),
    telemetry: z.object({
      keepRuns: z.number().min(0).default(50),
    }).default({}),
  }).default({}),
}).default({})
```

### Environment Variable Overrides

| Variable | Description | Default |
|----------|-------------|---------|
| `CLAUDE_CONFIG_DIR` | Override `~/.claude` path | `~/.claude` |
| `OPENCODE_CONFIG_DIR` | Override `~/.config/opencode` path | `~/.config/opencode` |
| `GEMINI_CONFIG_DIR` | Override `~/.gemini` path | `~/.gemini` |
| `ARE_DISABLE_HOOK` | Disable session-end auto-update (set to `1`) | unset |

### Default Constants

**DEFAULT_VENDOR_DIRS** (18 entries):
```typescript
['node_modules', 'vendor', '.git', 'dist', 'build', '__pycache__', '.next', 
 'venv', '.venv', 'target', '.cargo', '.gradle', '.agents-reverse-engineer', 
 '.agents', '.planning', '.claude', '.opencode', '.gemini']
```

**DEFAULT_EXCLUDE_PATTERNS** (26 entries):
```typescript
['AGENTS.md', 'CLAUDE.md', 'OPENCODE.md', 'GEMINI.md', '**/AGENTS.md', 
 '**/CLAUDE.md', '**/OPENCODE.md', '**/GEMINI.md', '*.lock', 'package-lock.json', 
 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', 'Gemfile.lock', 
 'Cargo.lock', 'poetry.lock', 'composer.lock', 'go.sum', '.gitignore', 
 '.gitattributes', '.gitkeep', '.env', '**/.env', '**/.env.*', '*.log', 
 '*.sum', '**/*.sum', '**/SKILL.md']
```

**DEFAULT_BINARY_EXTENSIONS** (26 entries in defaults.ts, 96 in binary filter):
```typescript
['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.zip', '.tar', 
 '.gz', '.rar', '.7z', '.exe', '.dll', '.so', '.dylib', '.mp3', '.mp4', 
 '.wav', '.pdf', '.woff', '.woff2', '.ttf', '.eot', '.class', '.pyc']
```

---

## 6. Dependencies

| Package | Version | Rationale |
|---------|---------|-----------|
| `fast-glob` | ^3.3.3 | High-performance file discovery with glob pattern support, symlink handling, and directory filtering |
| `ignore` | ^7.0.3 | Gitignore-compatible pattern matching for file exclusion rules |
| `isbinaryfile` | ^5.0.4 | Binary file content detection for files without recognizable extensions |
| `simple-git` | ^3.27.0 | Git operations for change detection (`git diff`, `git status`, commit retrieval) |
| `yaml` | ^2.7.0 | YAML parsing and serialization for config files |
| `zod` | ^3.24.1 | Schema validation with TypeScript type inference for configuration and checkpoint files |
| `ora` | ^8.1.1 | Terminal spinner UI for long-running operations |
| `picocolors` | ^1.1.1 | Lightweight terminal color formatting (ANSI escape codes) |
| `@types/node` | ^22.10.7 | TypeScript type definitions for Node.js APIs |
| `tsx` | ^4.19.2 | TypeScript execution for development mode (`npm run dev`) |
| `typescript` | ^5.7.3 | TypeScript compiler targeting ES2022 with strict mode |

---

## 7. Behavioral Contracts

### 7.1 Runtime Behavior

#### Error Handling

**AIServiceError Codes**:
| Code | When Thrown |
|------|-------------|
| `CLI_NOT_FOUND` | Backend CLI not found on PATH during resolution |
| `TIMEOUT` | Subprocess exceeded `timeoutMs` |
| `PARSE_ERROR` | Failed to parse backend JSON output |
| `SUBPROCESS_ERROR` | Subprocess exited with non-zero code |
| `RATE_LIMIT` | Rate limit detected in stderr |

**Exit Codes (CLI commands)**:
- `0`: Success (all tasks completed or no tasks to process)
- `1`: Partial failure (some tasks succeeded, some failed) OR file conflict OR first-run detection
- `2`: Total failure (no tasks succeeded) OR AI CLI not found

#### Retry Logic

**Exponential Backoff Formula**:
```typescript
delay = min(baseDelayMs * multiplier^attempt, maxDelayMs) + Math.random() * 500
```

**Default Retry Options**:
```typescript
{ maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 8000, multiplier: 2 }
```

**Retryable Conditions**: Only rate limit errors are retryable. Timeouts are NOT retried (rationale: spawning another heavyweight subprocess on a struggling system makes things worse).

#### Subprocess Lifecycle

1. Spawn with `execFile()`, 10MB `maxBuffer`, SIGTERM `killSignal`
2. Track in `activeSubprocesses` Map with PID → `{ command, spawnedAt }`
3. Invoke `onSpawn()` callback for trace emission
4. Write prompt to stdin, close with `.end()`
5. Set unref'd SIGKILL timer at `timeoutMs + 5000ms`
6. On callback: clear timer, attempt process group kill via `kill(-pid, 'SIGKILL')`
7. Remove from `activeSubprocesses`, resolve with `SubprocessResult`

#### Concurrency Model

**Worker Pool**: Shares single `tasks.entries()` iterator across N workers. Workers consume tasks via `for...of` loop calling iterator `.next()` atomically. Fail-fast mode sets shared `aborted` flag, checked before each task pickup.

**Resource-Adaptive Concurrency**:
```typescript
clamp(
  os.availableParallelism() * 5,
  2,
  min(20, floor(os.totalmem() * 0.5 / 0.512))
)
```

Constants: `CONCURRENCY_MULTIPLIER = 5`, `MIN_CONCURRENCY = 2`, `MAX_CONCURRENCY = 20`, `SUBPROCESS_HEAP_GB = 0.512`, `MEMORY_FRACTION = 0.5`

#### Lifecycle Hooks

**SessionStart Hook**: Spawns detached process querying `npm view agents-reverse-engineer version`, compares against `~/.claude/ARE-VERSION`, writes to `~/.claude/cache/are-update-check.json`.

**SessionEnd Hook**: Checks `git status --porcelain`, spawns `npx agents-reverse-engineer@latest update --quiet` as detached process if changes detected.

**Disable Mechanisms**:
- Environment: `ARE_DISABLE_HOOK=1`
- Config: `hook_enabled: false` substring in `.agents-reverse-engineer.yaml`

### 7.2 Implementation Contracts

#### Regex Patterns

**Export Extraction** (code-vs-doc.ts):
```
/^[ \t]*export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/gm
```

**Import Extraction** (extractor.ts):
```
/^import\s+(type\s+)?(?:\{([^}]*)\}|(\*\s+as\s+\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/gm
```

**Phantom Path Extraction** (validator.ts `PATH_PATTERNS`):
```javascript
/\[(?:[^\]]*)\]\((\.[^)]+)\)/g                          // Markdown links
/`((?:src\/|\.\.?\/)[^`]+\.[a-z]{1,4})`/g              // Backtick paths
/(?:from|in|by|via|see)\s+`?(src\/[\w\-./]+)`?/gi     // Prose-embedded paths
```

**Phantom Path Skip Patterns** (validator.ts `SKIP_PATTERNS`):
```javascript
/node_modules/
/\.git\//
/^https?:/
/\{\{/
/\$\{/
/\*/
/\{[^}]*,[^}]*\}/
```

**Sum File Frontmatter Extraction**:
```
/^---\n([\s\S]*?)\n---\n/
```

**Sum File Field Extraction**:
```
/generated_at:\s*(.+)/
/content_hash:\s*(.+)/
/purpose:\s*(.+)/
```

**YAML Array Inline Format**:
```
/<key>:\s*\[([^\]]*)\]/
```

**YAML Array Multi-line Format**:
```
/<key>:\s*\n((?:\s+-\s+.+\n?)+)/m
```

**Build Plan Phase Extraction** (spec-reader.ts):
```
/^### Phase (\d+):\s*(.+)$/gm
```

**Rebuild File Delimiter** (output-parser.ts):
```
/===FILE:\s*(.+?)===\n([\s\S]*?)===END_FILE===/g
```

**Rebuild Fenced Block Fallback**:
```
/```\w*:([^\n]+)\n([\s\S]*?)```/g
```

**Spec Heading Split** (writer.ts):
```
/^(?=# )/m
```

**Slugification Transforms** (writer.ts):
```typescript
.toLowerCase()
.replace(/\s+/g, '-')
.replace(/[^a-z0-9-]/g, '')
.replace(/-+/g, '-')
.replace(/^-|-$/g, '')
```

**PlanTracker Checkbox Update**:
```
/- \[ \] \`${itemPath}\`/ → /- \[x\] \`${itemPath}\`/
```

**Preamble Separator**:
```
\n---\n
```

**Preamble Bold Detection**:
```
/^[\s\S]{0,500}?(\*\*[A-Z])/
```

**ANSI Strip Pattern** (progress.ts):
```
/\x1b\[[0-9;]*m/g
```

#### Format Strings and Templates

**Sum File Path**: `${sourcePath}.sum`

**Annex File Path**: `${sourcePath}.annex.md`

**Trace File Path**: `.agents-reverse-engineer/traces/trace-${safeTimestamp}.ndjson`
- Timestamp format: `2026-02-09T12:34:56.789Z` → `2026-02-09T12-34-56-789Z`

**Run Log Path**: `.agents-reverse-engineer/logs/run-${safeTimestamp}.json`

**Progress Log Path**: `.agents-reverse-engineer/progress.log`

**Config Path**: `.agents-reverse-engineer/config.yaml`

**Checkpoint Path**: `${outputDir}/.rebuild-checkpoint`

**Progress Output Formats**:
```
[X/Y] ANALYZING path
[X/Y] DONE path Xs in/out tok model ~Ns remaining
[X/Y] FAIL path error
[dir X/Y] ANALYZING dirPath/AGENTS.md
[dir X/Y] DONE dirPath/AGENTS.md Xs in/out tok model ~ETA
[root] DONE docPath
```

**Update Check Cache Schema**:
```json
{
  "update_available": boolean,
  "installed": string,
  "latest": string,
  "checked": number  // Unix timestamp
}
```

#### Magic Constants and Sentinel Values

| Constant | Value | Meaning |
|----------|-------|---------|
| `GENERATED_MARKER` | `'<!-- Generated by agents-reverse-engineer -->'` | Marker for tool-generated AGENTS.md |
| `CONFIG_DIR` | `'.agents-reverse-engineer'` | Configuration directory name |
| `CONFIG_FILE` | `'config.yaml'` | Configuration file name |
| `TRACES_DIR` | `'.agents-reverse-engineer/traces'` | Trace output directory |
| `DEFAULT_MAX_FILE_SIZE` | `1048576` (1MB) | Binary detection threshold |
| `SUBPROCESS_HEAP_GB` | `0.512` | Subprocess heap limit in GB |
| `CONCURRENCY_MULTIPLIER` | `5` | CPU cores multiplier for concurrency |
| `MIN_CONCURRENCY` | `2` | Minimum worker pool size |
| `MAX_CONCURRENCY` | `20` | Maximum worker pool size |
| `MEMORY_FRACTION` | `0.5` | System memory fraction for subprocesses |
| `BUILT_CONTEXT_LIMIT` | `100000` | LRU truncation limit for rebuild context |
| `TRUNCATED_HEAD_LINES` | `20` | Lines to keep when truncating context |
| `FILTER_CONCURRENCY` | `30` | Concurrency for filter application |
| `TRACE_KEEP_COUNT` | `500` | Default trace file retention count |
| `RUN_LOG_KEEP_COUNT` | `50` | Default run log retention count |

#### Rate Limit Detection Patterns

```javascript
["rate limit", "429", "too many requests", "overloaded"]
```

Checked via lowercase `stderr.includes()`.

#### Claude Backend Arguments

```javascript
['-p', '--output-format', 'json', '--no-session-persistence', '--permission-mode', 'bypassPermissions']
// Appends conditionally:
['--model', options.model]        // if options.model present
['--system-prompt', options.systemPrompt]  // if options.systemPrompt present
['--max-turns', String(options.maxTurns)]  // if options.maxTurns defined
```

#### Git Diff Format

```
A       → { status: 'added', path }
M       → { status: 'modified', path }
D       → { status: 'deleted', path }
R<pct>  → { status: 'renamed', path: newPath, oldPath }
```

#### Manifest Detection Array

```javascript
['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'pom.xml',
 'build.gradle', 'Gemfile', 'composer.json', 'CMakeLists.txt', 'Makefile']
```

#### Language Detection Map

```javascript
.ts → typescript, .tsx → typescript, .js → javascript, .jsx → javascript,
.py → python, .go → go, .rs → rust, .java → java, .kt → kotlin,
.rb → ruby, .php → php, .c → c, .cpp → cpp, .cs → csharp,
.swift → swift, .scala → scala, .sh → bash, .md → markdown,
.yaml → yaml, .yml → yaml, .json → json, .toml → toml
Default: text
```

#### Skip Directories (Collector)

```javascript
['node_modules', '.git', '.agents-reverse-engineer', 'vendor', 'dist', 
 'build', '__pycache__', '.next', 'venv', '.venv', 'target', '.cargo', '.gradle']
```

#### Binary Extensions (Full Set - 96 entries)

```javascript
['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg', '.tiff', '.tif', 
 '.psd', '.raw', '.heif', '.heic', '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', 
 '.xz', '.tgz', '.exe', '.dll', '.so', '.dylib', '.bin', '.msi', '.app', '.dmg', 
 '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac', '.ogg', '.webm', '.m4a', 
 '.aac', '.wma', '.wmv', '.flv', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', 
 '.pptx', '.odt', '.ods', '.odp', '.woff', '.woff2', '.ttf', '.eot', '.otf', 
 '.class', '.pyc', '.pyo', '.o', '.obj', '.a', '.lib', '.wasm', '.db', '.sqlite', 
 '.sqlite3', '.mdb', '.ico', '.icns', '.cur', '.deb', '.rpm', '.jar', '.war', '.ear']
```

---

## 8. Test Contracts

### AI Service Module

**Test Scenarios**:
- Backend registry correctly orders backends by priority (Claude → Gemini → OpenCode)
- `resolveBackend('auto')` returns first available backend
- `resolveBackend('auto')` throws `AIServiceError` with `CLI_NOT_FOUND` when no backends available
- `withRetry()` retries on rate limit errors up to `maxRetries`
- `withRetry()` does NOT retry on timeout errors
- Exponential backoff formula produces correct delays: 1000, 2000, 4000, 8000ms (capped)
- `runSubprocess()` enforces timeout with SIGTERM, escalates to SIGKILL after 5s grace
- `runSubprocess()` captures stdout/stderr on success and failure
- `AIService.call()` emits `subprocess:spawn` and `subprocess:exit` trace events
- `TelemetryLogger` correctly aggregates token counts across entries
- `cleanupOldLogs()` keeps exactly `keepCount` most recent files

**Edge Cases**:
- Empty stdout from subprocess
- Subprocess exits before stdin write completes
- SIGKILL required after SIGTERM timeout
- Concurrent calls with shared tracer

### Change Detection Module

**Test Scenarios**:
- `isGitRepo()` returns false for non-git directories
- `getChangedFiles()` parses A/M/D status codes correctly
- `getChangedFiles()` parses R100 rename format with oldPath
- `includeUncommitted: true` merges staged and modified files
- Deduplication prevents duplicate FileChange entries
- `computeContentHash()` produces consistent SHA-256 hex output

**Edge Cases**:
- Empty git diff output (no changes)
- Git rename with 50% similarity threshold
- File path containing spaces or special characters

### Config Module

**Test Scenarios**:
- `loadConfig()` returns defaults for empty object `{}`
- `loadConfig()` merges partial config with defaults
- `loadConfig()` throws `ConfigError` for invalid YAML
- `loadConfig()` throws `ConfigError` for schema violations
- `getDefaultConcurrency()` respects memory cap
- `writeDefaultConfig()` creates valid YAML with all defaults

**Edge Cases**:
- Config file with ENOENT returns defaults without error
- Very low memory system (< 1GB)
- Config with unknown extra fields (should be ignored)

### Discovery Module

**Test Scenarios**:
- `discoverFiles()` excludes vendor directories
- `discoverFiles()` excludes binary files by extension
- `discoverFiles()` excludes files matching gitignore patterns
- `applyFilters()` short-circuits on first exclusion
- `createBinaryFilter()` uses isBinaryFile for unknown extensions
- Filter chain respects priority order

**Edge Cases**:
- File exceeds maxFileSize
- Symlink handling when `followSymlinks: false`
- Dotfiles included when `dot: true`
- Empty gitignore file

### Generation Module

**Test Scenarios**:
- `createPlan()` groups files by directory correctly
- `buildExecutionPlan()` sorts directories by depth descending
- `getDirectoryDepth()` returns correct values (`.` → 0, `src` → 1, `src/cli` → 2)
- `isDirectoryComplete()` returns false when child .sum missing
- `writeSumFile()` creates valid YAML frontmatter
- `readSumFile()` parses both inline and multi-line array formats
- `writeAgentsMd()` preserves AGENTS.local.md content
- `collectAgentsDocs()` skips SKIP_DIRS directories

**Edge Cases**:
- Empty directory (no files)
- Directory with only subdirectories
- Circular symlinks
- AGENTS.md already exists without GENERATED_MARKER

### Orchestration Module

**Test Scenarios**:
- `runPool()` distributes tasks across workers evenly
- `runPool()` respects fail-fast flag
- `runPool()` returns results in original task order
- `ProgressReporter` calculates ETA from moving average
- `TraceWriter` serializes events in emission order despite concurrency
- `PlanTracker` updates checkboxes correctly

**Edge Cases**:
- Zero tasks in pool
- Single task with concurrency > 1
- All tasks fail simultaneously
- Promise chain handles write errors gracefully

### Quality Module

**Test Scenarios**:
- `extractExports()` captures function, class, const, type, interface, enum
- `extractExports()` captures default exports
- `checkCodeVsDoc()` detects missing exports in summary
- `checkCodeVsCode()` detects duplicate exports in same directory
- `checkPhantomPaths()` resolves relative paths from AGENTS.md location
- `checkPhantomPaths()` resolves src/ paths from project root
- `checkPhantomPaths()` tries .ts fallback for .js references

**Edge Cases**:
- Destructured exports (currently missed by regex)
- Namespace exports (currently missed)
- Path with template placeholder `{{foo}}`
- URL-like string in markdown

### Update Module

**Test Scenarios**:
- `preparePlan()` identifies modified files by hash mismatch
- `preparePlan()` identifies added files (no existing .sum)
- `cleanupOrphans()` deletes .sum for deleted files
- `cleanupOrphans()` targets oldPath for renamed files
- `getAffectedDirectories()` walks to project root
- `getAffectedDirectories()` sorts deepest-first

**Edge Cases**:
- File modified but hash unchanged (no regeneration)
- Directory becomes empty after file deletion
- Rename to different directory

---

## 9. Build Plan

### Phase 1: Core Types and Utilities
**Defines**: `AICallOptions`, `AIResponse`, `SubprocessResult`, `RetryOptions`, `AIServiceErrorCode`, `AIServiceError`, `TelemetryEntry`, `RunLog`, `FileRead`, `ChangeType`, `FileChange`, `ChangeDetectionResult`, `ChangeDetectionOptions`, `FilterResult`, `ExcludedFile`, `DiscoveryResult`, `DiscoveryStats`, `WalkerOptions`, `FileFilter`, `InconsistencySeverity`, `CodeDocInconsistency`, `CodeCodeInconsistency`, `PhantomPathInconsistency`, `Inconsistency`, `InconsistencyReport`, `SummaryMetadata`, `SumFileContent`, `ImportEntry`, `FileImports`

**Consumes**: None (foundation phase)

**Tasks**:
1. Define all interface and type definitions
2. Implement `AIServiceError` class
3. Define Zod schemas where applicable

---

### Phase 2: Configuration
**Defines**: `Config`, `ExcludeConfig`, `OptionsConfig`, `OutputConfig`, `AIConfig`, `ConfigSchema`, `loadConfig`, `configExists`, `writeDefaultConfig`, `getDefaultConcurrency`, `DEFAULT_VENDOR_DIRS`, `DEFAULT_EXCLUDE_PATTERNS`, `DEFAULT_BINARY_EXTENSIONS`, `DEFAULT_MAX_FILE_SIZE`, `DEFAULT_CONFIG`, `CONFIG_DIR`, `CONFIG_FILE`

**Consumes**: Phase 1 types (for config validation)

**Tasks**:
1. Implement Zod schemas for all config sections
2. Implement `getDefaultConcurrency()` with memory-adaptive formula
3. Implement YAML loader with error handling
4. Implement config writer with YAML special character escaping

---

### Phase 3: Change Detection
**Defines**: `isGitRepo`, `getCurrentCommit`, `getChangedFiles`, `computeContentHash`, `computeContentHashFromString`

**Consumes**: `FileChange`, `ChangeDetectionResult`, `ChangeDetectionOptions` from Phase 1

**Tasks**:
1. Implement git repository detection
2. Implement `git diff --name-status -M` parser
3. Implement SHA-256 content hashing
4. Implement uncommitted change merging

---

### Phase 4: Discovery Filters
**Defines**: `FileFilter` interface implementations, `createGitignoreFilter`, `createVendorFilter`, `createBinaryFilter`, `createCustomFilter`, `applyFilters`, `BINARY_EXTENSIONS`

**Consumes**: `FileFilter`, `FilterResult`, `ExcludedFile` from Phase 1; config defaults from Phase 2

**Tasks**:
1. Implement gitignore filter with `ignore` library
2. Implement vendor filter with Set + path matching
3. Implement binary filter with extension set + isBinaryFile
4. Implement custom pattern filter
5. Implement filter chain applicator with bounded concurrency

---

### Phase 5: File Discovery
**Defines**: `discoverFiles`, `walkDirectory`, `DiscoveryConfig`, `DiscoverFilesOptions`

**Consumes**: Filter functions from Phase 4; `WalkerOptions`, `FilterResult` from Phase 1

**Tasks**:
1. Implement fast-glob wrapper
2. Implement filter chain composition
3. Implement discovery result assembly

---

### Phase 6: Import Extraction
**Defines**: `extractImports`, `extractDirectoryImports`, `formatImportMap`, `IMPORT_REGEX`

**Consumes**: `ImportEntry`, `FileImports` from Phase 1

**Tasks**:
1. Implement regex-based import parser
2. Implement directory-level import aggregation (first 100 lines)
3. Implement import map formatter

---

### Phase 7: Sum File I/O
**Defines**: `writeSumFile`, `readSumFile`, `getSumPath`, `sumFileExists`, `writeAnnexFile`, `getAnnexPath`, `formatSumFile`, `parseSumFile`, `GENERATED_MARKER`

**Consumes**: `SumFileContent`, `SummaryMetadata` from Phase 1

**Tasks**:
1. Implement YAML frontmatter serialization
2. Implement YAML array formatting (inline vs multi-line)
3. Implement frontmatter parser with regex extraction
4. Implement annex file generator

---

### Phase 8: AGENTS.md Writer
**Defines**: `writeAgentsMd`, `isGeneratedAgentsMd`

**Consumes**: `GENERATED_MARKER` from Phase 7

**Tasks**:
1. Implement AGENTS.local.md preservation logic
2. Implement generated marker detection
3. Implement content assembly with user content block

---

### Phase 9: Telemetry
**Defines**: `TelemetryLogger`, `writeRunLog`, `cleanupOldLogs`

**Consumes**: `TelemetryEntry`, `RunLog`, `FileRead` from Phase 1

**Tasks**:
1. Implement in-memory entry accumulation
2. Implement summary computation
3. Implement NDJSON file writer
4. Implement retention enforcement

---

### Phase 10: Tracing
**Defines**: `ITraceWriter`, `TraceWriter`, `NullTraceWriter`, `createTraceWriter`, `cleanupOldTraces`, `TraceEvent`, `TraceEventPayload`

**Consumes**: None (standalone)

**Tasks**:
1. Define trace event type hierarchy
2. Implement promise-chain file writer
3. Implement null writer for disabled tracing
4. Implement trace cleanup

---

### Phase 11: Subprocess Runner
**Defines**: `runSubprocess`, `isCommandOnPath`, `getActiveSubprocessCount`, `getActiveSubprocesses`

**Consumes**: `SubprocessResult` from Phase 1; `ITraceWriter` from Phase 10

**Tasks**:
1. Implement execFile wrapper with resource limits
2. Implement timeout enforcement with SIGTERM/SIGKILL
3. Implement process group killing
4. Implement active subprocess tracking

---

### Phase 12: Retry Logic
**Defines**: `withRetry`, `DEFAULT_RETRY_OPTIONS`

**Consumes**: `RetryOptions` from Phase 1

**Tasks**:
1. Implement exponential backoff formula
2. Implement retry loop with predicate
3. Implement jitter addition

---

### Phase 13: Backend Adapters
**Defines**: `AIBackend` implementations (`ClaudeBackend`, `GeminiBackend`, `OpenCodeBackend`), `BackendRegistry`, `createBackendRegistry`, `resolveBackend`, `detectBackend`, `getInstallInstructions`

**Consumes**: `AIBackend`, `AICallOptions`, `AIResponse`, `AIServiceError` from Phase 1; `isCommandOnPath` from Phase 11

**Tasks**:
1. Implement Claude backend with Zod JSON parsing
2. Implement stub backends for Gemini/OpenCode
3. Implement backend registry with priority ordering
4. Implement auto-detection

---

### Phase 14: AI Service
**Defines**: `AIService`

**Consumes**: `BackendRegistry` from Phase 13; `withRetry` from Phase 12; `runSubprocess` from Phase 11; `TelemetryLogger` from Phase 9; `ITraceWriter` from Phase 10; all AI types from Phase 1

**Tasks**:
1. Implement rate limit detection
2. Implement retry integration (not for timeouts)
3. Implement trace event emission
4. Implement telemetry aggregation

---

### Phase 15: Worker Pool
**Defines**: `runPool`, `PoolOptions`, `TaskResult`

**Consumes**: `ITraceWriter` from Phase 10

**Tasks**:
1. Implement iterator-based task distribution
2. Implement fail-fast flag handling
3. Implement trace emission for workers/tasks

---

### Phase 16: Progress Reporting
**Defines**: `ProgressReporter`, `ProgressLog`, `ProgressEvent`

**Consumes**: `RunSummary`, `ProgressEvent` from Phase 1; ANSI strip pattern

**Tasks**:
1. Implement ETA calculation with moving average
2. Implement console output formatting
3. Implement progress.log file mirroring
4. Implement summary printer

---

### Phase 17: Plan Tracking
**Defines**: `PlanTracker`

**Consumes**: None (standalone)

**Tasks**:
1. Implement GENERATION-PLAN.md writer
2. Implement checkbox update via regex
3. Implement promise-chain serialization

---

### Phase 18: Quality Validators
**Defines**: `extractExports`, `checkCodeVsDoc`, `checkCodeVsCode`, `checkPhantomPaths`, `buildInconsistencyReport`, `formatReportForCli`, `validateFindability`, `FindabilityResult`

**Consumes**: All inconsistency types from Phase 1; `SumFileContent` from Phase 7

**Tasks**:
1. Implement export extraction regex
2. Implement code-vs-doc substring matching
3. Implement code-vs-code duplicate detection
4. Implement phantom path resolution with fallbacks
5. Implement report aggregation

---

### Phase 19: Prompt Construction
**Defines**: `buildFilePrompt`, `buildDirectoryPrompt`, `buildRootPrompt`, `detectLanguage`, `PromptContext`, `SUMMARY_GUIDELINES`, `FILE_SYSTEM_PROMPT`, `FILE_USER_PROMPT`, `DIRECTORY_SYSTEM_PROMPT`, `FILE_UPDATE_SYSTEM_PROMPT`, `DIRECTORY_UPDATE_SYSTEM_PROMPT`, `ROOT_SYSTEM_PROMPT`

**Consumes**: `readSumFile`, `GENERATED_MARKER` from Phases 7-8; `extractDirectoryImports`, `formatImportMap` from Phase 6; `collectAgentsDocs` from Phase 20

**Tasks**:
1. Implement prompt templates with placeholder substitution
2. Implement language detection map
3. Implement manifest detection
4. Implement prompt builders for all three phases

---

### Phase 20: Document Collector
**Defines**: `collectAgentsDocs`, `collectAnnexFiles`, `AgentsDocs`, `SKIP_DIRS`

**Consumes**: None (filesystem operations only)

**Tasks**:
1. Implement recursive AGENTS.md collection
2. Implement recursive .annex.md collection
3. Implement SKIP_DIRS filtering

---

### Phase 21: Generation Orchestrator
**Defines**: `GenerationOrchestrator`, `createOrchestrator`, `GenerationPlan`, `PreparedFile`, `AnalysisTask`, `ComplexityMetrics`, `analyzeComplexity`

**Consumes**: `discoverFiles` from Phase 5; `buildFilePrompt` from Phase 19; `Config` from Phase 2; `ITraceWriter` from Phase 10

**Tasks**:
1. Implement file preparation with content loading
2. Implement complexity analysis
3. Implement project structure tree generation
4. Implement task creation

---

### Phase 22: Execution Plan Builder
**Defines**: `buildExecutionPlan`, `ExecutionPlan`, `ExecutionTask`, `formatExecutionPlanAsMarkdown`, `isDirectoryComplete`, `getReadyDirectories`, `getDirectoryDepth`

**Consumes**: `GenerationPlan` from Phase 21; `sumFileExists` from Phase 7

**Tasks**:
1. Implement depth calculation
2. Implement directory task dependency construction
3. Implement post-order sorting
4. Implement markdown plan formatter

---

### Phase 23: Command Runner
**Defines**: `CommandRunner`, `FileTaskResult`, `RunSummary`, `CommandRunOptions`

**Consumes**: `AIService` from Phase 14; `ExecutionPlan` from Phase 22; `runPool` from Phase 15; `ProgressReporter`, `ProgressLog` from Phase 16; `PlanTracker` from Phase 17; quality validators from Phase 18; writers from Phases 7-8; prompt builders from Phase 19

**Tasks**:
1. Implement three-phase execution loop
2. Implement quality validation integration
3. Implement preamble stripping
4. Implement purpose extraction

---

### Phase 24: Update Orchestrator
**Defines**: `UpdateOrchestrator`, `createUpdateOrchestrator`, `UpdatePlan`, `UpdateOptions`, `UpdateResult`, `CleanupResult`, `cleanupOrphans`, `cleanupEmptyDirectoryDocs`, `getAffectedDirectories`

**Consumes**: `discoverFiles` from Phase 5; `readSumFile` from Phase 7; `computeContentHash` from Phase 3; `FileChange` from Phase 1

**Tasks**:
1. Implement hash comparison workflow
2. Implement orphan cleanup
3. Implement affected directory calculation
4. Implement empty directory cleanup

---

### Phase 25: Specification Synthesis
**Defines**: `buildSpecPrompt`, `writeSpec`, `SpecExistsError`, `SpecPrompt`, `WriteSpecOptions`, `SPEC_SYSTEM_PROMPT`

**Consumes**: `collectAgentsDocs`, `collectAnnexFiles` from Phase 20

**Tasks**:
1. Implement system prompt constant
2. Implement prompt builder
3. Implement heading-based file splitter
4. Implement conflict detection

---

### Phase 26: Rebuild Module
**Defines**: `readSpecFiles`, `partitionSpec`, `parseModuleOutput`, `buildRebuildPrompt`, `executeRebuild`, `CheckpointManager`, `RebuildUnit`, `RebuildPlan`, `RebuildResult`, `RebuildCheckpoint`, `RebuildCheckpointSchema`, `REBUILD_SYSTEM_PROMPT`

**Consumes**: `AIService` from Phase 14; `runPool` from Phase 15; `computeContentHashFromString` from Phase 3

**Tasks**:
1. Implement spec file reader
2. Implement Build Plan phase parser
3. Implement output delimiter parser
4. Implement checkpoint manager with drift detection
5. Implement context accumulation with LRU truncation

---

### Phase 27: Integration Templates
**Defines**: `detectEnvironments`, `hasEnvironment`, `generateIntegrationFiles`, `getClaudeTemplates`, `getOpenCodeTemplates`, `getGeminiTemplates`, `EnvironmentType`, `DetectedEnvironment`, `IntegrationTemplate`, `IntegrationResult`, `COMMANDS`, `PLATFORM_CONFIGS`

**Consumes**: None (standalone)

**Tasks**:
1. Implement environment detection
2. Implement command template definitions
3. Implement platform config objects
4. Implement frontmatter builders
5. Implement TOML builder for Gemini

---

### Phase 28: Installer
**Defines**: `runInstaller`, `parseInstallerArgs`, `installFiles`, `uninstallFiles`, `registerHooks`, `registerPermissions`, `getPackageVersion`, `writeVersionFile`, `InstallerArgs`, `InstallerResult`, `RuntimePaths`, `InstallOptions`, `Runtime`, `Location`, `ARE_PERMISSIONS`, `ARE_HOOKS`, `ARE_PLUGINS`

**Consumes**: `getClaudeTemplates`, `getOpenCodeTemplates`, `getGeminiTemplates` from Phase 27

**Tasks**:
1. Implement argument parser
2. Implement interactive prompts with arrow-key navigation
3. Implement file copy operations
4. Implement hook registration (Claude nested, Gemini flat)
5. Implement permission registration
6. Implement uninstall with cleanup

---

### Phase 29: Session Hooks
**Defines**: `are-check-update.js`, `are-session-end.js`, `opencode-are-check-update.js`, `opencode-are-session-end.js`

**Consumes**: None (standalone scripts)

**Tasks**:
1. Implement version check with npm registry query
2. Implement git status check
3. Implement detached process spawning
4. Implement OpenCode plugin wrappers

---

### Phase 30: CLI Commands
**Defines**: `initCommand`, `discoverCommand`, `generateCommand`, `updateCommand`, `specifyCommand`, `rebuildCommand`, `cleanCommand`, `parseArgs`

**Consumes**: All previous phases

**Tasks**:
1. Implement argument parser with short/long flags
2. Implement each command handler
3. Implement backend resolution error handling
4. Implement exit code conventions
5. Implement dry-run behavior
6. Implement installer detection and routing

---

## 10. Prompt Templates & System Instructions

### FILE_SYSTEM_PROMPT

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

### FILE_USER_PROMPT

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

### DIRECTORY_SYSTEM_PROMPT

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

### FILE_UPDATE_SYSTEM_PROMPT

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

### DIRECTORY_UPDATE_SYSTEM_PROMPT

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

### ROOT_SYSTEM_PROMPT

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

### SPEC_SYSTEM_PROMPT

```
You produce software specifications from documentation.

TASK:
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
9. Build Plan — phased implementation sequence with explicit interface contracts per phase:
   - Each phase MUST include a "Defines:" list naming the exact types, interfaces, classes, and functions this phase must export (use the exact names from section 3 Public API Surface)
   - Each phase MUST include a "Consumes:" list naming the exact types and functions from earlier phases that this phase imports
   - Include dependency ordering and implementation tasks as before
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
- Build Plan phases MUST cross-reference the Public API Surface: every type/function in the API Surface section must appear in exactly one phase's "Defines:" list
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

### REBUILD_SYSTEM_PROMPT

```
You reconstruct source code from a project specification.

TASK:
Generate all source files for the described module/phase. The code must be complete, compilable, and production-ready.

OUTPUT FORMAT:
Use this exact delimiter format for EVERY file:

===FILE: relative/path.ext===
[file content]
===END_FILE===

Generate ONLY the file content between delimiters. No markdown fencing, no commentary, no explanations outside the file delimiters.

QUALITY:
- Code must compile. Use exact type names, function signatures, and constants from the spec.
- Follow the architecture and patterns described in the specification.
- Imports must reference real modules described in the spec.
- Generate production code only (no tests, no stubs, no placeholders).
- Do not invent features not in the spec.
- Do not add comments explaining what the spec says — write the code the spec describes.

STRICT COMPLIANCE:
- When the specification defines exact names for functions, methods, types, classes, or constants, you MUST use those exact names. Do not invent synonyms (e.g., if the spec says done(), do not write reportSuccess()).
- Pay close attention to the "Interfaces for This Phase" section in the current phase — it contains the exact signatures you must implement.
- When "Already Built" context shows an exported symbol, import and use it. Do not redefine it.

CONTEXT AWARENESS:
When "Already Built" context is provided, import from those modules and use their exported types/functions. Do not redefine types that already exist in built modules.
When "Already Built" context provides a function or method signature, your code MUST call it using the exact name shown. Match the API precisely.
```

### SUMMARY_GUIDELINES

```typescript
const SUMMARY_GUIDELINES = {
  targetLength: { min: 300, max: 500 },
  include: [
    'Purpose and responsibility',
    'Public interface (exports, key functions)',
    'Key patterns and notable algorithms',
    'Dependencies with usage context',
    'Key function signatures as code snippets',
    'Tightly coupled sibling files',
    'Behavioral contracts: verbatim regex patterns, format strings, magic constants, sentinel values, output templates, environment variables',
    'Annex references: for files with large string constants (prompt templates, config arrays, IDE templates), list each constant name with a one-line description in an ## Annex References section',
  ],
  exclude: [
    'Control flow minutiae (loop structures, variable naming, temporary state)',
    'Generic TODOs/FIXMEs (keep only security/breaking)',
    'Broad architectural relationships (handled by AGENTS.md)',
  ],
} as const;
```

---

## 11. IDE Integration & Installer

### Platform Configuration Objects

```typescript
const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  claude: {
    commandPrefix: '/are-',
    pathPrefix: '.claude/skills/',
    filenameSeparator: '.',
    usesName: true,
    versionFilePath: '.claude/ARE-VERSION',
  },
  opencode: {
    commandPrefix: '/are-',
    pathPrefix: '.opencode/commands/',
    filenameSeparator: '-',
    extraFrontmatter: 'agent: build',
    usesName: false,
    versionFilePath: '.opencode/ARE-VERSION',
  },
  gemini: {
    commandPrefix: '/are-',
    pathPrefix: '.gemini/commands/',
    filenameSeparator: '-',
    usesName: false,
    versionFilePath: '.gemini/ARE-VERSION',
  },
};
```

### Command Definitions

**COMMANDS** object contains seven command definitions: `generate`, `update`, `init`, `discover`, `clean`, `specify`, `rebuild`, `help`.

Each command has:
- `description`: Short description string
- `argumentHint`: CLI argument placeholders
- `content`: Full command execution instructions

### Permission Lists

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

### Hook Definitions

```typescript
const ARE_HOOKS: HookDefinition[] = [
  // Currently disabled - causing issues
  // { event: 'SessionStart', filename: 'are-check-update.js', name: 'are-check-update' },
  // { event: 'SessionEnd', filename: 'are-session-end.js', name: 'are-session-end' },
];

const ARE_PLUGINS: PluginDefinition[] = [
  { srcFilename: 'opencode-are-check-update.js', destFilename: 'are-check-update.js' },
  // { srcFilename: 'opencode-are-session-end.js', destFilename: 'are-session-end.js' }, // Disabled
];
```

### Settings.json Schemas

**Claude Code format (nested)**:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node ~/.claude/hooks/are-check-update.js" }
        ]
      }
    ]
  },
  "permissions": {
    "allow": ["Bash(npx agents-reverse-engineer@latest generate*)"]
  }
}
```

**Gemini CLI format (flat)**:
```json
{
  "hooks": {
    "SessionStart": [
      { "name": "are-check-update", "type": "command", "command": "node ~/.gemini/hooks/are-check-update.js" }
    ]
  }
}
```

### Session Hook Scripts

**are-check-update.js**:
```javascript
#!/usr/bin/env node
// Spawns detached process to check npm registry version
// Writes result to ~/.claude/cache/are-update-check.json
// Checks project/.claude/ARE-VERSION first, then global

const child = spawn(process.execPath, ['-e', `
  // Read installed version from ARE-VERSION files
  // Query npm view agents-reverse-engineer version
  // Write { update_available, installed, latest, checked } to cache
`], {
  stdio: 'ignore',
  detached: true,
  windowsHide: true,
});
child.unref();
```

**are-session-end.js**:
```javascript
#!/usr/bin/env node
// Checks ARE_DISABLE_HOOK env and config file
// Runs git status --porcelain
// Spawns detached: npx agents-reverse-engineer@latest update --quiet

if (process.env.ARE_DISABLE_HOOK === '1') process.exit(0);
// Check config for hook_enabled: false
// Check git status
spawn('npx', ['agents-reverse-engineer@latest', 'update', '--quiet'], {
  stdio: 'ignore',
  detached: true,
}).unref();
```

### Frontmatter Formats

**Claude (Markdown with name)**:
```yaml
---
name: are-generate
description: Generate AI-friendly documentation for the entire codebase
---
```

**OpenCode (Markdown with agent)**:
```yaml
---
description: Generate AI-friendly documentation for the entire codebase
agent: build
---
```

**Gemini (TOML)**:
```toml
description = "Generate AI-friendly documentation for the entire codebase"
# Arguments: [path] [--dry-run] [--concurrency N]
prompt = """
<command content>
"""
```

### Environment Path Overrides

| Variable | Platform | Default |
|----------|----------|---------|
| `CLAUDE_CONFIG_DIR` | Claude | `~/.claude` |
| `OPENCODE_CONFIG_DIR` | OpenCode | `~/.config/opencode` (or `XDG_CONFIG_HOME/opencode`) |
| `GEMINI_CONFIG_DIR` | Gemini | `~/.gemini` |
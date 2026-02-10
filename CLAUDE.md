# agents-reverse-engineer

**agents-reverse-engineer (ARE)** is a CLI tool that generates AI-friendly codebase documentation through three-phase AI analysis: per-file `.sum` summaries with YAML frontmatter, per-directory `AGENTS.md` navigational indexes synthesized via post-order traversal, and root `CLAUDE.md`/`GEMINI.md`/`OPENCODE.md` entry points. Enables incremental updates via hash-based change detection, specification synthesis via `SPEC.md` generation, and project reconstruction from specifications with checkpoint resumption.

## Purpose

ARE reverse-engineers existing codebases into structured documentation optimized for AI coding assistants (Claude Code, OpenCode, Gemini CLI), enabling AI agents to understand project architecture, navigate file relationships, and maintain context across sessions. The tool implements the RLM (Recursive Language Model) algorithm: leaf-first file analysis with concurrent `.sum` generation, bottom-up directory synthesis into `AGENTS.md` navigational indexes, and root-level aggregation into runtime-specific entry documents.

## Architecture

### Three-Phase AI Pipeline

**Phase 1 (File Analysis)**: Concurrent `.sum` generation via iterator-based worker pool sharing task queue across workers. Each worker executes `buildFilePrompt()` (embeds source content, language detection, import map) → `AIService.call()` → `writeSumFile()` with YAML frontmatter (`generated_at`, `content_hash`, `purpose`, `critical_todos`, `related_files`). Concurrency controlled by config or CPU/memory-based formula: `clamp(cores * 5, 2, min(floor(totalMemGB * 0.5 / 0.512), 20))` allocating 50% system memory with 512MB per subprocess.

**Phase 2 (Directory Synthesis)**: Post-order `AGENTS.md` generation grouped by directory depth descending (deepest-first). Each directory task executes `buildDirectoryPrompt()` (reads child `.sum` files + subdirectory AGENTS.md, extracts import map) → `AIService.call()` → `writeAgentsMd()` with `GENERATED_MARKER`. Preserves user-authored content as `AGENTS.local.md`.

**Phase 3 (Root Documentation)**: Sequential root doc generation (concurrency=1). Root tasks execute `buildRootPrompt()` (aggregates all AGENTS.md + package.json metadata) → `AIService.call()` → writes `CLAUDE.md`/`OPENCODE.md`/`GEMINI.md`.

### Iterator-Based Concurrency Pool

`orchestration/pool.ts` implements shared iterator pattern: `runPool()` spawns `Math.min(concurrency, tasks.length)` workers pulling `[index, task]` pairs from single `tasks.entries()` iterator. Each worker executes task factory → `onComplete?.(result)` → checks `aborted` flag when `failFast` enabled. Phases labeled for tracing (`'phase-1-files'`, `'phase-2-directories'`, `'phase-3-root'`, `'pre-phase-1-cache'`, `'post-phase-1-quality'`, `'post-phase-2-phantom'`).

### AI Backend Abstraction

`AIBackend` interface defines four methods: `isAvailable()` checks CLI presence via `isCommandOnPath()`, `buildArgs()` constructs subprocess argv, `parseResponse()` normalizes stdout to `AIResponse`, `getInstallInstructions()` returns setup guide. `BackendRegistry` pre-populated with ClaudeBackend, GeminiBackend, OpenCodeBackend in detection priority order. `resolveBackend()` handles `'auto'` detection or explicit backend selection, throws `AIServiceError('CLI_NOT_FOUND')` with install instructions on unavailable CLI. `AIService.call()` wraps `runSubprocess()` with `withRetry()` (exponential backoff, 3 max retries, rate-limit detection), enforces timeout via SIGTERM → SIGKILL escalation, attempts process group kill `kill(-pid)`, records telemetry to `.agents-reverse-engineer/logs/run-${timestamp}.json`, emits NDJSON trace events.

### Change Detection Strategies

**Git-based**: `getChangedFiles()` parses `git diff --name-status -M baseCommit..HEAD` with 50% rename similarity threshold, optionally appends uncommitted changes from `git.status()` (modified, deleted, not_added, staged arrays), maps status codes (`A` → added, `M` → modified, `D` → deleted, `R<percentage>` → renamed).

**Hash-based**: `UpdateOrchestrator.preparePlan()` reads `.sum` frontmatter via `readSumFile()`, compares stored `contentHash` against `computeContentHash()` (SHA-256 hex digest from disk), classifies files as added (no .sum), modified (hash mismatch), or unchanged (hash match), calls `cleanupOrphans()` for deleted files, sorts affected directories deepest-first for post-order regeneration. Abandoned git-only approach to support non-git repositories.

### Quality Validation Pipeline

Runs during `executeGenerate()` and `executeUpdate()`:

1. **Pre-Phase 1 (cache)**: Reads existing `.sum` files concurrently (concurrency=20) into `oldSumCache` for stale documentation detection
2. **Post-Phase 1 (quality)**: Groups processed files by directory, runs `checkCodeVsDoc()` (old-doc stale + new-doc omission) and `checkCodeVsCode()` (duplicate exports) per directory with concurrency=10, builds `InconsistencyReport`
3. **Post-Phase 2 (phantom paths)**: Reads all generated `AGENTS.md`, runs `checkPhantomPaths()` detecting references to non-existent files via three regex patterns (markdown links, backtick paths, prose references), filters false positives

## Key Directories

| Directory | Purpose |
|-----------|---------|
| **src/cli/** | Eight command entry points: init (bootstrap config), discover (file tree walk), generate (three-phase AI pipeline), update (incremental regeneration), clean (artifact deletion), specify (spec synthesis), rebuild (project reconstruction), install/uninstall (CLI hooks) |
| **src/ai/** | AIBackend abstraction with retry, subprocess execution, telemetry. ClaudeBackend (production-ready with JSON/NDJSON/legacy parsing), GeminiBackend (stub), OpenCodeBackend (stub). `AIService.call()` wraps `runSubprocess()` with exponential backoff, timeout enforcement, rate-limit detection |
| **src/config/** | Configuration management via Zod schema validation for `config.yaml`, default constants (exclusion patterns, binary extensions, vendor directories), concurrency calculation from CPU/memory, YAML serialization with comment headers |
| **src/discovery/** | File discovery pipeline with composable filter chain (gitignore → vendor → binary → custom). `discoverFiles()` orchestrates `walkDirectory()` → `applyFilters()` with concurrency=30 for I/O-bound binary detection |
| **src/generation/** | Three-phase orchestration: `GenerationOrchestrator.createPlan()` builds dependency graph, `buildExecutionPlan()` converts to `ExecutionTask[]` sorted by depth descending (post-order traversal). Prompts inject source content, import maps, child documentation |
| **src/orchestration/** | Execution layer with iterator-based concurrency pool, NDJSON tracing to `.agents-reverse-engineer/traces/`, progress reporting with ETA calculation, quality checks (`checkCodeVsDoc`, `checkCodeVsCode`, `checkPhantomPaths`) |
| **src/change-detection/** | Git-based change detection and SHA-256 content hashing. `getChangedFiles()` parses `git diff` with rename detection, `computeContentHash()` generates hex-encoded SHA-256 from disk |
| **src/update/** | Incremental updates via frontmatter hash comparison. `UpdateOrchestrator.preparePlan()` reads `.sum` files, compares stored `contentHash` against current, classifies added/modified/unchanged, calls `cleanupOrphans()`, sorts directories deepest-first |
| **src/imports/** | TypeScript/JavaScript import extraction via regex parsing. `extractImports()` captures named/namespace/default imports with five capture groups, `extractDirectoryImports()` classifies relative imports as internal (`./`) or external (`../`) |
| **src/specify/** | Specification synthesis from AGENTS.md. `buildSpecPrompt()` assembles AGENTS.md + annex files into structured prompt with 12-section template, `writeSpec()` supports single-file and multi-file output via `splitByHeadings()` |
| **src/rebuild/** | AI-driven project reconstruction with checkpoint resumption. `executeRebuild()` reads specs, partitions by `order` field, loads `CheckpointManager` for resume state, runs `runPool()` for concurrent AI calls, accumulates `builtContext` from completed files |
| **src/installer/** | npx-driven installation workflow deploying command templates, session hooks, and configuration to Claude Code, OpenCode, Gemini CLI environments through interactive prompts or non-interactive CLI flags |
| **src/integration/** | Environment detection (`.claude/`, `.opencode/`, `.gemini/`, `.aider/`) and platform-specific template generation. Claude templates target `.claude/skills/are-{command}/SKILL.md`, OpenCode uses `.opencode/commands/are-{command}.md`, Gemini uses `.gemini/commands/are-{command}.toml` |
| **src/quality/** | Quality validation detecting code-vs-doc inconsistencies via export extraction and substring matching, code-vs-code duplicate exports via Map-based detection, phantom path verification via markdown link extraction and `existsSync()` checks |
| **hooks/** | Node.js hook scripts for Claude CLI and OpenCode enabling automatic version checks and incremental updates. `are-check-update.js` spawns detached background process querying npm registry, `are-session-end.js` triggers update when session ends with uncommitted changes |
| **scripts/** | Build automation. `build-hooks.js` copies `.js` files from `hooks/` to `hooks/dist/` during `npm run build:hooks` and `prepublishOnly` |
| **docs/** | Founding requirements document `INPUT.md` specifying RLM algorithm, `{filename}.sum` → AGENTS.md synthesis pipeline, `/are-generate` and `/are-update` command semantics |
| **.github/workflows/** | CI/CD automation. `publish.yml` defines npm publish workflow triggered on GitHub release creation, runs Node.js 20.x tests, authenticates to npm registry, executes `npm publish` with `--provenance` flag |

## Getting Started

### Installation

**Interactive installer (recommended):**
```bash
npx agents-reverse-engineer@latest
```
Arrow-key navigation selects runtime (Claude Code, OpenCode, Gemini CLI, All) and location (Global, Local). Installs command templates, hooks, permissions.

**Non-interactive installer:**
```bash
npx agents-reverse-engineer@latest --runtime claude --global
npx agents-reverse-engineer@latest --runtime all --local
```

**CLI tool only (no integration):**
```bash
npm install -g agents-reverse-engineer
```

### Basic Workflow

```bash
# 1. Initialize configuration
are init

# 2. Discover files (writes GENERATION-PLAN.md)
are discover

# 3. Generate documentation
are generate

# 4. Update after code changes
are update --uncommitted

# 5. Synthesize specification
are specify

# 6. Reconstruct project from spec
are rebuild
```

### AI Assistant Commands

After installation, use commands within Claude Code, OpenCode, or Gemini CLI:

- `/are-help` — Display command reference
- `/are-init` — Bootstrap configuration
- `/are-discover` — Scan codebase, write plan
- `/are-generate` — Generate full documentation
- `/are-update` — Incremental update
- `/are-specify` — Synthesize project spec
- `/are-rebuild` — Reconstruct from spec
- `/are-clean` — Delete generated artifacts

### Configuration

Edit `.agents-reverse-engineer/config.yaml`:

```yaml
exclude:
  patterns:
    - '*.lock'
    - '*.sum'
    - 'AGENTS.md'
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
  model: sonnet
  timeoutMs: 300000
  maxRetries: 3
  concurrency: 10
  telemetry:
    keepRuns: 10
```

## Key Technologies

**Runtime**: Node.js ≥18.0.0 ESM (type: "module")  
**Build**: TypeScript 5.7.3 → ES2022, NodeNext module resolution, output to `dist/`  
**CLI**: Dual binaries `agents-reverse-engineer` and `are` both mapping to `dist/cli/index.js`  
**Tests**: Vitest (implicit via `npm test`)

**Core Dependencies**:
- **fast-glob** 3.3.3 — glob pattern matching for file discovery
- **ignore** 7.0.3 — `.gitignore` parsing for exclusion filters
- **isbinaryfile** 5.0.4 — binary file detection
- **simple-git** 3.27.0 — git diff/status for change detection
- **yaml** 2.7.0 — config parsing and frontmatter serialization
- **zod** 3.24.1 — schema validation for `config.yaml`
- **ora** 8.1.1 — terminal spinner UI
- **picocolors** 1.1.1 — ANSI color formatting

## Behavioral Contracts

### CLI Exit Codes

- **0**: Success (all tasks completed without failures)
- **1**: Partial failure (some files/modules failed, at least one succeeded)
- **2**: Total failure (no files processed AND failures occurred) OR CLI backend not found

### Subprocess Timeout Handling

SIGTERM sent at `timeoutMs`, SIGKILL escalation after `timeoutMs + SIGKILL_GRACE_MS` (5000ms). Process group kill `kill(-pid)` attempts to terminate subprocess tree, falls back to single process `kill(pid)`.

### Import Detection Regex

`/^[ \t]*export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/gm` captures TypeScript/JavaScript export identifiers in group 1.

### Phantom Path Extraction Patterns

- Markdown links: `/\[(?:[^\]]*)\]\((\.[^)]+)\)/g`
- Backtick paths: `` /`((?:src\/|\.\.?\/)[^`]+\.[a-z]{1,4})`/g ``
- Prose references: `/(?:from|in|by|via|see)\s+`?(src\/[\w\-./]+)`?/gi`

### Retry Configuration

`DEFAULT_RETRY_OPTIONS`: `maxRetries: 3`, `baseDelayMs: 1000`, `maxDelayMs: 8000`, `multiplier: 2`. Exponential backoff formula: `min(baseDelayMs * multiplier^attempt, maxDelayMs) + jitter` where jitter is `Math.random() * 500`. Rate-limit errors retry up to `maxRetries` when stderr matches `['rate limit', '429', 'too many requests', 'overloaded']` case-insensitively. Timeout errors do not retry.

### Trace Event Schema

NDJSON events written to `.agents-reverse-engineer/traces/trace-${timestamp}.ndjson` with auto-populated fields: `seq` (monotonic), `ts` (ISO 8601), `pid` (process.pid), `elapsedMs` (fractional ms since run start). Event types: `phase:start`/`phase:end`, `worker:start`/`worker:end`, `task:pickup`/`task:done`, `subprocess:spawn`/`subprocess:exit`, `retry`, `discovery:start`/`discovery:end`, `filter:applied`, `plan:created`, `config:loaded`.

### Configuration Constants

- `CONFIG_DIR = ".agents-reverse-engineer"` — configuration directory name
- `CONFIG_FILE = "config.yaml"` — configuration filename
- `CONCURRENCY_MULTIPLIER = 5` — CPU core scaling factor
- `MIN_CONCURRENCY = 2` — floor for computed concurrency
- `MAX_CONCURRENCY = 20` — ceiling for computed concurrency
- `SUBPROCESS_HEAP_GB = 0.512` — memory budget per subprocess
- `MEMORY_FRACTION = 0.5` — allocates 50% of system memory to pool
- `DEFAULT_MAX_FILE_SIZE = 1048576` — 1MB file size threshold
- `SIGKILL_GRACE_MS = 5000` — delay between SIGTERM and SIGKILL
- `BUILT_CONTEXT_LIMIT = 100000` — max chars for rebuild accumulated context
- `TRUNCATED_HEAD_LINES = 20` — lines retained when truncating context

## Build Instructions

```bash
# Install dependencies
npm install

# Development with live reload
npm run dev

# Compile TypeScript to dist/
npm run build

# Copy hooks to hooks/dist/
npm run build:hooks

# Run tests
npm test

# Full release build (build + build:hooks)
npm run prepublishOnly
```

## Project-Wide Patterns

### File Generation Flow

**Installation**: `src/installer/index.ts` parses CLI flags → dispatches to `runInstaller()` or `uninstallFiles()` → copies command templates from `src/integration/templates.ts` → registers hooks/plugins in `settings.json` → adds bash permission patterns to `settings.permissions.allow` → writes VERSION marker.

**Discovery**: `src/cli/discover.ts` calls `loadConfig()` → `discoverFiles()` → `walkDirectory()` → `applyFilters()` (gitignore, vendor, binary, custom) → returns `FilterResult` → writes `GENERATION-PLAN.md`.

**Generation**: `src/cli/generate.ts` calls `createOrchestrator().createPlan()` → `buildExecutionPlan()` → `CommandRunner.executeGenerate()` → three-phase sequence: (1) `runPool()` file analysis with `buildFilePrompt()` → `aiService.call()` → `writeSumFile()`, (2) post-order directory synthesis with `buildDirectoryPrompt()` → `aiService.call()` → `writeAgentsMd()`, (3) sequential root doc generation with `buildRootPrompt()` → `aiService.call()` → writes CLAUDE.md/OPENCODE.md/GEMINI.md → quality checks via `checkCodeVsDoc()`/`checkCodeVsCode()`/`checkPhantomPaths()` → `buildInconsistencyReport()` → `formatReportForCli()`.

**Update**: `src/cli/update.ts` calls `createUpdateOrchestrator().preparePlan()` → `readSumFile()` + `computeContentHash()` → classifies added/modified/unchanged → `cleanupOrphans()` → `getAffectedDirectories()` → `CommandRunner.executeUpdate()` → parallel file analysis → sequential directory regeneration.

**Specify**: `src/cli/specify.ts` calls `collectAgentsDocs()` + `collectAnnexFiles()` → `buildSpecPrompt()` → `aiService.call()` → `writeSpec()` with single-file or multi-file mode via `splitByHeadings()`.

**Rebuild**: `src/cli/rebuild.ts` calls `readSpecFiles()` → `partitionSpec()` → `CheckpointManager.load()` → `executeRebuild()` groups by order → `runPool()` calls `buildRebuildPrompt()` → `aiService.call()` → `parseModuleOutput()` → `writeFile()` → `checkpoint.markDone()`.

**AI Service**: `AIService.call()` resolves backend via `resolveBackend()` → constructs argv via `backend.buildArgs()` → `withRetry()` wraps `runSubprocess()` → `execFile()` spawns child process → enforces timeout with SIGTERM/SIGKILL → `backend.parseResponse()` normalizes stdout → `TelemetryLogger.addEntry()` records metrics → `tracer.emit()` writes NDJSON events.

### Promise-Chain Serialization

`writeQueue: Promise<void>` field initialized to `Promise.resolve()` serves as promise chain anchor. Each write appends `writeQueue.then(() => writeFile(...))` to serialize concurrent writes from pool workers. Pattern used in: `PlanTracker.markDone()`, `ProgressLog.write()`, `TraceWriter.emit()`. Errors caught and suppressed with empty catch block to treat telemetry failures as non-critical.

### Background Process Pattern (Hooks)

All hooks use `spawn(process.execPath, ['-e', inlineCode])` or `spawn('npx', ...)` with:
- `detached: true` — allows subprocess to outlive parent session
- `stdio: 'ignore'` — suppresses all subprocess I/O
- `windowsHide: true` — prevents console window flash on Windows
- `child.unref()` — prevents subprocess from blocking parent exit

## License

MIT License — Copyright 2026 GeoloeG-IsT. See [LICENSE](./LICENSE) for full terms.
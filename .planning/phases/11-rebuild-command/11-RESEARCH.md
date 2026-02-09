# Phase 11: Rebuild Command - Research

**Researched:** 2026-02-09
**Domain:** CLI command for AI-driven project reconstruction from spec files
**Confidence:** HIGH

## Summary

The rebuild command reconstructs a project from specification files (`specs/`) into an output directory (`rebuild/`), using the same AI subprocess infrastructure as existing ARE commands. Research focused on three areas: (1) how to follow existing codebase patterns for new commands, (2) checkpoint-based session continuity for long-running multi-session execution, and (3) spec partitioning into per-module AI calls.

The codebase has very clear, consistent patterns for CLI commands, AI service orchestration, worker pool execution, progress reporting, and trace emission. The rebuild command is architecturally a new execution mode on the `CommandRunner`/pool infrastructure with a new concern: checkpoint-based state persistence for resume across sessions. All infrastructure pieces exist; the new code is a rebuild-specific orchestrator, prompt builder, checkpoint manager, and CLI entry point.

**Primary recommendation:** Follow the exact `generate` command pattern (CLI entry point -> orchestrator -> execution plan -> CommandRunner with pool) but replace the three-phase pipeline with a single rebuild phase. Add a checkpoint file (`rebuild/.rebuild-checkpoint`) that tracks per-module status and spec hashes for drift detection.

## Standard Stack

The rebuild command uses the existing ARE stack exclusively. No new libraries are needed.

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js crypto (`createHash`) | built-in | SHA-256 hashing for spec drift detection | Already used in `change-detection/detector.ts` |
| `fs/promises` | built-in | File I/O for checkpoint, spec reading, output writing | Project standard |
| `path` | built-in | Cross-platform path operations | Project standard |
| `picocolors` | ^1.1.1 | Terminal color output | Already used across all CLI commands |
| `zod` | ^3.24.1 | Checkpoint file schema validation | Already used for config schema |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `yaml` | ^2.7.0 | YAML parsing if checkpoint uses YAML format | Only if JSON insufficient |
| `fast-glob` | ^3.3.2 | Spec file discovery if multi-file mode | Only for `specs/*.md` globbing |

### No New Dependencies Needed
The rebuild command reuses all existing infrastructure: `AIService`, `runPool`, `ProgressReporter`, `ProgressLog`, `ITraceWriter`, `PlanTracker`. No new npm packages required.

**Installation:** No additional packages needed.

## Architecture Patterns

### Recommended Module Structure
```
src/
├── rebuild/                    # New directory for rebuild-specific logic
│   ├── index.ts               # Barrel export
│   ├── types.ts               # RebuildCheckpoint, RebuildTask, RebuildPlan types
│   ├── checkpoint.ts          # Checkpoint read/write/validate/drift-detect
│   ├── spec-reader.ts         # Read and partition spec files into rebuild units
│   └── prompts.ts             # System prompt + per-module user prompt builder
├── cli/
│   └── rebuild.ts             # CLI command entry point (new file)
└── orchestration/
    └── runner.ts              # Add executeRebuild() method (extend existing)
```

### Pattern 1: CLI Command Entry Point (follow `generate.ts` exactly)
**What:** Each ARE command has a CLI entry in `src/cli/` that loads config, resolves backend, creates AIService, creates CommandRunner, and calls the appropriate execution method.
**When to use:** For the `rebuild` command entry point.
**Example:**
```typescript
// Source: src/cli/generate.ts pattern
export interface RebuildOptions {
  output?: string;       // Custom output directory (default: rebuild/)
  force?: boolean;       // Wipe rebuild/ and start fresh
  dryRun?: boolean;      // Show plan without executing
  concurrency?: number;  // Override worker pool size
  failFast?: boolean;    // Stop on first failure
  debug?: boolean;       // Verbose subprocess logging
  trace?: boolean;       // Enable NDJSON tracing
}

export async function rebuildCommand(
  targetPath: string,
  options: RebuildOptions,
): Promise<void> {
  const absolutePath = path.resolve(targetPath);
  // 1. Load config
  // 2. Read spec files
  // 3. Check/load checkpoint
  // 4. Handle dry-run
  // 5. Resolve backend
  // 6. Create AIService with extended timeout
  // 7. Create CommandRunner
  // 8. Execute rebuild plan
  // 9. Finalize telemetry, traces, progress log
}
```

### Pattern 2: Execution Plan with Pool (follow `executeGenerate` pattern)
**What:** Create an array of task factories, run them through `runPool()` with `PoolOptions`, use `onComplete` callback for progress reporting and checkpoint updates.
**When to use:** For concurrent module rebuild execution.
**Example:**
```typescript
// Source: src/orchestration/runner.ts pattern
const rebuildTasks = modules.map(
  (module, taskIndex) => async (): Promise<RebuildTaskResult> => {
    reporter.onModuleStart(module.name);
    const response = await this.aiService.call({
      prompt: module.userPrompt,
      systemPrompt: module.systemPrompt,
      taskLabel: module.name,
    });
    // Write generated files to output directory
    await writeModuleFiles(module, response.text, outputDir);
    // Update checkpoint
    checkpoint.markDone(module.name);
    return { name: module.name, success: true, ... };
  },
);

await runPool(rebuildTasks, {
  concurrency: this.options.concurrency,
  failFast: this.options.failFast,
  tracer: this.tracer,
  phaseLabel: 'rebuild-modules',
  taskLabels: modules.map(m => m.name),
}, onComplete);
```

### Pattern 3: Checkpoint File (new pattern, follows project conventions)
**What:** A JSON file inside `rebuild/` tracking which modules completed, their status, and spec file hashes for drift detection.
**When to use:** Every rebuild session reads checkpoint on start, writes on each module completion.
**Example:**
```typescript
// Checkpoint schema (validated with Zod)
interface RebuildCheckpoint {
  version: string;          // ARE version that created checkpoint
  createdAt: string;        // ISO timestamp of first run
  updatedAt: string;        // ISO timestamp of last update
  specHashes: Record<string, string>;  // { "specs/SPEC.md": "sha256hex" }
  modules: Record<string, {
    status: 'pending' | 'done' | 'failed';
    completedAt?: string;
    error?: string;
  }>;
}
```

### Pattern 4: Promise-Chain Write Serialization
**What:** Concurrent pool workers writing to the same checkpoint file use the promise-chain pattern (`this.writeQueue = this.writeQueue.then(...)`) to prevent corruption.
**When to use:** Checkpoint updates from concurrent module rebuilds.
**Source:** Already used in `PlanTracker`, `ProgressLog`, `TraceWriter` -- this is a core project pattern.

### Pattern 5: Spec Partitioning into Rebuild Units
**What:** Parse the spec's top-level `## ` sections (matching the 11-section spec structure) and group them into logical rebuild units. Each unit maps to one AI call that generates all files for a module/directory.
**When to use:** When creating the rebuild execution plan from spec content.
**Example:**
```typescript
// The SPEC.md has sections like:
// ## 1. Project Overview
// ## 2. Architecture
// ## 9. Build Plan  <-- This section defines the rebuild order
//
// The Build Plan section already contains phased implementation order.
// Use it to determine module boundaries and ordering.
// Each Build Plan phase becomes a rebuild unit (one AI call per unit).
```

### Pattern 6: Context Accumulation for Subsequent Modules
**What:** As modules are rebuilt, already-generated files provide context for subsequent modules. Include file listings and key interfaces from completed modules in prompts for later modules.
**When to use:** To ensure cross-module consistency (imports, type references, etc.).

### Anti-Patterns to Avoid
- **File-per-AI-call:** Don't generate individual files one at a time. The decision is "one module/directory per AI call" -- the AI generates all files for a module in a single call.
- **Parsing AI output as code:** Don't try to parse TypeScript from AI output. The AI should produce output in a structured format (markdown with fenced code blocks tagged with file paths) that the tool extracts and writes.
- **Ignoring existing patterns:** Don't create a new execution engine. Reuse `runPool`, `AIService.call()`, `ProgressReporter`, `ProgressLog`, `ITraceWriter`.
- **Checkpoint as git:** Don't build a VCS-like system. The checkpoint is a simple JSON file tracking module completion status.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrent task execution | Custom Promise.all chunking | `runPool()` from `src/orchestration/pool.ts` | Shared iterator pattern prevents worker idling, handles failFast/abort |
| AI subprocess management | Direct `child_process.exec` | `AIService.call()` from `src/ai/service.ts` | Handles timeout, SIGTERM/SIGKILL, retry, telemetry, process group killing |
| Progress display + ETA | Custom console.log | `ProgressReporter` from `src/orchestration/progress.ts` | Moving average ETA, ANSI formatting, progress log mirroring |
| File-based progress monitoring | Custom file writer | `ProgressLog` from `src/orchestration/progress.ts` | Promise-chain serialization, tail -f compatible |
| NDJSON trace events | Custom JSON writer | `createTraceWriter()` from `src/orchestration/trace.ts` | Auto seq/ts/pid/elapsedMs, NullTraceWriter for disabled |
| Plan checkbox tracking | Custom markdown updater | `PlanTracker` from `src/orchestration/plan-tracker.ts` | Promise-chain serialized writes |
| SHA-256 hashing | Custom hash function | `computeContentHash()` / `computeContentHashFromString()` from `src/change-detection/` | Already tested, consistent with project |
| Config loading | Direct YAML parse | `loadConfig()` from `src/config/loader.ts` | Zod validation, defaults, debug support |
| Backend resolution | Direct CLI detection | `resolveBackend()` from `src/ai/index.ts` | Registry pattern, auto-detection, install instructions |
| Telemetry logging | Custom log writer | `AIService.finalize()` | Token tracking, run log retention, cost computation |

**Key insight:** The ARE codebase already has a mature orchestration and AI service layer. The rebuild command's unique contribution is: (1) reading specs instead of source files, (2) writing generated code instead of documentation, (3) checkpoint-based resume. Everything else is reuse.

## Common Pitfalls

### Pitfall 1: AI Output Parsing for Multi-File Generation
**What goes wrong:** The AI generates multiple files in a single response. If the output format isn't well-defined, parsing breaks on edge cases (file paths with spaces, code containing the delimiter, etc.).
**Why it happens:** LLMs can be inconsistent with output formatting, especially under complex instructions.
**How to avoid:** Define a clear, unambiguous output format in the system prompt. Use a distinctive delimiter that won't appear in code. Example format:
```
===FILE: src/config/schema.ts===
[file content]
===END_FILE===
```
Or use fenced code blocks with file path annotations:
```
```typescript:src/config/schema.ts
[content]
```
```
**Warning signs:** Files not being created, files with wrong content, partial writes.

### Pitfall 2: Spec Drift Detection False Positives
**What goes wrong:** Checkpoint is invalidated on every whitespace or formatting change to spec files, forcing full re-rebuilds unnecessarily.
**Why it happens:** Using raw file content hash (SHA-256 of exact bytes) means any whitespace change triggers drift.
**How to avoid:** Hash the exact file bytes (same as existing `computeContentHash`). Spec files are generated artifacts -- they don't change with cosmetic edits unless `are specify` is re-run, which produces meaningfully different content. Accept that any spec file change means a fresh rebuild is warranted.
**Warning signs:** Users re-running `are rebuild` after minor edits and losing progress.

### Pitfall 3: Context Window Overflow
**What goes wrong:** Stuffing the entire spec + all previously-generated files into a single prompt exceeds the AI model's context window.
**Why it happens:** Specs can be 90K+ characters. Adding generated context from completed modules compounds this.
**How to avoid:** Be selective about context. For each module rebuild:
- Include the full relevant spec section(s) for that module
- Include only type signatures / interface definitions from completed modules (not full file content)
- Include the project overview and architecture sections as persistent context
- Set an appropriate timeout (at least 300s, the existing default) since reconstruction prompts are large
**Warning signs:** AI responses being truncated, subprocess timeouts, incomplete file generation.

### Pitfall 4: Concurrent File Writes to Same Directory
**What goes wrong:** Two concurrent module rebuilds write to overlapping directories, causing race conditions or file corruption.
**Why it happens:** Module boundaries in the spec may not perfectly align with directory boundaries.
**How to avoid:** Use `mkdir({ recursive: true })` before writes (already the project pattern). If modules can write to the same directory, serialize those modules or ensure file names don't overlap. The most robust approach: each AI call generates files for a single module, and the output paths are pre-computed and non-overlapping.
**Warning signs:** ENOENT errors, empty files, missing directories.

### Pitfall 5: Checkpoint Corruption from Concurrent Writes
**What goes wrong:** Multiple pool workers update the checkpoint file simultaneously, corrupting JSON.
**Why it happens:** Standard pattern if not serialized.
**How to avoid:** Use the project's established promise-chain write serialization pattern (same as `PlanTracker.markDone()`).
**Warning signs:** JSON parse errors on resume, lost progress.

### Pitfall 6: Extended Timeout Not Set
**What goes wrong:** Rebuild tasks timeout at the default 120s/300s because generating entire modules takes longer than summarizing individual files.
**Why it happens:** Reconstruction requires more output tokens than documentation.
**How to avoid:** Follow the `specify` command pattern: `Math.max(config.ai.timeoutMs, 600_000)` for a 10-minute minimum. Consider even longer (900s) since module reconstruction is the most token-intensive operation.
**Warning signs:** Frequent SIGTERM subprocess kills, incomplete module output.

### Pitfall 7: Output Directory Not Isolated
**What goes wrong:** Rebuild writes into the project's own source tree instead of an isolated output directory.
**Why it happens:** Relative path resolution against cwd instead of output directory.
**How to avoid:** All file writes must resolve against the output directory root (e.g., `rebuild/`). Never use `path.resolve()` without explicitly joining with the output directory. The `--output` flag and default `rebuild/` must be used as the base for all generated file paths.
**Warning signs:** Source files overwritten, `.sum` files appearing in unexpected locations.

## Code Examples

Verified patterns from the existing codebase:

### CLI Command Registration (src/cli/index.ts pattern)
```typescript
// Source: src/cli/index.ts lines 222-299
// Add new case to the switch statement:
case 'rebuild': {
  const rebuildOpts: RebuildOptions = {
    output: values.get('output'),
    force: flags.has('force'),
    dryRun: flags.has('dry-run'),
    concurrency: values.has('concurrency')
      ? parseInt(values.get('concurrency')!, 10) : undefined,
    failFast: flags.has('fail-fast'),
    debug: flags.has('debug'),
    trace: flags.has('trace'),
  };
  await rebuildCommand(positional[0] || '.', rebuildOpts);
  break;
}
```

### AIService Creation with Extended Timeout (src/cli/specify.ts pattern)
```typescript
// Source: src/cli/specify.ts lines 174-179
const aiService = new AIService(backend, {
  timeoutMs: Math.max(config.ai.timeoutMs, 900_000), // 15min minimum for rebuild
  maxRetries: config.ai.maxRetries,
  model: config.ai.model,
  telemetry: { keepRuns: config.ai.telemetry.keepRuns },
});
```

### Checkpoint Read/Write with Serialization
```typescript
// Following PlanTracker pattern from src/orchestration/plan-tracker.ts
export class CheckpointManager {
  private data: RebuildCheckpoint;
  private readonly checkpointPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(outputDir: string, initialData: RebuildCheckpoint) {
    this.checkpointPath = path.join(outputDir, '.rebuild-checkpoint');
    this.data = initialData;
  }

  markDone(moduleName: string): void {
    this.data.modules[moduleName] = {
      status: 'done',
      completedAt: new Date().toISOString(),
    };
    this.data.updatedAt = new Date().toISOString();
    this.writeQueue = this.writeQueue
      .then(() => writeFile(this.checkpointPath, JSON.stringify(this.data, null, 2), 'utf-8'))
      .catch(() => { /* non-critical */ });
  }

  markFailed(moduleName: string, error: string): void {
    this.data.modules[moduleName] = {
      status: 'failed',
      error,
    };
    this.data.updatedAt = new Date().toISOString();
    this.writeQueue = this.writeQueue
      .then(() => writeFile(this.checkpointPath, JSON.stringify(this.data, null, 2), 'utf-8'))
      .catch(() => { /* non-critical */ });
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }
}
```

### Spec File Reading
```typescript
// Following collectAgentsDocs pattern from src/generation/collector.ts
export async function readSpecFiles(projectRoot: string): Promise<SpecContent[]> {
  const specsDir = path.join(projectRoot, 'specs');
  const entries = await readdir(specsDir);
  const mdFiles = entries.filter(e => e.endsWith('.md')).sort();

  const results: SpecContent[] = [];
  for (const file of mdFiles) {
    const filePath = path.join(specsDir, file);
    const content = await readFile(filePath, 'utf-8');
    results.push({ relativePath: `specs/${file}`, content });
  }
  return results;
}
```

### Spec Drift Detection
```typescript
// Following computeContentHash pattern from src/change-detection/detector.ts
export async function detectSpecDrift(
  specFiles: SpecContent[],
  checkpoint: RebuildCheckpoint,
): Promise<boolean> {
  for (const spec of specFiles) {
    const currentHash = computeContentHashFromString(spec.content);
    const storedHash = checkpoint.specHashes[spec.relativePath];
    if (currentHash !== storedHash) return true;
  }
  // Also check for added/removed spec files
  const currentPaths = new Set(specFiles.map(s => s.relativePath));
  const storedPaths = new Set(Object.keys(checkpoint.specHashes));
  if (currentPaths.size !== storedPaths.size) return true;
  for (const p of currentPaths) {
    if (!storedPaths.has(p)) return true;
  }
  return false;
}
```

### AI Output Parsing (extracting files from response)
```typescript
// Parse multi-file AI output with clear delimiters
export function parseModuleOutput(responseText: string): Map<string, string> {
  const files = new Map<string, string>();
  // Pattern: ===FILE: relative/path.ts===\ncontent\n===END_FILE===
  const filePattern = /===FILE:\s*(.+?)===\n([\s\S]*?)===END_FILE===/g;
  let match;
  while ((match = filePattern.exec(responseText)) !== null) {
    const filePath = match[1].trim();
    const content = match[2];
    files.set(filePath, content);
  }
  return files;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `specify` generates spec | `rebuild` consumes spec | Phase 11 (new) | Closes the spec -> code loop |
| Manual project reconstruction | AI-driven reconstruction from spec | Phase 11 (new) | Validates spec completeness |
| No session continuity | Checkpoint-based resume | Phase 11 (new) | Enables multi-session execution |

**New patterns introduced by this phase:**
- Checkpoint-based session continuity (new to ARE, but uses existing serialization patterns)
- AI output containing multiple files per call (new output parsing requirement)
- Context accumulation across rebuild modules (new prompt engineering pattern)

## Open Questions

Things that need design decisions during planning:

1. **AI Output Format for Multi-File Generation**
   - What we know: Each AI call generates all files for a module. The response is a single text block.
   - What's unclear: Exact delimiter format for extracting individual files from the response.
   - Recommendation: Use `===FILE: path===` / `===END_FILE===` delimiters in system prompt. These are unlikely to appear in generated code. Alternatively, use markdown fenced blocks with path in the info string. Test both approaches in prompt engineering.

2. **Spec Partitioning Strategy**
   - What we know: The spec has a Build Plan section (section 9) that defines phases. The spec has 11 conceptual sections organized by concern.
   - What's unclear: Should rebuild units follow the Build Plan phases (10 phases, each with tasks) or should they be derived from Architecture module boundaries?
   - Recommendation: Use the Build Plan phases as rebuild units. They already define dependency ordering and module boundaries. Each Build Plan phase becomes one or more AI calls.

3. **Context for Subsequent Modules**
   - What we know: Later modules need to know about types/interfaces from earlier modules to produce correct imports.
   - What's unclear: How much context to include (full files vs. type signatures only) and performance implications.
   - Recommendation: After each module completes, extract exported type signatures and interface definitions from the generated files. Include these as "already built" context in subsequent module prompts. Keep full spec always available.

4. **Build Validation After Rebuild**
   - What we know: Decision says "must compile" but validation mechanism is Claude's discretion.
   - What's unclear: Whether to run `npm install && npm run build` automatically or leave it to the user.
   - Recommendation: Don't run build validation automatically. The rebuild output directory may not have dependencies installed. Instead, log a message suggesting the user run the build. Future phases could add optional `--verify` flag.

5. **Module Concurrency Ordering**
   - What we know: Spec Build Plan has phases with dependencies between them. Concurrent execution is desired.
   - What's unclear: How to enforce dependency ordering while still allowing parallelism within a phase.
   - Recommendation: Follow the `generate` command's depth-level pattern. Process rebuild phases sequentially (phase 1 before phase 2), but within each phase, run modules concurrently through the pool.

## Sources

### Primary (HIGH confidence)
- `src/cli/generate.ts` -- CLI command pattern, option types, execution flow
- `src/cli/specify.ts` -- Extended timeout pattern, single-call AI invocation
- `src/cli/index.ts` -- CLI argument parsing, command routing
- `src/orchestration/pool.ts` -- `runPool()` API, `PoolOptions`, `TaskResult`
- `src/orchestration/runner.ts` -- `CommandRunner` class, `executeGenerate()` and `executeUpdate()` patterns
- `src/orchestration/progress.ts` -- `ProgressReporter`, `ProgressLog` patterns
- `src/orchestration/plan-tracker.ts` -- Promise-chain write serialization pattern
- `src/orchestration/trace.ts` -- `ITraceWriter`, `createTraceWriter()`, trace event types
- `src/orchestration/types.ts` -- `CommandRunOptions`, `RunSummary`, `FileTaskResult`
- `src/ai/service.ts` -- `AIService` class, `call()`, `finalize()`, `AIServiceOptions`
- `src/generation/executor.ts` -- `ExecutionPlan`, `ExecutionTask`, `buildExecutionPlan()`
- `src/generation/collector.ts` -- `collectAgentsDocs()` pattern for recursive file collection
- `src/specify/prompts.ts` -- Spec system prompt structure (defines what rebuild consumes)
- `src/specify/writer.ts` -- Spec output format (multi-file splitting on `# ` headings)
- `src/change-detection/detector.ts` -- `computeContentHash()`, `computeContentHashFromString()`
- `src/config/schema.ts` -- Zod config schema, `Config` type
- `specs/SPEC.md` -- Actual spec output structure (11 sections, Build Plan with 10 phases)

### Secondary (MEDIUM confidence)
- `.planning/phases/11-rebuild-command/11-CONTEXT.md` -- Phase context with implementation decisions

### Tertiary (LOW confidence)
- None -- all findings based on direct codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Entirely reuses existing project dependencies
- Architecture: HIGH - Directly follows established patterns in codebase
- Pitfalls: HIGH - Identified from real patterns in existing code and common AI output parsing challenges
- Checkpoint design: MEDIUM - New pattern for this project, but follows established serialization conventions
- Prompt engineering for reconstruction: MEDIUM - Output format parsing is inherently uncertain with LLMs

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable -- all based on project internals, not external libraries)

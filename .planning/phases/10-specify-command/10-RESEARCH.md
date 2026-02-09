# Phase 10: Specify Command - Research

**Researched:** 2026-02-09
**Domain:** AI-driven specification synthesis from existing AGENTS.md documentation
**Confidence:** HIGH

## Summary

Phase 10 adds an `are specify` command that reads the project's AGENTS.md hierarchy and .sum files, feeds them to an AI, and produces specification document(s) detailed enough to reconstruct the project from scratch. The command is structurally similar to the existing root document generation (Phase 3 of `executeGenerate`), but produces much richer, longer output and requires careful prompt engineering to ensure completeness.

The codebase already contains every building block needed: file collection (`collectAgentsMdFiles` pattern in `builder.ts`), .sum file reading (`readSumFile` in `writers/sum.ts`), AI service orchestration (`AIService.call()`), CLI argument parsing (`cli/index.ts`), config loading, backend resolution, progress reporting, telemetry, and dry-run display. The primary new work is: (1) a new CLI command handler, (2) a spec-specific prompt builder that collects all AGENTS.md + .sum content, (3) spec-specific system/user prompt templates, (4) output writing logic for single-file and multi-file modes, and (5) overwrite protection with `--force`.

**Primary recommendation:** Use single-pass AI synthesis by default (all AGENTS.md + .sum content injected into one prompt). For very large projects exceeding context window limits, implement a two-pass fallback: first pass generates per-module section drafts, second pass synthesizes into a coherent spec. The existing `buildRootPrompt` pattern in `src/generation/prompts/builder.ts` provides the exact collection and injection pattern to follow.

## Standard Stack

### Core

No new external libraries are needed. The specify command reuses the project's existing stack entirely.

| Library | Version | Purpose | Why Reuse |
|---------|---------|---------|-----------|
| picocolors | ^1.1.1 | Terminal colored output | Already used by all CLI commands |
| zod | ^3.24.1 | Config schema validation | Already used; extend if spec config needed |
| yaml | ^2.7.0 | Config file parsing | Already used by config loader |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `fs/promises` | built-in | File I/O for reading AGENTS.md/.sum and writing specs | All file operations |
| Node.js `path` | built-in | Path manipulation | All path operations |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single-pass synthesis | Multi-pass chunked approach (Map-Reduce) | Multi-pass adds complexity and cost; single-pass is viable for projects up to ~200 source files with Claude's 200K context. Only needed as fallback for very large projects. |
| Custom token counting for dry-run | gpt-tokenizer | Not in current deps (was removed). Character-based estimation (1 token ~= 4 chars) is sufficient for dry-run cost preview. |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Module Structure

```
src/
├── cli/
│   └── specify.ts           # CLI command handler (new)
├── specify/
│   ├── collector.ts          # Collects AGENTS.md + .sum content (new)
│   ├── prompts.ts            # System/user prompt templates for spec gen (new)
│   ├── writer.ts             # Writes spec output (single or multi-file) (new)
│   └── index.ts              # Barrel export (new)
```

This follows the existing separation pattern where:
- `cli/*.ts` files are thin command handlers that wire together config, AI service, and domain logic
- Domain logic lives in its own module (`generation/`, `quality/`, `update/`, etc.)
- Prompts live close to their domain module

### Pattern 1: Command Handler Pattern (follow `generate.ts`)

**What:** The `specifyCommand()` function in `cli/specify.ts` follows the exact structure of `generateCommand()`: load config, resolve backend, create AIService, build prompt, call AI, write output, finalize telemetry.

**When to use:** This is the only pattern for adding new CLI commands.

**Example:**
```typescript
// Source: src/cli/generate.ts (existing pattern)
export async function specifyCommand(
  targetPath: string,
  options: SpecifyOptions,
): Promise<void> {
  const absolutePath = path.resolve(targetPath);
  const config = await loadConfig(absolutePath);

  // Collect all AGENTS.md + .sum content
  const specInput = await collectSpecInput(absolutePath);

  if (options.dryRun) {
    printDryRun(specInput);
    return;
  }

  // Resolve backend, create AI service
  const registry = createBackendRegistry();
  const backend = await resolveBackend(registry, config.ai.backend);
  const aiService = new AIService(backend, { ... });

  // Build prompt and call AI
  const prompt = buildSpecPrompt(specInput, options);
  const response = await aiService.call({
    prompt: prompt.user,
    systemPrompt: prompt.system,
    taskLabel: 'specify',
  });

  // Write spec output
  await writeSpec(response.text, options);

  // Finalize telemetry
  await aiService.finalize(absolutePath);
}
```

### Pattern 2: Content Collection Pattern (follow `buildRootPrompt`)

**What:** The `collectAgentsMdFiles()` function in `builder.ts` recursively walks the project, reads AGENTS.md files, and builds prompt sections. The specify command extends this by also reading .sum files.

**When to use:** When gathering all documentation content for synthesis.

**Example:**
```typescript
// Source: src/generation/prompts/builder.ts (existing pattern)
async function collectAgentsMdFiles(dir: string): Promise<string[]> {
  const SKIP_DIRS = new Set([
    'node_modules', '.git', '.agents-reverse-engineer', ...
  ]);
  // Recursive walk, collect paths, sort
}

// Specify command extends this:
async function collectSpecInput(projectRoot: string): Promise<SpecInput> {
  const agentsFiles = await collectAgentsMdFiles(projectRoot);
  const sumFiles = await collectSumFiles(projectRoot);
  // Read all, compute total size
  return { agentsSections, sumSections, totalChars, fileCount };
}
```

### Pattern 3: Output Writing with Overwrite Protection

**What:** Check for existing output files before writing. Warn and exit unless `--force` is passed. Similar to how `writeAgentsMd` checks for existing user-authored files.

**When to use:** Writing spec output files.

**Example:**
```typescript
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

async function writeSpec(
  content: string,
  outputPath: string,
  force: boolean,
): Promise<void> {
  try {
    await access(outputPath, constants.F_OK);
    if (!force) {
      console.error(`Spec already exists: ${outputPath}`);
      console.error('Use --force to overwrite.');
      process.exit(1);
    }
  } catch {
    // File doesn't exist, safe to write
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, 'utf-8');
}
```

### Anti-Patterns to Avoid

- **Replicating the three-phase pipeline:** The specify command does NOT need Phase 1/2/3 orchestration. It reads already-generated docs and makes a single (or few) AI call(s). Do not create an ExecutionPlan or use the concurrency pool for spec generation.
- **Running generate inline:** The context says "auto-generates AGENTS.md if missing." This should call the existing `generateCommand()` function directly, not re-implement generation logic. However, check for AGENTS.md existence first and only call generate if truly needed.
- **Streaming to stdout:** Specs are written to files. Do not stream AI output to stdout; capture the full response and write it atomically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AGENTS.md file collection | Custom recursive walker | Reuse `collectAgentsMdFiles()` from `builder.ts` (or extract and share) | Already handles skip dirs, sorting, error handling |
| .sum file parsing | Custom YAML parser | `readSumFile()` from `writers/sum.ts` | Handles frontmatter, optional fields, graceful error handling |
| AI service orchestration | Direct subprocess calls | `AIService.call()` from `ai/service.ts` | Retry, timeout, telemetry, backend abstraction |
| Backend resolution | Hardcoded CLI detection | `resolveBackend()` + `createBackendRegistry()` | Multi-backend support, install instructions |
| Config loading | Manual YAML read | `loadConfig()` from `config/loader.ts` | Validation, defaults, debug/trace support |
| Dry-run display | Custom formatting | Follow `generateCommand` dry-run pattern | Consistent UX across commands |
| Token estimation | gpt-tokenizer or external lib | Character-based heuristic (chars / 4) | Sufficient accuracy for cost preview, no new dep |

**Key insight:** This phase is 80% integration of existing modules and 20% new prompt engineering. The codebase already has all the infrastructure; the specify command just wires it differently.

## Common Pitfalls

### Pitfall 1: Context Window Overflow

**What goes wrong:** Injecting all AGENTS.md + .sum content into a single prompt exceeds the model's context window, causing truncated or degraded output.
**Why it happens:** A project with 100+ source files generates substantial .sum content. Each .sum is ~500-2000 chars; 100 files = 50K-200K chars = ~12K-50K tokens of .sum alone. AGENTS.md files add more on top.
**How to avoid:** (1) Estimate total input size before calling AI. (2) For projects where total docs exceed ~150K tokens, switch to multi-pass: generate per-concern sections (architecture, APIs, data flow, config) in separate calls, then synthesize. (3) The dry-run should show estimated input size and warn if it's near the limit.
**Warning signs:** AI response that abruptly stops, loses coherence in later sections, or drops sections entirely.

### Pitfall 2: Spec Mirrors Folder Structure Instead of Concepts

**What goes wrong:** The AI produces a spec that's organized as "src/ai/ does X, src/cli/ does Y" instead of conceptual grouping (architecture, data flow, APIs, config).
**Why it happens:** The input is folder-organized AGENTS.md content, so the AI naturally mirrors that structure.
**How to avoid:** The system prompt must explicitly instruct conceptual grouping and prohibit folder-mirroring. Provide the desired section structure in the prompt. Include examples of conceptual organization.
**Warning signs:** Spec sections named after directory paths.

### Pitfall 3: Spec Prescribes File Paths

**What goes wrong:** The spec includes exact filenames and paths, constraining the rebuilder's freedom on file organization.
**Why it happens:** AGENTS.md content is full of exact paths; the AI reproduces them.
**How to avoid:** The system prompt must instruct the AI to describe module boundaries and interfaces, not exact file paths. "A module that handles X and exports Y" not "src/foo/bar.ts exports Y."
**Warning signs:** Spec contains paths like `src/`, `./`, or filename extensions.

### Pitfall 4: Missing Build Order

**What goes wrong:** The spec is a flat description with no guidance on what to build first.
**Why it happens:** AGENTS.md doesn't contain build order information; it's a documentation artifact, not a construction guide.
**How to avoid:** The system prompt must explicitly request a phased build plan section. Instruct the AI to analyze dependencies between modules and produce a recommended implementation sequence.
**Warning signs:** Spec has no "Build Plan" or "Implementation Sequence" section.

### Pitfall 5: Overwriting Existing Specs Without Warning

**What goes wrong:** User runs `are specify` twice and loses their edited spec.
**Why it happens:** No overwrite check.
**How to avoid:** Check for existing files. If found, print warning and require `--force`. This is a user decision per the CONTEXT.md.
**Warning signs:** User complaints about lost work.

### Pitfall 6: Auto-Generate Hangs or Fails Silently

**What goes wrong:** When AGENTS.md doesn't exist and auto-generate is triggered, the generate command may fail (no AI CLI installed, rate limits, etc.) and the specify command hangs or crashes.
**Why it happens:** Auto-generate delegates to the full generate pipeline which has many failure modes.
**How to avoid:** Check AGENTS.md existence first. If auto-generate is needed, run it as a clearly visible prerequisite step. Catch failures and report them with clear guidance. Consider making auto-generate opt-in rather than automatic if it adds too much complexity.
**Warning signs:** Specify command appears to hang with no output.

## Code Examples

### Collecting All Documentation Content

```typescript
// Reuses the existing pattern from src/generation/prompts/builder.ts
// Extended to also collect .sum files

import { readFile, readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { readSumFile } from '../generation/writers/sum.js';

interface SpecInput {
  agentsSections: Array<{ relativePath: string; content: string }>;
  sumSections: Array<{ relativePath: string; purpose: string; summary: string }>;
  packageJson?: Record<string, unknown>;
  totalChars: number;
  fileCount: number;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.agents-reverse-engineer',
  'vendor', 'dist', 'build', '__pycache__', '.next',
  'venv', '.venv', 'target', '.cargo', '.gradle',
]);

async function collectSpecInput(projectRoot: string): Promise<SpecInput> {
  const agentsSections: SpecInput['agentsSections'] = [];
  const sumSections: SpecInput['sumSections'] = [];
  let totalChars = 0;

  async function walk(dir: string): Promise<void> {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        await walk(fullPath);
      } else if (entry.name === 'AGENTS.md') {
        try {
          const content = await readFile(fullPath, 'utf-8');
          const rel = path.relative(projectRoot, fullPath);
          agentsSections.push({ relativePath: rel, content });
          totalChars += content.length;
        } catch { /* skip unreadable */ }
      } else if (entry.name.endsWith('.sum')) {
        try {
          const sumContent = await readSumFile(fullPath);
          if (sumContent) {
            const rel = path.relative(projectRoot, fullPath);
            sumSections.push({
              relativePath: rel,
              purpose: sumContent.metadata.purpose,
              summary: sumContent.summary,
            });
            totalChars += sumContent.summary.length;
          }
        } catch { /* skip */ }
      }
    }
  }

  await walk(projectRoot);

  // Optional: read package.json
  let packageJson: Record<string, unknown> | undefined;
  try {
    const raw = await readFile(path.join(projectRoot, 'package.json'), 'utf-8');
    packageJson = JSON.parse(raw);
  } catch { /* no package.json */ }

  return {
    agentsSections,
    sumSections,
    packageJson,
    totalChars,
    fileCount: agentsSections.length + sumSections.length,
  };
}
```

### CLI Command Registration

```typescript
// In src/cli/index.ts, add to the switch statement:
case 'specify': {
  const options: SpecifyOptions = {
    output: values.get('output'),
    force: flags.has('force'),
    dryRun: flags.has('dry-run'),
    multiFile: flags.has('multi-file'),
    debug: flags.has('debug'),
    trace: flags.has('trace'),
  };
  await specifyCommand(positional[0] || '.', options);
  break;
}
```

### System Prompt Structure for Spec Generation

```typescript
const SPEC_SYSTEM_PROMPT = `You produce software specifications from documentation.

TASK:
Generate a comprehensive specification document from the provided AGENTS.md and .sum file content. The specification must contain enough detail for an AI agent to reconstruct the entire project from scratch.

AUDIENCE: AI agents (LLMs) — use structured, precise, instruction-oriented language.

ORGANIZATION (MANDATORY):
Group content by CONCERN, not by directory structure. Use these conceptual sections:
1. Project Overview — purpose, core value, problem solved
2. Architecture — system design, module boundaries, data flow, key patterns
3. API Surface — all public interfaces, function signatures, types, error contracts
4. Data Structures — key types, schemas, state management
5. Configuration — all config options with types, defaults, validation rules
6. Dependencies — each dependency with version and rationale
7. Behavioral Contracts — error handling, retry logic, concurrency, lifecycle
8. Test Contracts — what each module's tests should verify
9. Build Plan — phased implementation sequence for incremental construction

RULES:
- Describe MODULE BOUNDARIES, not file paths
- Use exact function/type/const names from the documentation
- Include full type signatures for all public APIs
- Do NOT prescribe exact filenames — describe what each module does and exports
- Do NOT mirror the folder structure in section organization
- Include version numbers for all dependencies
- Phased build plan must list implementation order with dependencies

OUTPUT: Raw markdown. No preamble. No meta-commentary.`;
```

### Dry-Run Display

```typescript
// Follow existing pattern from cli/generate.ts
function printDryRun(input: SpecInput, outputPath: string): void {
  const estimatedTokens = Math.ceil(input.totalChars / 4);

  console.log(pc.bold('\n--- Dry Run Summary ---\n'));
  console.log(`  AGENTS.md files:   ${pc.cyan(String(input.agentsSections.length))}`);
  console.log(`  .sum files:        ${pc.cyan(String(input.sumSections.length))}`);
  console.log(`  Total input:       ${pc.cyan(`~${(estimatedTokens / 1000).toFixed(0)}K tokens`)}`);
  console.log(`  Output:            ${pc.cyan(outputPath)}`);
  console.log(`  Estimated calls:   ${pc.cyan('1')}`);
  console.log('');

  if (estimatedTokens > 150_000) {
    console.log(pc.yellow(
      `  Warning: Input exceeds 150K tokens. Consider using a model with extended context.`
    ));
  }

  console.log(pc.dim('No AI calls made (dry run).'));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| RAG-based document synthesis | Full-context single-pass synthesis | 2025-2026 | With 200K+ context windows, retrieval-based approaches are unnecessary for codebase-sized documentation. Single-pass produces more coherent output. |
| Fixed-template specs | AI-adaptive conceptual grouping | 2025 | Rather than prescribing exact sections, let the AI choose section depth and organization based on project complexity. Provide a template as guidance, not constraint. |
| Human-targeted specs | AI-agent-targeted specs | 2025-2026 | Specifications written for AI consumption should be more structured, include type signatures, and use instruction-oriented language rather than narrative prose. |

**Deprecated/outdated:**
- Map-reduce document synthesis: Unnecessary for projects that fit in a single context window. Only needed as a fallback for exceptionally large codebases (>200 source files with heavy documentation).

## Open Questions

1. **Multi-file split strategy**
   - What we know: Multi-file output is available via a flag. The AI has discretion on how to split.
   - What's unclear: Should the AI decide the split, or should the tool split based on section headers in the AI's response? AI-decided splitting requires multiple AI calls or post-processing. Tool-based splitting (split on `# ` headings) is simpler and predictable.
   - Recommendation: Tool-based splitting after single-pass generation. The AI produces one document; if `--multi-file` is set, the tool splits on top-level `# ` headings into separate files. Simpler, cheaper, and deterministic.

2. **Auto-generate complexity**
   - What we know: Context says auto-generate AGENTS.md if missing. This requires running the full generate pipeline.
   - What's unclear: Does auto-generate import and call `generateCommand()` directly, or does it spawn a subprocess? How to handle the case where no AI CLI is installed (generate would fail)?
   - Recommendation: Import `generateCommand()` and call it directly. If it fails, surface the error with guidance ("Run `are generate` first"). This avoids the complexity of subprocess spawning and keeps the dependency explicit.

3. **Timeout for spec generation**
   - What we know: Current default timeout is 300s (5 minutes). Spec generation is a single, potentially very large AI call that may need more time.
   - What's unclear: Is 300s sufficient for spec generation? The AI needs to produce a much longer document than file summaries.
   - Recommendation: Use a longer default timeout for specify (e.g., 600s). Make it configurable via the existing `ai.timeoutMs` config or a `--timeout` flag.

4. **Cost awareness for large projects**
   - What we know: Single-pass synthesis of all AGENTS.md + .sum content could consume significant tokens (100K+ input, 10K-50K output).
   - What's unclear: Should there be a cost threshold warning specific to the specify command?
   - Recommendation: The dry-run output already shows estimated tokens. Add a warning at >150K estimated input tokens suggesting the user verify they're comfortable with the cost.

## Sources

### Primary (HIGH confidence)

- `src/cli/generate.ts` -- existing command handler pattern (lines 1-234)
- `src/cli/index.ts` -- CLI routing and argument parsing (lines 1-303)
- `src/generation/prompts/builder.ts` -- `buildRootPrompt()` and `collectAgentsMdFiles()` pattern (lines 230-349)
- `src/generation/prompts/templates.ts` -- existing prompt templates (lines 1-144)
- `src/generation/writers/sum.ts` -- `readSumFile()` and .sum format (lines 1-186)
- `src/generation/writers/agents-md.ts` -- AGENTS.md writing pattern (lines 1-88)
- `src/ai/service.ts` -- `AIService.call()` API (lines 1-456)
- `src/ai/types.ts` -- `AICallOptions`, `AIResponse` contracts (lines 1-279)
- `src/orchestration/runner.ts` -- three-phase pipeline reference (lines 1-984)
- `src/orchestration/progress.ts` -- progress reporting pattern (lines 1-318)
- `src/config/schema.ts` -- config schema and types (lines 1-124)
- `src/config/loader.ts` -- config loading and `CONFIG_DIR` constant (lines 1-272)

### Secondary (MEDIUM confidence)

- [Context Windows - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/context-windows) -- 200K standard context window, pricing tiers
- [Claude Opus 4.6 1M Context Window Guide](https://attractgroup.com/blog/how-to-switch-to-claude-opus-4-6-with-1-million-token-context-window-complete-guide-2026/) -- 1M extended context availability
- [Spec-Driven AI Development - Red Hat](https://developers.redhat.com/articles/2025/10/22/how-spec-driven-development-improves-ai-coding-quality) -- layered spec structure (functional, architectural, language-specific, testing)
- [The Specification Renaissance - Scott Logic](https://blog.scottlogic.com/2025/12/15/the-specification-renaissance-skills-and-mindset-for-spec-driven-development.html) -- spec sections (functional reqs, non-functional reqs, context/constraints)

### Tertiary (LOW confidence)

- [Best LLMs for Extended Context Windows in 2026](https://aimultiple.com/ai-context-window) -- practical context limitations (models unreliable past ~65% of advertised limit)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new libraries needed; entire stack is reuse of existing codebase
- Architecture: HIGH -- Follows established patterns from existing commands (generate, update, clean)
- Pitfalls: MEDIUM -- Context window overflow risk is well-understood, but exact thresholds for "too large" are project-dependent
- Prompt engineering: MEDIUM -- Spec generation prompts are novel for this codebase; the conceptual grouping and anti-file-mirroring instructions need empirical tuning

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable domain -- patterns won't change quickly)

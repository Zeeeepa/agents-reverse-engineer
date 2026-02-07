# Phase 9: Quality Improvements - Research

**Researched:** 2026-02-07
**Domain:** LLM-driven documentation quality: inconsistency detection, information density, hierarchical deduplication
**Confidence:** MEDIUM (internal codebase analysis is HIGH; external technique applicability is MEDIUM)

## Summary

This phase adds two distinct capability domains to the tool: (A) inconsistency detection between generated documentation and actual code, and (B) higher information density in generated summaries. Both domains touch the existing generation pipeline extensively but in different locations.

The inconsistency detection requirements (INCON-01/02/03) require new analysis passes that compare existing `.sum` file content against current source code semantics and cross-reference patterns across files. The density requirements (DENSE-01/02/03/04) require revising the existing prompt templates, modifying the AGENTS.md builder to avoid repeating child summary content, and adding a validation mechanism for output quality.

**Primary recommendation:** Implement inconsistency detection as a separate analysis phase that runs during `update` (and optionally `generate`), reading existing `.sum` files and current source to flag discrepancies. Implement density improvements as prompt engineering changes plus structural modifications to the AGENTS.md builder, with a simple "file findability" test to validate DENSE-04.

## Standard Stack

### Core

No new external libraries are needed. All features build on the existing stack.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (existing) gpt-tokenizer | ^3.4.0 | Token counting for density metrics | Already in project |
| (existing) zod | ^3.24.1 | Schema validation for inconsistency report types | Already in project |
| (existing) simple-git | ^3.27.0 | Detect changed files for targeted checks | Already in project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (existing) picocolors | ^1.1.1 | Colorized inconsistency report output | CLI report formatting |
| (existing) yaml | ^2.7.0 | Parse .sum frontmatter for comparison | Already used via sum.ts |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| LLM-based inconsistency detection | AST-based static analysis (ts-morph) | AST parsing would be more precise for code-vs-doc but adds a new dependency and only works for TypeScript; LLM-based approach works across all languages the tool supports |
| Custom density metrics | External NLP tools (spaCy, NLTK) | Would add Python dependency; token-level density ratios with gpt-tokenizer are sufficient |
| Structured JSON report | Markdown report | JSON is machine-readable for downstream tools; markdown is human-readable; recommend both formats |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── quality/                    # NEW: quality analysis module
│   ├── types.ts               # Inconsistency types, density metric types
│   ├── inconsistency/
│   │   ├── code-vs-doc.ts     # INCON-01: compare .sum content with source
│   │   ├── code-vs-code.ts    # INCON-02: cross-file pattern conflicts
│   │   └── reporter.ts        # INCON-03: structured report output
│   ├── density/
│   │   ├── metrics.ts         # DENSE-01/02: density measurement
│   │   ├── dedup.ts           # DENSE-03: hierarchical dedup logic
│   │   └── validator.ts       # DENSE-04: "can AI find file?" test
│   └── index.ts               # Barrel exports
├── generation/
│   ├── prompts/
│   │   └── templates.ts       # MODIFIED: revised prompts for density
│   └── writers/
│       └── agents-md.ts       # MODIFIED: hierarchical dedup in output
└── cli/
    ├── generate.ts            # MODIFIED: hook quality checks
    └── update.ts              # MODIFIED: hook quality checks
```

### Pattern 1: Inconsistency Detection as Post-Analysis Pass

**What:** Inconsistency detection runs AFTER file analysis completes, comparing existing `.sum` files against current source code. This is a read-only analysis pass that produces a report without modifying any files.

**When to use:** During `update` command (always) and `generate` command (when existing .sum files are present).

**Why this pattern:** The existing pipeline already reads source files and writes .sum files. Inconsistency detection needs both the old .sum content and the new source content. Running it as a post-pass means it has access to both without disrupting the existing pipeline flow.

**Example:**
```typescript
// Source: internal design based on existing pipeline analysis
interface InconsistencyCheck {
  /** Run after file analysis phase */
  phase: 'post-analysis';
  /** Reads existing .sum files before they're overwritten */
  inputs: { sumFiles: SumFileContent[]; sourceFiles: SourceFileContent[] };
  /** Produces report without side effects */
  output: InconsistencyReport;
}
```

### Pattern 2: Prompt-Driven Density via Chain of Density Adaptation

**What:** Adapt the Chain of Density (CoD) prompting technique for code documentation. Instead of 5 iterative passes (too expensive), use a single-pass "density-aware" prompt that instructs the LLM to: (1) preserve all anchor terms (function names, class names, exports), (2) eliminate filler phrases, (3) maximize information per token.

**When to use:** For all .sum file generation prompts (DENSE-01, DENSE-02).

**Why single-pass adaptation:** The original CoD technique uses 5 iterative LLM calls per document. For a codebase with hundreds of files, this would 5x the API cost. Instead, incorporate CoD principles directly into the system prompt as constraints. Research shows steps 3-4 of CoD produce optimal density, so encode those density characteristics as explicit prompt instructions.

**Example:**
```typescript
// Source: adapted from Chain of Density research (arxiv.org/abs/2309.04269)
const DENSITY_SYSTEM_PROMPT = `You are analyzing source code to generate documentation for AI coding assistants.

DENSITY RULES:
- Every sentence must contain at least one specific identifier (function name, class name, type name, or constant)
- Never use filler phrases: "this file", "this module", "basically", "essentially", "provides functionality for"
- Lead with the most important exports and their signatures
- Use technical shorthand: "exports X, Y, Z" not "this module exports a function called X, another function called Y, and a third function called Z"
- Compress descriptions: "parses YAML frontmatter from .sum files" not "responsible for the parsing of YAML-style frontmatter that is contained within .sum files"

ANCHOR TERM PRESERVATION:
- All exported function/class/type names MUST appear in the summary
- Key parameter types and return types MUST be mentioned
- Preserve the exact casing of identifiers (e.g., buildAgentsMd, not "build agents md")`;
```

### Pattern 3: Hierarchical Deduplication in AGENTS.md Builder

**What:** When building AGENTS.md for a parent directory, compare the content being generated against child AGENTS.md files. Remove any information from the parent that is already present (verbatim or semantically equivalent) in child summaries. The parent adds ONLY: cross-cutting concerns, directory-level patterns, and navigation.

**When to use:** During AGENTS.md generation (Phase 2 of the execution pipeline) -- specifically in `buildDirectoryDoc()` and `buildAgentsMd()` in `agents-md.ts`.

**Why:** The current implementation in `buildAgentsMd()` already creates per-file descriptions from .sum metadata. The problem is it duplicates purpose descriptions that child .sum files already contain. Parents should provide unique value: how files relate, what patterns govern the directory, and navigation to children.

### Anti-Patterns to Avoid

- **Inline inconsistency checks during generation:** Don't check for inconsistencies while generating .sum files. This couples detection to generation and makes the pipeline harder to reason about. Keep detection as a separate pass.
- **Modifying .sum files to fix inconsistencies:** The tool should FLAG inconsistencies, not auto-fix them. Auto-fixing changes the meaning of documentation without user consent.
- **Over-compressing summaries:** Density should not sacrifice understandability. A summary that only an expert could parse defeats the purpose of documentation for AI agents. Target: any AI coding assistant should be able to determine what file to look at from the summary.
- **Parent AGENTS.md that is just a table of contents:** Deduplication should not strip parents to bare navigation. Parents must add cross-cutting value (patterns, conventions, how files work together).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Semantic similarity between .sum and code | Custom NLP embedding pipeline | LLM-based comparison via existing AI service | The tool already has an AI service; adding embedding infrastructure is over-engineering |
| YAML frontmatter parsing in .sum files | New YAML parser | Existing `parseSumFile()` in `writers/sum.ts` | Already handles inline and multi-line YAML arrays |
| Token-level density measurement | Custom tokenizer | Existing `countTokens()` from `generation/budget/counter.ts` | Already wraps gpt-tokenizer |
| Report formatting | Custom report builder | Structured types + simple formatter | Zod types for validation, then a straightforward `formatReport()` function |

**Key insight:** This phase is about prompting, comparison logic, and output formatting. The heavy lifting (LLM calls, file I/O, .sum parsing) already exists. The new code is predominantly orchestration logic connecting existing capabilities.

## Common Pitfalls

### Pitfall 1: Stale .sum Comparison During generate

**What goes wrong:** During a full `generate` run, ALL .sum files are regenerated. If inconsistency detection runs after .sum files are overwritten, it compares NEW .sum content against current code -- which will always be consistent (the LLM just generated them from the same source).

**Why it happens:** The existing runner writes .sum files immediately after each AI call completes.

**How to avoid:** For `generate`, capture the OLD .sum content BEFORE overwriting. Store it in memory during the file analysis phase. For `update`, old .sum files for unchanged files are still on disk and can be read directly.

**Warning signs:** Inconsistency detection always reports zero issues on `generate` runs.

### Pitfall 2: Cross-File Inconsistency False Positives

**What goes wrong:** INCON-02 (code-vs-code) flags "conflicting patterns" that are actually intentional architectural choices (e.g., different error handling in API layer vs. service layer).

**Why it happens:** Different parts of a codebase legitimately use different patterns for different concerns.

**How to avoid:** Scope cross-file checks to within the same directory level or module boundary. Do not compare patterns across architectural layers unless they share the same concern (e.g., two files both claiming to be the "main entry point").

**Warning signs:** More than 30% of files flagged as having cross-file inconsistencies.

### Pitfall 3: Density Prompts Losing Readability

**What goes wrong:** Overly aggressive density instructions cause the LLM to produce terse, jargon-heavy summaries that are hard to parse even for AI agents.

**Why it happens:** The LLM follows density instructions too literally, compressing natural language into near-unreadable shorthand.

**How to avoid:** Include a readability constraint in the prompt: "The summary must be understandable to an AI coding assistant that has never seen this codebase before." Test with the DENSE-04 "can an AI find the right file?" validation.

**Warning signs:** DENSE-04 test scores decrease after density prompt changes.

### Pitfall 4: Hierarchical Dedup Removing Too Much From Parents

**What goes wrong:** After deduplication, parent AGENTS.md files become empty navigation shells with no descriptive value.

**Why it happens:** Every piece of information in the parent was also in at least one child, so dedup removes everything.

**How to avoid:** Parents must ALWAYS contain: (1) a directory purpose statement synthesized from children, (2) how the children relate to each other, (3) patterns/conventions that apply across children. These are inherently parent-level information that children don't contain.

**Warning signs:** Parent AGENTS.md has fewer than 3 lines of descriptive text after dedup.

### Pitfall 5: Running AI-Based Inconsistency Detection on Every File

**What goes wrong:** Making an AI call per file to check for inconsistencies is prohibitively expensive and slow.

**Why it happens:** Treating inconsistency detection like file analysis (one AI call per file).

**How to avoid:** Use heuristic pre-filtering first. Only escalate to AI-based checking for files where heuristics detect a potential mismatch (e.g., .sum mentions a function that no longer exists in the source, or source exports changed significantly). Heuristic checks: compare exported symbol names in source vs. names mentioned in .sum text.

**Warning signs:** Inconsistency detection takes as long as the original generation.

## Code Examples

### Example 1: Code-vs-Doc Inconsistency Detection (INCON-01)

```typescript
// Heuristic-based pre-filter: compare exported symbols against .sum content
interface CodeDocInconsistency {
  type: 'code-vs-doc';
  severity: 'warning' | 'error';
  filePath: string;
  sumPath: string;
  description: string;
  details: {
    /** Symbols exported in source but not mentioned in .sum */
    missingFromDoc: string[];
    /** Symbols mentioned in .sum but not found in source */
    missingFromCode: string[];
    /** Purpose statement that contradicts observable behavior */
    purposeMismatch?: string;
  };
}

// Extract exported symbols from TypeScript/JavaScript source
function extractExports(sourceContent: string): string[] {
  const exports: string[] = [];
  const exportRegex = /export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/g;
  let match;
  while ((match = exportRegex.exec(sourceContent)) !== null) {
    exports.push(match[1]);
  }
  return exports;
}

// Compare source exports against .sum mentions
function checkCodeVsDoc(
  sourceContent: string,
  sumContent: SumFileContent,
  filePath: string,
): CodeDocInconsistency | null {
  const exports = extractExports(sourceContent);
  const sumText = sumContent.summary + ' ' + sumContent.metadata.publicInterface.join(' ');

  const missingFromDoc = exports.filter(e => !sumText.includes(e));
  const missingFromCode = sumContent.metadata.publicInterface
    .filter(iface => !exports.some(e => iface.includes(e)));

  if (missingFromDoc.length > 0 || missingFromCode.length > 0) {
    return {
      type: 'code-vs-doc',
      severity: missingFromCode.length > 0 ? 'error' : 'warning',
      filePath,
      sumPath: `${filePath}.sum`,
      description: `Documentation out of sync: ${missingFromDoc.length} exports undocumented, ${missingFromCode.length} documented items not found in code`,
      details: { missingFromDoc, missingFromCode },
    };
  }
  return null;
}
```

### Example 2: Code-vs-Code Inconsistency Detection (INCON-02)

```typescript
// Cross-file pattern inconsistency check
interface CodeCodeInconsistency {
  type: 'code-vs-code';
  severity: 'info' | 'warning';
  files: string[];
  description: string;
  pattern: string;
}

// Detect duplicated logic or conflicting patterns across files in same directory
function checkCodeVsCode(
  files: Array<{ path: string; content: string; sumContent: SumFileContent }>,
): CodeCodeInconsistency[] {
  const inconsistencies: CodeCodeInconsistency[] = [];

  // Check for duplicate exports (same function name exported from multiple files)
  const exportsByName = new Map<string, string[]>();
  for (const file of files) {
    const exports = extractExports(file.content);
    for (const exp of exports) {
      const existing = exportsByName.get(exp) ?? [];
      existing.push(file.path);
      exportsByName.set(exp, existing);
    }
  }

  for (const [name, filePaths] of exportsByName) {
    if (filePaths.length > 1) {
      inconsistencies.push({
        type: 'code-vs-code',
        severity: 'warning',
        files: filePaths,
        description: `Symbol "${name}" exported from ${filePaths.length} files`,
        pattern: 'duplicate-export',
      });
    }
  }

  return inconsistencies;
}
```

### Example 3: Inconsistency Report (INCON-03)

```typescript
// Structured report format
interface InconsistencyReport {
  /** Run metadata */
  metadata: {
    timestamp: string;
    projectRoot: string;
    filesChecked: number;
    durationMs: number;
  };
  /** All detected inconsistencies */
  issues: Array<CodeDocInconsistency | CodeCodeInconsistency>;
  /** Summary counts */
  summary: {
    total: number;
    codeVsDoc: number;
    codeVsCode: number;
    errors: number;
    warnings: number;
    info: number;
  };
}

// Report output (both JSON and CLI-formatted)
function formatReportForCli(report: InconsistencyReport): string {
  const lines: string[] = [];
  lines.push(`\n=== Inconsistency Report ===`);
  lines.push(`Checked ${report.metadata.filesChecked} files in ${report.metadata.durationMs}ms`);
  lines.push(`Found ${report.summary.total} issue(s)\n`);

  for (const issue of report.issues) {
    const icon = issue.severity === 'error' ? 'ERROR' :
                 issue.severity === 'warning' ? 'WARN' : 'INFO';
    lines.push(`[${icon}] ${issue.description}`);
    if (issue.type === 'code-vs-doc') {
      lines.push(`  File: ${issue.filePath}`);
    } else {
      lines.push(`  Files: ${issue.files.join(', ')}`);
    }
  }

  return lines.join('\n');
}
```

### Example 4: Revised Density-Aware Prompt (DENSE-01/02)

```typescript
// Revised BASE_SYSTEM_PROMPT for higher density
const DENSE_BASE_SYSTEM_PROMPT = `You are analyzing source code to generate documentation for AI coding assistants.

OUTPUT FORMAT:
- Lead with a single-line purpose statement (what this file IS, not what it does)
- List all public exports with their type signatures in a code block
- For each export: one sentence explaining its role
- End with dependencies and coupled files

DENSITY RULES (MANDATORY):
- Every sentence must reference at least one specific identifier from the code
- Never use: "this file", "this module", "provides", "responsible for", "is used to"
- Use the pattern: "[ExportName] does X" not "The ExportName function is responsible for doing X"
- Compress: "parseConfig(path: string): Config" not "A function called parseConfig that takes a string path parameter and returns a Config object"
- All exported identifiers MUST appear in the summary exactly as written in source (preserve casing)
- Maximum 300 words. Every word must earn its place.

WHAT TO INCLUDE:
- All exported function/class/type/const names (MANDATORY - missing any is a failure)
- Parameter types and return types for public functions
- Key dependencies and what they're used for
- Coupled sibling files

WHAT TO EXCLUDE:
- Internal implementation details
- Generic descriptions without identifiers
- Filler phrases and transitions`;
```

### Example 5: Hierarchical Deduplication (DENSE-03)

```typescript
// Modified buildAgentsMd to deduplicate against child content
export function buildAgentsMd(
  doc: DirectoryDoc,
  hasLocalFile: boolean = false,
  childSummaries?: Map<string, string>,  // child file name -> purpose
): string {
  // ... existing header generation ...

  // MODIFIED: Files section - show only name + one-liner, NOT the full purpose
  // (which is already in the .sum file)
  if (doc.files.length > 0) {
    sections.push('## Contents\n');
    for (const group of doc.files) {
      if (group.files.length === 0) continue;
      sections.push(`### ${group.purpose}\n`);
      for (const file of group.files) {
        // Abbreviated reference, not full description
        sections.push(`- [${file.name}](./${file.name})`);
      }
      sections.push('');
    }
  }

  // NEW: Cross-cutting patterns section (unique to parent)
  if (doc.patterns.length > 0) {
    sections.push('## Patterns & Conventions\n');
    sections.push('These patterns apply across files in this directory:\n');
    for (const pattern of doc.patterns) {
      sections.push(`- ${pattern}`);
    }
    sections.push('');
  }

  // NEW: Relationships section (unique to parent)
  // This is information that no individual child .sum file contains
  sections.push('## How Files Relate\n');
  sections.push(`${doc.description}\n`);

  return sections.join('\n').trim() + '\n';
}
```

### Example 6: DENSE-04 "Can an AI Find the Right File?" Validation

```typescript
// Validation test: given a question, can the AGENTS.md + .sum hierarchy guide to the right file?
interface FindabilityTest {
  /** Natural language question about the codebase */
  question: string;
  /** Expected file path(s) that answer the question */
  expectedFiles: string[];
  /** Whether the test passed */
  passed: boolean;
  /** Which file the test procedure selected */
  selectedFile?: string;
}

// Generate findability tests from .sum metadata
function generateFindabilityTests(
  sumFiles: Map<string, SumFileContent>,
): FindabilityTest[] {
  const tests: FindabilityTest[] = [];

  for (const [filePath, sum] of sumFiles) {
    // For each file, generate a question from its purpose
    if (sum.metadata.purpose) {
      tests.push({
        question: `Where is the code that ${sum.metadata.purpose.toLowerCase()}?`,
        expectedFiles: [filePath],
        passed: false,
      });
    }

    // For each public interface item, generate a question
    for (const iface of sum.metadata.publicInterface.slice(0, 2)) {
      tests.push({
        question: `Which file exports ${iface}?`,
        expectedFiles: [filePath],
        passed: false,
      });
    }
  }

  return tests;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-pass generic prompts | Density-aware prompts with anchor term preservation | 2024-2025 (Chain of Density, 2023 paper; widely adopted 2024+) | 2-3x more entities preserved per summary |
| Flat document hierarchies | Hierarchical summarization with dedup | 2024-2025 (NEXUSSUM, CoTHSSum) | Eliminates redundancy across levels |
| Manual doc-code consistency | LLM-based semantic comparison (Metamon, 2025) | 2025 | Automated inconsistency detection |
| Rule-based code analysis | Heuristic pre-filter + LLM verification | 2024-2025 | Balances cost vs. accuracy for inconsistency detection |

**Deprecated/outdated:**
- Full 5-iteration Chain of Density: Too expensive for per-file code docs. Use single-pass adaptation.
- AST-only inconsistency detection: Limited to single languages. LLM-based approach is language-agnostic.

## Open Questions

1. **INCON-01 timing for `generate` command**
   - What we know: During `generate`, .sum files are overwritten. To detect inconsistencies, old content must be captured before overwriting.
   - What's unclear: Should the runner cache old .sum content in memory, or should inconsistency detection be a separate CLI command (e.g., `are check`)?
   - Recommendation: Cache old .sum content in memory during `generate`. Also support a standalone `are check` command for on-demand analysis. Let the planner decide based on complexity constraints.

2. **INCON-02 scope boundaries**
   - What we know: Cross-file inconsistency detection should be scoped to avoid false positives.
   - What's unclear: What is the right boundary -- per-directory, per-package-root, or per-architectural-layer?
   - Recommendation: Start with per-directory scope. This matches the existing AGENTS.md generation boundary and keeps the comparison set manageable.

3. **DENSE-04 validation: automated vs. manual**
   - What we know: The "can an AI find the right file?" test needs to verify that AGENTS.md content is useful for file discovery.
   - What's unclear: Should this use an actual LLM call (expensive) or a keyword/embedding-based heuristic (cheaper but less accurate)?
   - Recommendation: Start with heuristic-based validation (check that file names and key exports from .sum files appear in the parent AGENTS.md). Add optional LLM-based validation behind a flag for thoroughness.

4. **Cost impact of inconsistency detection**
   - What we know: Heuristic checks are free. AI-based verification costs API tokens.
   - What's unclear: What percentage of files will pass heuristic pre-filtering vs. needing AI verification?
   - Recommendation: Implement heuristic-only for v1. If users want deeper analysis, expose an `--ai-verify` flag. Track which heuristic patterns catch the most real inconsistencies.

## Sources

### Primary (HIGH confidence)

- Internal codebase analysis: `src/generation/prompts/templates.ts`, `src/generation/writers/sum.ts`, `src/generation/writers/agents-md.ts`, `src/orchestration/runner.ts`, `src/update/orchestrator.ts` -- full pipeline understanding
- Internal codebase analysis: `src/generation/executor.ts`, `src/generation/orchestrator.ts` -- task dependency graph and execution model
- Internal codebase analysis: `src/change-detection/detector.ts` -- existing hash-based change detection

### Secondary (MEDIUM confidence)

- [Chain of Density (CoD) Prompting](https://arxiv.org/abs/2309.04269) -- from Salesforce/MIT/Columbia researchers, validated technique for information-dense summarization
- [Metamon: Inconsistency Detection](https://arxiv.org/html/2502.02794) -- metamorphic LLM queries for doc-code consistency checking
- [Code Comment Inconsistency Detection using LLM and Program Analysis](https://dl.acm.org/doi/10.1145/3663529.3664458) -- FSE 2024, combining static analysis with LLM-based detection
- [Context-Aware Hierarchical Merging for Long Document Summarization](https://arxiv.org/abs/2502.00977) -- hierarchical dedup in summarization
- [Chain of Density implementation](https://learnprompting.org/docs/advanced/self_criticism/chain-of-density) -- practical prompt template
- [PromptHub: Better Summarization with CoD](https://www.prompthub.us/blog/better-summarization-with-chain-of-density-prompting) -- implementation guidance

### Tertiary (LOW confidence)

- General RAG evaluation patterns (for DENSE-04 test design) -- multiple sources on retrieval quality metrics
- NEXUSSUM hierarchical agent pipeline -- concept reference only, not directly applicable

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed, all existing stack
- Architecture: HIGH -- clear patterns from codebase analysis, well-defined insertion points
- Inconsistency detection: MEDIUM -- heuristic approach is well-understood; AI-based verification is novel for this tool
- Density prompts: MEDIUM -- Chain of Density is validated but adaptation to code docs is specific to this project
- Pitfalls: MEDIUM -- based on analysis of similar systems and known failure modes

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days -- stable domain, no fast-moving dependencies)

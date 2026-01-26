# Phase 2: Documentation Generation - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Produce documentation artifacts from discovered files: .sum files for individual source files, AGENTS.md hierarchy for directories, and supplementary docs (ARCHITECTURE.md, STACK.md) when complexity warrants. This phase does NOT include incremental updates — that's Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Summary content (.sum files)
- Capture both purpose/responsibility AND public interface in balanced detail
- Moderate implementation detail — key patterns and notable algorithms mentioned, not internals
- Include dependencies with brief usage context (what's imported and why)
- Include key function signatures and type definitions as code snippets
- Only include critical TODOs/FIXMEs (security-related, breaking issues), skip general ones
- Reference tightly coupled files only (sibling files used together), let AGENTS.md handle broader relationships
- Target length: 300-500 words (thorough coverage)

### Summary templates
- File-type specific templates, not one-size-fits-all
- Categories: Components, Services, Utils, Types, Tests, Configs, APIs, Models, Hooks, Schemas
- Detection: Directory-first (files in /components use component template), content-based fallback
- Location: .sum files alongside source files (foo.ts → foo.ts.sum)

### AGENTS.md structure
- Content style: Files grouped by purpose, not flat listing
- Include explicit "Related directories" section — auto-detected from imports + manual overrides via config
- Include dedicated "Patterns" or "Conventions" section per directory
- Generate AGENTS.md for every directory containing source files
- Subdirectories: Brief one-liner summary + link to child AGENTS.md
- File references: Markdown links with inline description `[utils.ts](./utils.ts) - Helper functions for X`
- Mark frequently modified or critical files as indicators for AI assistants
- No test coverage or quality metrics (out of scope)

### Root AGENTS.md
- Comprehensive: Project overview + architecture summary + directory map + entry points
- Include "Quick Start" section for common operations (only at root level, not per-directory)

### CLAUDE.md
- Simple pointer to AGENTS.md for Anthropic compatibility
- Just "See AGENTS.md for codebase documentation"

### Supplementary docs
- ARCHITECTURE.md: Generate based on complexity threshold
  - Triggers (any one fires): 20+ source files, 3+ directory levels, multiple architectural patterns detected
- STACK.md: Dependencies from package files + inferred tech decisions/rationale
- Location: Configurable via .agents-reverse.json (root or .docs/ folder)

### Token budget strategy
- Large files: Chunk and merge — split into chunks, summarize each, synthesize final summary
- No per-file token limit, only project total budget
- Priority: Breadth-first coverage — summarize everything shallowly before going deep
- Budget exhaustion: Stop and report progress — document what was completed, list remaining files

### Claude's Discretion
- Exact chunking strategy for large files
- Specific complexity thresholds (exact file count, depth numbers)
- Template section ordering and formatting
- How to detect architectural patterns for ARCHITECTURE.md trigger
- Synthesis approach for chunked file summaries

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-documentation-generation*
*Context gathered: 2026-01-26*

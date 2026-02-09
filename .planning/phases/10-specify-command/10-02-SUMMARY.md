---
phase: 10-specify-command
plan: 02
subsystem: generation
tags: [prompts, spec-generation, file-writer, overwrite-protection, multi-file]

# Dependency graph
requires:
  - phase: 10-specify-command/01
    provides: "AgentsDocs type and collectAgentsDocs() from generation/collector.ts"
provides:
  - "buildSpecPrompt() for AI spec generation prompt building"
  - "writeSpec() for spec output with overwrite protection and multi-file split"
  - "SpecExistsError for programmatic overwrite conflict handling"
affects: [10-specify-command/03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SpecExistsError thrown instead of process.exit for testable overwrite protection"
    - "Atomic conflict detection: check all target files before writing any"
    - "Slugified heading-to-filename conversion for multi-file output"

key-files:
  created:
    - src/specify/prompts.ts
    - src/specify/writer.ts
    - src/specify/index.ts
  modified: []

key-decisions:
  - "SPEC_SYSTEM_PROMPT enforces 9-section conceptual structure (not folder-mirroring)"
  - "SpecExistsError thrown (not process.exit) so callers control error presentation"
  - "Multi-file split on top-level '# ' headings with slugified filenames"
  - "Pre-heading content placed in 00-preamble.md"
  - "All conflicts detected before any writes in multi-file mode (atomic check)"

patterns-established:
  - "SpecExistsError: custom error class with paths property for overwrite conflicts"
  - "splitByHeadings: regex-based markdown splitting on top-level headings"

# Metrics
duration: 2min
completed: 2026-02-09
---

# Phase 10 Plan 02: Spec Prompts and Writer Summary

**Spec generation prompt templates with 9-section conceptual grouping and atomic file writer with overwrite protection and multi-file heading-based splitting**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T11:07:06Z
- **Completed:** 2026-02-09T11:09:24Z
- **Tasks:** 3
- **Files created:** 3

## Accomplishments
- SPEC_SYSTEM_PROMPT with mandatory conceptual grouping (9 sections) targeting AI agent audience
- buildSpecPrompt() injects AgentsDocs with section delimiters and optional package metadata
- writeSpec() with single-file and multi-file output modes, overwrite protection via SpecExistsError
- Barrel index re-exporting all public symbols from the specify module

## Task Commits

Each task was committed atomically:

1. **Task 1: Create prompt templates for spec generation** - `c741e6f` (feat)
2. **Task 2: Create output writer with overwrite protection and multi-file split** - `6ad5b8e` (feat)
3. **Task 3: Create barrel index** - `96dc23d` (feat)

## Files Created/Modified
- `src/specify/prompts.ts` - System/user prompt templates for AI spec generation with conceptual grouping enforcement
- `src/specify/writer.ts` - Spec output writer with overwrite protection, multi-file heading-based splitting, and SpecExistsError
- `src/specify/index.ts` - Barrel export for buildSpecPrompt, SpecPrompt, writeSpec, WriteSpecOptions, SpecExistsError

## Decisions Made
- SPEC_SYSTEM_PROMPT enforces 9-section conceptual structure: Project Overview, Architecture, Public API Surface, Data Structures & State, Configuration, Dependencies, Behavioral Contracts, Test Contracts, Build Plan
- System prompt explicitly prohibits folder-mirroring and file path prescription
- SpecExistsError is a proper Error subclass with paths property -- thrown (not process.exit) for testable, composable error handling
- Multi-file mode splits on `^# ` regex (top-level headings only), content before first heading goes to 00-preamble.md
- Slugify function lowercases, replaces spaces with hyphens, strips non-alphanumeric except hyphens
- In multi-file mode, all conflicts are detected before any files are written (atomic check-then-write)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Prompt templates and writer ready for Plan 03 (CLI command handler and integration)
- buildSpecPrompt() accepts AgentsDocs from collectAgentsDocs() (created in Plan 01)
- writeSpec() is fully independent, ready for CLI wiring

---
*Phase: 10-specify-command*
*Completed: 2026-02-09*

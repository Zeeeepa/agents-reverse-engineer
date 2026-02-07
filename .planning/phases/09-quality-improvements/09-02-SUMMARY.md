---
phase: 09-quality-improvements
plan: 02
subsystem: generation
tags: [prompts, density, dedup, agents-md, findability]

requires:
  - phase: 08-full-telemetry
    provides: "Complete AI service pipeline with telemetry"
provides:
  - "Density-aware BASE_SYSTEM_PROMPT with DENSITY RULES and ANCHOR TERM PRESERVATION"
  - "Reduced target word count (300 max) for .sum files"
  - "Hierarchical dedup in AGENTS.md builder -- parents no longer repeat child descriptions"
  - "How Files Relate section in AGENTS.md for parent-unique value"
  - "validateFindability heuristic for checking symbol presence in AGENTS.md"
affects: [09-quality-improvements]

tech-stack:
  added: []
  patterns:
    - "Density-aware prompting: single-pass density constraints in system prompt"
    - "Hierarchical deduplication: parent docs add cross-cutting value, not repeated content"
    - "Heuristic findability validation: string-based symbol matching without LLM calls"

key-files:
  created:
    - src/quality/density/validator.ts
  modified:
    - src/generation/prompts/templates.ts
    - src/generation/prompts/types.ts
    - src/generation/writers/agents-md.ts

key-decisions:
  - "Single-pass density prompt adaptation (not multi-pass Chain of Density) for cost efficiency"
  - "Contents section links files without descriptions -- full description lives in .sum only"
  - "How Files Relate section uses synthesized directory description for parent-unique value"
  - "Findability validator uses case-sensitive string includes for symbol matching"

patterns-established:
  - "Density-aware prompts: DENSITY RULES + ANCHOR TERM PRESERVATION sections in system prompt"
  - "Hierarchical dedup: parent AGENTS.md adds patterns and relationships, not repeated descriptions"

duration: 3min
completed: 2026-02-07
---

# Phase 9 Plan 2: Density-Aware Prompts and Hierarchical Dedup Summary

**Density-aware BASE_SYSTEM_PROMPT with anchor term preservation, deduplicated AGENTS.md builder with How Files Relate section, and heuristic findability validator**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T16:29:02Z
- **Completed:** 2026-02-07T16:32:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced BASE_SYSTEM_PROMPT with density-aware version containing DENSITY RULES, ANCHOR TERM PRESERVATION, and OUTPUT FORMAT sections
- All 11 per-type templates inherit density constraints automatically via shared systemPrompt reference
- Reduced SUMMARY_GUIDELINES.targetLength.max from 500 to 300 words
- AGENTS.md Contents section now shows abbreviated file links without repeating .sum descriptions
- Added "How Files Relate" section to AGENTS.md for parent-unique cross-cutting value
- Created validateFindability heuristic that checks exported symbol presence in AGENTS.md content

## Task Commits

Each task was committed atomically:

1. **Task 1: Revise prompts for density and anchor term preservation** - `cd99685` (feat)
2. **Task 2: Hierarchical dedup in AGENTS.md builder + findability validator** - `7f625e0` (feat)

## Files Created/Modified
- `src/generation/prompts/templates.ts` - Density-aware BASE_SYSTEM_PROMPT with DENSITY RULES, ANCHOR TERM PRESERVATION, OUTPUT FORMAT sections
- `src/generation/prompts/types.ts` - SUMMARY_GUIDELINES.targetLength.max reduced to 300
- `src/generation/writers/agents-md.ts` - Abbreviated Contents links, How Files Relate section, removed description duplication
- `src/quality/density/validator.ts` - Heuristic findability validator (validateFindability, FindabilityResult)

## Decisions Made
- Single-pass density prompt adaptation rather than multi-pass Chain of Density -- keeps cost at 1x per file
- Contents section shows only file name links -- full descriptions remain exclusively in .sum files to eliminate duplication
- Directory description moved from H1 subtitle to dedicated "How Files Relate" section for cleaner structure
- Findability validator uses case-sensitive string.includes matching -- simple, zero-cost, no LLM needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Density-aware prompts ready for use by the generation pipeline
- AGENTS.md builder produces deduplicated parent docs
- Findability validator available for quality checks in plan 09-03
- No blockers for remaining phase 9 work

---
*Phase: 09-quality-improvements*
*Completed: 2026-02-07*

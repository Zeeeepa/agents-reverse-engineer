# Roadmap: Agents Reverse

## Overview

Agents Reverse delivers auto-updating codebase documentation for AI coding assistants. The journey progresses from file discovery (knowing what to analyze) through documentation generation (producing summaries and AGENTS.md files) to incremental updates (the core differentiator via git diff) to integration (making it usable in real workflows). Each phase builds on the previous, delivering a coherent capability that can be verified independently.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (e.g., 2.1): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Foundation & Discovery** - Identify which files to analyze, exclude noise
- [x] **Phase 2: Documentation Generation** - Produce .sum files and AGENTS.md hierarchy
- [x] **Phase 3: Incremental Updates** - Update only changed files via git diff detection
- [x] **Phase 4: Integration & Commands** - Commands, hooks, and multi-tool support
- [x] **Phase 5: Installation Workflow** - npx installer with runtime/location prompts

## Phase Details

### Phase 1: Foundation & Discovery
**Goal**: Users can run the tool and it correctly identifies which files to analyze
**Depends on**: Nothing (first phase)
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04
**Success Criteria** (what must be TRUE):
  1. Running the tool on a repo skips files matching .gitignore patterns
  2. Binary files (images, executables, archives) are automatically excluded
  3. Vendor directories (node_modules, vendor, .git, etc.) are excluded by default
  4. User can add custom exclusion patterns via configuration file
**Plans**: 5 plans

Plans:
- [x] 01-01-PLAN.md - Initialize TypeScript project and config schema
- [x] 01-02-PLAN.md - Create discovery types and directory walker
- [x] 01-03-PLAN.md - Implement file filters (gitignore, binary, vendor, custom)
- [x] 01-04-PLAN.md - Create config loader and terminal logger
- [x] 01-05-PLAN.md - Create CLI commands (init, discover)

### Phase 2: Documentation Generation
**Goal**: Users get complete documentation hierarchy from file summaries to root AGENTS.md
**Depends on**: Phase 1
**Requirements**: GEN-01, GEN-02, GEN-03, GEN-04, GEN-05
**Success Criteria** (what must be TRUE):
  1. Every analyzed source file has a corresponding .sum file with useful summary
  2. Every directory containing analyzed files has an AGENTS.md describing contents
  3. Project root has CLAUDE.md that points to AGENTS.md for Anthropic compatibility
  4. Large repositories complete without cost explosion (token budgets enforced)
  5. Supplementary docs (ARCHITECTURE.md, STACK.md) generated when codebase warrants them
**Plans**: 6 plans

Plans:
- [x] 02-01-PLAN.md - Create generation types and file type detection
- [x] 02-02-PLAN.md - Create token budget management system
- [x] 02-03-PLAN.md - Create file-type-specific prompt templates
- [x] 02-04-PLAN.md - Create documentation writers (.sum, AGENTS.md, CLAUDE.md)
- [x] 02-05-PLAN.md - Create supplementary docs (ARCHITECTURE.md, STACK.md)
- [x] 02-06-PLAN.md - Create CLI generate command and orchestrator

### Phase 3: Incremental Updates
**Goal**: Users can update documentation incrementally based on what changed since last run
**Depends on**: Phase 2
**Requirements**: UPD-01, UPD-02, UPD-03, UPD-04
**Success Criteria** (what must be TRUE):
  1. Tool stores git hash after each generation run
  2. Running update only re-analyzes files changed since stored hash
  3. Changes to files automatically update parent directory AGENTS.md files
  4. Renamed or moved files are detected and handled without orphaning old summaries
**Plans**: 5 plans

Plans:
- [x] 03-01-PLAN.md - Create state management with SQLite
- [x] 03-02-PLAN.md - Create git change detection module
- [x] 03-03-PLAN.md - Create orphan cleanup for stale docs
- [x] 03-04-PLAN.md - Create update orchestrator
- [x] 03-05-PLAN.md - Create CLI update command

### Phase 4: Integration & Commands
**Goal**: Users can invoke the tool via commands and automate updates via hooks
**Depends on**: Phase 3
**Requirements**: INT-01, INT-02, INT-03, INT-04
**Success Criteria** (what must be TRUE):
  1. User can run /are:generate in Claude Code to analyze entire project
  2. User can run /are:update in Claude Code to incrementally update changed files
  3. End-of-session hook automatically triggers update when session ends
  4. Tool works in other AI coding assistants (OpenCode, etc.) via compatible integration
**Plans**: 5 plans

Plans:
- [x] 04-01-PLAN.md - Create integration infrastructure (types, detection, templates)
- [x] 04-02-PLAN.md - Create init --integration command
- [x] 04-03-PLAN.md - Create Claude Code command files and hook
- [x] 04-04-PLAN.md - Create OpenCode integration and verify all commands
- [x] 04-05-PLAN.md - Fix --integration flag ignored when config exists (gap closure)

### Phase 5: Installation Workflow
**Goal**: Users can install via npx with interactive prompts for runtime and location
**Depends on**: Phase 4
**Requirements**: INST-01, INST-02, INST-03, INST-04
**Success Criteria** (what must be TRUE):
  1. Running `npx agents-reverse-engineer` launches interactive installer
  2. User can select runtime (Claude Code, OpenCode, or all)
  3. User can select location (global ~/.claude or local ./.claude)
  4. CLI flags support non-interactive installation (--claude --global, etc.)
**Plans**: 5 plans

Plans:
- [x] 05-01-PLAN.md - Create installer types and path resolution
- [x] 05-02-PLAN.md - Create interactive prompts and banner
- [x] 05-03-PLAN.md - Create file operations and hook registration
- [x] 05-04-PLAN.md - Create uninstall and CLI integration
- [x] 05-05-PLAN.md - End-to-end verification checkpoint

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Discovery | 5/5 | ✓ Complete | 2026-01-26 |
| 2. Documentation Generation | 6/6 | ✓ Complete | 2026-01-26 |
| 3. Incremental Updates | 5/5 | ✓ Complete | 2026-01-26 |
| 4. Integration & Commands | 5/5 | ✓ Complete | 2026-02-02 |
| 5. Installation Workflow | 5/5 | ✓ Complete | 2026-02-02 |

---
*Roadmap created: 2025-01-25*
*Phase 1 planned: 2025-01-25*
*Phase 1 complete: 2026-01-26*
*Phase 2 planned: 2026-01-26*
*Phase 2 complete: 2026-01-26*
*Phase 3 planned: 2026-01-26*
*Phase 3 complete: 2026-01-26*
*Phase 4 planned: 2026-01-26*
*Phase 4 complete: 2026-01-26*
*Phase 5 added: 2026-02-02*
*Phase 5 planned: 2026-02-02*
*Phase 5 complete: 2026-02-02*
*Depth: quick (3-5 phases)*
*Total v1 requirements: 21*

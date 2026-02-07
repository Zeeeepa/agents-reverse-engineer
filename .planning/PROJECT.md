# Agents Reverse

## What This Is

A lightweight, open-source tool that generates and maintains agent-friendly documentation for brownfield codebases. It recursively analyzes a project bottom-up — from file summaries to directory overviews — creating AGENTS.md files that help AI coding assistants understand the codebase. Installs via npx and works as commands within Claude Code, OpenCode, Gemini CLI, and similar tools.

## Core Value

Documentation that stays fresh automatically. When code changes, docs update — solving doc drift.

## Requirements

### Validated

- [x] Recursive file analysis (bottom-up from leaves to root) — v1.0
- [x] Generate `.sum` file for each analyzed file — v1.0
- [x] Generate `AGENTS.md` per directory describing contents and sub-structure — v1.0
- [x] Generate `CLAUDE.md` as pointer to `AGENTS.md` for Anthropic compatibility — v1.0
- [x] Content-driven supplementary docs (ARCHITECTURE.md, STACK.md, etc. when relevant) — v1.0
- [x] `/are:generate` command for full project analysis — v1.0
- [x] `/are:update` command for incremental updates — v1.0
- [x] End-of-session hook integration for automatic updates — v1.0
- [x] Git diff-based change detection (track hash between runs) — v1.0
- [x] Language agnostic analysis (LLM figures out the language) — v1.0
- [x] Works on any repository size (token budgets) — v1.0
- [x] Interactive npx installer with runtime/location selection — v1.0
- [x] Multi-runtime support (Claude Code, OpenCode, Gemini CLI) — v1.0

### Active

- [ ] AI service that spawns CLI subprocesses (claude, gemini, opencode) to drive analysis directly
- [ ] Full telemetry logging per LLM call (input, output, thinking, tokens in/out, timing, files read) as JSON log files
- [ ] Refactor discover and generate commands to use the new AI service
- [ ] Inconsistency detection during analysis — flag code-vs-code and code-vs-doc inconsistencies (#1)
- [ ] Improved AGENTS.md context density — more compressed, information-dense output (#5)

### Deferred

- [ ] AST-based code structure extraction for deeper understanding
- [ ] Cross-reference detection between files
- [ ] Dependency graph visualization

### Out of Scope

- Language-specific parsers — relies on LLM understanding
- GUI or web interface — CLI only
- Proprietary/commercial features — fully open source
- Real-time file watching — git-diff-based is sufficient
- Auto-commit generated docs — user controls git commits

## Current Milestone: v2.0 AI Service & Quality

**Goal:** The tool directly orchestrates AI analysis via CLI subprocesses, with full telemetry and improved output quality.

**Target features:**
- AI service abstraction that spawns claude/gemini/opencode CLI processes
- Per-call telemetry: input, output, thinking, tokens, timing, files read (JSON logs)
- Refactored discover/generate pipeline using the AI service
- Inconsistency detection (code vs code, code vs doc) during analysis
- Higher-density AGENTS.md output (compressed, information-rich)

## Context

**Shipped v1.0 MVP** with ~12,000 lines of TypeScript across 58 source files.

**Tech stack:**
- TypeScript (ESM, NodeNext resolution)
- better-sqlite3 for state management
- simple-git for change detection
- gpt-tokenizer for budget tracking
- picocolors for terminal output

**Problem**: AI coding assistants struggle with brownfield codebases because context docs either don't exist or go stale quickly. Manually maintaining docs is tedious and gets deprioritized.

**Solution approach**: Leverage the LLM-powered host tool to analyze code recursively, generating structured documentation at every level. Hook into session lifecycle to keep docs current automatically via git diff.

**Ecosystem compatibility**:
- AGENTS.md is the standard format used by multiple tools
- CLAUDE.md is Anthropic-specific (points to AGENTS.md)
- Designed to complement tools like SpecKit, BMAD, and GSD

**Repository structure**: Following patterns from GSD and BMAD for commands, hooks, and configuration.

## Constraints

- **CLI availability**: Claude CLI, Gemini CLI, or OpenCode must be installed for the AI service to work
- **No API keys in tool**: Uses installed CLI tools which handle their own auth
- **Visible artifacts**: .sum files and AGENTS.md are committed, not hidden
- **Backward compatible**: Existing v1.0 command/hook integration must still work

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| One file per LLM call | Keeps context focused, works for any repo size | Good |
| Host tool does analysis | No external API needed, leverages existing agent | Good |
| Visible .sum files | Serve as context for agents AND human reference | Good |
| CLAUDE.md as pointer | Anthropic compatibility without duplication | Good |
| Git diff for updates | Natural integration, tracks what actually changed | Good |
| SQLite for state | Sync API via better-sqlite3, WAL mode for reads | Good |
| ESM-only project | Modern Node.js with NodeNext module resolution | Good |
| Zero-dep prompts | Node.js readline instead of inquirer for installer | Good |
| Multi-runtime templates | Same commands work across Claude/OpenCode/Gemini | Good |
| Session hooks for all | Claude and Gemini get SessionEnd auto-updates | Good |

| Tool drives LLM via CLI subprocess | Full control over orchestration, telemetry, error handling | — Pending |
| JSON log files for telemetry | Human-readable, one file per run, easy to inspect | — Pending |

---
*Last updated: 2026-02-07 after v2.0 milestone start*

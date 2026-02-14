# Multi-Runtime Support: Claude Code, Gemini CLI, OpenCode, and Codex

The AI coding assistant landscape is rapidly diversifying. How do you maintain consistent documentation across different tools? `agents-reverse-engineer` (ARE) was designed from the ground up to work across multiple AI coding assistants, generating documentation that works seamlessly with all of them.

## The AGENTS.md Standard

Before diving into runtime-specific details, understand that **AGENTS.md is an emerging cross-tool standard** for AI-readable project documentation. Like README.md for humans, AGENTS.md provides AI-readable documentation in a consistent, hierarchical structure. ARE generates this through its two-phase pipeline: parallel file analysis followed by hierarchical directory aggregation. Because AGENTS.md is a standard format, any tool that supports it will automatically benefit—even tools that don't exist yet.

## Runtime-by-Runtime Breakdown

### Claude Code: Full Integration

Claude Code has the most mature integration, with full slash commands (`/are-generate`, `/are-update`, etc.) and three automated session hooks. `are-check-update.js` performs version checks, `are-context-loader.js` auto-injects parent AGENTS.md files into context, and `are-session-end.js` triggers auto-updates on git changes. Uses `CLAUDE.md` pointer file.

### Gemini CLI: Full Support

Receives the same level of support with runtime-specific adaptations. Uses `GEMINI.md` pointer file, identical slash commands, and equivalent session hooks for version checking, context loading, and session-end updates.

### OpenCode: AGENTS.md Native

Supports AGENTS.md files directly without additional configuration. Uses `OPENCODE.md` pointer file, full command suite, and hooks stored in `.opencode/hooks/` directory.

### Codex: Local Context Rules

Uses `AGENTS.override.md` pattern instead of runtime-specific pointer files. Works with Codex's local context rule system for integrating generated documentation.

## Installation for Multiple Runtimes

Install for all runtimes simultaneously:
```bash
npx agents-reverse-engineer@latest --runtime all -g
```

Or target specific runtimes:
```bash
npx agents-reverse-engineer@latest --runtime claude -g
```

## What's the Same Across Runtimes

- **Generated Artifacts**: Identical `.sum` and `AGENTS.md` files
- **Generation Pipeline**: Runtime-independent two-phase process
- **Configuration**: Shared `.agents-reverse-engineer/config.yaml`
- **Command Interface**: Consistent slash command names and CLI flags
- **Quality Gates**: Same validation across all runtimes

## What's Different

- **Pointer Files**: CLAUDE.md, GEMINI.md, OPENCODE.md, or AGENTS.override.md
- **Hook Locations**: `.claude/hooks/`, `.gemini/hooks/`, `.opencode/hooks/`
- **Version Files**: Different locations per runtime

## Backend Selection

Runtimes determine where documentation is consumed; backends determine which AI CLI generates it. You can mix and match: generate with Claude for quality, consume with Gemini for speed. This separation provides maximum flexibility.

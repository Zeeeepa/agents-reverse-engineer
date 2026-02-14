# Getting Started with agents-reverse-engineer in 5 Minutes

agents-reverse-engineer (ARE) is a CLI tool that generates AI-friendly documentation for your codebase automatically. Instead of manually explaining your project to AI coding assistants, ARE analyzes your code and creates comprehensive documentation that AI models can read instantly.

## Prerequisites

You'll need Node.js 18 or higher and an AI coding assistant like Claude Code, Gemini CLI, OpenCode, or Codex. ARE works with existing codebases in any state.

## Step 1: Install agents-reverse-engineer

ARE integrates directly with your AI assistant through slash commands. Run:

```bash
npx agents-reverse-engineer@latest
```

The installer prompts two questions:
1. **Select your runtime** (Claude Code, Gemini CLI, OpenCode, Codex, or all)
2. **Installation location**: Global (~/.claude/) for all projects, or Local (./.claude/) for this project only

For non-interactive installation, use flags:

```bash
# Global installation for Claude Code
npx agents-reverse-engineer@latest --runtime claude -g
```

## Step 2: Initialize Configuration

In your AI assistant, navigate to your project and run:

```bash
/are-init
```

This creates `.agents-reverse-engineer/config.yaml` with defaults that work for most projects.

## Step 3: Discover Your Codebase

Run the discovery command:

```bash
/are-discover
```

ARE scans your project, respects `.gitignore` patterns, filters binaries, and creates a generation plan showing checkboxes for each file and directory.

## Step 4: Generate Documentation

Run the generation command:

```bash
/are-generate
```

ARE executes a two-phase pipeline:

**Phase 1: File Analysis** - ARE analyzes each source file in parallel, extracting imports, exports, purpose, and dependencies. It writes a `.sum` file next to each source file.

**Phase 2: Directory Aggregation** - ARE builds directory summaries from deepest to shallowest, ensuring child documentation is available when building parent summaries.

## What You Get

After generation, you have three documentation types:

**1. File Summaries (.sum files)** - Each source file gets a `.sum` file with YAML frontmatter and structured sections covering purpose, public interface, dependencies, and implementation notes.

**2. Directory Summaries (AGENTS.md)** - Each directory gets an aggregated summary of its contents and architecture.

**3. Root Pointer (CLAUDE.md)** - A simple `@AGENTS.md` pointer at your project root that tells your AI assistant to automatically load project documentation.

## Keeping Documentation Updated

As you modify code, run `/are-update`. This compares file hashes, regenerates only changed files, updates parent directories, and removes documentation for deleted files.

## Next Steps

You now have a fully documented codebase that your AI assistant understands. The documentation lives alongside your code and updates as your project evolves.

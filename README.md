<div align="center">

# AGENTS REVERSE ENGINEER (ARE)

**Reverse engineer your codebase into AI-friendly documentation.**

**Generate `.sum` files and `AGENTS.md` for Claude Code, OpenCode, and any AI assistant that supports `AGENTS.md`.**

[![npm version](https://img.shields.io/npm/v/agents-reverse-engineer?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/agents-reverse-engineer)
[![npm downloads](https://img.shields.io/npm/dw/agents-reverse-engineer?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/agents-reverse-engineer)
[![GitHub stars](https://img.shields.io/github/stars/GeoloeG-IsT/agents-reverse-engineer?style=for-the-badge&logo=github&color=181717)](https://github.com/GeoloeG-IsT/agents-reverse-engineer)
[![Last commit](https://img.shields.io/github/last-commit/GeoloeG-IsT/agents-reverse-engineer?style=for-the-badge&logo=github&color=181717)](https://github.com/GeoloeG-IsT/agents-reverse-engineer/commits)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

<br>

```bash
npx agents-reverse-engineer@latest
```

**Interactive installer with runtime and location selection.**

**Works on Mac, Windows, and Linux.**

<br>

_"Finally, my AI assistant actually understands my codebase structure."_

_"No more explaining the same architecture in every conversation."_

<br>

[Why This Exists](#why-this-exists) · [How It Works](#how-it-works) · [Commands](#commands) · [Generated Docs](#generated-documentation)

<br>

### Works with

[<img src="https://img.shields.io/badge/Claude_Code-F97316?style=for-the-badge&logo=anthropic&logoColor=white" alt="Claude Code">](https://claude.ai/claude-code)
[<img src="https://img.shields.io/badge/Gemini_CLI-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini CLI">](https://github.com/google-gemini/gemini-cli)
[<img src="https://img.shields.io/badge/OpenCode-000000?style=for-the-badge&logo=github&logoColor=white" alt="OpenCode">](https://github.com/anomalyco/opencode)
[<img src="https://img.shields.io/badge/Any_AGENTS.md_tool-6B7280?style=for-the-badge" alt="Any AGENTS.md tool">](#)

</div>

---

## Why This Exists

AI coding assistants are powerful, but they don't know your codebase. Every session starts fresh. You explain the same architecture, the same patterns, the same file locations — over and over.

**agents-reverse-engineer** fixes that. It generates documentation that AI assistants actually read:

- **`.sum` files** — Per-file summaries with purpose, exports, dependencies
- **`AGENTS.md`** — Per-directory overviews with file organization (standard format)
- **`CLAUDE.md`** / **`GEMINI.md`** / **`OPENCODE.md`** — Runtime-specific project entry points

The result: Your AI assistant understands your codebase from the first message.

---

## Who This Is For

Developers using AI coding assistants (Claude Code, OpenCode, Gemini CLI, or any tool supporting `AGENTS.md`) who want their assistant to actually understand their project structure — without manually writing documentation or repeating context every session.

---

## Getting Started

### 1. Install Commands

```bash
npx agents-reverse-engineer@latest
```

The interactive installer prompts you to:

1. **Select runtime** — Claude Code, OpenCode, Gemini CLI, or all
2. **Select location** — Global (`~/.claude/`) or local (`./.claude/`)

This installs:

- **Commands** — `/are-init`, `/are-discover`, `/are-generate`, `/are-update`, `/are-specify`, `/are-clean`
- **Session hook** — Auto-updates docs when session ends (Claude/Gemini)

### 2. Initialize Configuration

After installation, create the configuration file in your AI assistant:

```bash
/are-init
```

This creates `.agents-reverse-engineer/config.yaml` with default settings.

### 3. Generate Documentation

In your AI assistant:

```
/are-discover
/are-generate
```

The assistant creates the plan and generates all documentation.

### Non-Interactive Installation

```bash
# Install for Claude Code globally
npx agents-reverse-engineer@latest --runtime claude -g

# Install for all runtimes locally
npx agents-reverse-engineer@latest --runtime all -l
```

### Uninstall

```bash
npx agents-reverse-engineer@latest uninstall
```

Removes:
- Command files (`/are-*` commands)
- Session hooks (Claude/Gemini)
- ARE permissions from settings.json
- `.agents-reverse-engineer` folder (local installs only)

Use `--runtime` and `-g`/`-l` flags for specific targets.

### Checking Version

```bash
npx agents-reverse-engineer@latest --version
```

---

## How It Works

### 1. Install Commands

```bash
npx agents-reverse-engineer@latest
```

Interactive installer installs commands and hooks for your chosen runtime(s).

**Runtimes:** Claude Code, OpenCode, Gemini CLI (or all at once)

---

### 2. Initialize Configuration

```
/are-init
```

Creates `.agents-reverse-engineer/config.yaml` with exclusion patterns and options.

---

### 3. Discover & Plan

```
/are-discover
```

Scans your codebase (respecting `.gitignore`), detects file types, and creates `GENERATION-PLAN.md` with all files to analyze.

Uses **post-order traversal** — deepest directories first, so child documentation exists before parent directories are documented.

---

### 4. Generate (in your AI assistant)

```
/are-generate
```

Your AI assistant executes the plan:

1. **File Analysis** — Creates `.sum` file for each source file
2. **Directory Docs** — Creates `AGENTS.md` and `CLAUDE.md` pointer for each directory

---

### 5. Update Incrementally

```
/are-update
```

Only regenerates documentation for files that changed since last run.

---

### 6. Generate Specification

```
/are-specify
```

Synthesizes all AGENTS.md documentation into a single project specification document (`specs/SPEC.md`). Use `--multi-file` to split into separate files, or `--dry-run` to preview without calling the AI.

---

## Commands

| Command                         | Description                      |
| ------------------------------- | -------------------------------- |
| `are`                           | Interactive installer (default)  |
| `are install`                   | Install with prompts             |
| `are install --runtime <rt> -g` | Install to runtime globally      |
| `are install --runtime <rt> -l` | Install to runtime locally       |
| `are install -u`                | Uninstall (remove files/hooks)   |
| `are init`                      | Create configuration file        |
| `are discover`                  | Scan files and create GENERATION-PLAN.md |
| `are generate`                  | Generate all documentation       |
| `are update`                    | Update changed files only        |
| `are specify`                   | Generate project specification   |
| `are clean`                     | Remove all generated docs        |

**Runtimes:** `claude`, `opencode`, `gemini`, `all`

### AI Assistant Commands

| Command         | Description                    | Supported Runtimes       |
| --------------- | ------------------------------ | ------------------------ |
| `/are-init`     | Initialize config and commands | Claude, OpenCode, Gemini |
| `/are-discover` | Rediscover and regenerate plan | Claude, OpenCode, Gemini |
| `/are-generate` | Generate all documentation     | Claude, OpenCode, Gemini |
| `/are-update`   | Update changed files only      | Claude, OpenCode, Gemini |
| `/are-specify`  | Generate project specification | Claude, OpenCode, Gemini |
| `/are-clean`    | Remove all generated docs      | Claude, OpenCode, Gemini |

---

## Generated Documentation

### `.sum` Files (Per File)

```yaml
---
file_type: service
generated_at: 2026-01-30T12:00:00Z
---

## Purpose
Handles user authentication via JWT tokens.

## Public Interface
- `authenticate(token: string): User`
- `generateToken(user: User): string`

## Dependencies
- jsonwebtoken: Token signing/verification
- ./user-repository: User data access

## Implementation Notes
Tokens expire after 24 hours. Refresh handled by client.
```

### `AGENTS.md` (Per Directory)

Directory overview with:

- Description of the directory's role
- Files grouped by purpose (Types, Services, Utils, etc.)
- Subdirectories with brief descriptions

### Pointer Files

- **`CLAUDE.md`** — Imports `AGENTS.md` for Claude Code (auto-loaded per directory)

### Root Overview

- **`AGENTS.md`** — Root directory overview (universal format)

---

## Configuration

Edit `.agents-reverse-engineer/config.yaml`:

```yaml
# File and directory exclusions
exclude:
  patterns: []              # Custom glob patterns (e.g., ["*.log", "temp/**"])
  vendorDirs:               # Directories to skip
    - node_modules
    - dist
    - .git
  binaryExtensions:         # File types to skip
    - .png
    - .jpg
    - .pdf

# Discovery options
options:
  followSymlinks: false     # Follow symbolic links during traversal
  maxFileSize: 1048576      # Max file size in bytes (1MB default)

# Output formatting
output:
  colors: true              # Use colors in terminal output

# AI service configuration
ai:
  backend: auto             # Backend: 'claude', 'gemini', 'opencode', 'auto'
  model: sonnet             # Model identifier (backend-specific)
  timeoutMs: 300000         # Subprocess timeout in ms (5 minutes)
  maxRetries: 3             # Max retries for transient errors
  concurrency: 10           # Parallel AI calls (1-20, auto-detected from CPU/RAM)

  telemetry:
    keepRuns: 50            # Number of run logs to keep
```

### Key Config Options

**Concurrency (`ai.concurrency`)**
- Default: Auto-detected from CPU cores and available memory
- Range: `1-20`
- Lower values recommended for resource-constrained environments
- Higher values speed up generation but use more memory

**Timeout (`ai.timeoutMs`)**
- Default: `300000` (5 minutes)
- AI subprocess timeout for each file analysis
- Increase for very large files or slow connections

---

## Requirements

- **Node.js 18+**
- **AI Coding Assistant** — One of:
  - [Claude Code](https://claude.ai/claude-code) (full support + session hooks)
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli) (full support + session hooks)
  - [OpenCode](https://github.com/opencode-ai/opencode) (AGENTS.md supported)
  - Any assistant supporting `AGENTS.md` format

---

## Contributing

Contributions are welcome! Whether it's bug reports, feature requests, or pull requests — all input is valued.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

---

## License

MIT

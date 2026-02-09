---
name: are-help
description: Show available ARE commands and usage guide
---

<objective>
Display the complete ARE command reference.

**First**: Read `.claude/ARE-VERSION` and show the user the version: `agents-reverse-engineer vX.Y.Z`

**Then**: Output ONLY the reference content below. Do NOT add:
- Project-specific analysis
- Git status or file context
- Next-step suggestions
- Any commentary beyond the reference
</objective>

<reference>
# agents-reverse-engineer (ARE) Command Reference

**ARE** generates AI-friendly documentation for codebases, creating structured summaries optimized for AI assistants.

## Quick Start

1. `/are-init` — Create configuration file
2. `/are-generate` — Generate documentation for the codebase
3. `/are-update` — Keep docs in sync after code changes

## Commands Reference

### `/are-init`
Initialize configuration in this project.

Creates `.agents-reverse-engineer/config.yaml` with customizable settings.

**Usage:** `/are-init`
**CLI:** `npx are init`

---

### `/are-discover`
Discover files that would be analyzed for documentation.

Shows included files, excluded files with reasons, and generates a `GENERATION-PLAN.md` execution plan.

**Options:**
| Flag | Description |
|------|-------------|
| `[path]` | Target directory (default: current directory) |
| `--debug` | Show verbose debug output |
| `--trace` | Enable concurrency tracing to `.agents-reverse-engineer/traces/` |
**Usage:**
- `/are-discover` — Discover files and generate execution plan

**CLI:**
```bash
npx are discover
npx are discover ./src
```

---

### `/are-generate`
Generate comprehensive documentation for the codebase.

**Options:**
| Flag | Description |
|------|-------------|
| `[path]` | Target directory (default: current directory) |
| `--concurrency N` | Number of concurrent AI calls (default: auto) |
| `--dry-run` | Show what would be generated without writing |
| `--fail-fast` | Stop on first file analysis failure |
| `--debug` | Show AI prompts and backend details |
| `--trace` | Enable concurrency tracing to `.agents-reverse-engineer/traces/` |
**Usage:**
- `/are-generate` — Generate docs
- `/are-generate --dry-run` — Preview without writing
- `/are-generate --concurrency 3` — Limit parallel AI calls

**CLI:**
```bash
npx are generate
npx are generate --dry-run
npx are generate ./my-project --concurrency 3
npx are generate --debug --trace
```

**How it works:**
1. Discovers files, applies filters, detects file types, and creates a generation plan
2. Analyzes each file via concurrent AI calls, writes `.sum` summary files
3. Generates `AGENTS.md` for each directory (post-order traversal)
4. Creates root document: `CLAUDE.md`

---

### `/are-update`
Incrementally update documentation for changed files.

**Options:**
| Flag | Description |
|------|-------------|
| `[path]` | Target directory (default: current directory) |
| `--uncommitted` | Include staged but uncommitted changes |
| `--dry-run` | Show what would be updated without writing |
| `--concurrency N` | Number of concurrent AI calls (default: auto) |
| `--fail-fast` | Stop on first file analysis failure |
| `--debug` | Show AI prompts and backend details |
| `--trace` | Enable concurrency tracing to `.agents-reverse-engineer/traces/` |
**Usage:**
- `/are-update` — Update docs for committed changes
- `/are-update --uncommitted` — Include uncommitted changes

**CLI:**
```bash
npx are update
npx are update --uncommitted
npx are update --dry-run
npx are update ./my-project --concurrency 3
```

---

### `/are-specify`
Generate a project specification from AGENTS.md documentation.

Collects all AGENTS.md files, synthesizes them via AI, and writes a comprehensive project specification. Auto-runs `generate` if no AGENTS.md files exist.

**Options:**
| Flag | Description |
|------|-------------|
| `[path]` | Target directory (default: current directory) |
| `--output <path>` | Custom output path (default: specs/SPEC.md) |
| `--multi-file` | Split specification into multiple files |
| `--force` | Overwrite existing specification |
| `--dry-run` | Show input statistics without making AI calls |
| `--debug` | Show AI prompts and backend details |
| `--trace` | Enable concurrency tracing to `.agents-reverse-engineer/traces/` |
**Usage:**
- `/are-specify` — Generate specification
- `/are-specify --dry-run` — Preview without calling AI
- `/are-specify --output ./docs/spec.md --force` — Custom output path

**CLI:**
```bash
npx are specify
npx are specify --dry-run
npx are specify --output ./docs/spec.md --force
npx are specify --multi-file
```

---

### `/are-clean`
Remove all generated documentation artifacts.

**Options:**
| Flag | Description |
|------|-------------|
| `--dry-run` | Show what would be deleted without deleting |

**What gets deleted:**
- `.agents-reverse-engineer/GENERATION-PLAN.md`
- All `*.sum` files
- All `AGENTS.md` files
- Root docs: `CLAUDE.md`

**Usage:**
- `/are-clean --dry-run` — Preview deletions
- `/are-clean` — Delete all artifacts

**CLI:**
```bash
npx are clean --dry-run
npx are clean
```

---

### `/are-help`
Show this command reference.

## CLI Installation

Install ARE commands to your AI assistant:

```bash
npx agents-reverse-engineer install              # Interactive mode
npx agents-reverse-engineer install --runtime claude -g  # Global Claude
npx agents-reverse-engineer install --runtime claude -l  # Local project
npx agents-reverse-engineer install --runtime all -g     # All runtimes
```

**Install/Uninstall Options:**
| Flag | Description |
|------|-------------|
| `--runtime <name>` | Target: `claude`, `opencode`, `gemini`, `all` |
| `-g, --global` | Install to global config directory |
| `-l, --local` | Install to current project directory |
| `--force` | Overwrite existing files (install only) |

## Configuration

**File:** `.agents-reverse-engineer/config.yaml`

```yaml
# Exclusion patterns
exclude:
  patterns:
    - "**/*.test.ts"
    - "**/__mocks__/**"
  vendorDirs:
    - node_modules
    - dist
    - .git
  binaryExtensions:
    - .png
    - .jpg
    - .pdf

# Options
options:
  followSymlinks: false
  maxFileSize: 100000

# Output settings
output:
  colors: true
```

## Generated Files

### Per Source File

**`*.sum`** — File summaries with YAML frontmatter + detailed prose.

```yaml
---
file_type: service
generated_at: 2025-01-15T10:30:00Z
content_hash: abc123...
purpose: Handles user authentication and session management
public_interface: [login(), logout(), refreshToken(), AuthService]
dependencies: [express, jsonwebtoken, ./user-model]
patterns: [singleton, factory, observer]
related_files: [./types.ts, ./middleware.ts]
---

<300-500 word summary covering implementation, patterns, edge cases>
```

### Per Directory

**`AGENTS.md`** — Directory overview synthesized from `.sum` files. Groups files by purpose and links to subdirectories.

### Root Documents

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project entry point — synthesizes all AGENTS.md |

## Common Workflows

**Initial documentation:**
```
/are-init
/are-generate
```

**After code changes:**
```
/are-update
```

**Full regeneration:**
```
/are-clean
/are-generate
```

**Preview before generating:**
```
/are-discover                   # Check files and exclusions
/are-generate --dry-run         # Preview generation
```

## Tips

- **Custom exclusions**: Edit `.agents-reverse-engineer/config.yaml` to skip files
- **Hook auto-update**: Install creates a session-end hook that auto-runs update

## Resources

- **Repository:** https://github.com/GeoloeG-IsT/agents-reverse-engineer
- **Update:** `npx agents-reverse-engineer@latest install --force`
</reference>

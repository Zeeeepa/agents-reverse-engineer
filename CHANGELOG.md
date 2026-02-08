# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.9] - 2026-02-08

### Changed
- Version bump

## [0.4.8] - 2026-02-08

### Added
- Subprocess resource management controls — environment variables (`NODE_OPTIONS`, `UV_THREADPOOL_SIZE`, `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`) to limit memory usage and thread spawning in WSL/resource-constrained environments
- Process group termination — `kill(-pid)` ensures entire subprocess tree is terminated, not just parent
- Concurrency default reduced from 5 to 2 for better resource management on WSL/limited environments

### Changed
- Improved subprocess lifecycle management with enhanced cleanup and resource constraints

## [0.4.7] - 2026-02-08

### Changed
- Version bump

## [0.4.6] - 2026-02-08

### Added
- Subprocess output logging capability (`--debug` flag captures stdout/stderr from AI subprocesses for better debugging)
- Subprocess isolation — subprocesses are now prevented from spawning subagents and background tasks are disabled

## [0.4.5] - 2026-02-08

### Fixed
- Timeout errors no longer trigger retries — previously a timed-out subprocess (120s) would retry 3 more times, spawning heavyweight processes on an already struggling system and potentially freezing the host
- SIGKILL escalation after SIGTERM timeout — if a subprocess doesn't exit within 5s of SIGTERM, SIGKILL is sent to prevent hung/zombie processes

### Changed
- `subprocess:spawn` trace events now emit at actual spawn time instead of after subprocess completion, making trace files accurately reflect concurrent process activity
- `--debug` flag now logs active subprocess count, heap/RSS memory usage, PID, exit code, and duration for every subprocess spawn and exit
- Timeout and retry warnings now always print to stderr (not gated behind `--debug`) for visibility into transient failures

## [0.4.4] - 2026-02-08

### Added
- Concurrency tracing system (`--trace` flag) for subprocess lifecycle and task management with NDJSON output
- `--debug` and `--trace` flags to generate and update command argument options
- `ITraceWriter` interface with `NullTraceWriter` and `TraceWriter` implementations for structured trace events
- Trace events for phase lifecycle, worker management, task processing, subprocess spawn/exit, and retries

## [0.4.3] - 2026-02-08

### Added
- OpenCode integration plugins: session-end hook and update-check plugin for automatic documentation updates
- Bounded concurrency for file processing with configurable worker pools
- Token estimation in chunking and orchestration for better budget management

## [0.4.2] - 2026-02-07

### Added
- `computeContentHashFromString` function for in-memory hash computation without writing temporary files
- `PlanTracker` for real-time progress tracking in GENERATION-PLAN.md during documentation generation

### Changed
- Optimized directory processing with parallel file reads in orchestration runner

### Fixed
- Command syntax in documentation and installer messages now consistent across README, docs, and CLI output

## [0.4.1] - 2026-02-07

### Fixed
- `/are-generate` skill now delegates to CLI (`npx agents-reverse-engineer generate`) instead of using an embedded prompt-based workflow — consistent with all other ARE commands
- `/are-clean` skill now deletes all per-package documents (`STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`, `INTEGRATIONS.md`, `CONCERNS.md`) instead of only `STACK.md`
- `/are-help` updated to reflect current CLI capabilities: removed deprecated `--execute`/`--stream` flags, added `--concurrency`/`--fail-fast`, added missing `CONCERNS.md` to generated files list
- Quick Start and Common Workflows in help no longer reference the removed `discover --plan` step

## [0.4.0] - 2026-02-07

### Added
- **AI Service Layer** — New backend abstraction with Claude, Gemini, and OpenCode adapters, auto-detection, and Zod response parsing
- **Orchestration Engine** — Concurrent command runner with configurable concurrency pool, progress reporting, and `--concurrency`, `--fail-fast`, `--debug` CLI flags
- **Cost Estimation** — Pricing engine with per-model token costs, cost thresholds, and unknown model warnings
- **Full Telemetry** — Track file sizes, token usage, and cost per run with dashboard display in `printSummary`
- **Quality Analysis** — Code-vs-doc drift detection (`extractExports`, `checkCodeVsDoc`), cross-file inconsistency detection wired into generate/update pipeline
- **Density-Aware Prompts** — Anchor term preservation and hierarchical deduplication in AGENTS.md builder
- **LLM-Generated Content** — Integrate LLM-generated content into AGENTS.md writing process with directory-level prompt generation
- **Findability Validator** — Validates generated documentation meets findability criteria

### Changed
- Rewrote `generate` command to use AIService + CommandRunner for real AI-powered analysis
- Rewrote `update` command to use AIService for real analysis instead of stubs
- Rewrote `discover` command for consistency with new orchestration layer

### Fixed
- Relative paths now correctly returned in `UpdateOrchestrator`
- Improved directory checks in orphan cleaner

## [0.3.6] - 2026-02-03

### Fixed
- Gemini CLI commands now use TOML format (`.toml` files) instead of markdown, matching Gemini CLI's expected format
- Gemini commands now installed to `.gemini/commands/are/{cmd}.toml` for proper `/are:*` namespace

### Changed
- Uninstall now cleans up legacy Gemini markdown files from previous installations

## [0.3.5] - 2026-02-03

### Changed
- Renamed `VERSION` file to `ARE-VERSION` to avoid conflicts with other tools in `.claude/` directory

## [0.3.4] - 2026-02-03

### Removed
- Unused SQLite database module (`src/state/`) and `better-sqlite3` dependency - state is managed via `.sum` file frontmatter
- Dead code: `writeClaudeMd`, `writeGeminiMd`, `writeOpencodeMd` functions and related files
- Dead code: `estimatePromptOverhead` function from budget module

## [0.3.3] - 2026-02-03

### Changed
- Enhanced `/are:help` command with comprehensive documentation including all options, workflows, and generated file details
- Updated generate skill to document per-package files (`STACK.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`, `INTEGRATIONS.md`) at manifest locations

## [0.3.2] - 2026-02-02

### Changed
- Refactored Claude Code command generation to use new skills format (`.claude/skills/are-{command}/SKILL.md`)
- OpenCode and Gemini CLI continue using commands format unchanged

## [0.3.1] - 2026-02-02

### Added
- Support for Go and Rust package manifests (`go.mod`, `Cargo.toml`) for enhanced analysis and documentation generation
- `LANGUAGES-MANIFEST.md` document listing package manifest files by language
- Package root details and supplementary documentation in generated output
- New documentation files: `STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`, `INTEGRATIONS.md`, `CONCERNS.md`

## [0.3.0] - 2026-02-02

### Added
- **GEMINI.md and OPENCODE.md root documents** — Runtime-specific root documents generated alongside CLAUDE.md for Gemini CLI and OpenCode users
- **Content hash for change detection** — `.sum` files now include a `content_hash` field to detect file changes without relying solely on timestamps
- **User-defined file preservation** — Generation now preserves user-modified root documents (CLAUDE.md, GEMINI.md, OPENCODE.md) instead of overwriting them

### Changed
- Updated default `vendorDirs` and `binaryExtensions` for better AI assistant tooling coverage
- Enhanced `.sum` file format documentation with detailed field guidelines and examples
- Orchestrator now uses frontmatter mode for more reliable document generation

### Fixed
- `.sum` file generation steps now correctly include content hash computation

## [0.2.12] - 2026-02-02

### Fixed
- `vendorDirs` now supports path patterns (e.g., `apps/vendor`, `.agents/skills`) in addition to single directory names

## [0.2.11] - 2026-02-02

### Fixed
- Permissions now use `npx agents-reverse-engineer@latest` to match command templates

## [0.2.10] - 2026-02-02

### Fixed
- `/are:discover` prompt now uses strict "VIOLATION IS FORBIDDEN" wording to prevent AI from auto-adding flags

## [0.2.9] - 2026-02-02

### Changed
- Refactored command templates to use single source of truth (no content duplication across Claude/OpenCode/Gemini)
- `/are:discover` command instructions now explicitly prevent AI from auto-adding flags

## [0.2.8] - 2026-02-02

### Fixed
- Uninstall prompts now correctly say "uninstall" instead of "install"
- Uninstall now removes ARE permissions from Claude Code settings.json
- Uninstall now removes `.agents-reverse-engineer` folder for local installations

## [0.2.7] - 2026-02-02

### Added
- `uninstall` command as cleaner alternative to `install -u` (e.g., `npx agents-reverse-engineer@latest uninstall`)

### Fixed
- All command templates now use `npx agents-reverse-engineer@latest` instead of `npx are` to avoid conflicts with globally installed older versions
- Session-end hook updated to use `@latest` specifier

## [0.2.6] - 2026-02-02

### Fixed
- `/are:discover` description now neutral to prevent AI from auto-adding `--plan` flag
- Added explicit instruction in command template to pass arguments exactly as provided

## [0.2.5] - 2026-02-02

### Fixed
- `--force` flag now correctly triggers installer flow (was showing help instead)

## [0.2.4] - 2026-02-02

### Added
- Auto-register bash permissions for ARE commands in Claude Code settings.json (reduces approval friction)

### Fixed
- `/are:discover` command now matches CLI signature (`npx are discover $ARGUMENTS` instead of hardcoded `--plan`)

## [0.2.3] - 2026-02-02

### Added
- `/are:help` command for all runtimes (Claude, OpenCode, Gemini) showing available commands and usage guide

## [0.2.2] - 2026-02-02

### Added
- `--version` / `-V` flag to display version and exit
- Version banner displayed on startup for all CLI commands (e.g., `agents-reverse-engineer v0.2.2`)
- Version now read dynamically from `package.json` (single source of truth)

### Changed
- Interactive installer banner now reads version from `package.json` instead of hardcoded value

## [0.2.1] - 2026-02-02

### Fixed
- Running `npx agents-reverse-engineer` with no arguments now launches the interactive installer instead of showing help text
- Updated documentation to clarify two-step workflow: install commands first, then run `/are:init` to create configuration

### Changed
- Configuration is no longer created during installation; users must run `/are:init` after installing commands

## [0.2.0] - 2026-02-02

### Added
- **Interactive TUI installer** - Running `npx agents-reverse-engineer` launches an interactive installer with ASCII banner and arrow-key navigation
- **Runtime selection** - Choose from Claude Code, OpenCode, Gemini CLI, or install to all runtimes at once
- **Location selection** - Install globally (`~/.claude/`) or locally (`./.claude/`) with interactive prompts
- **Non-interactive flags** - `--runtime <name>`, `-g`/`--global`, `-l`/`--local` for scripted installations
- **Uninstall command** - `npx are uninstall` removes all installed files and hooks cleanly
- **SessionEnd hooks** - Automatic documentation updates on session close for Claude Code and Gemini CLI
- **VERSION tracking** - Installed version tracked for future upgrade detection

### Changed
- Default command is now the interactive installer (previously required `init` command)
- `are init` now only creates config file; use `are install` for commands and hooks
- Simplified onboarding: just run `npx agents-reverse-engineer` and follow prompts

### Removed
- `--integration` flag from `are init` - replaced by the interactive installer (`are install`)

## [0.1.2] - 2026-01-31

### Added
- **Gemini CLI support** - New integration for Google's Gemini CLI with full command set
- **Required integration name** - `--integration` now requires a name parameter (`claude`, `opencode`, `gemini`, `aider`)
- **discover command** - Added to all integration templates for file discovery and plan generation
- **clean command** - Added to all integration templates for removing generated documentation
- **OIDC publishing** - GitHub Actions workflow now uses OIDC trusted publishing (no npm token needed)
- **CHANGELOG.md** - Added project changelog

### Changed
- `are init --integration` now requires environment name: `are init --integration claude`
- Updated all documentation to reflect new integration syntax
- AI Assistant Commands table now shows support for Claude, OpenCode, and Gemini

## [0.1.1] - 2025-01-30

### Added
- GitHub Actions workflow for npm publishing on release
- GENERATION-PLAN.md generation with post-order traversal in discover command
- Post-order directory processing for AGENTS.md generation

### Changed
- Improved README documentation structure and clarity

## [0.1.0] - 2025-01-29

### Added
- Initial release
- `are init` command - Create configuration file
- `are discover` command - Discover files to analyze
- `are generate` command - Generate documentation plan
- `are update` command - Incremental documentation updates
- Claude Code integration with command files and session-end hook
- OpenCode integration support
- `.sum` file generation for per-file summaries
- `AGENTS.md` generation for directory overviews
- Root document generation (`CLAUDE.md`, `ARCHITECTURE.md`, `STACK.md`)
- Configurable exclusion patterns via `.agents-reverse-engineer/config.yaml`
- Git-aware file detection (respects `.gitignore`)
- Binary file detection and exclusion
- Token budget management for AI-friendly output

[Unreleased]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.4.9...HEAD
[0.4.9]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.4.8...v0.4.9
[0.4.8]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.4.7...v0.4.8
[0.4.7]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.4.6...v0.4.7
[0.4.6]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.4.5...v0.4.6
[0.4.5]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.3.6...v0.4.0
[0.3.6]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.12...v0.3.0
[0.2.12]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.11...v0.2.12
[0.2.11]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.10...v0.2.11
[0.2.10]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.9...v0.2.10
[0.2.9]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/releases/tag/v0.1.0

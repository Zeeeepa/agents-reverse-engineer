# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.5...HEAD
[0.2.5]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/releases/tag/v0.1.0

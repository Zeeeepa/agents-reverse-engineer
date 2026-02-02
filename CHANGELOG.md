# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.2.12...HEAD
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

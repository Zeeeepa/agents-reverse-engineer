# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Gemini CLI support** - New integration for Google's Gemini CLI with full command set
- **Required integration name** - `--integration` now requires a name parameter (`claude`, `opencode`, `gemini`, `aider`)
- **discover command** - Added to all integration templates for file discovery and plan generation
- **clean command** - Added to all integration templates for removing generated documentation
- **OIDC publishing** - GitHub Actions workflow now uses OIDC trusted publishing (no npm token needed)

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

[Unreleased]: https://github.com/GeoloeG-IsT/agents-reverse/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/GeoloeG-IsT/agents-reverse/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/GeoloeG-IsT/agents-reverse/releases/tag/v0.1.0

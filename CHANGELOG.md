# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.0] - 2026-02-09

### Added
- **`rebuild` command** — New CLI command (`are rebuild`) that reconstructs source code from specification documents in `specs/`. Reads and partitions specs into rebuild units from Build Plan phases or top-level headings, processes them with ordered concurrent execution via worker pools, and writes generated files to an output directory
- **Rebuild checkpoint manager** — Persistent session continuity for rebuild operations with `CheckpointManager` class supporting load/createFresh static factories, markDone/markFailed/getPendingUnits tracking, spec drift detection via SHA-256 hash comparison, and promise-chain write serialization
- **Rebuild output parser** — Handles `===FILE:===` delimited multi-file AI output with fenced code block fallback for single-file responses
- **Rebuild prompt templates** — `REBUILD_SYSTEM_PROMPT` with delimiter format instructions and `buildRebuildPrompt` combining full spec, current phase, and accumulated build context (export signatures extracted after each group)
- **Conflict detection for `specify` command** — Early exit when spec files already exist to avoid waiting for an AI call; `--force` flag overrides the check

### Changed
- AI service default timeout increased from 300s (5 minutes) to 1200s (20 minutes) for longer specification and rebuild operations
- Orphan cleanup now includes `.annex.md` files when their source file is deleted/renamed, and skips `.annex.md` files when checking for remaining source files in empty directory cleanup
- Rebuild CLI handler supports `--output`, `--force`, `--dry-run`, `--concurrency`, `--fail-fast`, `--debug`, `--trace` flags with 15-minute minimum timeout and exit codes 0/1/2 for success/partial/total failure
- Full documentation regeneration with updated `.sum` and `AGENTS.md` files

## [0.6.6] - 2026-02-09

### Added
- **Annex file system** for reproduction-critical content — files containing large string constants (prompt templates, config arrays, IDE templates) now generate companion `.annex.md` files alongside `.sum` files, preserving full verbatim source content that cannot fit within summary word limits
- `collectAnnexFiles()` utility in `src/generation/collector.ts` — recursively walks project tree to collect all `.annex.md` files for consumption by the `specify` command
- Annex-aware file analysis prompts — `FILE_SYSTEM_PROMPT` includes new "REPRODUCTION-CRITICAL CONTENT (ANNEX OVERFLOW)" section instructing the LLM to identify constants needing verbatim preservation and list them in `## Annex References` sections
- Annex reference linking in directory AGENTS.md — directory prompts detect `.annex.md` files and link to them; `DIRECTORY_SYSTEM_PROMPT` includes "Reproduction-Critical Constants" section type
- Annex content in specification synthesis — `buildSpecPrompt()` accepts optional annex files, adds them as a dedicated "Annex Files" section in the user prompt, and mandates verbatim reproduction in spec sections 10 (Prompt Templates) and 11 (IDE Integration)
- `prepack` script in package.json — removes `LICENSE.sum` and `README.md.sum` before npm pack to keep published tarball clean

### Changed
- `clean` command now discovers and deletes `*.annex.md` files alongside `.sum` files, with annex count displayed in cleanup summary
- `specify` command collects annex files and includes them in dry-run token estimates and progress log metadata
- Orphan cleaner (`src/update/orphan-cleaner.ts`) now deletes `.annex.md` files when their source file is deleted/renamed, and skips `.annex.md` files when checking for remaining source files in empty directory cleanup
- `CommandRunner` automatically writes annex files when AI response contains `## Annex References` section (both initial generation and incremental update paths)
- Spec prompt adds two new required sections: "10. Prompt Templates & System Instructions" and "11. IDE Integration & Installer" with mandatory verbatim reproduction from annex content
- `npm pack` command added to Claude Code settings allowlist

## [0.6.5] - 2026-02-09

### Added
- **Behavioral contract preservation in summaries** — File analysis prompts now mandate verbatim inclusion of regex patterns, format strings, magic constants, sentinel values, environment variable names, and output templates. New "BEHAVIORAL CONTRACTS (NEVER EXCLUDE)" section in `FILE_SYSTEM_PROMPT` ensures reproduction-critical patterns survive summarization
- **Behavioral Contracts section in directory AGENTS.md** — Directory aggregation prompts include mandatory "Behavioral Contracts" section when file summaries contain regex, format specs, or constants; incremental update prompts preserve these verbatim
- **Version display in all skill commands** — Every `/are-*` skill now reads `ARE-VERSION` file and displays `agents-reverse-engineer vX.Y.Z` before execution. Platform-specific `versionFilePath` added to `PlatformConfig` (`.claude/ARE-VERSION`, `.opencode/ARE-VERSION`, `.gemini/ARE-VERSION`)
- **`specs/SPEC.md` generated** — First project specification synthesized from AGENTS.md corpus via `are specify`

### Changed
- Summary target length increased from 200-300 words to 300-500 words to accommodate behavioral contract content (`SUMMARY_GUIDELINES.targetLength`)
- "Internal implementation details" exclusion replaced with more precise "Control flow minutiae (loop structures, variable naming, temporary state)" in both `FILE_SYSTEM_PROMPT` and `SUMMARY_GUIDELINES`
- Specification synthesis prompt (`src/specify/prompts.ts`) now splits Behavioral Contracts into "Runtime Behavior" and "Implementation Contracts" subsections, requiring verbatim regex patterns and magic constants
- Stale progress log clearing (`rm -f progress.log`) removed from all skill templates, replaced with version display step
- Per-file descriptions in directory prompts clarified as belonging to "Contents sections" only; behavioral contracts directed to separate dedicated section

## [0.6.4] - 2026-02-09

### Added
- **Incremental update prompts** — `update` command now passes existing `.sum` content and `AGENTS.md` content to AI prompts with update-specific system prompts (`FILE_UPDATE_SYSTEM_PROMPT`, `DIRECTORY_UPDATE_SYSTEM_PROMPT`) that instruct the AI to preserve stable text and only modify sections affected by code changes
- **`--force` flag for `init` command** — `are init --force` overwrites existing configuration instead of warning about existing `config.yaml`
- **Claude Code skills** — Added `/are-init`, `/are-discover`, `/are-generate`, `/are-update`, `/are-clean`, `/are-specify`, `/are-help` as `.claude/skills/` SKILL.md files for native IDE integration
- **Centralized version module** (`src/version.ts`) — `getVersion()` extracted from CLI and installer banner into shared module; version now included in `RunSummary` output

### Changed
- Progress monitoring in skills and settings switched from `tail -f` to `sleep`-based polling for better compatibility with buffered environments
- `ProgressReporter` enhanced with real-time build log streaming, ETA calculation, and improved console formatting
- `CommandRunner` refactored with `RunSummary` and `FileTaskResult` types for improved execution metrics and type safety
- Quality validation in orchestration module now non-blocking — errors during quality checks no longer abort the run

## [0.6.3] - 2026-02-09

### Added
- Auto-detection of default concurrency based on system CPU cores and available memory — `getDefaultConcurrency()` computes `clamp(cores * 5, 2, min(memCap, 20))` where memCap allocates 50% of system RAM at 512MB per subprocess
- Permission entries for viewing (`tail -5`) and removing (`rm -f`) progress logs added to Claude Code installer permissions
- Phantom path validation `.sum` files and `AGENTS.md` documentation for the `src/quality/phantom-paths/`, `src/specify/`, `src/types/`, and `src/update/` directories

### Changed
- Default concurrency changed from static `5` to auto-detected value based on system resources (CPU cores and memory)
- Maximum concurrency limit increased from 10 to 20
- Generated `config.yaml` now shows auto-detected concurrency value and comments out the field by default instead of hardcoding `5`
- Affected directories in `update` command now sorted by depth descending (deepest first) so child AGENTS.md files are regenerated before their parents
- Configuration schema refactored with improved Zod validation defaults and `getDefaultConcurrency` as schema default function

## [0.6.2] - 2026-02-09

### Added
- ProgressLog integration in `discover` command for real-time `tail -f` monitoring — mirrors file discovery output, exclusion details, and plan generation status to `.agents-reverse-engineer/progress.log`
- `specify` command template with full documentation in skill help — includes argument hints, execution steps with background polling, and CLI examples

### Changed
- Command templates for `generate`, `update`, and `discover` updated with background execution and progress polling pattern — commands now run with `run_in_background: true` and poll `progress.log` every 10-15 seconds for real-time status updates
- `discover` command arguments simplified: removed `--plan` and `--show-excluded` flags (plan generation and excluded file display are now always enabled), replaced with `--debug` and `--trace`
- Help documentation updated to reflect new `specify` command and revised `discover` options

## [0.6.1] - 2026-02-09

### Added
- **`ProgressLog` class** for real-time `tail -f` monitoring — mirrors all console progress output to `.agents-reverse-engineer/progress.log` as ANSI-stripped plain text, enabling live monitoring in buffered environments (e.g. Claude Code's Bash tool)
- ProgressLog integrated into `generate`, `specify`, and `update` commands with run header (timestamp, project path, task counts) and full summary output
- `/are-specify` and `/are-clean` commands added to post-install next steps banner

### Changed
- README updated with `/are-specify` command documentation — added to workflow steps, CLI command table, and AI assistant commands table

## [0.6.0] - 2026-02-09

### Added
- **`specify` command** — New CLI command (`are specify`) that generates a project specification document from existing AGENTS.md documentation by collecting all AGENTS.md files, synthesizing them via AI, and writing a comprehensive spec to disk. Supports `--output` path, `--force` overwrite, `--dry-run` preview, `--multi-file` output mode, and `--debug`/`--trace` flags
- Shared `collectAgentsDocs()` utility (`src/generation/collector.ts`) — reusable function that walks the project tree and collects all AGENTS.md file contents, used by both root prompt building and the new specify command
- Spec generation prompt templates (`src/specify/prompts.ts`) for specification synthesis from collected documentation
- Spec output writer (`src/specify/writer.ts`) with overwrite protection (`SpecExistsError`) to prevent accidental overwrites
- ETA calculation in progress reporting — directory and root tasks now show estimated time remaining based on elapsed time and completed task ratio
- Cache creation tokens tracked in progress reporting and `FileTaskResult`/`RunSummary` interfaces

### Changed
- `buildRootPrompt()` refactored to use shared `collectAgentsDocs()` instead of inline AGENTS.md collection logic

### Fixed
- `--dry-run` in specify command no longer triggers auto-generation fallback — dry-run check moved before the auto-generate code path
- Removed language-specific `readPackageSection()` from specify prompts (tool is language-agnostic)

## [0.5.5] - 2026-02-09

### Added
- Phantom path detection in generated AGENTS.md files — post-Phase 2 validation scans all directory AGENTS.md for path-like references (`src/...`, `../...`, markdown links) that don't resolve to real files, reporting them as warnings via the inconsistency reporter
- Import map extraction module (`src/imports/`) — regex-based extractor parses TypeScript/JavaScript import statements from source files, classifying them as internal (`./`) or external (`../`) and formatting them as structured text for directory prompts
- Project directory structure context passed to directory AGENTS.md prompts — `buildDirectoryPrompt()` accepts a `projectStructure` parameter so the AI sees the real directory tree

### Changed
- Directory AGENTS.md system prompt includes "Path Accuracy" rules — AI must use only paths from the import map and exact directory names from the project structure, never inventing or renaming module paths
- Directory AGENTS.md system prompt includes "Consistency" rules — prevents self-contradictions within the same document (e.g., describing a technique as "regex-based" then calling it "AST-based")
- `RunSummary` now tracks `phantomPaths` count alongside `inconsistenciesCodeVsDoc` and `inconsistenciesCodeVsCode`
- `InconsistencyReport.counts` includes `phantomPaths` field
- `Inconsistency` union type extended with `PhantomPathInconsistency`

## [0.5.4] - 2026-02-09

### Changed
- File analysis prompts now enforce structured output format — bold purpose statement as first line (`**FileName does X.**`), mandatory exported symbols section, and explicit anti-preamble instructions preventing LLM meta-commentary
- Root CLAUDE.md prompt clarifies scope boundaries — comprehensive project reference with architecture and build instructions, referencing (not duplicating) directory-level AGENTS.md content
- Directory AGENTS.md prompts refocused as navigational indexes — 1-2 sentence per-file and per-subdirectory descriptions, no full architecture sections (those belong in root CLAUDE.md)
- `stripPreamble()` function added to runner — detects and removes common LLM preamble patterns (separator-based and bold-line detection) from AI responses before writing `.sum` files
- `extractPurpose()` now skips LLM preamble lines (e.g., "Now I'll...", "Based on my analysis...") and strips bold markdown wrappers from purpose text

### Removed
- `publicInterface`, `dependencies`, and `patterns` arrays from `SummaryMetadata` type and `.sum` file frontmatter — these fields were unused after adaptive prompt changes in v0.5.2
- `validateFindability()` implementation gutted (returns empty array) since it depended on the removed `publicInterface` metadata; function signature preserved for future re-implementation
- `checkCodeVsDoc()` no longer checks for documented items missing from source code (`missingFromCode` always empty); only undocumented exports are reported

## [0.5.3] - 2026-02-09

### Added
- Runtime root prompt builder (`buildRootPrompt()`) — collects all AGENTS.md files and package.json metadata at runtime, embedding full context directly in the root CLAUDE.md prompt instead of relying on static placeholder text
- `ROOT_SYSTEM_PROMPT` template with anti-hallucination constraints — instructs the LLM to synthesize only from provided AGENTS.md content and never invent features or APIs
- Cache token tracking in telemetry — `cacheReadTokens` and `cacheCreationTokens` fields added to `FileTaskResult`, `RunSummary`, and telemetry logger summary
- Cache statistics display in progress summary — shows cache read/created token counts when prompt caching is active

### Changed
- `clean` command now preserves user-authored AGENTS.md files by checking for `GENERATED_MARKER` before deleting; non-ARE AGENTS.md files are listed as "Preserving user-authored" in output
- Root CLAUDE.md generation moved from static inline prompts in `executor.ts` to runtime prompt building via `buildRootPrompt()` in `runner.ts` Phase 3
- Progress reporter displays effective input tokens (non-cached + cache read) per file and shows separate cache line in run summary
- Plan task count now correctly includes the root CLAUDE.md task (+1 in orchestrator trace event)
- Root doc AI call uses `maxTurns: 1` since all context is embedded in prompt (no tool use needed)

## [0.5.2] - 2026-02-08

### Added
- Project structure context in file analysis — `buildProjectStructure()` builds a compact directory-grouped file listing passed to every file prompt via `projectPlan`, giving the AI bird's-eye context of the entire codebase
- User-defined AGENTS.md preservation — non-ARE AGENTS.md files are renamed to AGENTS.local.md and user content is prepended verbatim above generated content; directory prompt builder also detects user-authored AGENTS.md and includes it as context
- Manifest file detection in directory prompts — `buildDirectoryPrompt` detects package.json, Cargo.toml, go.mod, etc. and adds a "Directory Hints" section indicating package roots
- `.agents` directory and `**/SKILL.md` added to default exclude patterns

### Changed
- File analysis prompts rewritten to be adaptive — instead of a fixed 5-section template (Purpose/Exports/Dependencies/Patterns/Related), prompts now instruct the AI to choose documentation topics most relevant to each specific file
- Directory AGENTS.md prompts rewritten with adaptive sections — instead of a fixed Contents/Subdirectories/How Files Relate template, the AI selects from architecture, stack, structure, patterns, configuration, API surface, and file relationships
- Removed mandatory "Library & Dependency Statistics" and "Common Patterns" prompt sections in favor of adaptive topic selection
- YAML config generation now properly quotes glob patterns containing special characters (`*`, `[`, `]`, etc.) via `yamlScalar()` helper in `loader.ts`
- `writeAgentsMd` now reads existing AGENTS.local.md from previous runs and prepends user content above generated content with a separator
- `GENERATED_MARKER` and `isGeneratedAgentsMd` exported from `agents-md.ts` for reuse in prompt builder
- `update` command now reads GENERATION-PLAN.md for project structure context, matching `generate` behavior

## [0.5.1] - 2026-02-08

### Added
- `--model` option for `generate` and `update` commands — set a default AI model (e.g., `sonnet`, `opus`) at the service level, with per-call override support
- Lock file exclusion patterns — `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, `Cargo.lock`, `poetry.lock`, `composer.lock`, `go.sum`, and `*.lock` added to default exclude patterns
- Dotfile and generated artifact exclusion — `.gitignore`, `.gitattributes`, `.gitkeep`, `.env`, `*.log`, `*.sum` moved from binary extensions to glob-based exclude patterns for correct matching

### Changed
- `clean` command now restores `AGENTS.local.md` → `AGENTS.md` (undoes the rename performed during generation), with restore count reported in summary
- Directory prompt builder now filters child directories against the known plan directories, skipping directories not in the generation plan instead of throwing on missing `AGENTS.md`
- Root doc generation (CLAUDE.md) prompts rewritten to suppress conversational preamble — system prompt enforces raw markdown output only
- Runner strips LLM preamble from root doc output before writing (detects text before first `# ` heading)
- Phase 2 (directory docs) and Phase 3 (root docs) now correctly report `tasksFailed` in trace events instead of always reporting 0

## [0.5.0] - 2026-02-08

### Added
- `clean` command to delete all generated documentation artifacts (`.sum`, `AGENTS.md`, generation plan)
- Shared file discovery function (`src/discovery/run.ts`) consolidating duplicated discovery logic across commands

### Changed
- Major codebase simplification — removed 6,500+ lines of unused or over-engineered code
- Streamlined orchestrator and prompt builder by removing architectural pattern detection layer
- Simplified CLI options: removed `--verbose`, `--quiet`, and deprecated JSON output flags
- Simplified init command by removing inline options parameter
- Enhanced debug logging in prompt building functions for better troubleshooting
- Updated CLI documentation to include `clean` command and remove duplicate options

### Removed
- Token budget system (`chunker`, `counter`, `tracker`) — unused complexity
- Pricing engine and cost estimation (`src/ai/pricing.ts`) — not needed for core functionality
- Architectural pattern detection (`src/generation/detection/`) and complexity analysis
- Supplementary document writers (`STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`, `INTEGRATIONS.md`, `CONCERNS.md`) — per-package documents removed in favor of simpler `AGENTS.md`-only approach
- Chunk and synthesis prompt functions
- Code-vs-doc quality analysis (`extractExports`, `checkCodeVsDoc`)
- File type detection and related metadata from generation process
- `disallowedTools` and `settings` from Claude backend options

## [0.4.11] - 2026-02-08

### Added
- Improved `/bump` command with automatic changelog extraction from git commits (Phase 2: analyzes git log, categorizes changes, extracts concrete details)

### Changed
- Detailed changelog entries added retroactively for v0.4.9 and v0.4.7 (no more "Version bump" placeholders)

### Fixed
- Init command now properly includes `DEFAULT_EXCLUDE_PATTERNS` in generated config.yaml instead of empty patterns array

## [0.4.10] - 2026-02-08

### Added
- `DEFAULT_EXCLUDE_PATTERNS` constant for AI-generated documentation files (AGENTS.md, CLAUDE.md, OPENCODE.md, GEMINI.md)
- Exclusion patterns now applied by default to prevent analyzing AI-generated files

### Changed
- AI subprocess timeout increased from 120s to 300s (5 minutes) for better handling of large files
- Telemetry log retention increased from 10 to 50 runs for better debugging history
- Exclusion patterns moved from `binaryExtensions` to dedicated `patterns` field with proper glob matching
- Enhanced README with detailed configuration documentation
- Improved init command with better default configuration

## [0.4.9] - 2026-02-08

### Added
- File path deduplication in execution plan markdown formatting for cleaner output

### Changed
- Maximum concurrency limit increased from 5 to 10 for better performance on capable systems
- Default concurrency restored from 2 to 5 for balanced resource usage
- Debug logging in subprocess execution commented out for cleaner output (logs still available with `--debug`)

## [0.4.8] - 2026-02-08

### Added
- Subprocess resource management controls — environment variables (`NODE_OPTIONS`, `UV_THREADPOOL_SIZE`, `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`) to limit memory usage and thread spawning in WSL/resource-constrained environments
- Process group termination — `kill(-pid)` ensures entire subprocess tree is terminated, not just parent
- Concurrency default reduced from 5 to 2 for better resource management on WSL/limited environments

### Changed
- Improved subprocess lifecycle management with enhanced cleanup and resource constraints

## [0.4.7] - 2026-02-08

### Added
- Active subprocess tracking with detailed process lifecycle logging
- Enhanced subprocess management with PID tracking and memory usage monitoring
- Detailed logging for subprocess spawn, exit, and resource consumption

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

[Unreleased]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.6.6...v0.7.0
[0.6.6]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.6.5...v0.6.6
[0.6.5]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.6.4...v0.6.5
[0.6.4]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.6.3...v0.6.4
[0.6.3]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.6.2...v0.6.3
[0.6.2]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.5.5...v0.6.0
[0.5.5]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.5.4...v0.5.5
[0.5.4]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.4.11...v0.5.0
[0.4.11]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.4.10...v0.4.11
[0.4.10]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v0.4.9...v0.4.10
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

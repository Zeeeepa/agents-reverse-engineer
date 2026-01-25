# Phase 1: Foundation & Discovery - Context

**Gathered:** 2025-01-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Identify which files to analyze, exclude noise. Users can run the tool and it correctly identifies which files to analyze — skipping gitignore patterns, binaries, vendor directories, and custom exclusions. This phase establishes the CLI foundation but does NOT generate documentation (Phase 2).

</domain>

<decisions>
## Implementation Decisions

### CLI Invocation
- Command names: `agents-reverse` as canonical, `ar` as short alias
- Separate commands: `ar init` (config only) and `ar discover` (analyze files)
- Path argument: `ar discover [path]` — can specify repo path, defaults to pwd
- Git optional: Works on any directory, but warns that some features (gitignore parsing, incremental updates) won't work without git

### Output & Feedback
- Verbose by default: Show each file as it's processed
- `--quiet` flag: Suppress output for scripting/CI use cases
- Excluded files: Summary by default ("42 files excluded..."), `--show-excluded` to list each one
- Human-readable format: Pretty table/text with colors, designed for terminal reading

### Configuration Format
- YAML format: `.agents-reverse/config.yaml`
- Location: Hidden folder (`.agents-reverse/`) to keep project root clean
- Init modes: `ar init` (generate defaults) vs `ar init --interactive` (ask questions)
- Config options: Exclusion patterns + output preferences (colors, verbosity)

### Edge Case Handling
- Symlinks: Skip by default, configurable option to follow
- Large files: Configurable size threshold (default 1MB), skip with warning if exceeded
- Unreadable files: Skip and warn, don't fail the entire run
- Binary detection: Extension-based check first (fast), content-based fallback (like git)

### Claude's Discretion
- Exact color scheme for terminal output
- Progress indicator style (spinner vs dots vs none)
- Default list of vendor directories to exclude
- Binary extension list contents

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-discovery*
*Context gathered: 2025-01-25*

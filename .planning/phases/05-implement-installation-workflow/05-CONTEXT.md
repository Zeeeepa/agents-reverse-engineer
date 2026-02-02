# Phase 5: Installation Workflow - Context

**Gathered:** 2026-02-02
**Status:** Ready for planning

<domain>
## Phase Boundary

CLI installer invoked via `npx agents-reverse` that copies commands and hooks to runtime config directories. Supports interactive prompts for runtime/location selection OR non-interactive flags for CI/scripted installs. Handles Claude Code, OpenCode, and Gemini runtimes.

</domain>

<decisions>
## Implementation Decisions

### Interactive prompts
- Show styled ASCII banner on launch (colored, project name + tagline)
- Use arrow key selection for runtime/location prompts (inquirer-style)
- Support three runtimes: Claude Code, OpenCode, Gemini (plus "all" option)
- Use colored terminal output (cyan prompts, green success, yellow warnings)

### Flag design
- Runtime selection: `--runtime <claude|opencode|gemini|all>`
- Location flags: `-g/--global` and `-l/--local` (short + long forms)
- Uninstall support: `-u/--uninstall` (combined with runtime/location)
- Help: `-h/--help` shows usage, flags, and examples

### File operations
- Skip existing files by default, overwrite with `--force` flag
- Inform user which files were skipped (not silent)
- Prompt user whether to run `are init` after install
- Auto-register hooks in settings.json for global installs
- Write VERSION file to track installed version

### Output & feedback
- Show checkmarks per item: ✓ Installed commands, ✓ Registered hooks, etc.
- Include next steps after success (how to verify with /are:help)
- Verify installed files exist before showing success
- Errors shown with colored symbol: ✗ Error message (red)
- Show both GitHub docs URL and community link post-install

### Claude's Discretion
- Exact ASCII banner design
- Arrow key library choice (inquirer, prompts, or similar)
- Specific error messages and exit codes
- Order of prompts in interactive flow

</decisions>

<specifics>
## Specific Ideas

- Reference implementation: GSD installer (get-shit-done-cc) — similar UX flow
- Should work in CI pipelines when flags provided (non-interactive, proper exit codes)
- Gemini support is new (Phase 4 only implemented Claude Code + OpenCode)

</specifics>

<deferred>
## Deferred Ideas

- Update checker on session start — could be separate phase
- Auto-update mechanism — future enhancement

</deferred>

---

*Phase: 05-implement-installation-workflow*
*Context gathered: 2026-02-02*

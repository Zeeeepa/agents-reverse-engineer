# Phase 3: Incremental Updates - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Update documentation based on git changes — re-analyze only modified files, propagate changes to parent AGENTS.md, handle renamed/deleted files without orphaning old summaries. Full generation remains a separate command.

</domain>

<decisions>
## Implementation Decisions

### State persistence
- Store state in `.agents-reverse/` directory in project root
- Use SQLite for state storage (fast lookups for large repos)
- State file committed to git (team shares same state, avoid duplicate work)
- Track content hash per file in addition to git — detect changes even outside git

### Change detection scope
- Default to committed changes only
- `--uncommitted` flag to include staged and working directory changes
- Baseline is most recent update OR generate run (incremental tracking)
- New files since last run are auto-included for analysis
- Direct changes only — don't follow import chains to re-analyze dependents

### Orphan handling
- Auto-delete .sum files when source file is deleted
- On file rename/move: delete old .sum, regenerate at new path (no rename tracking)
- Auto-delete AGENTS.md when directory has no more source files
- Verbose reporting: list every deleted .sum and AGENTS.md during update

### Update CLI feedback
- Default to per-file progress (show each file as processed)
- Show all files with skip marker for unchanged ones
- Clear message when nothing changed: "No changes detected since last run at [hash]"
- Always show token budget usage after each run

### Claude's Discretion
- SQLite schema design
- Exact git diff parsing approach
- Content hash algorithm choice
- Progress display formatting

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

*Phase: 03-incremental-updates*
*Context gathered: 2026-01-26*

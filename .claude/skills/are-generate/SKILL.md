---
name: are-generate
description: Generate AI-friendly documentation for the entire codebase
---

Generate comprehensive documentation for this codebase using agents-reverse-engineer.

<execution>
Run the generate command in the background and monitor progress in real time.

## Steps

1. **Display version**: Read `.claude/ARE-VERSION` and show the user: `agents-reverse-engineer vX.Y.Z`

2. **Delete stale progress log** (prevents reading leftover data from a previous run):
   ```bash
   rm -f .agents-reverse-engineer/progress.log
   ```

3. **Run the generate command in the background** using `run_in_background: true`:
   ```bash
   npx are generate --backend claude $ARGUMENTS
   ```

4. **Monitor progress by polling** `.agents-reverse-engineer/progress.log`:
   - Wait ~15 seconds (use `sleep 15` in Bash), then use the **Read** tool to read `.agents-reverse-engineer/progress.log` (use the `offset` parameter to read only the last ~20 lines for long files)
   - Show the user a brief progress update (e.g. "32/96 files analyzed, ~12m remaining")
   - Check whether the background task has completed using `TaskOutput` with `block: false`
   - Repeat until the background task finishes
   - **Important**: Keep polling even if progress.log doesn't exist yet (the command takes a few seconds to start writing)

5. **On completion**, read the full background task output and summarize:
   - Number of files analyzed and any failures
   - Number of directories documented
   - Any inconsistency warnings from the quality report

This executes a two-phase pipeline:

1. **File Analysis** (concurrent): Discovers files, applies filters, then analyzes each source file via AI and writes `.sum` summary files with YAML frontmatter (`content_hash`, `file_type`, `purpose`, `public_interface`, `dependencies`, `patterns`).

2. **Directory Aggregation** (sequential): Generates `AGENTS.md` per directory in post-order traversal (deepest first, so child summaries feed into parents), and writes `CLAUDE.md` pointers.

**Options:**
- `--dry-run`: Preview the plan without making AI calls
- `--eval`: Namespace output by backend.model for side-by-side comparison (e.g., `file.ts.claude.haiku.sum`, `AGENTS.claude.haiku.md`)
- `--concurrency N`: Control number of parallel AI calls (default: auto)
- `--fail-fast`: Stop on first file analysis failure
- `--debug`: Show AI prompts and backend details
- `--trace`: Enable concurrency tracing to `.agents-reverse-engineer/traces/`
</execution>

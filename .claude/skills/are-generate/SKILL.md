---
name: are-generate
description: Generate AI-friendly documentation for the entire codebase
---

Generate comprehensive documentation for this codebase using agents-reverse-engineer.

<execution>
Run the generate command in the background and monitor progress in real time.

## Steps

1. **Clear stale progress log** (if it exists):
   ```bash
   rm -f .agents-reverse-engineer/progress.log
   ```

2. **Run the generate command in the background** using `run_in_background: true`:
   ```bash
   npx agents-reverse-engineer@latest generate $ARGUMENTS
   ```

3. **Monitor progress by polling** `.agents-reverse-engineer/progress.log`:
   - Every ~15 seconds, use Bash `tail -5 .agents-reverse-engineer/progress.log` to read the latest lines
   - Show the user a brief progress update (e.g. "32/96 files analyzed, ~12m remaining")
   - Check whether the background task has completed using `TaskOutput` with `block: false`
   - Repeat until the background task finishes
   - **Important**: Keep polling even if progress.log doesn't exist yet (the command takes a few seconds to start writing)

4. **On completion**, read the full background task output and summarize:
   - Number of files analyzed and any failures
   - Number of directories documented
   - Root and per-package documents generated
   - Any inconsistency warnings from the quality report

This executes a three-phase pipeline:

1. **Discovery & Planning**: Walks the directory tree, applies filters (gitignore, vendor, binary, custom), detects file types, and creates a generation plan.

2. **File Analysis** (concurrent): Analyzes each source file via AI and writes `.sum` summary files with YAML frontmatter (`content_hash`, `file_type`, `purpose`, `public_interface`, `dependencies`, `patterns`).

3. **Directory & Root Documents** (sequential):
   - Generates `AGENTS.md` per directory in post-order traversal (deepest first, so child summaries feed into parents)
   - Creates root document: `CLAUDE.md`

**Options:**
- `--dry-run`: Preview the plan without making AI calls
- `--concurrency N`: Control number of parallel AI calls (default: auto)
- `--fail-fast`: Stop on first file analysis failure
- `--debug`: Show AI prompts and backend details
- `--trace`: Enable concurrency tracing to `.agents-reverse-engineer/traces/`
</execution>

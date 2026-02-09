---
status: complete
phase: 10-specify-command
source: [10-01-SUMMARY.md, 10-02-SUMMARY.md, 10-03-SUMMARY.md]
started: 2026-02-09T11:30:00Z
updated: 2026-02-09T11:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Specify command appears in CLI help
expected: Running `node dist/cli/index.js --help` shows `specify` in the command list with description and lists --output, --multi-file, --dry-run flags
result: pass

### 2. Dry-run shows statistics without generating anything
expected: Running `are specify --dry-run` shows AGENTS.md file count, estimated tokens, output path, and mode — without making any AI calls or generating .sum files
result: pass

### 3. Dry-run with no AGENTS.md warns instead of generating
expected: On a project with no AGENTS.md files, `are specify --dry-run` shows "0" AGENTS.md files and a warning to run generate first — does NOT auto-generate or create .sum files
result: pass

### 4. Generate command still works after collector refactor
expected: Running `are generate --dry-run` still shows the execution plan correctly — the collector refactor (Plan 01) did not break existing behavior
result: pass

### 5. Overwrite protection blocks without --force
expected: If specs/SPEC.md already exists, running `are specify` (without --force) fails with an error about existing file. Running with `--force` would overwrite.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0

## Gaps

[none]

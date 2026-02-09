---
status: complete
phase: 11-rebuild-command
source: [11-01-SUMMARY.md, 11-02-SUMMARY.md]
started: 2026-02-09T20:00:00Z
updated: 2026-02-09T20:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Rebuild command in CLI help
expected: Running `are --help` (or `node dist/cli/index.js --help`) lists `rebuild` as an available command with a brief description.
result: pass

### 2. Rebuild command usage info
expected: Running `are rebuild --help` (or `node dist/cli/index.js rebuild --help`) shows usage with available flags: --output, --force, --dry-run, --concurrency, --fail-fast, --debug, --trace.
result: pass

### 3. TypeScript compiles clean
expected: Running `npx tsc --noEmit` completes with no errors. All rebuild module files compile: types.ts, spec-reader.ts, output-parser.ts, checkpoint.ts, prompts.ts, orchestrator.ts, index.ts.
result: pass

### 4. Dry-run shows execution plan
expected: Running `are rebuild --dry-run` (with specs/ directory containing spec files) displays a plan showing rebuild units grouped by order, file counts, and does NOT make any AI calls or write output files.
result: pass

### 5. Rebuild handles missing specs gracefully
expected: Running `are rebuild --dry-run` without a specs/ directory shows a clear error message (not a crash/stack trace) indicating spec files are missing.
result: pass

### 6. Unit tests pass
expected: Running `npm test` passes all tests including any rebuild-related tests. No test failures.
result: pass

### 7. Checkpoint resume on re-run
expected: After a rebuild run creates a checkpoint file, running `are rebuild` again resumes from where it left off (skips already-completed units) rather than starting over.
result: pass

### 8. Force flag resets checkpoint
expected: Running `are rebuild --force` ignores any existing checkpoint and starts the rebuild from scratch, re-processing all units.
result: pass

### 9. Custom output directory
expected: Running `are rebuild --output custom-dir` writes reconstructed files to `custom-dir/` instead of the default `rebuild/` directory.
result: pass

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0

## Gaps

[none]

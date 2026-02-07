---
status: complete
phase: 07-orchestration-commands
source: [07-01-SUMMARY.md, 07-02-SUMMARY.md, 07-03-SUMMARY.md]
started: 2026-02-07T14:00:00Z
updated: 2026-02-07T16:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Generate Dry-Run Shows Execution Plan
expected: Running `npx are generate --dry-run` displays an execution plan summary (file count, directories, root docs, estimated AI calls) without requiring an AI CLI installed. No actual AI analysis runs.
result: pass

### 2. Generate Executes AI Analysis Directly
expected: Running `npx are generate` on a project spawns AI CLI subprocesses and produces .sum files and AGENTS.md output directly — without outputting a plan for a host LLM to execute.
result: pass

### 3. Generate Shows Streaming Progress
expected: During `are generate`, the terminal shows streaming progress output: current file name being processed, X of Y complete count, and estimated time remaining (ETA appears after 2+ files complete).
result: pass

### 4. Generate Shows Run Summary
expected: After `are generate` completes, a summary line is printed showing total AI calls, total tokens (input/output), total elapsed time, and error count.
result: pass

### 5. CLI Flags Accepted
expected: Running `npx are generate --concurrency 3 --fail-fast --debug --dry-run` is accepted without errors. The --concurrency flag limits parallelism, --fail-fast stops on first error, --debug enables verbose output.
result: pass

### 6. Deprecated Flags Show Warning
expected: Running with `--execute` or `--stream` flags prints a deprecation notice to stderr while still functioning. The notice goes to stderr (not stdout) to preserve JSON output.
result: pass

### 7. Update Executes AI Analysis on Changed Files
expected: Running `npx are update` after making a file change analyzes only the changed files via the AI service (not all files). Produces updated .sum files with real AI-generated content replacing "Analysis Pending" placeholders.
result: pass

### 8. Update Shows Progress and Summary
expected: During `are update`, streaming progress shows per-file timing and token counts. After completion, a run summary prints total calls, tokens, time, and error count — same format as generate.
result: pass

### 9. No AI CLI Gives Clear Error
expected: When no supported AI CLI (e.g., claude) is installed or on PATH, running `are generate` prints a clear error message with installation instructions instead of crashing with a stack trace.
result: pass

### 10. Exit Codes Are Correct
expected: Commands exit with code 0 on full success, 1 on partial failure (some files failed), and 2 on total failure or when no AI CLI is found.
result: pass

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]

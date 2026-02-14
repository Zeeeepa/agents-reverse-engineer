# The Two-Phase Pipeline: How ARE Understands Your Codebase

When you run `are generate`, you see progress bars ticking through files and directories. But what's happening under the hood? This article takes you inside the pipeline that transforms raw source code into comprehensive, AI-friendly documentation.

## Why Two Phases?

The fundamental insight behind ARE's architecture is simple: **you can't summarize a directory without first understanding the files in it.**

Consider a typical project structure with `src/auth/` containing `login.ts`, `logout.ts`, and `session.ts`. To write a meaningful summary of `src/auth/`, ARE needs to know what each file does. This requires analyzing files first, then aggregating them into directory summaries.

This is **post-order traversal**: process children before parents, leaves before branches. Phase 1 handles the leaves (individual files), Phase 2 builds the branches (directory hierarchies).

The alternative—trying to analyze everything in one pass—would require massive context windows including entire subdirectories (expensive and error-prone) or produce shallow summaries missing important relationships.

## Phase 1: File Analysis

Phase 1 develops understanding of individual source files. The `createFileTasks()` function extracts import/export metadata for each file, then `buildFilePrompt()` constructs a carefully crafted prompt including source code, import map, export map, project structure context, and compression directives when needed.

Tasks execute via `runPool()`, ARE's iterator-based concurrency engine. Multiple files are analyzed in parallel, with concurrency automatically tuned to your system's capabilities.

After a prompt is built, the original task content is nullified to free memory—critical on large codebases with thousands of files.

Each successful analysis produces a `.sum` file with YAML frontmatter including `file_type`, `generated_at`, and `content_hash`—which enables incremental updates by detecting when source files change.

## Phase 2: Directory Aggregation

With all files analyzed, Phase 2 builds the hierarchical view. The `createDirectoryTasks()` function constructs a dependency graph where each directory task knows which child tasks must complete before it can run.

Directories are sorted by depth, **descending**—deepest directories process first. This ensures `src/auth/utils/` completes before `src/auth/`, which completes before `src/`.

The `buildDirectoryPrompt()` reads all child `.sum` files in parallel and feeds them to the LLM for synthesis.

## The Concurrency Engine

Both phases use `runPool<T>()`, an **iterator-based worker pool**. Workers pull tasks from a **shared iterator**—when one finishes early, it immediately grabs the next task, maintaining full utilization despite variable task durations.

## Error Handling

ARE's retry logic is surgical. Rate limit errors trigger exponential backoff plus random jitter to prevent thundering herd problems.

Crucially, **timeouts are NOT retried**. Retrying would spawn more expensive subprocesses on an already-strained system.

## What This Enables

The two-phase architecture unlocks: **Incremental Updates** regenerate only affected files and parent directories, **Quality Validation** detects undocumented exports between phases, **Scalability** processes thousands of files without memory issues, **Observability** provides natural instrumentation boundaries.

# Rebuilding from Specs: ARE's Code Reconstruction Pipeline

Documentation tools typically operate in one direction: they extract information from your codebase and produce documentation. agents-reverse-engineer goes further. The `are rebuild` command takes project specifications and reconstructs source code, completing the full circle from code to documentation and back.

This experimental feature challenges the traditional relationship between specification and implementation, opening new possibilities for development workflows.

## When Would You Use This?

Several compelling scenarios make the rebuild pipeline invaluable:

**Scaffolding from specifications.** When you've documented an architecture but haven't implemented it, `are rebuild` generates a working starting point. This proves particularly useful when exploring multiple implementation approaches to the same architectural design.

**Framework migration.** Modify your specification to reference a new framework, adjust architectural decisions accordingly, and use `are rebuild` to generate migration scaffolding. The specification becomes the invariant; implementation becomes the variable.

**Disaster recovery.** Lost source code but retained specifications? `are rebuild` reconstructs a working implementation, dramatically reducing recovery time from catastrophic data loss.

**Exploring alternatives.** What would your microservices architecture look like as a monolith? Modify specifications, run `are rebuild`, and rapidly explore architectural alternatives without manual rewriting.

## How It Works

The rebuild pipeline orchestrates a multi-stage transformation from specification to implementation.

### Discovery and Parsing

The process begins with `readSpecFiles()` discovering markdown files in `specs/`. Then `partitionSpec()` extracts Build Plan phases using `/^### Phase (\d+):\s*(.+)$/gm` to find headings defining sequential build phases.

### Checkpoint Validation

Before generation, `CheckpointManager.load()` checks `.rebuild-checkpoint` tracking completed phases and SHA-256 hashes of specification files.

### Orchestrated Execution

With checkpoint validated, `executeRebuild()` begins generation. It groups rebuild units by `order`, creating sequential groups. Within groups, tasks run concurrently using `runPool()` concurrency.

## The Rebuild Prompt

The `buildRebuildPrompt()` function includes your project's Architecture section from AGENTS.md, extracts relevant subsections, and accumulates a `builtContext` buffer capped at 100KB for later phases to reference earlier output.

## Output Parsing

AI-generated code uses strict delimiter format:

```
===FILE: src/models/user.ts===
export interface User {
  id: string;
  name: string;
}
===END_FILE===
```

If delimiters aren't found, ARE falls back to fenced code block parsing.

## Limitations

AI-generated code requires review—treat output as scaffolding, not production code. Specification quality is critical. The 100KB context cap means large projects lose visibility into earlier files. Not all code is rebuildable from specifications alone.

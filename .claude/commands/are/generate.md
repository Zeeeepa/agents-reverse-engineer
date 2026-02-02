---
name: are:generate
description: Generate AI-friendly documentation for the entire codebase
argument-hint: "[--budget N] [--dry-run]"
---

Generate comprehensive documentation for this codebase using agents-reverse-engineer.

<execution>
## Phase 0: Check for Existing Plan

First, check if a resumable plan exists:

```bash
cat .agents-reverse-engineer/GENERATION-PLAN.md 2>/dev/null | head -20
```

**If NO plan exists**: Run `/are:discover` first to create the GENERATION-PLAN.md, then return here.

**If plan exists**: Continue to **Resume Execution** below.

## Resume Execution

Read `.agents-reverse-engineer/GENERATION-PLAN.md` and find unchecked tasks (`- [ ]`).

### For Each Unchecked File Task:

1. **Spawn ONE subagent PER FILE** (Task tool with model="sonnet") to:
   - Read the source file
   - Generate summary following guidelines below
   - Write the .sum file using the Write tool
   - **VERIFY**: Read back the .sum file to confirm it was written correctly
   - Report success/failure

2. **Mark complete** in the plan file: change `- [ ]` to `- [x]` (only after verification)

3. **Parallel execution**: Spawn all file tasks in parallel (one agent per file) for maximum efficiency and easy resumption

### Subagent Prompt Template:

```
Analyze and document this file:
1. Read: <file_path>
2. Generate .sum content following the format below
3. Write to: <file_path>.sum
4. Verify: Read back the .sum file to confirm success
5. Report: "SUCCESS: <file_path>.sum created" or "FAILED: <reason>"
```

### .sum File Format

```
---
file_type: <generic|type|config|test|component|service|api|hook|model|schema>
generated_at: <ISO timestamp>
---

## Purpose
<1-2 sentence description of what this file does>

## Public Interface
<exported functions, classes, types with brief descriptions>

## Dependencies
<key imports and what they're used for>

## Implementation Notes
<important patterns, algorithms, or gotchas>
```

### After All Files Complete, Generate AGENTS.md (Post-Order Traversal):

Process directories from **deepest to shallowest** so child AGENTS.md files exist before parent directories are documented.

For each directory (in post-order):
1. Verify ALL .sum files exist for that directory
2. Read all .sum files in the directory
3. **Read AGENTS.md from any subdirectories** (already generated due to post-order)
4. Generate AGENTS.md with:
   - Directory description synthesized from file summaries
   - Files grouped by purpose (Types, Services, Utils, etc.)
   - Subdirectories section listing child directories with descriptions
5. Mark the directory task complete in the plan

### After All Directories Complete:

Generate root documents:

1. **CLAUDE.md** - Synthesize all AGENTS.md into project overview
2. **ARCHITECTURE.md** - Document system architecture
3. **STACK.md** - Document technology stack from package.json

## Completion

After all tasks complete:

- Report number of files analyzed
- Report number of directories documented
- Mark plan as complete (change header to show ✓ COMPLETE)
</execution>

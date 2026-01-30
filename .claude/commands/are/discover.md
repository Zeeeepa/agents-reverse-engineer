---
name: are:discover
description: Discover files and create execution plan (GENERATION-PLAN.md)
argument-hint: "[path] [--show-excluded]"
---

Discover files to analyze and create the GENERATION-PLAN.md for documentation generation.

<execution>
## Step 1: Run Discovery

```bash
npx are discover $ARGUMENTS
```

Note the file count from the output.

### Common Options

- `--show-excluded` - Show excluded files with reasons (gitignore, vendor, binary, custom pattern)
- `--quiet` - Only show the summary count

## Step 2: Get Execution Plan

```bash
npx are generate --execute
```

This outputs JSON with file tasks, directory tasks, and root document tasks.

## Step 3: Create GENERATION-PLAN.md

Create `.agents-reverse-engineer/GENERATION-PLAN.md` with this structure:

```markdown
# Documentation Generation Plan

Generated: <today's date>
Project: <project path>

## Summary

- **Total Tasks**: <count>
- **File Tasks**: <count>
- **Directory Tasks**: <count>
- **Root Tasks**: 3

---

## Phase 1: File Analysis

### <directory>/ (<N> files)

- [ ] `<file_path>`
- [ ] `<file_path>`
      ...

(Group files by their parent directory)

---

## Phase 2: Directory AGENTS.md (<N> directories)

- [ ] `<dir>/AGENTS.md`
- [ ] `<dir>/AGENTS.md`
      ...
- [ ] `./AGENTS.md` (root)

---

## Phase 3: Root Documents

- [ ] `CLAUDE.md`
- [ ] `ARCHITECTURE.md`
- [ ] `STACK.md`
```

## Output

Report:

- Number of files discovered
- Path to GENERATION-PLAN.md
- Suggest running `/are:generate` to execute the plan
  </execution>

---
name: are:discover
description: Discover files in codebase
argument-hint: "[path] [--plan] [--show-excluded] [--quiet]"
---

List files that would be analyzed for documentation.

<execution>
**CRITICAL**: Run this command EXACTLY as shown. Do NOT add any flags unless the user explicitly provided them in $ARGUMENTS.

```bash
npx are discover $ARGUMENTS
```

If $ARGUMENTS is empty, run: `npx are discover` (with NO additional flags)

Available flags (ONLY use if user requested):
- `--plan` - Generate GENERATION-PLAN.md
- `--show-excluded` - Show excluded files
- `--quiet` - Summary only

After completion: Report number of files found.
</execution>

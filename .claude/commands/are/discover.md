---
name: are:discover
description: Discover files in codebase
argument-hint: "[path] [--plan] [--show-excluded] [--quiet]"
---

List files that would be analyzed for documentation.

<execution>
## STRICT RULES - VIOLATION IS FORBIDDEN

1. Run ONLY this exact command: `npx are discover $ARGUMENTS`
2. DO NOT add `--plan` unless user typed `--plan`
3. DO NOT add ANY flags the user did not explicitly type
4. If user typed nothing after `/are:discover`, run with ZERO flags

```bash
npx are discover $ARGUMENTS
```

Report number of files found.
</execution>

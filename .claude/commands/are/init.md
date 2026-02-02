---
name: are:init
description: Initialize agents-reverse-engineer configuration and integration
argument-hint: "[--integration <name>]"
---

Initialize agents-reverse-engineer in this project.

<execution>
Run the agents-reverse-engineer init command:

```bash
npx are init $ARGUMENTS
```

This creates:
- `.agents-reverse-engineer.yaml` configuration file
- With `--integration <name>`: command files for the specified AI assistant (claude, opencode, gemini)
</execution>

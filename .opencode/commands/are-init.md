---
description: Initialize agents-reverse-engineer configuration and integration
agent: build
---

Initialize agents-reverse-engineer in this project.

Run: `npx are init $ARGUMENTS`

Arguments supported:
- `--integration <name>` - Also install command files for specified AI assistant (claude, opencode, gemini)

This creates:
- `.agents-reverse-engineer.yaml` configuration file
- With `--integration`: command files for the specified AI assistant

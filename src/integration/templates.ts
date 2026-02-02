/**
 * Template generators for AI coding assistant integration files
 *
 * Generates command file templates for Claude Code, OpenCode, and session hooks.
 */

import type { IntegrationTemplate } from './types.js';

/**
 * Get Claude Code command file templates
 *
 * Returns templates for:
 * - generate.md: Full documentation generation command
 * - update.md: Incremental documentation update command
 * - init.md: Initialize agents-reverse-engineer in a project
 *
 * @returns Array of Claude Code command templates
 */
export function getClaudeTemplates(): IntegrationTemplate[] {
  return [
    {
      filename: 'generate.md',
      path: '.claude/commands/are/generate.md',
      content: `---
name: are:generate
description: Generate AI-friendly documentation for the entire codebase
argument-hint: "[--budget N] [--dry-run]"
---

Generate comprehensive documentation for this codebase using agents-reverse-engineer.

<execution>
## Phase 0: Check for Existing Plan

First, check if a resumable plan exists:

\`\`\`bash
cat .agents-reverse-engineer/GENERATION-PLAN.md 2>/dev/null | head -20
\`\`\`

**If NO plan exists**: Run \`/are:discover\` first to create the GENERATION-PLAN.md, then return here.

**If plan exists**: Continue to **Resume Execution** below.

## Resume Execution

Read \`.agents-reverse-engineer/GENERATION-PLAN.md\` and find unchecked tasks (\`- [ ]\`).

### For Each Unchecked File Task:

1. **Spawn ONE subagent PER FILE** (Task tool with model="sonnet") to:
   - Read the source file
   - Generate summary following guidelines below
   - Write the .sum file using the Write tool
   - **VERIFY**: Read back the .sum file to confirm it was written correctly
   - Report success/failure

2. **Mark complete** in the plan file: change \`- [ ]\` to \`- [x]\` (only after verification)

3. **Parallel execution**: Spawn all file tasks in parallel (one agent per file) for maximum efficiency and easy resumption

### Subagent Prompt Template:

\`\`\`
Analyze and document this file:
1. Read: <file_path>
2. Generate .sum content following the format below
3. Write to: <file_path>.sum
4. Verify: Read back the .sum file to confirm success
5. Report: "SUCCESS: <file_path>.sum created" or "FAILED: <reason>"
\`\`\`

### .sum File Format

\`\`\`
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
\`\`\`

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
`,
    },
    {
      filename: 'update.md',
      path: '.claude/commands/are/update.md',
      content: `---
name: are:update
description: Incrementally update documentation for changed files
argument-hint: "[--uncommitted] [--dry-run] [--verbose]"
---

Update documentation for files that changed since last run.

<execution>
Run the agents-reverse-engineer update command:

\`\`\`bash
npx agents-reverse-engineer@latest update $ARGUMENTS
\`\`\`

After completion, summarize:
- Files updated
- Files unchanged
- Any orphaned docs cleaned up

Use \`--uncommitted\` to include staged but uncommitted changes.
</execution>
`,
    },
    {
      filename: 'init.md',
      path: '.claude/commands/are/init.md',
      content: `---
name: are:init
description: Initialize agents-reverse-engineer configuration
---

Initialize agents-reverse-engineer configuration in this project.

<execution>
Run the agents-reverse-engineer init command:

\`\`\`bash
npx agents-reverse-engineer@latest init
\`\`\`

This creates \`.agents-reverse-engineer.yaml\` configuration file.

To install commands and hooks, use the interactive installer:

\`\`\`bash
npx agents-reverse-engineer install
\`\`\`
</execution>
`,
    },
    {
      filename: 'discover.md',
      path: '.claude/commands/are/discover.md',
      content: `---
name: are:discover
description: Discover files to analyze (use --plan to create GENERATION-PLAN.md)
argument-hint: "[path] [--plan] [--show-excluded]"
---

Discover files that will be analyzed for documentation.

<execution>
Run the agents-reverse-engineer discover command with EXACTLY the arguments provided by the user:

\`\`\`bash
npx agents-reverse-engineer@latest discover $ARGUMENTS
\`\`\`

**IMPORTANT**: Do NOT add flags that the user did not request. Pass $ARGUMENTS exactly as provided.

Options (only use if user requests):
- \`--plan\` - Generate GENERATION-PLAN.md file
- \`--show-excluded\` - Show excluded files with reasons
- \`--quiet\` - Only show the summary count

After completion, summarize what was done based on the flags actually used.
</execution>
`,
    },
    {
      filename: 'clean.md',
      path: '.claude/commands/are/clean.md',
      content: `---
name: are:clean
description: Delete all generated documentation artifacts (.sum, AGENTS.md, plan)
argument-hint: "[--dry-run]"
---

Remove all documentation artifacts generated by agents-reverse-engineer.

<execution>
## What Gets Deleted

1. **Plan file**: \`.agents-reverse-engineer/GENERATION-PLAN.md\`
2. **Summary files**: All \`*.sum\` files
3. **Directory docs**: All \`AGENTS.md\` files
4. **Root docs**: \`CLAUDE.md\`, \`ARCHITECTURE.md\`, \`STACK.md\`

## Dry Run (Preview)

First, show what would be deleted:

\`\`\`bash
echo "=== Files to delete ===" && \\
find . -name "*.sum" -not -path "./node_modules/*" -not -path "./.git/*" 2>/dev/null && \\
find . -name "AGENTS.md" -not -path "./node_modules/*" -not -path "./.git/*" 2>/dev/null && \\
ls -la CLAUDE.md ARCHITECTURE.md STACK.md .agents-reverse-engineer/GENERATION-PLAN.md 2>/dev/null || true
\`\`\`

Report the count of files that would be deleted.

If user passed \`--dry-run\`, stop here.

## Execute Deletion

After confirming with the user (or if no --dry-run flag):

\`\`\`bash
find . -name "*.sum" -not -path "./node_modules/*" -not -path "./.git/*" -delete 2>/dev/null
find . -name "AGENTS.md" -not -path "./node_modules/*" -not -path "./.git/*" -delete 2>/dev/null
rm -f CLAUDE.md ARCHITECTURE.md STACK.md
rm -f .agents-reverse-engineer/GENERATION-PLAN.md
\`\`\`

Report:
- Number of .sum files deleted
- Number of AGENTS.md files deleted
- Root documents deleted
- Plan file deleted

Suggest running \`/are:discover\` to start fresh.
</execution>
`,
    },
    {
      filename: 'help.md',
      path: '.claude/commands/are/help.md',
      content: `---
name: are:help
description: Show available ARE commands and usage guide
---

Show help for agents-reverse-engineer commands.

<execution>
Display the following help information:

## agents-reverse-engineer (ARE) Commands

| Command | Description |
|---------|-------------|
| \`/are:help\` | Show this help message |
| \`/are:init\` | Initialize configuration file |
| \`/are:discover\` | Discover files and create GENERATION-PLAN.md |
| \`/are:generate\` | Generate documentation from the plan |
| \`/are:update\` | Update docs for changed files only |
| \`/are:clean\` | Remove all generated documentation |

## Typical Workflow

1. **\`/are:init\`** — Create \`.agents-reverse-engineer/config.yaml\`
2. **\`/are:discover\`** — Scan codebase, create \`GENERATION-PLAN.md\`
3. **\`/are:generate\`** — Execute plan, generate \`.sum\` and \`AGENTS.md\` files
4. **\`/are:update\`** — After code changes, update only what changed

## Generated Files

- \`*.sum\` — Per-file summaries (purpose, exports, dependencies)
- \`AGENTS.md\` — Per-directory overviews
- \`CLAUDE.md\` — Project entry point
- \`ARCHITECTURE.md\` — System design overview
- \`STACK.md\` — Technology stack

## More Info

- Docs: https://github.com/GeoloeG-IsT/agents-reverse-engineer
- Update: \`npx agents-reverse-engineer@latest\`
</execution>
`,
    },
  ];
}

/**
 * Get OpenCode command file templates
 *
 * Returns templates for:
 * - are-generate.md: Full documentation generation command
 * - are-update.md: Incremental documentation update command
 *
 * @returns Array of OpenCode command templates
 */
export function getOpenCodeTemplates(): IntegrationTemplate[] {
  return [
    {
      filename: 'are-generate.md',
      path: '.opencode/commands/are-generate.md',
      content: `---
description: Generate AI-friendly documentation for the entire codebase
agent: build
---

Generate comprehensive documentation for this codebase using agents-reverse-engineer.

Run: \`npx agents-reverse-engineer@latest generate $ARGUMENTS\`

Arguments supported:
- \`--budget N\` - Override token budget
- \`--dry-run\` - Show plan without writing files
- \`--verbose\` - Show detailed output
`,
    },
    {
      filename: 'are-update.md',
      path: '.opencode/commands/are-update.md',
      content: `---
description: Incrementally update documentation for changed files
agent: build
---

Update documentation for files that changed since last run.

Run: \`npx agents-reverse-engineer@latest update $ARGUMENTS\`

Arguments supported:
- \`--uncommitted\` - Include staged but uncommitted changes
- \`--dry-run\` - Show plan without writing files
- \`--verbose\` - Show detailed output
`,
    },
    {
      filename: 'are-discover.md',
      path: '.opencode/commands/are-discover.md',
      content: `---
description: Discover files to analyze (use --plan to create GENERATION-PLAN.md)
agent: build
---

Discover files that will be analyzed for documentation.

Run: \`npx agents-reverse-engineer@latest discover $ARGUMENTS\`

**IMPORTANT**: Pass $ARGUMENTS exactly as provided. Do NOT add flags the user did not request.

Options (only use if user requests):
- \`--plan\` - Generate GENERATION-PLAN.md file
- \`--show-excluded\` - Show excluded files with reasons
- \`--quiet\` - Only show the summary count
`,
    },
    {
      filename: 'are-clean.md',
      path: '.opencode/commands/are-clean.md',
      content: `---
description: Delete all generated documentation artifacts (.sum, AGENTS.md, plan)
agent: build
---

Remove all documentation artifacts generated by agents-reverse-engineer.

Run: \`npx agents-reverse-engineer@latest clean $ARGUMENTS\`

Arguments supported:
- \`--dry-run\` - Preview what would be deleted without deleting
`,
    },
    {
      filename: 'are-init.md',
      path: '.opencode/commands/are-init.md',
      content: `---
description: Initialize agents-reverse-engineer configuration
agent: build
---

Initialize agents-reverse-engineer configuration in this project.

Run: \`npx agents-reverse-engineer@latest init\`

This creates \`.agents-reverse-engineer.yaml\` configuration file.

To install commands and hooks, use the interactive installer:
\`npx agents-reverse-engineer install\`
`,
    },
    {
      filename: 'are-help.md',
      path: '.opencode/commands/are-help.md',
      content: `---
description: Show available ARE commands and usage guide
agent: build
---

## agents-reverse-engineer (ARE) Commands

| Command | Description |
|---------|-------------|
| \`/are-help\` | Show this help message |
| \`/are-init\` | Initialize configuration file |
| \`/are-discover\` | Discover files and create GENERATION-PLAN.md |
| \`/are-generate\` | Generate documentation from the plan |
| \`/are-update\` | Update docs for changed files only |
| \`/are-clean\` | Remove all generated documentation |

## Typical Workflow

1. **\`/are-init\`** — Create \`.agents-reverse-engineer/config.yaml\`
2. **\`/are-discover\`** — Scan codebase, create \`GENERATION-PLAN.md\`
3. **\`/are-generate\`** — Execute plan, generate \`.sum\` and \`AGENTS.md\` files
4. **\`/are-update\`** — After code changes, update only what changed

## More Info

Docs: https://github.com/GeoloeG-IsT/agents-reverse-engineer
`,
    },
  ];
}

/**
 * Get Gemini CLI command file templates
 *
 * Returns templates for:
 * - are-generate.md: Full documentation generation command
 * - are-update.md: Incremental documentation update command
 * - are-discover.md: Discover files and create execution plan
 * - are-clean.md: Delete generated documentation artifacts
 *
 * @returns Array of Gemini CLI command templates
 */
export function getGeminiTemplates(): IntegrationTemplate[] {
  return [
    {
      filename: 'are-generate.md',
      path: '.gemini/commands/are-generate.md',
      content: `---
description: Generate AI-friendly documentation for the entire codebase
---

Generate comprehensive documentation for this codebase using agents-reverse-engineer.

Run: \`npx agents-reverse-engineer@latest generate $ARGUMENTS\`

Arguments supported:
- \`--budget N\` - Override token budget
- \`--dry-run\` - Show plan without writing files
- \`--verbose\` - Show detailed output
`,
    },
    {
      filename: 'are-update.md',
      path: '.gemini/commands/are-update.md',
      content: `---
description: Incrementally update documentation for changed files
---

Update documentation for files that changed since last run.

Run: \`npx agents-reverse-engineer@latest update $ARGUMENTS\`

Arguments supported:
- \`--uncommitted\` - Include staged but uncommitted changes
- \`--dry-run\` - Show plan without writing files
- \`--verbose\` - Show detailed output
`,
    },
    {
      filename: 'are-discover.md',
      path: '.gemini/commands/are-discover.md',
      content: `---
description: Discover files to analyze (use --plan to create GENERATION-PLAN.md)
---

Discover files that will be analyzed for documentation.

Run: \`npx agents-reverse-engineer@latest discover $ARGUMENTS\`

**IMPORTANT**: Pass $ARGUMENTS exactly as provided. Do NOT add flags the user did not request.

Options (only use if user requests):
- \`--plan\` - Generate GENERATION-PLAN.md file
- \`--show-excluded\` - Show excluded files with reasons
- \`--quiet\` - Only show the summary count
`,
    },
    {
      filename: 'are-clean.md',
      path: '.gemini/commands/are-clean.md',
      content: `---
description: Delete all generated documentation artifacts (.sum, AGENTS.md, plan)
---

Remove all documentation artifacts generated by agents-reverse-engineer.

Run: \`npx agents-reverse-engineer@latest clean $ARGUMENTS\`

Arguments supported:
- \`--dry-run\` - Preview what would be deleted without deleting
`,
    },
    {
      filename: 'are-init.md',
      path: '.gemini/commands/are-init.md',
      content: `---
description: Initialize agents-reverse-engineer configuration
---

Initialize agents-reverse-engineer configuration in this project.

Run: \`npx agents-reverse-engineer@latest init\`

This creates \`.agents-reverse-engineer.yaml\` configuration file.

To install commands and hooks, use the interactive installer:
\`npx agents-reverse-engineer install\`
`,
    },
    {
      filename: 'are-help.md',
      path: '.gemini/commands/are-help.md',
      content: `---
description: Show available ARE commands and usage guide
---

## agents-reverse-engineer (ARE) Commands

| Command | Description |
|---------|-------------|
| \`/are-help\` | Show this help message |
| \`/are-init\` | Initialize configuration file |
| \`/are-discover\` | Discover files and create GENERATION-PLAN.md |
| \`/are-generate\` | Generate documentation from the plan |
| \`/are-update\` | Update docs for changed files only |
| \`/are-clean\` | Remove all generated documentation |

## Typical Workflow

1. **\`/are-init\`** — Create \`.agents-reverse-engineer/config.yaml\`
2. **\`/are-discover\`** — Scan codebase, create \`GENERATION-PLAN.md\`
3. **\`/are-generate\`** — Execute plan, generate \`.sum\` and \`AGENTS.md\` files
4. **\`/are-update\`** — After code changes, update only what changed

## More Info

Docs: https://github.com/GeoloeG-IsT/agents-reverse-engineer
`,
    },
  ];
}

/**
 * Get session-end hook template for automatic documentation updates
 *
 * The hook:
 * - Checks ARE_DISABLE_HOOK env var for temporary disable
 * - Checks config file for permanent disable (hook_enabled: false)
 * - Checks git status and exits silently if no changes
 * - Spawns are update --quiet in background (detached, unref'd)
 *
 * Uses CommonJS (require) since hooks run via node directly.
 *
 * @returns JavaScript hook code as a string
 */
export function getHookTemplate(): string {
  return `#!/usr/bin/env node
// .claude/hooks/are-session-end.js
// Triggers are update when session ends (if there are uncommitted changes)

const { execSync, spawn } = require('child_process');
const fs = require('fs');

// Check for disable flag
if (process.env.ARE_DISABLE_HOOK === '1') {
  process.exit(0);
}

// Check config file for permanent disable
const configPath = '.agents-reverse-engineer.yaml';
if (fs.existsSync(configPath)) {
  const config = fs.readFileSync(configPath, 'utf-8');
  if (config.includes('hook_enabled: false')) {
    process.exit(0);
  }
}

// Check git status - skip if no changes
try {
  const status = execSync('git status --porcelain', { encoding: 'utf-8' });
  if (!status.trim()) {
    // No changes since last run - exit silently
    process.exit(0);
  }
} catch {
  // Not a git repo or git not available - exit silently
  process.exit(0);
}

// Run update in background (don't block session close)
const child = spawn('npx', ['agents-reverse-engineer@latest', 'update', '--quiet'], {
  stdio: 'ignore',
  detached: true,
});
child.unref();
`;
}

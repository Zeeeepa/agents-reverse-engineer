/**
 * Template generators for AI coding assistant integration files
 *
 * Generates command file templates for Claude Code, OpenCode, Gemini CLI, and session hooks.
 */

import type { IntegrationTemplate } from './types.js';

// =============================================================================
// Shared Command Content
// =============================================================================

const COMMANDS = {
  generate: {
    description: 'Generate AI-friendly documentation for the entire codebase',
    argumentHint: '[--budget N] [--dry-run]',
    content: `Generate comprehensive documentation for this codebase using agents-reverse-engineer.

<execution>
## Phase 0: Check for Existing Plan

First, check if a resumable plan exists:

\`\`\`bash
cat .agents-reverse-engineer/GENERATION-PLAN.md 2>/dev/null | head -20
\`\`\`

**If NO plan exists**: Run \`/are:discover --plan\` first to create the GENERATION-PLAN.md, then return here.

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
</execution>`,
  },

  update: {
    description: 'Incrementally update documentation for changed files',
    argumentHint: '[--uncommitted] [--dry-run] [--verbose]',
    content: `Update documentation for files that changed since last run.

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
</execution>`,
  },

  init: {
    description: 'Initialize agents-reverse-engineer configuration',
    argumentHint: '',
    content: `Initialize agents-reverse-engineer configuration in this project.

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
</execution>`,
  },

  discover: {
    description: 'Discover files in codebase',
    argumentHint: '[path] [--plan] [--show-excluded] [--quiet]',
    content: `List files that would be analyzed for documentation.

<execution>
## STRICT RULES - VIOLATION IS FORBIDDEN

1. Run ONLY this exact command: \`npx agents-reverse-engineer@latest discover $ARGUMENTS\`
2. DO NOT add \`--plan\` unless user typed \`--plan\`
3. DO NOT add ANY flags the user did not explicitly type
4. If user typed nothing after \`/are:discover\`, run with ZERO flags

\`\`\`bash
npx agents-reverse-engineer@latest discover $ARGUMENTS
\`\`\`

Report number of files found.
</execution>`,
  },

  clean: {
    description: 'Delete all generated documentation artifacts (.sum, AGENTS.md, plan)',
    argumentHint: '[--dry-run]',
    content: `Remove all documentation artifacts generated by agents-reverse-engineer.

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

Suggest running \`/are:discover --plan\` to start fresh.
</execution>`,
  },

  help: {
    description: 'Show available ARE commands and usage guide',
    argumentHint: '',
    // Content uses COMMAND_PREFIX placeholder, replaced per platform
    content: `Show help for agents-reverse-engineer commands.

<execution>
Display the following help information:

## agents-reverse-engineer (ARE) Commands

| Command | Description |
|---------|-------------|
| \`COMMAND_PREFIXhelp\` | Show this help message |
| \`COMMAND_PREFIXinit\` | Initialize configuration file |
| \`COMMAND_PREFIXdiscover\` | Discover files (use --plan for GENERATION-PLAN.md) |
| \`COMMAND_PREFIXgenerate\` | Generate documentation from the plan |
| \`COMMAND_PREFIXupdate\` | Update docs for changed files only |
| \`COMMAND_PREFIXclean\` | Remove all generated documentation |

## Typical Workflow

1. **\`COMMAND_PREFIXinit\`** — Create \`.agents-reverse-engineer/config.yaml\`
2. **\`COMMAND_PREFIXdiscover --plan\`** — Scan codebase, create \`GENERATION-PLAN.md\`
3. **\`COMMAND_PREFIXgenerate\`** — Execute plan, generate \`.sum\` and \`AGENTS.md\` files
4. **\`COMMAND_PREFIXupdate\`** — After code changes, update only what changed

## Generated Files

- \`*.sum\` — Per-file summaries (purpose, exports, dependencies)
- \`AGENTS.md\` — Per-directory overviews
- \`CLAUDE.md\` — Project entry point
- \`ARCHITECTURE.md\` — System design overview
- \`STACK.md\` — Technology stack

## More Info

- Docs: https://github.com/GeoloeG-IsT/agents-reverse-engineer
- Update: \`npx agents-reverse-engineer@latest\`
</execution>`,
  },
} as const;

// =============================================================================
// Platform-specific template generators
// =============================================================================

type Platform = 'claude' | 'opencode' | 'gemini';

interface PlatformConfig {
  commandPrefix: string; // /are: or /are-
  pathPrefix: string; // .claude/commands/are/ or .opencode/commands/ etc
  filenameSeparator: string; // . or -
  extraFrontmatter?: string; // e.g., "agent: build" for OpenCode
  usesName: boolean; // Claude uses "name:" in frontmatter
}

const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  claude: {
    commandPrefix: '/are:',
    pathPrefix: '.claude/commands/are/',
    filenameSeparator: '.',
    usesName: true,
  },
  opencode: {
    commandPrefix: '/are-',
    pathPrefix: '.opencode/commands/',
    filenameSeparator: '-',
    extraFrontmatter: 'agent: build',
    usesName: false,
  },
  gemini: {
    commandPrefix: '/are-',
    pathPrefix: '.gemini/commands/',
    filenameSeparator: '-',
    usesName: false,
  },
};

function buildFrontmatter(
  platform: Platform,
  commandName: string,
  description: string,
  argumentHint?: string
): string {
  const config = PLATFORM_CONFIGS[platform];
  const lines = ['---'];

  if (config.usesName) {
    lines.push(`name: are:${commandName}`);
  }

  lines.push(`description: ${description}`);

  if (argumentHint) {
    lines.push(`argument-hint: "${argumentHint}"`);
  }

  if (config.extraFrontmatter) {
    lines.push(config.extraFrontmatter);
  }

  lines.push('---');
  return lines.join('\n');
}

function buildTemplate(
  platform: Platform,
  commandName: string,
  command: (typeof COMMANDS)[keyof typeof COMMANDS]
): IntegrationTemplate {
  const config = PLATFORM_CONFIGS[platform];
  const filename =
    platform === 'claude' ? `${commandName}.md` : `are-${commandName}.md`;
  const path = `${config.pathPrefix}${filename}`;

  const frontmatter = buildFrontmatter(
    platform,
    commandName,
    command.description,
    command.argumentHint || undefined
  );

  // Replace command prefix placeholder in help content
  const content = command.content.replace(/COMMAND_PREFIX/g, config.commandPrefix);

  return {
    filename,
    path,
    content: `${frontmatter}\n\n${content}\n`,
  };
}

function getTemplatesForPlatform(platform: Platform): IntegrationTemplate[] {
  return Object.entries(COMMANDS).map(([name, command]) =>
    buildTemplate(platform, name, command)
  );
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get Claude Code command file templates
 */
export function getClaudeTemplates(): IntegrationTemplate[] {
  return getTemplatesForPlatform('claude');
}

/**
 * Get OpenCode command file templates
 */
export function getOpenCodeTemplates(): IntegrationTemplate[] {
  return getTemplatesForPlatform('opencode');
}

/**
 * Get Gemini CLI command file templates
 */
export function getGeminiTemplates(): IntegrationTemplate[] {
  return getTemplatesForPlatform('gemini');
}

/**
 * Get session-end hook template for automatic documentation updates
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

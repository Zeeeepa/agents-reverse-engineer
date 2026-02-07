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

**If NO plan exists**: Run \`COMMAND_PREFIXdiscover --plan\` first to create the GENERATION-PLAN.md, then return here.

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
1. Compute content hash: sha256sum <file_path> | cut -d' ' -f1
2. Read: <file_path>
3. Generate .sum content following the format below (include the content_hash)
4. Write to: <file_path>.sum
5. Verify: Read back the .sum file to confirm success
6. Report: "SUCCESS: <file_path>.sum created" or "FAILED: <reason>"
\`\`\`

### .sum File Format

\`\`\`yaml
---
file_type: <generic|type|config|test|component|service|api|hook|model|schema>
generated_at: <ISO timestamp>
content_hash: <SHA-256 hash - compute with: sha256sum <file> | cut -d' ' -f1>
purpose: <1-2 sentence description of what this file does>
public_interface: [func1(), func2(), ClassName]
dependencies: [express, lodash, ./utils]
patterns: [singleton, factory, observer]
related_files: [./types.ts, ./utils.ts]
---

<Detailed 300-500 word summary covering:
- What the code does and how it works
- Key implementation details
- Important usage patterns
- Notable edge cases or gotchas>
\`\`\`

**Field Guidelines:**
- \`purpose\`: One-line summary (what + why)
- \`public_interface\`: Exported functions/classes/types
- \`dependencies\`: External packages and internal imports
- \`patterns\`: Design patterns used (singleton, factory, etc.)
- \`related_files\`: Tightly coupled files (optional)

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
2. **ARCHITECTURE.md** - Document system architecture (if 20+ source files)

Generate per-package documents (at each directory containing package.json, requirements.txt, Cargo.toml, etc.):

1. **STACK.md** - Technology stack from manifest file
2. **STRUCTURE.md** - Codebase structure and organization
3. **CONVENTIONS.md** - Coding conventions and patterns
4. **TESTING.md** - Test setup and patterns
5. **INTEGRATIONS.md** - External services and APIs

In monorepos, these appear in each package directory (e.g., \`packages/api/STACK.md\`).

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
4. If user typed nothing after \`COMMAND_PREFIXdiscover\`, run with ZERO flags

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

Suggest running \`COMMAND_PREFIXdiscover --plan\` to start fresh.
</execution>`,
  },

  help: {
    description: 'Show available ARE commands and usage guide',
    argumentHint: '',
    // Content uses COMMAND_PREFIX placeholder, replaced per platform
    content: `<objective>
Display the complete ARE command reference.

Output ONLY the reference content below. Do NOT add:
- Project-specific analysis
- Git status or file context
- Next-step suggestions
- Any commentary beyond the reference
</objective>

<reference>
# agents-reverse-engineer (ARE) Command Reference

**ARE** generates AI-friendly documentation for codebases, creating structured summaries optimized for AI assistants.

## Quick Start

1. \`COMMAND_PREFIXinit\` — Create configuration file
2. \`COMMAND_PREFIXdiscover --plan\` — Scan codebase, create execution plan
3. \`COMMAND_PREFIXgenerate\` — Generate documentation from the plan
4. \`COMMAND_PREFIXupdate\` — Keep docs in sync after code changes

## Commands Reference

### \`COMMAND_PREFIXinit\`
Initialize configuration in this project.

Creates \`.agents-reverse-engineer/config.yaml\` with customizable settings.

**Usage:** \`COMMAND_PREFIXinit\`
**CLI:** \`npx are init\`

---

### \`COMMAND_PREFIXdiscover\`
Discover files that would be analyzed for documentation.

**Options:**
| Flag | Description |
|------|-------------|
| \`[path]\` | Target directory (default: current directory) |
| \`--plan\` | Generate \`GENERATION-PLAN.md\` execution plan |
| \`--show-excluded\` | List excluded files with reasons |
| \`--quiet, -q\` | Suppress output except errors |

**Usage:**
- \`COMMAND_PREFIXdiscover\` — List discoverable files
- \`COMMAND_PREFIXdiscover --plan\` — Create execution plan for generate
- \`COMMAND_PREFIXdiscover --show-excluded\` — Debug exclusion rules

**CLI:**
\`\`\`bash
npx are discover
npx are discover --plan
npx are discover ./src --show-excluded
\`\`\`

---

### \`COMMAND_PREFIXgenerate\`
Generate comprehensive documentation for the codebase.

**Requires:** Run \`COMMAND_PREFIXdiscover --plan\` first to create \`GENERATION-PLAN.md\`.

**Options:**
| Flag | Description |
|------|-------------|
| \`--budget N\` | Override token budget (default: from config) |
| \`--dry-run\` | Show what would be generated without writing |
| \`--execute\` | Output JSON execution plan for AI agents |
| \`--stream\` | Output tasks as streaming JSON, one per line |
| \`--verbose, -v\` | Show detailed task breakdown |
| \`--quiet, -q\` | Suppress output except errors |

**Usage:**
- \`COMMAND_PREFIXgenerate\` — Generate docs (resumes from plan)
- \`COMMAND_PREFIXgenerate --dry-run\` — Preview without writing

**CLI:**
\`\`\`bash
npx are generate
npx are generate --dry-run
npx are generate --budget 50000
npx are generate --execute  # For programmatic use
\`\`\`

**How it works:**
1. Reads \`GENERATION-PLAN.md\` and finds unchecked tasks
2. Spawns parallel subagents to analyze each file
3. Writes \`.sum\` summary files alongside source files
4. Generates \`AGENTS.md\` for each directory (post-order)
5. Creates root documents: \`CLAUDE.md\`, \`ARCHITECTURE.md\`
6. Creates per-package documents at each manifest location: \`STACK.md\`, \`STRUCTURE.md\`, \`CONVENTIONS.md\`, \`TESTING.md\`, \`INTEGRATIONS.md\`

---

### \`COMMAND_PREFIXupdate\`
Incrementally update documentation for changed files.

**Options:**
| Flag | Description |
|------|-------------|
| \`--uncommitted\` | Include staged but uncommitted changes |
| \`--dry-run\` | Show what would be updated without writing |
| \`--budget N\` | Override token budget |
| \`--verbose, -v\` | Show detailed output |
| \`--quiet, -q\` | Suppress output except errors |

**Usage:**
- \`COMMAND_PREFIXupdate\` — Update docs for committed changes
- \`COMMAND_PREFIXupdate --uncommitted\` — Include uncommitted changes

**CLI:**
\`\`\`bash
npx are update
npx are update --uncommitted --verbose
npx are update --dry-run
\`\`\`

---

### \`COMMAND_PREFIXclean\`
Remove all generated documentation artifacts.

**Options:**
| Flag | Description |
|------|-------------|
| \`--dry-run\` | Show what would be deleted without deleting |

**What gets deleted:**
- \`.agents-reverse-engineer/GENERATION-PLAN.md\`
- All \`*.sum\` files
- All \`AGENTS.md\` files
- Root docs: \`CLAUDE.md\`, \`ARCHITECTURE.md\`
- Per-package docs: \`STACK.md\`, \`STRUCTURE.md\`, \`CONVENTIONS.md\`, \`TESTING.md\`, \`INTEGRATIONS.md\`

**Usage:**
- \`COMMAND_PREFIXclean --dry-run\` — Preview deletions
- \`COMMAND_PREFIXclean\` — Delete all artifacts

---

### \`COMMAND_PREFIXhelp\`
Show this command reference.

## CLI Installation

Install ARE commands to your AI assistant:

\`\`\`bash
npx agents-reverse-engineer install              # Interactive mode
npx agents-reverse-engineer install --runtime claude -g  # Global Claude
npx agents-reverse-engineer install --runtime claude -l  # Local project
npx agents-reverse-engineer install --runtime all -g     # All runtimes
\`\`\`

**Install/Uninstall Options:**
| Flag | Description |
|------|-------------|
| \`--runtime <name>\` | Target: \`claude\`, \`opencode\`, \`gemini\`, \`all\` |
| \`-g, --global\` | Install to global config directory |
| \`-l, --local\` | Install to current project directory |
| \`--force\` | Overwrite existing files (install only) |

## Configuration

**File:** \`.agents-reverse-engineer/config.yaml\`

\`\`\`yaml
# Exclusion patterns
exclude:
  patterns:
    - "**/*.test.ts"
    - "**/__mocks__/**"
  vendorDirs:
    - node_modules
    - dist
    - .git
  binaryExtensions:
    - .png
    - .jpg
    - .pdf

# Options
options:
  followSymlinks: false
  maxFileSize: 100000

# Output settings
output:
  verbose: false
  colors: true

# Generation settings
generation:
  tokenBudget: 50000
\`\`\`

## Generated Files

### Per Source File

**\`*.sum\`** — File summaries with YAML frontmatter + detailed prose.

\`\`\`yaml
---
file_type: service
generated_at: 2025-01-15T10:30:00Z
content_hash: abc123...
purpose: Handles user authentication and session management
public_interface: [login(), logout(), refreshToken(), AuthService]
dependencies: [express, jsonwebtoken, ./user-model]
patterns: [singleton, factory, observer]
related_files: [./types.ts, ./middleware.ts]
---

<300-500 word summary covering implementation, patterns, edge cases>
\`\`\`

### Per Directory

**\`AGENTS.md\`** — Directory overview synthesized from \`.sum\` files. Groups files by purpose and links to subdirectories.

### Root Documents

| File | Purpose |
|------|---------|
| \`CLAUDE.md\` | Project entry point — synthesizes all AGENTS.md |
| \`ARCHITECTURE.md\` | System design, layers, data flow (if 20+ files) |

### Per-Package Documents (at each manifest file location)

Generated alongside \`package.json\`, \`requirements.txt\`, \`Cargo.toml\`, etc.:

| File | Purpose |
|------|---------|
| \`STACK.md\` | Technology stack from manifest |
| \`STRUCTURE.md\` | Codebase structure and organization |
| \`CONVENTIONS.md\` | Coding conventions and patterns |
| \`TESTING.md\` | Test setup and patterns |
| \`INTEGRATIONS.md\` | External services and APIs |

In monorepos, these appear in each package directory (e.g., \`packages/api/STACK.md\`).

## Common Workflows

**Initial documentation:**
\`\`\`
COMMAND_PREFIXinit
COMMAND_PREFIXdiscover --plan
COMMAND_PREFIXgenerate
\`\`\`

**After code changes:**
\`\`\`
COMMAND_PREFIXupdate
\`\`\`

**Full regeneration:**
\`\`\`
COMMAND_PREFIXclean
COMMAND_PREFIXdiscover --plan
COMMAND_PREFIXgenerate
\`\`\`

**Preview before generating:**
\`\`\`
COMMAND_PREFIXdiscover --show-excluded  # Check exclusions
COMMAND_PREFIXgenerate --dry-run         # Preview generation
\`\`\`

## Tips

- **Resume generation**: If interrupted, run \`COMMAND_PREFIXgenerate\` again — it resumes from unchecked tasks in \`GENERATION-PLAN.md\`
- **Large codebases**: Use \`--budget N\` to limit token usage per run
- **Custom exclusions**: Edit \`.agents-reverse-engineer/config.yaml\` to skip files
- **Hook auto-update**: Install creates a session-end hook that auto-runs update

## Resources

- **Repository:** https://github.com/GeoloeG-IsT/agents-reverse-engineer
- **Update:** \`npx agents-reverse-engineer@latest install --force\`
</reference>`,
  },
} as const;

// =============================================================================
// Platform-specific template generators
// =============================================================================

type Platform = 'claude' | 'opencode' | 'gemini';

interface PlatformConfig {
  commandPrefix: string; // /are- (claude, opencode) or /are: (gemini)
  pathPrefix: string; // .claude/commands/are/ or .opencode/commands/ etc
  filenameSeparator: string; // . or -
  extraFrontmatter?: string; // e.g., "agent: build" for OpenCode
  usesName: boolean; // Claude uses "name:" in frontmatter
}

const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  claude: {
    commandPrefix: '/are-',
    pathPrefix: '.claude/skills/',
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
    commandPrefix: '/are:',
    pathPrefix: '.gemini/commands/are/', // Nested dir for /are:* namespace
    filenameSeparator: '-',
    usesName: false,
  },
};

function buildFrontmatter(
  platform: Platform,
  commandName: string,
  description: string
): string {
  const config = PLATFORM_CONFIGS[platform];
  const lines = ['---'];

  if (config.usesName) {
    lines.push(`name: are-${commandName}`);
  }

  lines.push(`description: ${description}`);

  if (config.extraFrontmatter) {
    lines.push(config.extraFrontmatter);
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * Build TOML content for Gemini CLI commands
 *
 * Gemini uses TOML format with description and prompt fields.
 * See: https://geminicli.com/docs/cli/custom-commands/
 */
function buildGeminiToml(
  commandName: string,
  command: (typeof COMMANDS)[keyof typeof COMMANDS]
): string {
  const config = PLATFORM_CONFIGS.gemini;
  // Replace command prefix placeholder in content
  const promptContent = command.content.replace(/COMMAND_PREFIX/g, config.commandPrefix);

  // Build TOML content
  // Use triple quotes for multi-line prompt
  const lines = [`description = "${command.description}"`];

  if (command.argumentHint) {
    lines.push(`# Arguments: ${command.argumentHint}`);
  }

  lines.push(`prompt = """`);
  lines.push(promptContent);
  lines.push(`"""`);

  return lines.join('\n');
}

function buildTemplate(
  platform: Platform,
  commandName: string,
  command: (typeof COMMANDS)[keyof typeof COMMANDS]
): IntegrationTemplate {
  const config = PLATFORM_CONFIGS[platform];

  // Platform-specific file naming:
  // - Claude: .claude/skills/are-{command}/SKILL.md
  // - OpenCode: .opencode/commands/are-{command}.md
  // - Gemini: .gemini/commands/are/{command}.toml (TOML format, nested dir for /are:* namespace)
  if (platform === 'gemini') {
    const filename = `${commandName}.toml`;
    const path = `${config.pathPrefix}${filename}`;
    const content = buildGeminiToml(commandName, command);

    return {
      filename,
      path,
      content: `${content}\n`,
    };
  }

  const filename = platform === 'claude' ? 'SKILL.md' : `are-${commandName}.md`;
  const path =
    platform === 'claude'
      ? `${config.pathPrefix}are-${commandName}/${filename}`
      : `${config.pathPrefix}${filename}`;

  const frontmatter = buildFrontmatter(
    platform,
    commandName,
    command.description
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


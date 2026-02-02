# Phase 5: Installation Workflow - Research

**Researched:** 2026-02-02
**Domain:** CLI installer with interactive prompts, file operations, cross-platform support
**Confidence:** HIGH

## Summary

This research covers implementing an interactive CLI installer invoked via `npx agents-reverse-engineer` that supports both interactive prompts (arrow key selection) and non-interactive flags for CI/scripted installs. The installer copies command files and hooks to runtime-specific directories (Claude Code, OpenCode, Gemini).

The standard approach for zero-dependency interactive CLIs uses Node.js built-in `readline` module with raw mode for keypresses. This matches the project's "zero external dependencies philosophy for CLI tools." The reference implementation (get-shit-done-cc) uses this exact pattern: numbered choices with readline, ANSI escape codes for colors, and flag detection for non-interactive mode.

Key recommendations: Use Node.js `readline` + raw mode for arrow key selection (zero dependencies), detect `process.stdin.isTTY` for CI mode, use ANSI escape codes via the existing `picocolors` dependency, and follow the existing `src/integration/` module patterns for file operations.

**Primary recommendation:** Build zero-dependency interactive prompts using Node.js `readline` with raw mode keypresses, falling back to numbered input for non-TTY environments.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library       | Version  | Purpose                         | Why Standard                                     |
| ------------- | -------- | ------------------------------- | ------------------------------------------------ |
| node:readline | built-in | Keypress events, line input     | Zero dependencies, full control over interaction |
| node:os       | built-in | `os.homedir()` for global paths | Cross-platform home directory detection          |
| node:fs       | built-in | File/directory operations       | Already used throughout codebase                 |
| node:path     | built-in | Cross-platform path joining     | Already used throughout codebase                 |
| picocolors    | ^1.1.1   | Terminal colors                 | Already a dependency, minimal, fast              |

### Supporting

| Library                 | Version | Purpose                    | When to Use                          |
| ----------------------- | ------- | -------------------------- | ------------------------------------ |
| existing integration/\* | n/a     | Templates, file generation | Reuse for command/hook file content  |
| existing output/logger  | n/a     | Colored output             | Extend for installer-specific output |

### Alternatives Considered

| Instead of        | Could Use             | Tradeoff                                           |
| ----------------- | --------------------- | -------------------------------------------------- |
| Raw readline      | inquirer/prompts      | Adds 50+ dependencies, against project philosophy  |
| Manual ANSI codes | chalk                 | Already have picocolors, no need for another       |
| Numbered input    | Full arrow navigation | Numbered works in all terminals, arrow only in TTY |

**Installation:**

```bash
# No new dependencies needed - use built-ins and existing deps
```

## Architecture Patterns

### Recommended Project Structure

```
src/
  installer/                 # New module for installation workflow
    index.ts                # Main installer entry point
    prompts.ts              # Interactive prompt utilities
    banner.ts               # ASCII banner display
    operations.ts           # File copy/verify operations
    paths.ts                # Runtime-specific path resolution
    uninstall.ts            # Uninstallation logic
  integration/              # Existing - templates, detection
  cli/
    index.ts                # Existing - add installer command routing
```

### Pattern 1: Dual-Mode Entry Point

**What:** Single entry point that detects interactive vs non-interactive mode
**When to use:** Main installer function
**Example:**

```typescript
// Source: Node.js TTY documentation + GSD installer pattern
async function runInstaller(args: ParsedArgs): Promise<void> {
  const isInteractive = process.stdin.isTTY && !hasAllRequiredFlags(args);

  if (isInteractive) {
    await runInteractiveInstaller(args);
  } else {
    await runNonInteractiveInstaller(args);
  }
}
```

### Pattern 2: Arrow Key Selection with Fallback

**What:** Raw mode for arrow keys, with numbered fallback for non-TTY
**When to use:** Runtime and location selection prompts
**Example:**

```typescript
// Source: Node.js readline docs, DEV Community guide
import * as readline from "node:readline";

async function selectOption<T>(
  prompt: string,
  options: { label: string; value: T }[],
): Promise<T> {
  // TTY mode: arrow key navigation
  if (process.stdin.isTTY) {
    return arrowKeySelect(prompt, options);
  }
  // Non-TTY: numbered selection
  return numberedSelect(prompt, options);
}

async function arrowKeySelect<T>(
  prompt: string,
  options: { label: string; value: T }[],
): Promise<T> {
  let selectedIndex = 0;

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const render = () => {
    // Clear previous lines
    process.stdout.write("\x1b[" + options.length + "A"); // Move up
    process.stdout.write("\x1b[0J"); // Clear to end

    console.log(prompt);
    options.forEach((opt, i) => {
      const prefix = i === selectedIndex ? "\x1b[36m> " : "  ";
      const suffix = "\x1b[0m";
      console.log(`${prefix}${opt.label}${suffix}`);
    });
  };

  render();

  return new Promise((resolve) => {
    const handler = (_: string, key: readline.Key) => {
      if (key.name === "up" && selectedIndex > 0) {
        selectedIndex--;
        render();
      } else if (key.name === "down" && selectedIndex < options.length - 1) {
        selectedIndex++;
        render();
      } else if (key.name === "return") {
        cleanup();
        resolve(options[selectedIndex].value);
      } else if (key.name === "c" && key.ctrl) {
        cleanup();
        process.exit(0);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("keypress", handler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    process.stdin.on("keypress", handler);
  });
}
```

### Pattern 3: ANSI Color Helper Functions

**What:** Centralized color functions using picocolors
**When to use:** All installer output
**Example:**

```typescript
// Source: Existing output/logger.ts pattern
import pc from "picocolors";

export const colors = {
  success: (msg: string) => `${pc.green("✓")} ${msg}`,
  error: (msg: string) => `${pc.red("✗")} ${msg}`,
  warn: (msg: string) => `${pc.yellow("!")} ${msg}`,
  info: (msg: string) => `${pc.cyan(">")} ${msg}`,
  dim: (msg: string) => pc.dim(msg),
  highlight: (msg: string) => pc.cyan(msg),
};
```

### Pattern 4: Skip-Existing-Unless-Force

**What:** Check file existence before write, respect --force flag
**When to use:** All file operations
**Example:**

```typescript
// Source: Existing integration/generate.ts pattern
interface WriteResult {
  created: string[];
  skipped: string[];
}

function writeFile(
  path: string,
  content: string,
  force: boolean,
): "created" | "skipped" {
  if (existsSync(path) && !force) {
    return "skipped";
  }
  ensureDir(path);
  writeFileSync(path, content, "utf-8");
  return "created";
}
```

### Anti-Patterns to Avoid

- **Blocking on stdin in non-TTY:** Check `process.stdin.isTTY` before any raw mode operations
- **Hardcoded paths:** Use `os.homedir()` and `path.join()` for cross-platform support
- **Silent failures:** Always report skipped files and verify installed files exist
- **Mixing sync/async:** Use consistent async patterns for file operations

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                 | Don't Build                   | Use Instead                         | Why                                  |
| ----------------------- | ----------------------------- | ----------------------------------- | ------------------------------------ |
| Cross-platform home dir | `process.env.HOME`            | `os.homedir()`                      | Works on Windows (USERPROFILE)       |
| Path separators         | String concatenation with `/` | `path.join()`                       | Handles Windows backslashes          |
| Terminal colors         | Manual ANSI codes             | `picocolors` (existing dep)         | Already in project, handles no-color |
| Template content        | Inline strings                | Existing `integration/templates.ts` | DRY, already tested                  |
| File existence checks   | Manual try/catch              | `existsSync()`                      | Cleaner, synchronous                 |

**Key insight:** The existing `src/integration/` module already handles most file operations and template generation. The installer should orchestrate these existing functions, not recreate them.

## Common Pitfalls

### Pitfall 1: Raw Mode Without Cleanup

**What goes wrong:** Terminal remains in raw mode after crash, user can't type
**Why it happens:** Uncaught exception or early return without restoring stdin
**How to avoid:** Always wrap raw mode in try/finally, use process exit handlers
**Warning signs:** Terminal behaves strangely after installer errors

```typescript
// ALWAYS clean up
process.on("exit", () => {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
});
```

### Pitfall 2: Assuming TTY in CI

**What goes wrong:** Installer hangs waiting for input that never comes
**Why it happens:** `readline.question()` blocks indefinitely in non-TTY
**How to avoid:** Check `process.stdin.isTTY` before interactive prompts
**Warning signs:** CI pipeline hangs or times out

```typescript
if (!process.stdin.isTTY && !hasRequiredFlags(args)) {
  console.error(
    "Error: Non-interactive mode requires --runtime and --global/--local flags",
  );
  process.exit(1);
}
```

### Pitfall 3: Windows Path Separators

**What goes wrong:** Paths like `~/.claude` don't resolve on Windows
**Why it happens:** `~` is Unix shell expansion, not Node.js
**How to avoid:** Use `os.homedir()` + `path.join()` for all paths
**Warning signs:** "File not found" errors only on Windows

```typescript
// WRONG
const globalPath = "~/.claude";

// RIGHT
const globalPath = path.join(os.homedir(), ".claude");
```

### Pitfall 4: Forgetting --force in Skip Logic

**What goes wrong:** User can't reinstall/update when files exist
**Why it happens:** Only checking existence, not respecting force flag
**How to avoid:** Always pass force option through to file operations
**Warning signs:** "Skipped" messages even with --force flag

### Pitfall 5: Exit Code 0 on Error

**What goes wrong:** CI reports success when installation failed
**Why it happens:** Missing `process.exit(1)` on error paths
**How to avoid:** Explicit exit codes for all error conditions
**Warning signs:** Green CI builds with failed installations

```typescript
// Standard exit codes
const EXIT_SUCCESS = 0;
const EXIT_ERROR = 1;
const EXIT_INVALID_ARGS = 9;
```

## Code Examples

Verified patterns from official sources:

### ASCII Banner Display

```typescript
// Source: GSD installer pattern
import pc from "picocolors";

export function displayBanner(): void {
  const banner = `
${pc.cyan("  ╔═══════════════════════════════════════════╗")}
${pc.cyan("  ║")}  ${pc.bold("agents-reverse-engineer")}               ${pc.cyan("║")}
${pc.cyan("  ║")}  ${pc.dim("AI-friendly codebase documentation")}     ${pc.cyan("║")}
${pc.cyan("  ╚═══════════════════════════════════════════╝")}
`;
  console.log(banner);
}
```

### Non-Interactive Flag Parsing

```typescript
// Source: Existing cli/index.ts pattern extended
interface InstallerArgs {
  runtime?: "claude" | "opencode" | "gemini" | "all";
  global: boolean;
  local: boolean;
  uninstall: boolean;
  force: boolean;
  help: boolean;
}

function parseInstallerArgs(args: string[]): InstallerArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--runtime" && i + 1 < args.length) {
      values.set("runtime", args[++i]);
    } else if (arg === "-g" || arg === "--global") {
      flags.add("global");
    } else if (arg === "-l" || arg === "--local") {
      flags.add("local");
    } else if (arg === "-u" || arg === "--uninstall") {
      flags.add("uninstall");
    } else if (arg === "--force") {
      flags.add("force");
    } else if (arg === "-h" || arg === "--help") {
      flags.add("help");
    }
  }

  return {
    runtime: values.get("runtime") as InstallerArgs["runtime"],
    global: flags.has("global"),
    local: flags.has("local"),
    uninstall: flags.has("uninstall"),
    force: flags.has("force"),
    help: flags.has("help"),
  };
}
```

### Global Path Resolution

```typescript
// Source: Node.js os.homedir() documentation
import * as os from "node:os";
import * as path from "node:path";

type Runtime = "claude" | "opencode" | "gemini";

interface PathConfig {
  global: string;
  local: string;
}

export function getRuntimePaths(runtime: Runtime): PathConfig {
  const home = os.homedir();

  const globalPaths: Record<Runtime, string> = {
    claude: path.join(home, ".claude"),
    opencode: path.join(home, ".config", "opencode"),
    gemini: path.join(home, ".gemini"),
  };

  const localPaths: Record<Runtime, string> = {
    claude: ".claude",
    opencode: ".opencode",
    gemini: ".gemini",
  };

  return {
    global: globalPaths[runtime],
    local: localPaths[runtime],
  };
}
```

### Hook Registration in settings.json

```typescript
// Source: Existing .claude/settings.json structure
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

interface SettingsHook {
  type: "command";
  command: string;
}

interface Settings {
  hooks?: {
    SessionEnd?: Array<{ hooks: SettingsHook[] }>;
  };
}

export function registerHook(
  settingsPath: string,
  hookEvent: "SessionEnd" | "SessionStart",
  command: string,
): void {
  let settings: Settings = {};

  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  }

  settings.hooks = settings.hooks || {};
  settings.hooks[hookEvent] = settings.hooks[hookEvent] || [];

  // Check if hook already registered
  const exists = settings.hooks[hookEvent].some((entry) =>
    entry.hooks.some((h) => h.command === command),
  );

  if (!exists) {
    settings.hooks[hookEvent].push({
      hooks: [{ type: "command", command }],
    });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }
}
```

### Verification After Install

```typescript
// Source: Best practice - verify before reporting success
export function verifyInstallation(files: string[]): {
  success: boolean;
  missing: string[];
} {
  const missing = files.filter((f) => !existsSync(f));
  return {
    success: missing.length === 0,
    missing,
  };
}
```

## State of the Art

| Old Approach            | Current Approach                       | When Changed | Impact                                 |
| ----------------------- | -------------------------------------- | ------------ | -------------------------------------- |
| inquirer.js             | @inquirer/prompts or built-in readline | 2024         | Modular imports, smaller bundles       |
| Callback-based readline | readline/promises                      | Node.js 17+  | Cleaner async/await code               |
| Manual ANSI             | picocolors/chalk                       | Stable       | Automatic color support detection      |
| postinstall scripts     | Direct CLI execution via npx           | Standard     | More reliable, no npm lifecycle issues |

**Deprecated/outdated:**

- `inquirer` classic: Still works but @inquirer/prompts is modular successor
- `readline.createInterface` for prompts: Use `readline/promises` for cleaner code

## Open Questions

Things that couldn't be fully resolved:

1. **Arrow key behavior in Windows CMD vs PowerShell**
   - What we know: Works in most terminals, may have issues in some Windows configurations
   - What's unclear: Exact failure modes in legacy Windows terminals
   - Recommendation: Always provide numbered fallback input option

2. **settings.json merging strategy**
   - What we know: GSD adds hooks array entries, doesn't overwrite existing
   - What's unclear: Best UX when existing hooks conflict
   - Recommendation: Warn user if existing ARE hook found, ask to update

## Sources

### Primary (HIGH confidence)

- Node.js readline documentation (v25.3.0) - emitKeypressEvents, raw mode
- Node.js TTY documentation - isTTY, setRawMode
- Node.js os documentation - homedir()
- Existing codebase: src/integration/, src/cli/, src/output/

### Secondary (MEDIUM confidence)

- DEV Community guide on building select options from scratch
- GitHub Gist: ANSI escape codes reference
- GSD installer (get-shit-done-cc) README and package.json

### Tertiary (LOW confidence)

- WebSearch results for CI detection patterns (verify with testing)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All built-in Node.js or existing dependencies
- Architecture: HIGH - Based on existing codebase patterns + reference implementation
- Pitfalls: HIGH - Well-documented in Node.js docs and verified in reference implementation

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (30 days - stable Node.js APIs)

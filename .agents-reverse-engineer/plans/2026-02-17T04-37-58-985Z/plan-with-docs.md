Now I have a comprehensive understanding of the codebase. Let me create a detailed implementation plan for adding a rotating logo and split-pane layout to the installer.

# Implementation Plan: Rotating Logo and Split-Pane Installer Layout

## Overview

Add a Codex-style rotating logo animation and split the installer UI into two sections:
- **Left pane (fixed)**: ARE ASCII banner and version info
- **Right pane (scrolling)**: Runtime selection, location selection, progress output, completion summary, and next steps

## Files to Create or Modify

### 1. **Create: `src/installer/frames/`** (NEW DIRECTORY)
36 pre-rendered text-art frames of a rotating golden circle, following the same approach as the Codex CLI (`codex-rs/tui/frames/`).

Each frame is **6 lines tall × 12 chars wide** — matching the height of the ARE ASCII banner (6 lines) so the rotating circle sits directly to the left of the banner text at the same size. The circle uses density-mapped characters to create a 3D sphere illusion with shading that rotates smoothly.

**Frame files:** `src/installer/frames/frame_1.txt` through `src/installer/frames/frame_36.txt`

**Frame generation approach:**
- Write a Node.js script (`scripts/generate-circle-frames.js`) that programmatically renders a 3D sphere using raycasting or parametric projection onto a 6×12 character grid (terminal chars are ~2:1 height:width, so 12 wide × 6 tall ≈ a visual circle)
- The sphere rotates around the Y-axis, with a highlight/shading band that moves to simulate 3D rotation
- Characters are density-mapped: ` ` → `.` → `·` → `°` → `o` → `O` → `●` for light-to-dark shading
- Output: 36 `.txt` files, each 6 lines × 12 chars, representing one frame of the rotation
- All frames colored gold (`\x1b[38;5;220m`) at render time
- Alternative: hand-craft frames using a circle with a moving highlight arc (simpler, still effective)

**Placement:** The spinning circle renders to the **left** of the ARE banner, composited line-by-line:
```
  frame_line_1   █████╗ ██████╔╝███████╗
  frame_line_2  ██╔══██╗██╔══██╗██╔════╝
  frame_line_3  ███████║██████╔╝█████╗
  frame_line_4  ██╔══██║██╔══██╗██╔══╝
  frame_line_5  ██║  ██║██║  ██║███████╗
  frame_line_6  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
```

### 2. **Create: `src/installer/spinner.ts`** (NEW)
Terminal spinner animation engine that cycles through the 36 golden circle frames.

**Functions to implement:**
```typescript
export interface SpinnerConfig {
  frames: string[];       // 36 multi-line frame strings
  interval: number;       // ms between frames (default: 80)
  color: (s: string) => string;  // coloring function
}

export class Spinner {
  private frames: string[];
  private interval: number;
  private currentFrame: number;
  private timerId: NodeJS.Timeout | null;
  private text: string;
  private color: (s: string) => string;
  private frameHeight: number;

  constructor(config?: Partial<SpinnerConfig>);
  start(text: string): void;
  stop(finalText?: string, symbol?: string): void;
  update(text: string): void;
  private render(): void;
  private renderMultiLineFrame(): void;
}

// 36-frame golden circle animation
export const GOLDEN_CIRCLE_FRAMES: string[];
export const GOLDEN_CIRCLE_SPINNER: SpinnerConfig;
```

**Implementation details:**
- Load 36 frames from `src/installer/frames/frame_*.txt` (embedded at build time or inlined as string array)
- Each frame is a multi-line string (6 lines × 12 chars) representing one rotation step of a 3D golden circle — same height as the ARE banner
- Frame tick: **80ms** (matching Codex's `FRAME_TICK_DEFAULT`), yielding ~2.88s per full rotation
- Color: ANSI 256-color gold (`\x1b[38;5;220m`) or `\x1b[33m` (yellow) via picocolors, applied per-line
- Multi-line rendering: use ANSI cursor positioning to overwrite the frame region in-place (`\x1b[{row};{col}H` per line)
- Frame index: `Math.floor((elapsed_ms / 80) % 36)` — same algorithm as Codex's `ascii_animation.rs`
- Cleanup on SIGINT/exit: restore cursor visibility, reset color, move cursor below frame area

### 2. **Create: `src/installer/layout.ts`** (NEW)
Split-pane layout management for installer UI.

**Functions to implement:**
```typescript
export interface LayoutConfig {
  leftWidth: number;
  totalWidth: number;
  padding: number;
}

export class SplitPaneLayout {
  private config: LayoutConfig;
  private leftContent: string[];
  private rightBuffer: string[];
  
  constructor(config?: Partial<LayoutConfig>);
  
  // Left pane (fixed position)
  setLeftPane(lines: string[]): void;
  renderLeftPane(): void;
  clearLeftPane(): void;
  
  // Right pane (scrolling)
  appendRight(text: string): void;
  renderRightLine(text: string): void;
  
  // Layout utilities
  private wrapText(text: string, width: number): string[];
  private padLine(text: string, width: number): string;
  private splitHorizontal(left: string, right: string): string;
}

// Helper functions
export function getBannerLines(): string[];
export function getVersionInfo(): string[];
export function clearScreen(): void;
export function moveCursorTo(row: number, col: number): void;
```

**Implementation details:**
- Default left pane width: 35 chars (banner fits comfortably)
- Total terminal width: detect via `process.stdout.columns` or default to 100
- Right pane starts at column 36 (leftWidth + 1 for separator)
- Use absolute positioning with ANSI `\x1b[{row};{col}H`
- Draw vertical separator `│` between panes
- Buffer right pane content to handle scrolling

### 4. **Modify: `src/installer/banner.ts`**
Update banner display to composite the rotating golden circle to the left of the ARE text.

**Changes:**
```typescript
// Raw banner lines (no color) for compositing with circle frames
export const BANNER_LINES: string[] = [
  '  █████╗ ██████╗ ███████╗',
  ' ██╔══██╗██╔══██╗██╔════╝',
  ' ███████║██████╔╝█████╗  ',
  ' ██╔══██║██╔══██╗██╔══╝  ',
  ' ██║  ██║██║  ██║███████╗',
  ' ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝',
];

// Composite one circle frame (6 lines) with the ARE banner (6 lines)
export function compositeBanner(circleFrame: string): string[] {
  const circleLines = circleFrame.split('\n');
  return BANNER_LINES.map((bannerLine, i) => {
    const circleLine = circleLines[i] || ''.padEnd(12);
    return gold(circleLine) + ' ' + pc.green(bannerLine);
  });
}

// Render the composited banner at fixed position
export function renderAnimatedBanner(frame: string, layout: SplitPaneLayout): void {
  const lines = compositeBanner(frame);
  layout.setLeftPane([...lines, '', pc.dim(` v${VERSION}`), pc.dim(' AI-friendly codebase documentation')]);
  layout.renderLeftPane();
}

// Gold color helper (ANSI 256-color #220)
function gold(s: string): string {
  return `\x1b[38;5;220m${s}\x1b[0m`;
}

// Backwards-compatible displayBanner (no layout)
export function displayBanner(layout?: SplitPaneLayout): void {
  if (layout) {
    renderAnimatedBanner(GOLDEN_CIRCLE_FRAMES[0], layout);
  } else {
    // Original implementation
    console.log();
    // ... existing code
  }
}
```

### 5. **Modify: `src/installer/index.ts`**
Integrate split-pane layout, animated golden circle banner, and spinner into installation workflow.

**Changes to `runInstall()`:**
```typescript
async function runInstall(
  runtime: Runtime,
  location: Location,
  force: boolean,
  quiet: boolean,
): Promise<InstallerResult[]> {
  // Initialize layout
  const layout = new SplitPaneLayout({ leftWidth: 35, totalWidth: 100 });
  
  if (!quiet) {
    clearScreen();
    displayBanner(layout);
  }
  
  // Start animated golden circle banner (rotates in left pane next to ARE text)
  const spinner = new Spinner(GOLDEN_CIRCLE_SPINNER);
  spinner.start('Installing files...', layout);
  
  try {
    // Install files with progress updates
    const results = installFiles(runtime, location, { force, dryRun: false });
    
    spinner.stop('Installation complete', '✓');
    
    // Verify installation
    const allCreatedFiles = results.flatMap((r) => r.filesCreated);
    const verification = verifyInstallation(allCreatedFiles);
    
    if (!verification.success) {
      layout.appendRight(pc.red('✗ Verification failed - some files missing:'));
      for (const missing of verification.missing) {
        layout.appendRight(pc.yellow(`  ! ${missing}`));
      }
    }
    
    // Display results in right pane
    if (!quiet) {
      displayInstallResultsInLayout(results, layout);
    }
    
    return results;
  } catch (err) {
    spinner.stop('Installation failed', '✗');
    throw err;
  }
}
```

**New function:**
```typescript
function displayInstallResultsInLayout(results: InstallerResult[], layout: SplitPaneLayout): void {
  layout.appendRight('');
  
  let totalCreated = 0;
  let totalSkipped = 0;
  let hooksRegistered = 0;
  
  for (const result of results) {
    if (result.success) {
      layout.appendRight(pc.green('✓') + ` Installed ${result.runtime} (${result.location})`);
    } else {
      layout.appendRight(pc.red('✗') + ` Failed to install ${result.runtime} (${result.location})`);
      for (const err of result.errors) {
        layout.appendRight(pc.yellow(`  ! ${err}`));
      }
    }
    
    totalCreated += result.filesCreated.length;
    totalSkipped += result.filesSkipped.length;
    
    if (result.hookRegistered) {
      hooksRegistered++;
    }
  }
  
  // Summary
  layout.appendRight('');
  if (totalCreated > 0) {
    layout.appendRight(pc.green('✓') + ` Created ${totalCreated} command files`);
  }
  if (hooksRegistered > 0) {
    layout.appendRight(pc.green('✓') + ` Registered ${hooksRegistered} session hook(s)`);
  }
  if (totalSkipped > 0) {
    layout.appendRight(pc.yellow('!') + ` Skipped ${totalSkipped} existing files (use --force to overwrite)`);
  }
  
  // Next steps
  const primaryRuntime = results[0]?.runtime || 'claude';
  displayNextStepsInLayout(primaryRuntime, totalCreated, layout);
}

function displayNextStepsInLayout(runtime: string, filesCreated: number, layout: SplitPaneLayout): void {
  layout.appendRight('');
  layout.appendRight(pc.bold('Next steps:'));
  layout.appendRight('  1. Run ' + pc.cyan('/are-help') + ' in your AI assistant');
  layout.appendRight('  2. Run ' + pc.cyan('/are-init') + ' to initialize a project');
  layout.appendRight('  3. Run ' + pc.cyan('/are-discover') + ' to create the plan');
  layout.appendRight('  4. Run ' + pc.cyan('/are-generate') + ' to generate docs');
  layout.appendRight('  5. Run ' + pc.cyan('/are-update') + ' after changes');
  layout.appendRight('');
  layout.appendRight(pc.dim('Docs: https://github.com/GeoloeG-IsT/agents-reverse-engineer'));
}
```

**Update `runUninstall()` similarly** with layout integration.

### 6. **Modify: `src/installer/prompts.ts`**
Integrate prompts with layout system.

**Changes to `arrowKeySelect()`:**
```typescript
async function arrowKeySelect<T>(
  prompt: string,
  options: SelectOption<T>[],
  layout?: SplitPaneLayout,
): Promise<T> {
  return new Promise((resolve) => {
    let selectedIndex = 0;
    
    const render = (clear: boolean = false): void => {
      if (layout) {
        // Render in right pane
        layout.appendRight('');
        layout.appendRight(pc.bold(prompt));
        options.forEach((opt, idx) => {
          const prefix = idx === selectedIndex ? pc.cyan('> ') : '  ';
          const label = idx === selectedIndex ? pc.cyan(opt.label) : opt.label;
          layout.appendRight(prefix + label);
        });
      } else {
        // Original implementation
        // ... existing code
      }
    };
    
    // ... rest of implementation
  });
}
```

**Update `selectOption()`, `selectRuntime()`, `selectLocation()` to accept optional `layout` parameter.**

### 7. **Modify: `src/installer/operations.ts`**
Add progress callbacks for file operations.

**Changes:**
```typescript
export interface InstallOptions {
  force: boolean;
  dryRun: boolean;
  onProgress?: (current: number, total: number, file: string) => void;
}

function installFilesForRuntime(
  runtime: Exclude<Runtime, 'all'>,
  location: Location,
  options: InstallOptions,
): InstallerResult {
  const basePath = resolveInstallPath(runtime, location);
  const templates = getTemplatesForRuntime(runtime);
  const filesCreated: string[] = [];
  const filesSkipped: string[] = [];
  const errors: string[] = [];
  
  const totalFiles = templates.length;
  let currentFile = 0;
  
  for (const template of templates) {
    currentFile++;
    options.onProgress?.(currentFile, totalFiles, template.path);
    
    // ... existing installation logic
  }
  
  // ... rest of implementation
}
```

### 7. **Update: `package.json`**
No new dependencies needed! Use only existing `picocolors` for styling and native Node.js for ANSI control.

## Step-by-Step Implementation Instructions

### Step 1: Generate Golden Circle Frames
1. Create `scripts/generate-circle-frames.js` — a Node.js script that renders a 3D sphere rotating around the Y-axis onto a 6-line × 12-char grid (matching ARE banner height) using raycasting with density-mapped characters
2. Generate 36 frames (`src/installer/frames/frame_1.txt` through `frame_36.txt`), each at 10° rotation increments
3. Verify frames look correct by printing them sequentially in a terminal loop
4. Tune shading characters and sphere radius until the animation reads as a smooth golden circle

### Step 2: Create Spinner Module
1. Create `src/installer/spinner.ts`
2. Inline the 36 frames as a `GOLDEN_CIRCLE_FRAMES` string array (or load from embedded files)
3. Implement `Spinner` class with multi-line frame rendering using ANSI cursor positioning
4. Apply gold coloring (`\x1b[38;5;220m` or picocolors yellow) to each frame line
5. Frame selection: `Math.floor((elapsed / 80) % 36)` — same as Codex
6. Add cleanup handlers for SIGINT and process exit (restore cursor, reset colors)
7. Test spinner in isolation with a simple example

### Step 3: Create Layout Module
1. Create `src/installer/layout.ts`
2. Implement `SplitPaneLayout` class with left/right pane management
3. Add ANSI escape code utilities:
   - `\x1b[2J` - clear screen
   - `\x1b[{row};{col}H` - move cursor to position
   - `\x1b[0K` - clear line from cursor to end
4. Implement text wrapping for right pane (respect width)
5. Add vertical separator rendering between panes
6. Test layout with sample content

### Step 4: Update Banner Module
1. Extract banner lines to `getBannerLines()`
2. Extract version info to `getVersionLines()`
3. Modify `displayBanner()` to accept optional layout
4. Add utility functions for formatted output
5. Ensure backwards compatibility (non-layout mode)

### Step 5: Integrate Layout into Installer
1. Modify `runInstall()` to initialize layout
2. Update all output calls to use `layout.appendRight()`
3. Replace `displayInstallResults()` with `displayInstallResultsInLayout()`
4. Add spinner with progress updates during file operations
5. Handle cleanup on errors (stop spinner, restore cursor)

### Step 6: Update Prompts
1. Modify `arrowKeySelect()` to work with layout
2. Update prompt rendering to use right pane
3. Ensure keyboard input still works correctly
4. Test runtime and location selection with layout

### Step 7: Add Progress Callbacks
1. Add `onProgress` to `InstallOptions`
2. Emit progress during file installation
3. Update spinner text with current file being processed
4. Show file counts: "Installing (3/15): commands/are/generate.md"

### Step 8: Testing & Polish
1. Test in different terminal sizes (80 cols, 120 cols)
2. Test with `--quiet` flag (should skip layout)
3. Test non-interactive mode (CI environments)
4. Test all runtimes (claude, codex, opencode, gemini, all)
5. Test both global and local installations
6. Verify cleanup on Ctrl+C (raw mode, cursor position)

## Dependencies and Imports

All modules use existing dependencies:
```typescript
// spinner.ts
import pc from 'picocolors';
import { GOLDEN_CIRCLE_FRAMES } from './frames/index.js';

// layout.ts
import pc from 'picocolors';
import { getVersion } from '../version.js';

// banner.ts (existing)
import pc from 'picocolors';
import { getVersion } from '../version.js';
import { GOLDEN_CIRCLE_FRAMES } from './frames/index.js';
import type { SplitPaneLayout } from './layout.js';

// index.ts (existing)
import { Spinner, GOLDEN_CIRCLE_SPINNER } from './spinner.js';
import { SplitPaneLayout, clearScreen } from './layout.js';
import { renderAnimatedBanner } from './banner.js';
// ... existing imports

// prompts.ts (existing)
import type { SplitPaneLayout } from './layout.js';
// ... existing imports
```

## Edge Cases and Risks

### Edge Cases
1. **Narrow terminals (<80 cols)**: Detect terminal width and disable layout if too narrow, fall back to sequential output
2. **Non-TTY environments**: Check `process.stdout.isTTY` and skip layout/spinner
3. **CI/automated mode**: Already handled by `isInteractive()` check
4. **Ctrl+C during installation**: Ensure cleanup handlers restore terminal state
5. **Long file paths**: Truncate in progress display with ellipsis
6. **No color support**: Detect via `NO_COLOR` env var and `picocolors` auto-detection
7. **Windows terminals**: ANSI codes may behave differently, test on Windows
8. **VSCode integrated terminal**: May have different dimensions, test compatibility

### Risks
1. **Terminal compatibility**: ANSI escape codes may not work on all terminals
   - **Mitigation**: Detect TTY and color support, graceful fallback
2. **Raw mode conflicts**: Prompt library uses raw mode for keyboard input
   - **Mitigation**: Careful cleanup and coordination between spinner and prompts
3. **Cursor position errors**: Concurrent writes could corrupt display
   - **Mitigation**: Synchronize all output through layout manager
4. **Performance**: Frequent re-renders could cause flicker
   - **Mitigation**: Buffer updates and render at controlled intervals
5. **Breaking existing workflows**: Users may rely on parseable output
   - **Mitigation**: Honor `--quiet` flag, provide `--no-layout` flag

## Testing Strategy

### Unit Tests
```typescript
// tests/installer/spinner.test.ts
describe('Spinner', () => {
  it('should create spinner with default frames');
  it('should rotate through frames at specified interval');
  it('should cleanup on stop');
  it('should handle multiple start/stop cycles');
});

// tests/installer/layout.test.ts
describe('SplitPaneLayout', () => {
  it('should split content into left and right panes');
  it('should wrap long lines in right pane');
  it('should render vertical separator');
  it('should handle terminal resize');
  it('should detect narrow terminals and disable layout');
});
```

### Integration Tests
1. **Manual testing**: Run `npx agents-reverse-engineer` and verify:
   - Banner appears on left, stays fixed
   - Runtime selection appears on right
   - Location selection appears on right
   - Progress updates show in right pane with spinner
   - Completion summary displays properly
   - Next steps render correctly
   
2. **Automated testing**:
   - Mock `process.stdout` to capture ANSI sequences
   - Verify cursor positioning commands
   - Check output structure matches expected layout

### Compatibility Testing
- Test on macOS Terminal.app
- Test on iTerm2
- Test on VSCode integrated terminal
- Test on Windows Terminal
- Test on Linux GNOME Terminal
- Test in CI environments (GitHub Actions)
- Test with `NO_COLOR=1`
- Test with narrow terminals (80 cols)

## Example Visual Output

```
             ⟵ golden circle (animated, 6×12) ⟶
   .·°Oo·.    █████╗ ██████╗ ███████╗      │
  °O●●●●O°  ██╔══██╗██╔══██╗██╔════╝      │  Select runtime to install:
  O●●●●●●O  ███████║██████╔╝█████╗        │    Claude Code
  O●●●●●●O  ██╔══██║██╔══██╗██╔══╝        │  > Codex
  °O●●●●O°  ██║  ██║██║  ██║███████╗      │    OpenCode
   '·°Oo·'   ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝      │    Gemini CLI
                                             │    All runtimes
  v1.2.5                                     │
  AI-friendly codebase documentation         │  Select installation location:
                                             │  > Global (~/.claude, ~/.agents, etc.)
                                             │    Local (./.claude, ./.agents, etc.)
                                             │
                                             │  Installing files... (12/15)
                                             │
                                             │  ✓ Installed codex (global)
                                             │  ✓ Created 15 command files
                                             │  ✓ Registered 1 session hook(s)
                                             │
                                             │  Next steps:
                                             │    1. Run /are-help in your AI assistant
                                             │    2. Run /are-init to initialize
                                             │    3. Run /are-discover to create plan
                                             │
                                             │  Docs: https://github.com/GeoloeG...
```

The golden circle rotates in-place on the left, composited line-by-line with the ARE banner. During the install phase, the circle continues spinning while progress streams to the right pane.

## Success Criteria

- ✅ 36-frame golden circle rotates smoothly at 80ms/frame (~2.88s per revolution) to the left of ARE banner
- ✅ Circle is 6 lines tall × 12 chars wide, matching the ARE banner height
- ✅ Circle + banner composite stays fixed on the left throughout entire process
- ✅ All interactive elements (runtime/location selection) appear on right
- ✅ Progress updates stream to right pane without disrupting left
- ✅ Completion summary and next steps display in right pane
- ✅ Layout gracefully degrades in non-TTY environments
- ✅ `--quiet` flag bypasses layout entirely
- ✅ Ctrl+C cleanly exits and restores terminal state
- ✅ Works on major terminals (macOS, Windows, Linux)
- ✅ Existing functionality preserved (backwards compatibility)

## Sources

- [OpenAI Codex CLI — TUI frame animation source (codex-rs/tui/)](https://github.com/openai/codex)
- [Codex `ascii_animation.rs` — frame cycling engine](https://github.com/openai/codex/blob/main/codex-rs/tui/src/ascii_animation.rs)
- [Codex `frames.rs` — 36-frame variants, 80ms tick](https://github.com/openai/codex/blob/main/codex-rs/tui/src/frames.rs)
- [Claude Code's thinking animation — reverse engineered](https://blog.alexbeals.com/posts/claude-codes-thinking-animation)
- [GitHub - sindresorhus/ora: Elegant terminal spinner](https://github.com/sindresorhus/ora)
- [GitHub - sindresorhus/cli-spinners: Spinners for use in the terminal](https://github.com/sindresorhus/cli-spinners)
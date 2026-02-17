Perfect! Now I have all the information I need. Let me create a comprehensive implementation plan:

# Implementation Plan: Rotating Logo and Split Layout for ARE Installer

## Overview
Add a rotating logo animation (similar to Codex installer) and implement a split-screen layout with the ARE ASCII banner fixed on the left and scrolling interactive content on the right.

## 1. Files to Create or Modify

### 1.1 New Files to Create

#### `/tmp/are-plan-b3064328646f/without-docs/src/installer/spinner.ts`
**Purpose**: Terminal spinner/animation utilities for rotating logo
**Exports**:
- `Spinner` class for managing rotating logo animation
- `LOGO_FRAMES`: Array of ARE logo rotation frames
- Methods: `start()`, `stop()`, `setText()`

#### `/tmp/are-plan-b3064328646f/without-docs/src/installer/layout.ts`
**Purpose**: Split-screen layout manager using terminal ANSI escape codes
**Exports**:
- `SplitLayout` class for managing two-column terminal output
- `clearScreen()`, `moveCursor()`, `saveCursor()`, `restoreCursor()` utility functions
- Methods for rendering left (fixed) and right (scrolling) panels

### 1.2 Files to Modify

#### `/tmp/are-plan-b3064328646f/without-docs/src/installer/banner.ts`
**Changes**:
- Add `getBannerLines()` function that returns banner as string array (lines 19-34)
- Modify `displayBanner()` to use new layout system instead of direct console.log
- Add `getVersionInfo()` helper to return version strings as array

#### `/tmp/are-plan-b3064328646f/without-docs/src/installer/index.ts`
**Changes**:
- Import `SplitLayout` and `Spinner` (line 8-10)
- Modify `runInstaller()` to initialize split layout (after line 131)
- Update all console output calls to route through layout manager
- Add spinner during runtime/location selection
- Update `displayInstallResults()` to use layout (lines 263-307)
- Update `displayUninstallResults()` to use layout (lines 317-373)

#### `/tmp/are-plan-b3064328646f/without-docs/src/installer/prompts.ts`
**Changes**:
- Add layout-aware rendering for `arrowKeySelect()` (lines 85-157)
- Modify `render()` function to output to right panel
- Ensure spinner coordination during selection

#### `/tmp/are-plan-b3064328646f/without-docs/package.json`
**Changes**:
- Add dependency: No external spinner library needed - we'll implement custom using picocolors
- Already has `picocolors` which we'll use for ANSI control

## 2. Specific Functions/Classes to Change

### 2.1 New `Spinner` Class (spinner.ts)
```typescript
export class Spinner {
  private interval: NodeJS.Timeout | null = null;
  private frameIndex: number = 0;
  private text: string = '';
  
  constructor(
    private frames: string[],
    private intervalMs: number = 80
  )
  
  start(text?: string): void
  stop(): void
  setText(text: string): void
  private render(): void
}
```

### 2.2 New `SplitLayout` Class (layout.ts)
```typescript
export class SplitLayout {
  private leftContent: string[] = [];
  private rightContent: string[] = [];
  private terminalWidth: number;
  private terminalHeight: number;
  private splitRatio: number = 0.4; // 40% left, 60% right
  
  constructor()
  
  setLeftPanel(content: string[]): void
  appendToRight(line: string): void
  clearRight(): void
  render(): void
  cleanup(): void
  
  private renderLeftPanel(): void
  private renderRightPanel(): void
}
```

### 2.3 Modified Functions

#### `displayBanner()` in banner.ts
- Current: Direct console.log output
- New: Return banner as string array, let layout manager handle display

#### `runInstaller()` in index.ts (line 122)
```typescript
// Before quiet check, initialize layout if interactive
if (!args.quiet && isInteractive()) {
  const layout = new SplitLayout();
  const spinner = new Spinner(LOGO_FRAMES);
  
  // Set left panel with banner + spinner
  layout.setLeftPanel([
    ...getBannerLines(),
    '', // Space for spinner
    ...getVersionInfo()
  ]);
  
  layout.render();
  spinner.start();
}
```

#### `selectRuntime()` and `selectLocation()` in prompts.ts
- Modify to work with layout manager
- Update console.log calls to use layout.appendToRight()

## 3. Step-by-Step Implementation Instructions

### Phase 1: Create Spinner Infrastructure
1. **Create `src/installer/spinner.ts`**
   - Define ARE logo rotation frames (6-8 frames showing rotation)
   - Implement Spinner class with start/stop/setText methods
   - Use `process.stdout.write()` with ANSI escape codes for in-place updates
   - Handle cleanup on Ctrl+C

2. **Test spinner in isolation**
   - Create a simple test script to verify animation works
   - Ensure it cleans up properly on exit

### Phase 2: Create Layout Manager
1. **Create `src/installer/layout.ts`**
   - Implement terminal size detection using `process.stdout.columns` and `rows`
   - Create ANSI cursor movement utilities
   - Implement SplitLayout class with two-panel rendering
   - Left panel: absolute positioned, right panel: scrolling
   - Use ANSI escape sequences: `\x1b[{row};{col}H` for positioning

2. **Test layout in isolation**
   - Verify panels render correctly at different terminal sizes
   - Test scrolling behavior in right panel

### Phase 3: Refactor Banner Module
1. **Modify `src/installer/banner.ts`**
   - Extract `getBannerLines()`: Returns string[] of ASCII art
   - Extract `getVersionInfo()`: Returns string[] of version/tagline
   - Keep `displayBanner()` for non-interactive mode (backward compatibility)
   - Add `displayBannerWithLayout(layout: SplitLayout)` for new mode

### Phase 4: Integrate into Installer Flow
1. **Modify `src/installer/index.ts`**
   - Add layout initialization in `runInstaller()` (after line 131)
   - Create wrapper functions for output routing
   - Replace direct console output with layout-aware output
   - Add spinner start/stop at appropriate points

2. **Update display functions**
   - `displayInstallResults()`: Use layout.appendToRight()
   - `displayUninstallResults()`: Use layout.appendToRight()

### Phase 5: Update Prompts for Layout
1. **Modify `src/installer/prompts.ts`**
   - Update `arrowKeySelect()` render function
   - Coordinate with layout for cursor positioning
   - Ensure prompts appear in right panel
   - Stop spinner during active selection, restart after

### Phase 6: Handle Edge Cases
1. **Non-interactive mode**: Skip layout entirely, use original behavior
2. **Quiet mode**: Skip layout and spinner
3. **Small terminals**: Fallback to non-layout mode if terminal < 80 cols
4. **Terminal resize**: Handle SIGWINCH signal to update layout
5. **Cleanup**: Ensure layout and spinner cleanup on exit/error

## 4. Dependencies and Imports

### New Imports Needed

#### In spinner.ts:
```typescript
import pc from 'picocolors';
```

#### In layout.ts:
```typescript
import pc from 'picocolors';
```

#### In index.ts:
```typescript
import { Spinner, LOGO_FRAMES } from './spinner.js';
import { SplitLayout } from './layout.js';
```

#### In banner.ts:
```typescript
import type { SplitLayout } from './layout.js';
```

### No New Package Dependencies
- Use existing `picocolors` for ANSI codes
- Use Node.js built-in `readline` and `process.stdout`

## 5. Edge Cases and Risks

### 5.1 Terminal Compatibility
**Risk**: ANSI escape codes may not work on all terminals (Windows CMD)
**Mitigation**: 
- Detect terminal capabilities using `process.stdout.isTTY`
- Fallback to simple mode if ANSI not supported
- Windows Terminal and WSL support ANSI, legacy CMD doesn't

### 5.2 Terminal Size
**Risk**: Small terminals may not have room for split layout
**Mitigation**:
- Require minimum width (80 cols) for split layout
- Auto-fallback to simple mode for smaller terminals
- Handle terminal resize with SIGWINCH

### 5.3 Concurrent Output
**Risk**: Layout and spinner both writing to stdout could cause corruption
**Mitigation**:
- Use a write queue/mutex for stdout access
- Spinner writes to specific coordinates, doesn't interfere with panels
- Pause spinner during active user input

### 5.4 Cleanup on Error
**Risk**: Abnormal exit could leave terminal in bad state
**Mitigation**:
- Register cleanup handlers for SIGINT, SIGTERM, uncaughtException
- Use try/finally blocks around layout/spinner usage
- Restore cursor visibility and clear screen on cleanup

### 5.5 Non-TTY Environments
**Risk**: CI/piped output would break with ANSI codes
**Mitigation**:
- Check `process.stdout.isTTY` before enabling layout
- Reuse existing `isInteractive()` check from prompts.ts
- Keep original simple output as fallback

### 5.6 Progress During Installation
**Risk**: File operations may be fast, making layout seem unnecessary
**Mitigation**:
- Show spinner during any async operations (file checks, writes)
- Use layout even for quick operations for consistent UX
- Provide visual feedback for each step

## 6. Testing Strategy

### 6.1 Unit Tests (Optional, but recommended)
- Test Spinner: frame transitions, cleanup
- Test SplitLayout: panel rendering, scrolling
- Test banner extraction functions

### 6.2 Manual Testing Scenarios

#### Scenario 1: Interactive Installation
```bash
npx agents-reverse-engineer
```
**Expected**: Split layout with rotating logo on left, runtime/location prompts on right

#### Scenario 2: Non-Interactive Installation
```bash
npx agents-reverse-engineer --runtime claude -g
```
**Expected**: Simple output (no layout), logo spins during file operations

#### Scenario 3: Quiet Mode
```bash
npx agents-reverse-engineer --runtime claude -g --quiet
```
**Expected**: Minimal output, no layout, no spinner

#### Scenario 4: Small Terminal
```bash
# Resize terminal to < 80 columns
npx agents-reverse-engineer
```
**Expected**: Fallback to simple mode

#### Scenario 5: Help Flag
```bash
npx agents-reverse-engineer --help
```
**Expected**: Help text with no layout (original behavior)

#### Scenario 6: Uninstall Flow
```bash
npx agents-reverse-engineer uninstall
```
**Expected**: Same layout treatment as install

### 6.3 Terminal Compatibility Testing
- [x] Test on Linux (bash, zsh)
- [x] Test on macOS (Terminal.app, iTerm2)
- [x] Test on Windows (Windows Terminal, WSL)
- [x] Test on Windows (legacy CMD - expect fallback)
- [x] Test in CI environment (GitHub Actions)

### 6.4 Regression Testing
- Ensure all existing command-line flags work
- Verify non-interactive mode still works
- Check that file operations complete successfully
- Confirm cleanup on Ctrl+C

## 7. Logo Frame Design

### ARE Logo Rotation Frames
The rotating logo should show the ARE ASCII art banner rotating. Here are suggested frames:

```
Frame 0 (0°):   Normal banner
Frame 1 (45°):  Slight tilt right
Frame 2 (90°):  Sideways
Frame 3 (135°): Slight tilt left
Frame 4 (180°): Upside down
Frame 5 (225°): Slight tilt right (reverse)
Frame 6 (270°): Sideways (reverse)
Frame 7 (315°): Slight tilt left (reverse)
```

Alternatively, use a simpler spinner next to the banner:
```
⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏
```

## 8. Implementation Priorities

### Must Have (MVP)
1. ✅ Rotating spinner/logo animation
2. ✅ Fixed left panel with ARE banner and version
3. ✅ Scrolling right panel for prompts and output
4. ✅ Fallback to simple mode for non-TTY

### Should Have
5. ✅ Terminal size detection and auto-fallback
6. ✅ Proper cleanup on exit/error
7. ✅ Works in quiet mode (disables layout)

### Nice to Have
8. Terminal resize handling (SIGWINCH)
9. Sophisticated logo rotation (vs simple spinner)
10. Color gradients in logo
11. Animation speed configuration

## 9. Code Example: Basic Spinner Implementation

```typescript
// src/installer/spinner.ts
import pc from 'picocolors';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class Spinner {
  private interval: NodeJS.Timeout | null = null;
  private frameIndex = 0;
  private text = '';
  private row = 0;
  private col = 0;

  constructor(
    private frames: string[] = SPINNER_FRAMES,
    private intervalMs = 80,
  ) {}

  start(text = '', row = 0, col = 0): void {
    this.text = text;
    this.row = row;
    this.col = col;
    
    if (this.interval) return;
    
    this.render();
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.render();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    // Clear the spinner
    this.clearLine();
  }

  private render(): void {
    const frame = pc.cyan(this.frames[this.frameIndex]);
    const output = `${frame} ${this.text}`;
    
    // Move cursor to position and write
    process.stdout.write(`\x1b[${this.row};${this.col}H${output}`);
  }

  private clearLine(): void {
    process.stdout.write(`\x1b[${this.row};${this.col}H\x1b[K`);
  }
}
```

## 10. Success Criteria

The implementation will be considered successful when:

1. ✅ Interactive installer shows split layout with rotating logo
2. ✅ Left panel displays ARE banner and version (fixed position)
3. ✅ Right panel shows runtime selection, location selection, progress, and results
4. ✅ Non-interactive mode works unchanged
5. ✅ Quiet mode works unchanged
6. ✅ Help and version flags work unchanged
7. ✅ Terminal too small triggers graceful fallback
8. ✅ Ctrl+C properly cleans up layout and spinner
9. ✅ Works on Linux, macOS, and Windows Terminal/WSL
10. ✅ No external dependencies added (uses existing picocolors)

---

**Sources**:
- [Ora - Elegant terminal spinner](https://github.com/sindresorhus/ora)
- [CLI Spinners - Spinners for terminal](https://github.com/sindresorhus/cli-spinners)
- [Nanospinner - Minimal terminal spinner](https://github.com/usmanyunusov/nanospinner)
- [OpenAI Codex CLI](https://github.com/openai/codex)
- [CODEX Installer Repository](https://github.com/SolsticeSpectrum/CODEX-Installer)
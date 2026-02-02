---
phase: 05-implement-installation-workflow
verified: 2026-02-02T10:30:00Z
status: human_needed
score: 17/17 must-haves verified
human_verification:
  - test: "Interactive installer with arrow key navigation"
    expected: "User can navigate runtime/location options with arrow keys"
    why_human: "Requires TTY interaction and visual feedback verification"
  - test: "Banner displays correctly with colors"
    expected: "ASCII art appears with green coloring"
    why_human: "Visual appearance requires human verification"
  - test: "Complete install flow to actual runtime directory"
    expected: "Files created in ~/.claude/commands/are/ with correct content"
    why_human: "Real filesystem installation needs validation"
  - test: "Hook registration in settings.json"
    expected: "settings.json contains SessionEnd hook for are-session-end.js"
    why_human: "JSON structure and hook wiring needs validation"
  - test: "Uninstall removes all traces"
    expected: "All installed files removed, hook unregistered, empty dirs cleaned"
    why_human: "Cleanup completeness requires filesystem inspection"
---

# Phase 5: Installation Workflow Verification Report

**Phase Goal:** Users can install via npx with interactive prompts for runtime and location
**Verified:** 2026-02-02T10:30:00Z
**Status:** HUMAN_NEEDED (all automated checks pass, needs human testing)
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `npx agents-reverse-engineer` launches interactive installer | ✓ VERIFIED | CLI routes to runInstaller(), displays banner, prompts for runtime/location |
| 2 | User can select runtime (Claude Code, OpenCode, or all) | ✓ VERIFIED | selectRuntime() prompts with 4 options, arrow key navigation implemented |
| 3 | User can select location (global ~/.claude or local ./.claude) | ✓ VERIFIED | selectLocation() prompts with 2 options, proper path resolution |
| 4 | CLI flags support non-interactive installation (--claude --global, etc.) | ✓ VERIFIED | parseInstallerArgs() handles --runtime, -g/-l flags, validates in non-TTY mode |

**Score:** 4/4 truths verified (automated checks)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/installer/types.ts` | Type definitions for installer | ✓ VERIFIED | 82 lines, exports Runtime, Location, InstallerArgs, InstallerResult, RuntimePaths |
| `src/installer/paths.ts` | Path resolution for runtimes | ✓ VERIFIED | 109 lines, exports getRuntimePaths, getAllRuntimes, resolveInstallPath, getSettingsPath |
| `src/installer/index.ts` | Main installer entry point | ✓ VERIFIED | 339 lines, exports runInstaller, parseInstallerArgs, complete install/uninstall flows |
| `src/installer/banner.ts` | ASCII banner and styled output | ✓ VERIFIED | 119 lines, exports displayBanner, showHelp, showSuccess/Error/Warning/Info |
| `src/installer/prompts.ts` | Interactive arrow key prompts | ✓ VERIFIED | 235 lines, exports selectRuntime, selectLocation, confirmAction, raw mode handling |
| `src/installer/operations.ts` | File operations and hook registration | ✓ VERIFIED | 432 lines, exports installFiles, verifyInstallation, registerHooks, writeVersionFile |
| `src/installer/uninstall.ts` | Uninstallation logic | ✓ VERIFIED | 288 lines, exports uninstallFiles, unregisterHooks, cleanupEmptyDirs |
| `src/cli/index.ts` | CLI with install command routing | ✓ VERIFIED | Updated with install command case, direct flag routing, hasInstallerFlags() |

**Total:** 8/8 artifacts verified

### Artifact Verification Details

#### Level 1: Existence
All 7 installer modules exist + CLI integration complete.

#### Level 2: Substantive
- **types.ts:** 82 lines - defines all required types (Runtime, Location, InstallerArgs, InstallerResult, RuntimePaths)
- **paths.ts:** 109 lines - full path resolution with os.homedir(), env var overrides (CLAUDE_CONFIG_DIR, etc.)
- **index.ts:** 339 lines - complete runInstaller with install/uninstall flows, determineLocation/Runtime helpers, result display
- **banner.ts:** 119 lines - ASCII art banner, showHelp with examples, styled output helpers (success/error/warning/info)
- **prompts.ts:** 235 lines - arrowKeySelect with raw mode, numberedSelect fallback, cleanupRawMode with SIGINT handling
- **operations.ts:** 432 lines - installFilesForRuntime, template copying, hook registration (Claude & Gemini), VERSION file, verifyInstallation
- **uninstall.ts:** 288 lines - uninstallFilesForRuntime, hook unregistration, cleanupEmptyDirs recursively
- **No stub patterns found:** No TODO/FIXME/placeholder comments in any installer files

#### Level 3: Wired
All key links verified:

1. **CLI → Installer:**
   - `src/cli/index.ts` imports `runInstaller, parseInstallerArgs` from `../installer/index.js`
   - Case 'install' routes to runInstaller
   - Direct flag routing (no command + hasInstallerFlags) also routes to runInstaller

2. **Installer → Prompts:**
   - `src/installer/index.ts` imports `selectRuntime, selectLocation, isInteractive` from `./prompts.js`
   - Calls selectRuntime() when !args.runtime && isInteractive()
   - Calls selectLocation() when !location && isInteractive()

3. **Installer → Operations:**
   - `src/installer/index.ts` imports `installFiles, verifyInstallation` from `./operations.js`
   - Calls installFiles(runtime, location, {force, dryRun: false}) in runInstall()
   - Calls verifyInstallation(allCreatedFiles) after install

4. **Installer → Uninstall:**
   - `src/installer/index.ts` imports `uninstallFiles` from `./uninstall.js`
   - Calls uninstallFiles(runtime, location, false) in runUninstall()

5. **Operations → Templates:**
   - `src/installer/operations.ts` imports `getClaudeTemplates, getOpenCodeTemplates, getGeminiTemplates, getHookTemplate` from `../integration/templates.js`
   - Calls getTemplatesForRuntime() to get template content
   - Writes template.content to resolved paths

6. **Prompts → Readline:**
   - `src/installer/prompts.ts` imports `readline` from `node:readline`
   - Calls readline.emitKeypressEvents(process.stdin)
   - Uses process.stdin.setRawMode(true) for arrow key capture
   - Cleanup handlers: cleanupRawMode() in try/finally, process.on('exit'), process.on('SIGINT')

7. **Banner → Picocolors:**
   - `src/installer/banner.ts` imports `pc from 'picocolors'`
   - Uses pc.green(), pc.bold(), pc.dim(), pc.cyan() for colored output

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| CLI | Installer | import & call | ✓ WIRED | runInstaller() called from both 'install' case and direct flag route |
| Installer | Prompts | import & call | ✓ WIRED | selectRuntime/Location called when interactive && missing args |
| Installer | Operations | import & call | ✓ WIRED | installFiles() called with runtime/location/options, result used |
| Installer | Uninstall | import & call | ✓ WIRED | uninstallFiles() called when args.uninstall is true |
| Operations | Templates | import & call | ✓ WIRED | getTemplatesForRuntime() fetches content, written to files |
| Prompts | Readline | import & call | ✓ WIRED | setRawMode(true) for arrow keys, cleanup handlers registered |
| Banner | Picocolors | import & call | ✓ WIRED | pc.green/bold/dim/cyan used for colored output |
| Operations | Hook Registration | function call | ✓ WIRED | registerHooks() called for Claude/Gemini, writes to settings.json |
| Uninstall | Hook Unregistration | function call | ✓ WIRED | unregisterHooks() removes hook from settings.json |

### Requirements Coverage

Phase 5 has 4 implicit requirements (not yet in REQUIREMENTS.md):

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| INST-01: Interactive runtime selection | ✓ SATISFIED | selectRuntime() with arrow keys implemented |
| INST-02: Interactive location selection | ✓ SATISFIED | selectLocation() with global/local options implemented |
| INST-03: Non-interactive flag support | ✓ SATISFIED | --runtime, -g/-l flags validated in non-TTY mode |
| INST-04: File installation to correct locations | ✓ SATISFIED | resolveInstallPath() + installFiles() write to runtime dirs |

### Anti-Patterns Found

**None found.** Comprehensive scan of all installer files:

- No TODO/FIXME/XXX/HACK comments
- No placeholder text or stub implementations
- No empty return objects (empty arrays for help/early exit are legitimate)
- No console.log-only handlers
- All exports are properly typed and implemented
- Raw mode cleanup properly handled with try/finally and exit handlers
- Hook registration merges with existing settings, doesn't overwrite

### Build & TypeScript Verification

```bash
npm run build
# Output: Clean compilation, no errors

npx tsc --noEmit
# Output: No TypeScript errors

npx tsx src/cli/index.ts --help
# Output: Shows install command in help text

npx tsx src/cli/index.ts install --help
# Output: Shows installer-specific help with --runtime, -g/-l flags
```

### Human Verification Required

Automated structural verification is complete, but the phase goal requires human testing of the interactive user experience:

#### 1. Interactive Installer Launch

**Test:** Run `npx tsx src/cli/index.ts install` in a TTY terminal
**Expected:**
- ASCII art "ARE" banner appears in green
- Version number displayed
- Tagline "AI-friendly codebase documentation" shown
- Runtime selection prompt appears with cursor on first option

**Why human:** Visual appearance and color rendering requires human eyes

#### 2. Arrow Key Navigation

**Test:** Use arrow keys to navigate runtime and location prompts
**Expected:**
- Up/down arrows move selection (cyan highlight follows cursor)
- Enter key confirms selection
- Navigation feels responsive and natural
- No terminal corruption or raw mode leakage

**Why human:** Interactive input behavior can't be verified programmatically

#### 3. Non-Interactive Mode

**Test:** Run `npx tsx src/cli/index.ts --runtime claude --local --force`
**Expected:**
- No prompts appear
- Banner displays (unless --quiet)
- Files created in ./.claude/commands/are/
- Success message with checkmarks
- Files listed (created/skipped)

**Why human:** Need to verify actual filesystem operations and visual output

#### 4. File Installation Verification

**Test:** Check that files were created in correct location
**Expected:**
- `./.claude/commands/are/generate.md` exists with command content
- `./.claude/commands/are/update.md` exists
- `./.claude/commands/are/help.md` exists
- `./.claude/commands/are/init.md` exists
- `./.claude/hooks/are-session-end.js` exists with hook code
- `./.claude/VERSION` contains "0.1.2"

**Why human:** Need to inspect actual file contents and verify correctness

#### 5. Hook Registration (Claude Global)

**Test:** Run `npx tsx src/cli/index.ts --runtime claude --global` (or local with settings.json)
**Expected:**
- `~/.claude/settings.json` (or ./.claude/settings.json) contains:
  ```json
  {
    "hooks": {
      "SessionEnd": [
        {
          "hooks": [
            {
              "type": "command",
              "command": "node hooks/are-session-end.js"
            }
          ]
        }
      ]
    }
  }
  ```
- If settings.json had existing content, it's preserved
- Hook is appended, not replacing existing hooks

**Why human:** Need to verify JSON structure matches Claude Code hook format exactly

#### 6. Uninstall Cleanup

**Test:** Run `npx tsx src/cli/index.ts --runtime claude --local --uninstall`
**Expected:**
- All command files removed from ./.claude/commands/are/
- Hook file removed from ./.claude/hooks/
- VERSION file removed
- Hook entry removed from settings.json
- Empty directories cleaned up (are/, commands/, hooks/)
- Success message shows files removed count
- No errors or warnings

**Why human:** Need to verify complete cleanup and no leftover artifacts

#### 7. Multi-Runtime Installation

**Test:** Run `npx tsx src/cli/index.ts --runtime all --local`
**Expected:**
- Creates ./.claude/commands/are/ with commands
- Creates ./.opencode/commands/are/ with commands
- Creates ./.gemini/commands/are/ with commands
- Success message shows installation for all three runtimes
- Each runtime gets appropriate file count

**Why human:** Need to verify templates for each runtime are correct

#### 8. CI/Non-Interactive Mode Error Handling

**Test:** Run `echo "" | npx tsx src/cli/index.ts --runtime claude` (no location flag, piped stdin)
**Expected:**
- Error message: "Missing -g/--global or -l/--local flag (required in non-interactive mode)"
- Exit code 1
- No prompts attempted

**Why human:** Need to verify error handling in non-TTY environments

### Gaps Summary

**No gaps found.** All phase goal requirements are met by the implementation:

1. ✓ Running `npx agents-reverse-engineer` launches interactive installer
2. ✓ User can select runtime (Claude Code, OpenCode, or all)
3. ✓ User can select location (global ~/.claude or local ./.claude)
4. ✓ CLI flags support non-interactive installation

All must-have artifacts exist, are substantive (no stubs), and are properly wired together. The implementation is complete and ready for human verification testing.

---

_Verified: 2026-02-02T10:30:00Z_
_Verifier: Claude (gsd-verifier)_

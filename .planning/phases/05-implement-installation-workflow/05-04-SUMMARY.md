---
phase: 05-implement-installation-workflow
plan: 04
subsystem: installer
tags: [uninstall, cli, entry-point]

dependency_graph:
  requires: [05-02, 05-03]
  provides: [complete-installer, cli-install-command, uninstall-capability]
  affects: [05-05]

tech_stack:
  added: []
  patterns: [cleanup-on-uninstall, direct-flag-routing]

key_files:
  created:
    - src/installer/uninstall.ts
  modified:
    - src/installer/index.ts
    - src/cli/index.ts
    - src/installer/banner.ts
    - src/installer/prompts.ts

decisions:
  - id: hookRegistered-repurpose
    choice: "Repurpose hookRegistered field for uninstall to indicate hook was unregistered"
    rationale: "Avoids adding new field to InstallerResult type"
  - id: direct-flag-routing
    choice: "Route installer flags directly without 'install' command"
    rationale: "Supports npx agents-reverse-engineer --runtime claude -g pattern"
  - id: picocolors-default-import
    choice: "Use default import for picocolors instead of namespace"
    rationale: "Matches existing codebase pattern and ESM compatibility"

metrics:
  duration: 4 min
  completed: 2026-02-02
---

# Phase 05 Plan 04: Uninstall Logic & CLI Integration Summary

Complete installer with uninstall support and CLI routing for `npx agents-reverse-engineer install`.

## What Was Built

### src/installer/uninstall.ts (new)

Uninstallation module that removes installed files and unregisters hooks.

**Key functions:**
- `uninstallFiles(runtime, location, dryRun)`: Remove command files for one or all runtimes
- `unregisterHooks(basePath, dryRun)`: Remove ARE hook from settings.json
- `cleanupEmptyDirs(dirPath)`: Remove empty directories after file deletion

**Logic:**
1. Gets templates for target runtime(s)
2. For each template file, deletes if exists
3. For Claude, also deletes hook file `hooks/are-session-end.js`
4. Deletes VERSION file if exists
5. Unregisters hook from settings.json for global Claude installs
6. Cleans up empty `are/` and `commands/` directories

### src/installer/index.ts (completed)

Full installer entry point now implementing actual install/uninstall flows.

**Changes:**
- Added imports for `installFiles`, `verifyInstallation`, `uninstallFiles`
- Implemented `runInstall()` - calls installFiles, verifies, displays results
- Implemented `runUninstall()` - calls uninstallFiles, displays results
- Added `displayInstallResults()` - shows checkmarks, file counts, next steps
- Added `displayUninstallResults()` - shows removal summary

**Flow:**
```
runInstaller(args)
  -> args.uninstall? runUninstall() : runInstall()
  -> Display results with styled output
  -> Show GitHub docs URL
```

### src/cli/index.ts (updated)

CLI now routes install command and direct installer flags.

**Changes:**
- Added import for `runInstaller`, `parseInstallerArgs`
- Added `install` case to switch statement
- Added `hasInstallerFlags()` helper for direct invocation detection
- Added -g/-l/-u short flags to parseArgs
- Updated USAGE to document install options and examples

**Routing:**
1. `are install --runtime claude -g` -> runInstaller
2. `npx are --runtime claude -g` -> runInstaller (direct)
3. `are install --help` -> showHelp (installer-specific)

## Commits

| Hash | Description |
|------|-------------|
| 3d6dd03 | feat(05-04): create uninstall module |
| b26e87e | feat(05-04): complete installer entry point with install/uninstall flows |
| 701ee89 | feat(05-04): add install command to CLI with direct flag support |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed picocolors import style**
- **Found during:** Task 3 verification
- **Issue:** banner.ts and prompts.ts used `import * as pc from 'picocolors'` which caused `pc.bold is not a function` error at runtime
- **Fix:** Changed to default import `import pc from 'picocolors'` to match existing codebase pattern
- **Files modified:** src/installer/banner.ts, src/installer/prompts.ts
- **Commit:** 701ee89 (included in Task 3 commit)

## Verification Results

All verification criteria passed:

1. All files compile: `npm run build` succeeds
2. `npx tsx src/cli/index.ts install --help` shows installer help
3. `npx tsx src/cli/index.ts --runtime claude --local --force` runs non-interactive install
4. Uninstall removes files (tested with local install/uninstall cycle)
5. Direct flag invocation without 'install' command works

## Success Criteria Checklist

- [x] src/installer/uninstall.ts exports uninstallFiles, unregisterHooks
- [x] Uninstall removes command files, hook files, and VERSION
- [x] Uninstall removes hook registration from settings.json
- [x] src/cli/index.ts handles 'install' command
- [x] Direct flag invocation (npx are --runtime claude -g) works
- [x] Non-interactive mode validates required flags are present
- [x] Success message shows checkmarks and next steps

## Next Phase Readiness

**Ready for Plan 05-05: TUI Entry Point**

Provides:
- Complete install/uninstall functionality
- CLI routing for `are install` command
- Direct npx invocation support

Blockers: None

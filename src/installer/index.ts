/**
 * Main installer entry point for agents-reverse-engineer
 *
 * Provides the runInstaller function for npx installation workflow.
 * Supports interactive prompts and non-interactive flags for CI/scripted installs.
 * Features split-pane layout with rotating golden circle animation in TTY mode.
 */

import pc from 'picocolors';
import type { InstallerArgs, InstallerResult, Runtime, Location } from './types.js';
import { getAllRuntimes, resolveInstallPath } from './paths.js';
import {
  displayBanner,
  showHelp,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  showNextSteps,
  getLeftPaneContent,
} from './banner.js';
import { selectRuntime, selectLocation, confirmAction, isInteractive } from './prompts.js';
import { installFiles, verifyInstallation, formatInstallResult } from './operations.js';
import { uninstallFiles, deleteConfigFolder, removeGitignoreEntry, removeVscodeExclude } from './uninstall.js';
import { SplitPaneLayout, clearScreen } from './layout.js';
import { Spinner, GOLDEN_CIRCLE_SPINNER } from './spinner.js';

// Re-export types for external consumers
export type { InstallerArgs, InstallerResult, Runtime, Location, RuntimePaths } from './types.js';
export { getRuntimePaths, getAllRuntimes, resolveInstallPath, getSettingsPath } from './paths.js';
export { displayBanner, showHelp, showSuccess, showError, showWarning, showInfo, showNextSteps, VERSION } from './banner.js';
export { selectRuntime, selectLocation, confirmAction, isInteractive } from './prompts.js';

/**
 * Parse command-line arguments for the installer
 *
 * Handles both short (-g, -l, -h) and long (--global, --local, --help) flags.
 * Uses pattern from cli/index.ts for consistency.
 *
 * @param args - Command line arguments (process.argv.slice(2))
 * @returns Parsed installer arguments
 */
export function parseInstallerArgs(args: string[]): InstallerArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--runtime' && i + 1 < args.length) {
      // --runtime requires a value
      values.set('runtime', args[++i]);
    } else if (arg === '-g' || arg === '--global') {
      flags.add('global');
    } else if (arg === '-l' || arg === '--local') {
      flags.add('local');
    } else if (arg === '--force') {
      flags.add('force');
    } else if (arg === '-q' || arg === '--quiet') {
      flags.add('quiet');
    } else if (arg === '-h' || arg === '--help') {
      flags.add('help');
    }
  }

  // Validate runtime value if provided
  const runtimeValue = values.get('runtime');
  const validRuntimes: Runtime[] = ['claude', 'codex', 'opencode', 'gemini', 'all'];
  const runtime = runtimeValue && validRuntimes.includes(runtimeValue as Runtime)
    ? (runtimeValue as Runtime)
    : undefined;

  return {
    runtime,
    global: flags.has('global'),
    local: flags.has('local'),
    uninstall: false, // Set by 'uninstall' command, not flags
    force: flags.has('force'),
    help: flags.has('help'),
    quiet: flags.has('quiet'),
  };
}

/**
 * Determine installation location from args or return undefined for prompt
 */
function determineLocation(args: InstallerArgs): Location | undefined {
  if (args.global && !args.local) {
    return 'global';
  }
  if (args.local && !args.global) {
    return 'local';
  }
  return undefined;
}

/**
 * Determine target runtimes from args
 */
function determineRuntimes(runtime: Runtime | undefined): Array<Exclude<Runtime, 'all'>> {
  if (!runtime) {
    return [];
  }
  if (runtime === 'all') {
    return getAllRuntimes();
  }
  return [runtime];
}

/**
 * Create a SplitPaneLayout if conditions allow (TTY, sufficient width, not quiet).
 * Returns undefined if layout should not be used.
 */
function createLayout(quiet: boolean): SplitPaneLayout | undefined {
  if (quiet || !process.stdout.isTTY) {
    return undefined;
  }

  const layout = new SplitPaneLayout({ leftWidth: 44, padding: 2 });
  return layout.isEnabled ? layout : undefined;
}

/**
 * Run the installer workflow
 *
 * This is the main entry point for the installation process.
 * Supports both interactive mode (prompts) and non-interactive mode (flags).
 */
export async function runInstaller(args: InstallerArgs): Promise<InstallerResult[]> {
  // Handle help flag
  if (args.help) {
    showHelp();
    return [];
  }

  // Create layout for split-pane mode (TTY only, not quiet)
  const layout = createLayout(args.quiet);

  // Start spinner + layout from the beginning so the circle rotates
  // throughout the entire installer flow (prompts, install, results).
  let spinner: Spinner | undefined;

  if (layout) {
    clearScreen();
    displayBanner(layout);
    // Draw separator for the initial screen height
    layout.drawSeparator(process.stdout.rows || 24);
    // Position right pane cursor after banner area
    layout.setRightRow(2);

    // Start the rotating golden circle in the left pane
    spinner = new Spinner(GOLDEN_CIRCLE_SPINNER);
    spinner.start(4, 2);
  } else if (!args.quiet) {
    displayBanner();
  }

  /** Stop spinner and restore static banner on exit */
  const stopSpinner = (): void => {
    if (spinner) {
      spinner.stop();
      spinner = undefined;
      // Re-render the static banner frame, separator, and right pane after spinner stops
      if (layout) {
        const content = getLeftPaneContent(0);
        layout.setLeftPane(content);
        layout.renderLeftPane();
        layout.drawSeparator(process.stdout.rows || 24);
        layout.refreshRight();
      }
    }
  };

  try {
    // Determine location and runtimes from flags
    let location = determineLocation(args);
    const runtimeArg = args.runtime;

    // Non-interactive mode: require all flags
    if (!isInteractive()) {
      if (!runtimeArg) {
        stopSpinner();
        showError('Missing --runtime flag (required in non-interactive mode)');
        process.exit(1);
      }
      if (!location) {
        stopSpinner();
        showError('Missing -g/--global or -l/--local flag (required in non-interactive mode)');
        process.exit(1);
      }
    }

    // Interactive mode: prompt for missing values (rendered in right pane)
    const mode = args.uninstall ? 'uninstall' : 'install';
    let selectedRuntime: Runtime | undefined = runtimeArg;
    if (!selectedRuntime && isInteractive()) {
      selectedRuntime = await selectRuntime(mode, layout);
    }

    if (!location && isInteractive()) {
      location = await selectLocation(mode, layout);
    }

    // Safety check
    if (!selectedRuntime || !location) {
      stopSpinner();
      showError('Unable to determine runtime and location');
      process.exit(1);
    }

    let results: InstallerResult[];

    // UNINSTALL MODE
    if (args.uninstall) {
      results = await runUninstall(selectedRuntime, location, args.quiet, layout);
    } else {
      // INSTALL MODE
      results = await runInstall(selectedRuntime, location, args.force, args.quiet, layout);
    }

    stopSpinner();
    layout?.finalize();
    return results;
  } catch (err) {
    stopSpinner();
    layout?.finalize();
    throw err;
  }
}

/**
 * Run the installation workflow with optional split-pane layout and spinner.
 */
async function runInstall(
  runtime: Runtime,
  location: Location,
  force: boolean,
  quiet: boolean,
  layout?: SplitPaneLayout,
): Promise<InstallerResult[]> {
  if (layout) {
    layout.appendRight(pc.dim('Installing files...'));
    layout.appendRight('');
  }

  // Install files with progress callback
  const results = installFiles(runtime, location, {
    force,
    dryRun: false,
    onProgress: layout
      ? (current, total, file) => {
          const shortFile = file.split('/').slice(-2).join('/');
          const statusRow = layout.currentRightRow - 1;
          layout.setRightRow(statusRow);
          layout.appendRight(pc.dim(`Installing (${current}/${total}): ${shortFile}`));
        }
      : undefined,
  });

  // Verify installation
  const allCreatedFiles = results.flatMap((r) => r.filesCreated);
  const verification = verifyInstallation(allCreatedFiles);

  if (!verification.success) {
    if (layout) {
      layout.appendRight(pc.red('✗') + ' Installation verification failed:');
      for (const missing of verification.missing) {
        layout.appendRight(pc.yellow('  ! Missing: ') + missing);
      }
    } else {
      showError('Installation verification failed - some files missing:');
      for (const missing of verification.missing) {
        showWarning(`  Missing: ${missing}`);
      }
    }
  }

  // Display results
  if (!quiet) {
    displayInstallResults(results, layout);
  }

  return results;
}

/**
 * Run the uninstallation workflow
 */
async function runUninstall(
  runtime: Runtime,
  location: Location,
  quiet: boolean,
  layout?: SplitPaneLayout,
): Promise<InstallerResult[]> {
  const results = uninstallFiles(runtime, location, false);

  const configDeleted = deleteConfigFolder(location, false);

  let gitignoreCleaned = false;
  let vscodeCleaned = false;
  if (location === 'local') {
    try {
      gitignoreCleaned = await removeGitignoreEntry(false);
    } catch {
      // Non-fatal
    }
    try {
      vscodeCleaned = await removeVscodeExclude(false);
    } catch {
      // Non-fatal
    }
  }

  if (!quiet) {
    displayUninstallResults(results, configDeleted, gitignoreCleaned, vscodeCleaned, layout);
  }

  return results;
}

/**
 * Display installation results with styled output.
 * Renders in split-pane right pane when layout is provided.
 */
function displayInstallResults(results: InstallerResult[], layout?: SplitPaneLayout): void {
  const output = (text: string): void => {
    if (layout) {
      layout.appendRight(text);
    } else {
      console.log(text);
    }
  };

  output('');

  let totalCreated = 0;
  let totalSkipped = 0;
  let hooksRegistered = 0;

  for (const result of results) {
    if (result.success) {
      output(pc.green('✓') + ` Installed ${result.runtime} (${result.location})`);
    } else {
      output(pc.red('✗') + ` Failed to install ${result.runtime} (${result.location})`);
      for (const err of result.errors) {
        output(pc.yellow('  ! ') + err);
      }
    }

    totalCreated += result.filesCreated.length;
    totalSkipped += result.filesSkipped.length;

    if (result.hookRegistered) {
      hooksRegistered++;
    }
  }

  // Summary
  output('');
  if (totalCreated > 0) {
    output(pc.green('✓') + ` Created ${totalCreated} command files`);
  }
  if (hooksRegistered > 0) {
    output(pc.green('✓') + ` Registered ${hooksRegistered} session hook(s)`);
  }
  if (totalSkipped > 0) {
    output(pc.yellow('!') + ` Skipped ${totalSkipped} existing files (use --force to overwrite)`);
  }

  // Next steps (includes docs link)
  const primaryRuntime = results[0]?.runtime || 'claude';
  showNextSteps(primaryRuntime, totalCreated, layout);
}

/**
 * Display uninstallation results with styled output.
 */
function displayUninstallResults(
  results: InstallerResult[],
  configDeleted: boolean = false,
  gitignoreCleaned: boolean = false,
  vscodeCleaned: boolean = false,
  layout?: SplitPaneLayout,
): void {
  const output = (text: string): void => {
    if (layout) {
      layout.appendRight(text);
    } else {
      console.log(text);
    }
  };

  output('');

  let totalDeleted = 0;
  let hooksUnregistered = 0;

  for (const result of results) {
    const deletedCount = result.filesCreated.length;

    if (result.success) {
      if (deletedCount > 0) {
        output(pc.green('✓') + ` Uninstalled ${result.runtime} (${result.location}) - ${deletedCount} files removed`);
      } else {
        output(pc.cyan('>') + ` No ${result.runtime} files found in ${result.location}`);
      }
    } else {
      output(pc.red('✗') + ` Failed to uninstall ${result.runtime} (${result.location})`);
      for (const err of result.errors) {
        output(pc.yellow('  ! ') + err);
      }
    }

    totalDeleted += deletedCount;

    if (result.hookRegistered) {
      hooksUnregistered++;
    }
  }

  // Summary
  output('');
  if (totalDeleted > 0) {
    output(pc.green('✓') + ` Removed ${totalDeleted} files`);
  }
  if (hooksUnregistered > 0) {
    output(pc.green('✓') + ` Unregistered ${hooksUnregistered} session hook(s)`);
  }
  if (configDeleted) {
    output(pc.green('✓') + ` Removed .agents-reverse-engineer folder`);
  }
  if (gitignoreCleaned) {
    output(pc.green('✓') + ` Removed ARE section from .gitignore`);
  }
  if (vscodeCleaned) {
    output(pc.green('✓') + ` Removed *.sum from .vscode/settings.json`);
  }
  if (totalDeleted === 0 && !configDeleted && !gitignoreCleaned && !vscodeCleaned) {
    output(pc.cyan('>') + ' No files were removed');
  }
}

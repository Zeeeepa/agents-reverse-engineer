/**
 * Main installer entry point for agents-reverse-engineer
 *
 * Provides the runInstaller function for npx installation workflow.
 * Supports interactive prompts and non-interactive flags for CI/scripted installs.
 */

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
} from './banner.js';
import { selectRuntime, selectLocation, confirmAction, isInteractive } from './prompts.js';
import { installFiles, verifyInstallation, formatInstallResult } from './operations.js';
import { uninstallFiles, deleteConfigFolder } from './uninstall.js';

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
  const validRuntimes: Runtime[] = ['claude', 'opencode', 'gemini', 'all'];
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
 *
 * @param args - Parsed installer arguments
 * @returns Location if specified, undefined if needs prompt
 */
function determineLocation(args: InstallerArgs): Location | undefined {
  if (args.global && !args.local) {
    return 'global';
  }
  if (args.local && !args.global) {
    return 'local';
  }
  // Both or neither - needs interactive prompt
  return undefined;
}

/**
 * Determine target runtimes from args
 *
 * @param runtime - Runtime from args (may be 'all' or specific runtime)
 * @returns Array of specific runtimes to install to
 */
function determineRuntimes(runtime: Runtime | undefined): Array<Exclude<Runtime, 'all'>> {
  if (!runtime) {
    // No runtime specified - will need interactive prompt
    return [];
  }
  if (runtime === 'all') {
    return getAllRuntimes();
  }
  return [runtime];
}

/**
 * Run the installer workflow
 *
 * This is the main entry point for the installation process.
 * Supports both interactive mode (prompts) and non-interactive mode (flags).
 *
 * @param args - Parsed installer arguments
 * @returns Array of installation results (one per runtime/location combination)
 */
export async function runInstaller(args: InstallerArgs): Promise<InstallerResult[]> {
  // Handle help flag
  if (args.help) {
    showHelp();
    return [];
  }

  // Display banner unless quiet mode
  if (!args.quiet) {
    displayBanner();
  }

  // Determine location and runtimes from flags
  let location = determineLocation(args);
  const runtimeArg = args.runtime;

  // Non-interactive mode: require all flags
  if (!isInteractive()) {
    if (!runtimeArg) {
      showError('Missing --runtime flag (required in non-interactive mode)');
      process.exit(1);
    }
    if (!location) {
      showError('Missing -g/--global or -l/--local flag (required in non-interactive mode)');
      process.exit(1);
    }
  }

  // Interactive mode: prompt for missing values
  const mode = args.uninstall ? 'uninstall' : 'install';
  let selectedRuntime: Runtime | undefined = runtimeArg;
  if (!selectedRuntime && isInteractive()) {
    selectedRuntime = await selectRuntime(mode);
  }

  if (!location && isInteractive()) {
    location = await selectLocation(mode);
  }

  // Safety check - should not reach here without values
  if (!selectedRuntime || !location) {
    showError('Unable to determine runtime and location');
    process.exit(1);
  }

  // UNINSTALL MODE
  if (args.uninstall) {
    return runUninstall(selectedRuntime, location, args.quiet);
  }

  // INSTALL MODE
  return runInstall(selectedRuntime, location, args.force, args.quiet);
}

/**
 * Run the installation workflow
 *
 * @param runtime - Target runtime or 'all'
 * @param location - Installation location
 * @param force - Overwrite existing files
 * @param quiet - Suppress output
 * @returns Array of installation results
 */
async function runInstall(
  runtime: Runtime,
  location: Location,
  force: boolean,
  quiet: boolean,
): Promise<InstallerResult[]> {
  // Install files
  const results = installFiles(runtime, location, { force, dryRun: false });

  // Verify installation
  const allCreatedFiles = results.flatMap((r) => r.filesCreated);
  const verification = verifyInstallation(allCreatedFiles);

  if (!verification.success) {
    showError('Installation verification failed - some files missing:');
    for (const missing of verification.missing) {
      showWarning(`  Missing: ${missing}`);
    }
  }

  // Display results
  if (!quiet) {
    displayInstallResults(results);
  }

  return results;
}

/**
 * Run the uninstallation workflow
 *
 * @param runtime - Target runtime or 'all'
 * @param location - Installation location
 * @param quiet - Suppress output
 * @returns Array of uninstallation results
 */
function runUninstall(
  runtime: Runtime,
  location: Location,
  quiet: boolean,
): InstallerResult[] {
  const results = uninstallFiles(runtime, location, false);

  // Delete .agents-reverse-engineer config folder (local only)
  const configDeleted = deleteConfigFolder(location, false);

  // Display results
  if (!quiet) {
    displayUninstallResults(results, configDeleted);
  }

  return results;
}

/**
 * Display installation results with styled output
 *
 * Shows checkmarks for successful actions, warnings for skipped files,
 * and next steps for using the installed commands.
 *
 * @param results - Array of installation results
 */
function displayInstallResults(results: InstallerResult[]): void {
  console.log();

  let totalCreated = 0;
  let totalSkipped = 0;
  let hooksRegistered = 0;

  for (const result of results) {
    if (result.success) {
      showSuccess(`Installed ${result.runtime} (${result.location})`);
    } else {
      showError(`Failed to install ${result.runtime} (${result.location})`);
      for (const err of result.errors) {
        showWarning(`  ${err}`);
      }
    }

    totalCreated += result.filesCreated.length;
    totalSkipped += result.filesSkipped.length;

    if (result.hookRegistered) {
      hooksRegistered++;
    }
  }

  // Summary
  console.log();
  if (totalCreated > 0) {
    showSuccess(`Created ${totalCreated} command files`);
  }
  if (hooksRegistered > 0) {
    showSuccess(`Registered ${hooksRegistered} session hook(s)`);
  }
  if (totalSkipped > 0) {
    showWarning(`Skipped ${totalSkipped} existing files (use --force to overwrite)`);
  }

  // Next steps
  const primaryRuntime = results[0]?.runtime || 'claude';
  showNextSteps(primaryRuntime, totalCreated);

  // GitHub link
  console.log();
  showInfo('Docs: https://github.com/GeoloeG-IsT/agents-reverse-engineer');
}

/**
 * Display uninstallation results with styled output
 *
 * @param results - Array of uninstallation results
 * @param configDeleted - Whether the .agents-reverse-engineer folder was deleted
 */
function displayUninstallResults(results: InstallerResult[], configDeleted: boolean = false): void {
  console.log();

  let totalDeleted = 0;
  let hooksUnregistered = 0;

  for (const result of results) {
    // In uninstall context, filesCreated tracks deleted files
    const deletedCount = result.filesCreated.length;
    const notFoundCount = result.filesSkipped.length;

    if (result.success) {
      if (deletedCount > 0) {
        showSuccess(`Uninstalled ${result.runtime} (${result.location}) - ${deletedCount} files removed`);
      } else {
        showInfo(`No ${result.runtime} files found in ${result.location}`);
      }
    } else {
      showError(`Failed to uninstall ${result.runtime} (${result.location})`);
      for (const err of result.errors) {
        showWarning(`  ${err}`);
      }
    }

    totalDeleted += deletedCount;

    // hookRegistered is repurposed for uninstall to mean "hook was unregistered"
    if (result.hookRegistered) {
      hooksUnregistered++;
    }
  }

  // Summary
  console.log();
  if (totalDeleted > 0) {
    showSuccess(`Removed ${totalDeleted} files`);
  }
  if (hooksUnregistered > 0) {
    showSuccess(`Unregistered ${hooksUnregistered} session hook(s)`);
  }
  if (configDeleted) {
    showSuccess(`Removed .agents-reverse-engineer folder`);
  }
  if (totalDeleted === 0 && !configDeleted) {
    showInfo('No files were removed');
  }
}

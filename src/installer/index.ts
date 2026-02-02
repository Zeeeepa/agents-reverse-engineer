/**
 * Main installer entry point for agents-reverse-engineer
 *
 * Provides the runInstaller function for npx installation workflow.
 * Supports interactive prompts and non-interactive flags for CI/scripted installs.
 */

import type { InstallerArgs, InstallerResult, Runtime, Location } from './types.js';
import { getAllRuntimes, resolveInstallPath } from './paths.js';
import { displayBanner, showHelp, showSuccess, showError, showWarning, showInfo } from './banner.js';
import { selectRuntime, selectLocation, confirmAction, isInteractive } from './prompts.js';

// Re-export types for external consumers
export type { InstallerArgs, InstallerResult, Runtime, Location, RuntimePaths } from './types.js';
export { getRuntimePaths, getAllRuntimes, resolveInstallPath, getSettingsPath } from './paths.js';
export { displayBanner, showHelp, showSuccess, showError, showWarning, showInfo, showNextSteps, VERSION } from './banner.js';
export { selectRuntime, selectLocation, confirmAction, isInteractive } from './prompts.js';

/**
 * Parse command-line arguments for the installer
 *
 * Handles both short (-g, -l, -u, -h) and long (--global, --local, --uninstall, --help) flags.
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
    } else if (arg === '-u' || arg === '--uninstall') {
      flags.add('uninstall');
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
    uninstall: flags.has('uninstall'),
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
  let runtimes = determineRuntimes(args.runtime);

  // Non-interactive mode: require all flags
  if (!isInteractive()) {
    if (runtimes.length === 0) {
      showError('Missing --runtime flag (required in non-interactive mode)');
      process.exit(1);
    }
    if (!location) {
      showError('Missing -g/--global or -l/--local flag (required in non-interactive mode)');
      process.exit(1);
    }
  } else {
    // Interactive mode: prompt for missing values
    if (runtimes.length === 0) {
      const selectedRuntime = await selectRuntime();
      runtimes = determineRuntimes(selectedRuntime);
    }
    if (!location) {
      location = await selectLocation();
    }
  }

  // TODO (Plan 03): File operations
  // For each runtime/location combination:
  // - Copy command files to target directory
  // - Register hooks in settings.json (for global installs)
  // - Write VERSION file

  // TODO (Plan 04): Uninstall logic
  // If args.uninstall:
  // - Remove command files
  // - Unregister hooks from settings.json
  // - Remove VERSION file

  // For now, return placeholder results
  // This skeleton establishes the API contract for subsequent plans
  const results: InstallerResult[] = [];

  for (const runtime of runtimes) {
    const installPath = resolveInstallPath(runtime, location!);

    if (!args.quiet) {
      showInfo(`Would install ${runtime} to ${location}: ${installPath}`);
    }

    results.push({
      success: true,
      runtime,
      location: location!,
      filesCreated: [],
      filesSkipped: [],
      errors: [],
    });
  }

  return results;
}

/**
 * Main installer entry point for agents-reverse-engineer
 *
 * Provides the runInstaller function for npx installation workflow.
 * Supports interactive prompts and non-interactive flags for CI/scripted installs.
 */

import type { InstallerArgs, InstallerResult, Runtime, Location } from './types.js';
import { getAllRuntimes, resolveInstallPath } from './paths.js';

// Re-export types for external consumers
export type { InstallerArgs, InstallerResult, Runtime, Location, RuntimePaths } from './types.js';
export { getRuntimePaths, getAllRuntimes, resolveInstallPath, getSettingsPath } from './paths.js';

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
  // Help is handled by caller (shows usage and exits)
  if (args.help) {
    return [];
  }

  // Determine location and runtimes
  const location = determineLocation(args);
  const runtimes = determineRuntimes(args.runtime);

  // TODO (Plan 02): Interactive prompts for missing location/runtime
  // If location is undefined and not in CI mode, prompt user
  // If runtimes is empty and not in CI mode, prompt user

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

  // For now, return empty results
  // This skeleton establishes the API contract for subsequent plans
  const results: InstallerResult[] = [];

  // Log placeholder info for development
  if (runtimes.length > 0 && location) {
    for (const runtime of runtimes) {
      const installPath = resolveInstallPath(runtime, location);
      console.log(`Would install ${runtime} to ${location}: ${installPath}`);

      results.push({
        success: true,
        runtime,
        location,
        filesCreated: [],
        filesSkipped: [],
        errors: [],
      });
    }
  } else {
    // Missing required info - would prompt in interactive mode
    console.log('Interactive mode: would prompt for runtime and location');
    console.log(`  runtime: ${args.runtime || '(needs prompt)'}`);
    console.log(`  location: ${location || '(needs prompt)'}`);
  }

  return results;
}

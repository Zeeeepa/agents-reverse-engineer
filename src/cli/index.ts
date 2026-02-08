#!/usr/bin/env node
/**
 * CLI entry point for agents-reverse
 *
 * Commands:
 *   init              Create default configuration
 *   discover [path]   Discover files to analyze
 *   generate [path]   Generate documentation plan
 *   update [path]     Update docs incrementally
 *   clean [path]      Delete all generated artifacts
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { initCommand } from './init.js';
import { discoverCommand } from './discover.js';
import { generateCommand, type GenerateOptions } from './generate.js';
import { updateCommand, type UpdateCommandOptions } from './update.js';
import { cleanCommand, type CleanOptions } from './clean.js';

import { runInstaller, parseInstallerArgs } from '../installer/index.js';

/**
 * Get package version from package.json.
 */
function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const packagePath = join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return packageJson.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

const VERSION = getVersion();

const USAGE = `
agents-reverse-engineer - AI-friendly codebase documentation

Commands:
  install           Install commands and hooks to AI assistant
  uninstall         Remove installed commands and hooks
  init              Create default configuration
  discover [path]   Discover files to analyze (default: current directory)
  generate [path]   Generate documentation plan (default: current directory)
  update [path]     Update docs incrementally (default: current directory)
  clean [path]      Delete all generated artifacts (.sum, AGENTS.md, etc.)

Install/Uninstall Options:
  --runtime <name>  Runtime to target (claude, opencode, gemini, all)
  -g, --global      Target global config directory
  -l, --local       Target current project directory
  --force           Overwrite existing files (install only)

General Options:
  --debug           Show AI prompts and backend details
  --trace           Enable concurrency tracing (.agents-reverse-engineer/traces/)
  --dry-run         Show plan without writing files (generate, update)
  --concurrency <n> Number of concurrent AI calls (default: 5)
  --fail-fast       Stop on first file analysis failure
  --uncommitted     Include uncommitted changes (update only)
  --help, -h        Show this help
  --version, -V     Show version number

Examples:
  are install
  are install --runtime claude -g
  are uninstall
  are uninstall --runtime claude -g
  are init
  are discover
  are generate --dry-run
  are generate --concurrency 3
  are generate ./my-project --concurrency 3
  are update
  are update --uncommitted
`;

/**
 * Parse command-line arguments.
 *
 * Extracts the command, positional arguments, and flags.
 * Handles global flags (--help, -h) that may appear before the command.
 */
function parseArgs(args: string[]): {
  command: string | undefined;
  positional: string[];
  flags: Set<string>;
  values: Map<string, string>;
} {
  let command: string | undefined;
  const positional: string[] = [];
  const flags = new Set<string>();
  const values = new Map<string, string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const flagName = arg.slice(2);
      // Check if next arg is a value (not starting with -)
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        values.set(flagName, args[i + 1]);
        i++; // Skip the value
      } else {
        flags.add(flagName);
      }
    } else if (arg.startsWith('-')) {
      // Handle short flags (e.g., -h, -g, -l)
      for (const char of arg.slice(1)) {
        switch (char) {
          case 'h':
            flags.add('help');
            break;
          case 'g':
            flags.add('global');
            break;
          case 'l':
            flags.add('local');
            break;
          case 'V':
            flags.add('version');
            break;
          default:
            // Unknown short flag - ignore
            break;
        }
      }
    } else if (!command) {
      // First non-flag argument is the command
      command = arg;
    } else {
      // Subsequent non-flag arguments are positional
      positional.push(arg);
    }
  }

  return { command, positional, flags, values };
}

/**
 * Show version and exit.
 */
function showVersion(): void {
  console.log(`agents-reverse-engineer v${VERSION}`);
  process.exit(0);
}

/**
 * Display version banner.
 */
function showVersionBanner(): void {
  console.log(`agents-reverse-engineer v${VERSION}\n`);
}

/**
 * Show usage information and exit.
 */
function showHelp(): void {
  console.log(USAGE);
  process.exit(0);
}

/**
 * Show error for unknown command and exit.
 */
function showUnknownCommand(command: string): void {
  console.error(`Unknown command: ${command}`);
  console.error(`Run 'are --help' for usage information.`);
  process.exit(1);
}

/**
 * Check if command-line has installer-related flags.
 *
 * Used to detect direct installer invocation without 'install' command.
 */
function hasInstallerFlags(flags: Set<string>, values: Map<string, string>): boolean {
  return (
    flags.has('global') ||
    flags.has('local') ||
    flags.has('force') ||
    values.has('runtime')
  );
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, positional, flags, values } = parseArgs(args);

  // Handle version flag
  if (flags.has('version')) {
    showVersion();
  }

  // Handle help flag anywhere (but not if --help is for install command)
  if (flags.has('help') && !command && !hasInstallerFlags(flags, values)) {
    showHelp();
  }

  // No command and no args - launch interactive installer
  if (args.length === 0) {
    await runInstaller({
      global: false,
      local: false,
      uninstall: false,
      force: false,
      help: false,
      quiet: false,
    });
    return;
  }

  // Direct installer invocation without 'install' command
  // Supports: npx agents-reverse-engineer --runtime claude -g
  if (!command && hasInstallerFlags(flags, values)) {
    const installerArgs = parseInstallerArgs(args);
    await runInstaller(installerArgs);
    return;
  }

  // Show version banner
  showVersionBanner();

  // Route to command handlers
  switch (command) {
    case 'install': {
      // Re-parse args for installer-specific flags
      const installerArgs = parseInstallerArgs(args);
      await runInstaller(installerArgs);
      break;
    }

    case 'uninstall': {
      // Re-parse args and force uninstall mode
      const installerArgs = parseInstallerArgs(args);
      installerArgs.uninstall = true;
      await runInstaller(installerArgs);
      break;
    }

    case 'init': {
      await initCommand(positional[0] || '.');
      break;
    }

    case 'clean': {
      const cleanOpts: CleanOptions = {
        dryRun: flags.has('dry-run'),
      };
      await cleanCommand(positional[0] || '.', cleanOpts);
      break;
    }

    case 'discover': {
      await discoverCommand(positional[0] || '.', {});
      break;
    }

    case 'generate': {
      const options: GenerateOptions = {
        dryRun: flags.has('dry-run'),
        concurrency: values.has('concurrency') ? parseInt(values.get('concurrency')!, 10) : undefined,
        failFast: flags.has('fail-fast'),
        debug: flags.has('debug'),
        trace: flags.has('trace'),
      };
      await generateCommand(positional[0] || '.', options);
      break;
    }

    case 'update': {
      const options: UpdateCommandOptions = {
        uncommitted: flags.has('uncommitted'),
        dryRun: flags.has('dry-run'),
        concurrency: values.has('concurrency') ? parseInt(values.get('concurrency')!, 10) : undefined,
        failFast: flags.has('fail-fast'),
        debug: flags.has('debug'),
        trace: flags.has('trace'),
      };
      await updateCommand(positional[0] || '.', options);
      break;
    }

    default:
      if (command) {
        showUnknownCommand(command);
      }
      showHelp();
  }
}

// Run main and handle any uncaught errors
main().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});

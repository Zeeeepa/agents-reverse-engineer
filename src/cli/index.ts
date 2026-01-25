#!/usr/bin/env node
/**
 * CLI entry point for agents-reverse
 *
 * Commands:
 *   init              Create default configuration
 *   discover [path]   Discover files to analyze
 */

import { initCommand, type InitOptions } from './init.js';
import { discoverCommand, type DiscoverOptions } from './discover.js';

const USAGE = `
agents-reverse - AI-friendly codebase documentation

Commands:
  init              Create default configuration
  discover [path]   Discover files to analyze (default: current directory)

Options:
  --quiet, -q       Suppress output except errors
  --show-excluded   List each excluded file
  --help, -h        Show this help

Examples:
  ar init
  ar discover
  ar discover ./my-project --quiet
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
} {
  let command: string | undefined;
  const positional: string[] = [];
  const flags = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      flags.add(arg.slice(2));
    } else if (arg.startsWith('-')) {
      // Handle short flags (e.g., -q, -h)
      for (const char of arg.slice(1)) {
        switch (char) {
          case 'q':
            flags.add('quiet');
            break;
          case 'h':
            flags.add('help');
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

  return { command, positional, flags };
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
  console.error(`Run 'ar --help' for usage information.`);
  process.exit(1);
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, positional, flags } = parseArgs(args);

  // Handle help flag anywhere
  if (flags.has('help') || args.length === 0) {
    showHelp();
  }

  // Route to command handlers
  switch (command) {
    case 'init': {
      const options: InitOptions = {
        interactive: flags.has('interactive'),
      };
      await initCommand(positional[0] || '.', options);
      break;
    }

    case 'discover': {
      const options: DiscoverOptions = {
        quiet: flags.has('quiet'),
        showExcluded: flags.has('show-excluded'),
        verbose: !flags.has('quiet'),
      };
      await discoverCommand(positional[0] || '.', options);
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

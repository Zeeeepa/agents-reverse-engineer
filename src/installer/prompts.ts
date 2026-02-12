/**
 * Interactive prompts module for the installer
 *
 * Provides arrow key selection in TTY mode with numbered fallback for CI/non-interactive.
 * Uses Node.js readline module with raw mode for keypress handling.
 *
 * CRITICAL: Raw mode is always cleaned up via try/finally and process exit handlers.
 */

import * as readline from 'node:readline';
import pc from 'picocolors';
import type { Runtime, Location } from './types.js';

/**
 * Check if stdin is a TTY (interactive terminal)
 *
 * @returns true if running in interactive terminal, false for CI/piped input
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true;
}

/**
 * Option type for selection prompts
 */
interface SelectOption<T> {
  label: string;
  value: T;
}

/**
 * Raw mode state tracker for cleanup
 */
let rawModeActive = false;

/**
 * Cleanup function to restore terminal state
 */
function cleanupRawMode(): void {
  if (rawModeActive && process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    } catch {
      // Ignore errors during cleanup
    }
    rawModeActive = false;
  }
}

// Register global cleanup handlers
process.on('exit', cleanupRawMode);
process.on('SIGINT', () => {
  cleanupRawMode();
  process.exit(0);
});

/**
 * Generic option selector that uses arrow keys in TTY, numbered in non-TTY
 *
 * @param prompt - Question to display
 * @param options - Array of options with labels and values
 * @returns Selected value
 */
export async function selectOption<T>(
  prompt: string,
  options: SelectOption<T>[],
): Promise<T> {
  if (isInteractive()) {
    return arrowKeySelect(prompt, options);
  }
  return numberedSelect(prompt, options);
}

/**
 * Arrow key selection for interactive terminals
 *
 * Uses raw mode to capture keypresses for up/down/enter navigation.
 * Always cleans up raw mode even on error or Ctrl+C.
 *
 * @param prompt - Question to display
 * @param options - Array of options with labels and values
 * @returns Selected value
 */
async function arrowKeySelect<T>(
  prompt: string,
  options: SelectOption<T>[],
): Promise<T> {
  return new Promise((resolve) => {
    let selectedIndex = 0;

    // Render the current selection state
    const render = (clear: boolean = false): void => {
      // Move cursor up and clear lines if re-rendering
      if (clear) {
        process.stdout.write(`\x1b[${options.length + 1}A`);
        for (let i = 0; i <= options.length; i++) {
          process.stdout.write('\x1b[2K\x1b[1B');
        }
        process.stdout.write(`\x1b[${options.length + 1}A`);
      }

      console.log(pc.bold(prompt));
      options.forEach((opt, idx) => {
        const prefix = idx === selectedIndex ? pc.cyan('> ') : '  ';
        const label = idx === selectedIndex ? pc.cyan(opt.label) : opt.label;
        console.log(prefix + label);
      });
    };

    // Handle keypress events
    const handleKeypress = (
      _str: string | undefined,
      key: { name?: string; ctrl?: boolean },
    ): void => {
      if (key.ctrl && key.name === 'c') {
        cleanupRawMode();
        process.exit(0);
      }

      switch (key.name) {
        case 'up':
          selectedIndex = Math.max(0, selectedIndex - 1);
          render(true);
          break;
        case 'down':
          selectedIndex = Math.min(options.length - 1, selectedIndex + 1);
          render(true);
          break;
        case 'return':
          // Cleanup and resolve
          process.stdin.off('keypress', handleKeypress);
          cleanupRawMode();
          console.log();
          resolve(options[selectedIndex].value);
          break;
      }
    };

    try {
      // Setup raw mode for keypress handling
      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        rawModeActive = true;
      }
      process.stdin.resume();
      process.stdin.on('keypress', handleKeypress);

      // Initial render
      render(false);
    } catch (err) {
      cleanupRawMode();
      throw err;
    }
  });
}

/**
 * Numbered selection for non-interactive environments
 *
 * Prints numbered options and reads a number from stdin.
 * Used in CI environments or when stdin is piped.
 *
 * @param prompt - Question to display
 * @param options - Array of options with labels and values
 * @returns Selected value
 */
async function numberedSelect<T>(
  prompt: string,
  options: SelectOption<T>[],
): Promise<T> {
  return new Promise((resolve, reject) => {
    console.log(pc.bold(prompt));
    options.forEach((opt, idx) => {
      console.log(`  ${idx + 1}. ${opt.label}`);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Enter number: ', (answer) => {
      rl.close();

      const num = parseInt(answer, 10);
      if (isNaN(num) || num < 1 || num > options.length) {
        reject(new Error(`Invalid selection: ${answer}. Expected 1-${options.length}`));
        return;
      }

      resolve(options[num - 1].value);
    });
  });
}

/**
 * Prompt user to select a runtime
 *
 * @param mode - 'install' or 'uninstall' to customize prompt text
 * @returns Selected runtime value
 */
export async function selectRuntime(mode: 'install' | 'uninstall' = 'install'): Promise<Runtime> {
  const prompt = mode === 'uninstall' ? 'Select runtime to uninstall:' : 'Select runtime to install:';
  return selectOption<Runtime>(prompt, [
    { label: 'Claude Code', value: 'claude' },
    { label: 'Codex', value: 'codex' },
    { label: 'OpenCode', value: 'opencode' },
    { label: 'Gemini CLI', value: 'gemini' },
    { label: 'All runtimes', value: 'all' },
  ]);
}

/**
 * Prompt user to select installation location
 *
 * @param mode - 'install' or 'uninstall' to customize prompt text
 * @returns Selected location value
 */
export async function selectLocation(mode: 'install' | 'uninstall' = 'install'): Promise<Location> {
  const prompt = mode === 'uninstall' ? 'Select uninstallation location:' : 'Select installation location:';
  return selectOption<Location>(prompt, [
    { label: 'Global (~/.claude, ~/.agents, ~/.config/opencode, etc.)', value: 'global' },
    { label: 'Local (./.claude, ./.agents, ./.opencode, etc.)', value: 'local' },
  ]);
}

/**
 * Prompt user to confirm an action
 *
 * @param message - Confirmation message to display
 * @returns true if confirmed, false if declined
 */
export async function confirmAction(message: string): Promise<boolean> {
  return selectOption<boolean>(message, [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ]);
}

/**
 * Interactive prompts module for the installer
 *
 * Provides arrow key selection in TTY mode with numbered fallback for CI/non-interactive.
 * Uses Node.js readline module with raw mode for keypress handling.
 * Supports rendering into SplitPaneLayout's right pane.
 *
 * CRITICAL: Raw mode is always cleaned up via try/finally and process exit handlers.
 */

import * as readline from 'node:readline';
import pc from 'picocolors';
import type { Runtime, Location } from './types.js';
import type { SplitPaneLayout } from './layout.js';

/**
 * Check if stdin is a TTY (interactive terminal)
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
  // Restore cursor visibility
  process.stdout.write('\x1b[?25h');
  cleanupRawMode();
  process.exit(0);
});

/**
 * Generic option selector that uses arrow keys in TTY, numbered in non-TTY.
 * Optionally renders into a SplitPaneLayout's right pane.
 */
export async function selectOption<T>(
  prompt: string,
  options: SelectOption<T>[],
  layout?: SplitPaneLayout,
): Promise<T> {
  if (isInteractive()) {
    return arrowKeySelect(prompt, options, layout);
  }
  return numberedSelect(prompt, options);
}

/**
 * Arrow key selection for interactive terminals.
 * When layout is provided, renders the prompt in the right pane.
 */
async function arrowKeySelect<T>(
  prompt: string,
  options: SelectOption<T>[],
  layout?: SplitPaneLayout,
): Promise<T> {
  return new Promise((resolve) => {
    let selectedIndex = 0;

    // Row where this prompt starts in the layout
    const promptStartRow = layout?.isEnabled ? layout.currentRightRow : 0;

    const render = (clear: boolean = false): void => {
      if (layout && layout.isEnabled) {
        // Render in right pane at fixed position
        layout.setRightRow(promptStartRow);
        layout.appendRight(pc.bold(prompt));
        options.forEach((opt, idx) => {
          const prefix = idx === selectedIndex ? pc.cyan('> ') : '  ';
          const label = idx === selectedIndex ? pc.cyan(opt.label) : opt.label;
          layout.appendRight(prefix + label);
        });
        return;
      }

      // Original: render to stdout with cursor movement
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

    const handleKeypress = (
      _str: string | undefined,
      key: { name?: string; ctrl?: boolean },
    ): void => {
      if (key.ctrl && key.name === 'c') {
        process.stdout.write('\x1b[?25h');
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
          process.stdin.off('keypress', handleKeypress);
          cleanupRawMode();
          if (layout && layout.isEnabled) {
            // Advance past the prompt area
            layout.setRightRow(promptStartRow + options.length + 2);
          } else {
            console.log();
          }
          resolve(options[selectedIndex].value);
          break;
      }
    };

    try {
      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        rawModeActive = true;
      }
      process.stdin.resume();
      process.stdin.on('keypress', handleKeypress);

      render(false);
    } catch (err) {
      cleanupRawMode();
      throw err;
    }
  });
}

/**
 * Numbered selection for non-interactive environments
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
 */
export async function selectRuntime(mode: 'install' | 'uninstall' = 'install', layout?: SplitPaneLayout): Promise<Runtime> {
  const prompt = mode === 'uninstall' ? 'Select runtime to uninstall:' : 'Select runtime to install:';
  return selectOption<Runtime>(prompt, [
    { label: 'Claude Code', value: 'claude' },
    { label: 'Codex', value: 'codex' },
    { label: 'OpenCode', value: 'opencode' },
    { label: 'Gemini CLI', value: 'gemini' },
    { label: 'All runtimes', value: 'all' },
  ], layout);
}

/**
 * Prompt user to select installation location
 */
export async function selectLocation(mode: 'install' | 'uninstall' = 'install', layout?: SplitPaneLayout): Promise<Location> {
  const prompt = mode === 'uninstall' ? 'Select uninstallation location:' : 'Select installation location:';
  return selectOption<Location>(prompt, [
    { label: 'Global (~/.claude, ~/.agents, ~/.config/opencode, etc.)', value: 'global' },
    { label: 'Local (./.claude, ./.agents, ./.opencode, etc.)', value: 'local' },
  ], layout);
}

/**
 * Prompt user to confirm an action
 */
export async function confirmAction(message: string, layout?: SplitPaneLayout): Promise<boolean> {
  return selectOption<boolean>(message, [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ], layout);
}

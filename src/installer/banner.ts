/**
 * ASCII banner and styled output for the installer
 *
 * Provides colored banner display, help text, and styled message helpers.
 * Uses picocolors for terminal coloring.
 */

import * as pc from 'picocolors';

/**
 * Display the ASCII banner at installer launch
 *
 * Shows a styled box with project name and tagline using colors:
 * - Cyan for box borders
 * - Bold for project name
 * - Dim for tagline
 */
export function displayBanner(): void {
  const border = pc.cyan;
  const name = pc.bold('agents-reverse-engineer');
  const tagline = pc.dim('AI-friendly codebase documentation');

  console.log(border('╔═══════════════════════════════════════════════════╗'));
  console.log(border('║') + '   ' + name + '                         ' + border('║'));
  console.log(border('║') + '   ' + tagline + '              ' + border('║'));
  console.log(border('╚═══════════════════════════════════════════════════╝'));
  console.log();
}

/**
 * Display help text showing usage, flags, and examples
 */
export function showHelp(): void {
  console.log(pc.bold('Usage:') + ' npx agents-reverse-engineer [options]');
  console.log();
  console.log(pc.bold('Options:'));
  console.log('  --runtime <runtime>  Select runtime: claude, opencode, gemini, or all');
  console.log('  -g, --global         Install to global config (~/.claude, etc.)');
  console.log('  -l, --local          Install to local project (./.claude, etc.)');
  console.log('  -u, --uninstall      Remove installed files');
  console.log('  --force              Overwrite existing files');
  console.log('  -q, --quiet          Suppress banner and info messages');
  console.log('  -h, --help           Show this help');
  console.log();
  console.log(pc.bold('Examples:'));
  console.log('  npx agents-reverse-engineer');
  console.log('    Interactive mode - prompts for runtime and location');
  console.log();
  console.log('  npx agents-reverse-engineer --runtime claude -g');
  console.log('    Install Claude Code commands globally');
  console.log();
  console.log('  npx agents-reverse-engineer --runtime all -l');
  console.log('    Install commands for all runtimes to local project');
  console.log();
  console.log('  npx agents-reverse-engineer --runtime claude -g -u');
  console.log('    Uninstall global Claude Code commands');
}

/**
 * Display a success message with green checkmark prefix
 *
 * @param msg - Message to display
 */
export function showSuccess(msg: string): void {
  console.log(pc.green('✓') + ' ' + msg);
}

/**
 * Display an error message with red X prefix
 *
 * @param msg - Message to display
 */
export function showError(msg: string): void {
  console.log(pc.red('✗') + ' ' + msg);
}

/**
 * Display a warning message with yellow exclamation prefix
 *
 * @param msg - Message to display
 */
export function showWarning(msg: string): void {
  console.log(pc.yellow('!') + ' ' + msg);
}

/**
 * Display an info message with cyan arrow prefix
 *
 * @param msg - Message to display
 */
export function showInfo(msg: string): void {
  console.log(pc.cyan('>') + ' ' + msg);
}

/**
 * ASCII banner and styled output for the installer
 *
 * Provides colored banner display, help text, and styled message helpers.
 * Uses picocolors for terminal coloring.
 */

import pc from 'picocolors';
import { getVersion } from '../version.js';

/** Package version read from package.json */
export const VERSION = getVersion();

/**
 * Display the ASCII banner at installer launch
 *
 * Shows big ASCII art "ARE" letters in green with version and tagline.
 */
export function displayBanner(): void {
  const art = pc.green;
  const dim = pc.dim;

  console.log();
  console.log(art('  █████╗ ██████╗ ███████╗'));
  console.log(art(' ██╔══██╗██╔══██╗██╔════╝'));
  console.log(art(' ███████║██████╔╝█████╗  '));
  console.log(art(' ██╔══██║██╔══██╗██╔══╝  '));
  console.log(art(' ██║  ██║██║  ██║███████╗'));
  console.log(art(' ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝'));
  console.log();
  console.log(dim(` agents-reverse-engineer v${VERSION}`));
  console.log(dim(' AI-friendly codebase documentation'));
  console.log();
}

/**
 * Display help text showing usage, flags, and examples
 */
export function showHelp(): void {
  console.log(pc.bold('Usage:') + ' npx agents-reverse-engineer [options]');
  console.log();
  console.log(pc.bold('Options:'));
  console.log('  --runtime <runtime>  Select runtime: claude, codex, opencode, gemini, or all');
  console.log('  -g, --global         Install to global config (~/.claude, ~/.codex, etc.)');
  console.log('  -l, --local          Install to local project (./.claude, ./.codex, etc.)');
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
  console.log('  npx agents-reverse-engineer --runtime codex -g');
  console.log('    Install Codex commands globally');
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

/**
 * Display post-install next steps
 *
 * Shows what to do after installation with helpful links.
 *
 * @param runtime - Which runtime was installed
 * @param filesCreated - Number of files created
 */
export function showNextSteps(runtime: string, filesCreated: number): void {
  console.log();
  console.log(pc.bold('Installation complete!'));
  console.log(pc.dim(`${filesCreated} files installed for ${runtime}`));
  console.log();
  console.log(pc.bold('Next steps:'));
  console.log('  1. Run ' + pc.cyan('/are-help') + ' in your AI assistant to verify');
  console.log('  2. Run ' + pc.cyan('/are-init') + ' to initialize a project');
  console.log('  3. Run ' + pc.cyan('/are-discover') + ' to create the generation plan');
  console.log('  4. Run ' + pc.cyan('/are-generate') + ' to generate documentation');
  console.log('  5. Run ' + pc.cyan('/are-update') + ' to update documentation after changes');
  console.log('  6. Run ' + pc.cyan('/are-specify') + ' to generate a specification document');
  console.log('  7. Run ' + pc.cyan('/are-clean') + ' to remove all generated artifacts');
  console.log();
  console.log(pc.dim('Docs: https://github.com/GeoloeG-IsT/agents-reverse-engineer'));
}

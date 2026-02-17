/**
 * ASCII banner and styled output for the installer
 *
 * Provides colored banner display with optional golden circle animation,
 * help text, and styled message helpers. Uses picocolors for terminal coloring.
 */

import pc from 'picocolors';
import { getVersion } from '../version.js';
import { GOLDEN_CIRCLE_FRAMES, FRAME_WIDTH } from './frames/index.js';
import type { SplitPaneLayout } from './layout.js';

/** Package version read from package.json */
export const VERSION = getVersion();

/** Gold color using ANSI 256-color palette (#220) */
function gold(s: string): string {
  return `\x1b[38;5;220m${s}\x1b[0m`;
}

/** Raw ARE banner lines (no color) for compositing */
export const BANNER_LINES: string[] = [
  '  █████╗ ██████╗ ███████╗',
  ' ██╔══██╗██╔══██╗██╔════╝',
  ' ███████║██████╔╝█████╗  ',
  ' ██╔══██║██╔══██╗██╔══╝  ',
  ' ██║  ██║██║  ██║███████╗',
  ' ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝',
];

/**
 * Composite one golden circle frame with the ARE banner.
 *
 * Returns an array of lines where the circle frame sits to the left of the banner text.
 *
 * @param circleFrame - Multi-line string of one animation frame
 * @returns Array of composited lines
 */
export function compositeBanner(circleFrame: string): string[] {
  const circleLines = circleFrame.split('\n');
  return BANNER_LINES.map((bannerLine, i) => {
    const circleLine = (circleLines[i] || '').padEnd(FRAME_WIDTH);
    return gold(circleLine) + ' ' + gold(bannerLine);
  });
}

/**
 * Get the full left pane content: composited banner + version info.
 *
 * @param frameIndex - Which animation frame to use (0-35)
 * @returns Array of styled lines for the left pane
 */
export function getLeftPaneContent(frameIndex: number = 0): string[] {
  const frame = GOLDEN_CIRCLE_FRAMES[frameIndex % GOLDEN_CIRCLE_FRAMES.length];
  const lines = compositeBanner(frame);
  return [
    '',
    '',
    '',
    ...lines,
    '',
    '',
    pc.dim(`   agents-reverse-engineer v${VERSION}`),
    pc.dim(' AI-friendly codebase documentation'),
    '',
    '',
    '',
    '',
    '',
  ];
}

/**
 * Display the ASCII banner at installer launch
 *
 * When a layout is provided, renders the composited golden circle + ARE banner
 * in the left pane. Otherwise falls back to the original console output.
 *
 * @param layout - Optional split-pane layout to render into
 */
export function displayBanner(layout?: SplitPaneLayout): void {
  if (layout && layout.isEnabled) {
    const content = getLeftPaneContent(0);
    layout.setLeftPane(content);
    layout.renderLeftPane();
    return;
  }

  // Original non-layout implementation (gold colored)
  const dim = pc.dim;

  console.log();
  console.log(gold('  █████╗ ██████╗ ███████╗'));
  console.log(gold(' ██╔══██╗██╔══██╗██╔════╝'));
  console.log(gold(' ███████║██████╔╝█████╗  '));
  console.log(gold(' ██╔══██║██╔══██╗██╔══╝  '));
  console.log(gold(' ██║  ██║██║  ██║███████╗'));
  console.log(gold(' ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝'));
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
  console.log('  -g, --global         Install to global config (~/.claude, ~/.agents, etc.)');
  console.log('  -l, --local          Install to local project (./.claude, ./.agents, etc.)');
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
 */
export function showSuccess(msg: string): void {
  console.log(pc.green('✓') + ' ' + msg);
}

/**
 * Display an error message with red X prefix
 */
export function showError(msg: string): void {
  console.log(pc.red('✗') + ' ' + msg);
}

/**
 * Display a warning message with yellow exclamation prefix
 */
export function showWarning(msg: string): void {
  console.log(pc.yellow('!') + ' ' + msg);
}

/**
 * Display an info message with cyan arrow prefix
 */
export function showInfo(msg: string): void {
  console.log(pc.cyan('>') + ' ' + msg);
}

/**
 * Display post-install next steps
 *
 * @param runtime - Which runtime was installed
 * @param filesCreated - Number of files created
 * @param layout - Optional layout to render into
 */
export function showNextSteps(runtime: string, filesCreated: number, layout?: SplitPaneLayout): void {
  if (layout && layout.isEnabled) {
    layout.appendRight('');
    layout.appendRight(pc.bold('Installation complete!'));
    layout.appendRight(pc.dim(`${filesCreated} files installed for ${runtime}`));
    layout.appendRight('');
    layout.appendRight(pc.bold('Next steps:'));
    layout.appendRight('  1. Run ' + pc.cyan('/are-help') + ' in your AI assistant to verify');
    layout.appendRight('  2. Run ' + pc.cyan('/are-init') + ' to initialize a project');
    layout.appendRight('  3. Run ' + pc.cyan('/are-discover') + ' to create the generation plan');
    layout.appendRight('  4. Run ' + pc.cyan('/are-generate') + ' to generate documentation');
    layout.appendRight('  5. Run ' + pc.cyan('/are-update') + ' to update documentation after changes');
    layout.appendRight('  6. Run ' + pc.cyan('/are-specify') + ' to generate a specification document');
    layout.appendRight('  7. Run ' + pc.cyan('/are-clean') + ' to remove all generated artifacts');
    layout.appendRight('');
    layout.appendRight(pc.dim('Docs: https://github.com/GeoloeG-IsT/agents-reverse-engineer'));
    return;
  }

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

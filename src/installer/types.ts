/**
 * Installer types for npx installation workflow
 *
 * Defines types for the interactive installer that copies command files and hooks
 * to runtime-specific directories (Claude Code, OpenCode, Gemini).
 */

/**
 * Supported AI coding assistant runtimes for installation
 *
 * - 'claude': Claude Code (~/.claude or .claude)
 * - 'opencode': OpenCode (~/.config/opencode or .opencode)
 * - 'gemini': Gemini (~/.gemini or .gemini)
 * - 'all': Install to all supported runtimes
 */
export type Runtime = 'claude' | 'opencode' | 'gemini' | 'all';

/**
 * Installation location target
 *
 * - 'global': User-level installation (~/.claude, ~/.config/opencode, etc.)
 * - 'local': Project-level installation (.claude, .opencode, etc.)
 */
export type Location = 'global' | 'local';

/**
 * Arguments parsed from installer command line
 *
 * Supports both interactive mode (prompts) and non-interactive mode (flags).
 */
export interface InstallerArgs {
  /** Target runtime (claude, opencode, gemini, or all) */
  runtime?: Runtime;
  /** Install to global/user location */
  global: boolean;
  /** Install to local/project location */
  local: boolean;
  /** Uninstall instead of install */
  uninstall: boolean;
  /** Force overwrite existing files */
  force: boolean;
  /** Show help and exit */
  help: boolean;
  /** Suppress banner and info messages */
  quiet: boolean;
}

/**
 * Result of an installation operation for a single runtime/location
 */
export interface InstallerResult {
  /** Whether the installation succeeded */
  success: boolean;
  /** Runtime that was installed */
  runtime: Exclude<Runtime, 'all'>;
  /** Location that was installed to */
  location: Location;
  /** Files that were successfully created */
  filesCreated: string[];
  /** Files that were skipped (already exist, no --force) */
  filesSkipped: string[];
  /** Error messages if any */
  errors: string[];
  /** Whether hook was registered in settings.json (Claude only) */
  hookRegistered?: boolean;
  /** Whether VERSION file was written */
  versionWritten?: boolean;
}

/**
 * Path configuration for a specific runtime
 *
 * Contains resolved paths for global and local installation locations.
 */
export interface RuntimePaths {
  /** Global installation path (e.g., ~/.claude) */
  global: string;
  /** Local installation path (e.g., .claude) */
  local: string;
  /** Path to settings.json for hook registration */
  settingsFile: string;
}

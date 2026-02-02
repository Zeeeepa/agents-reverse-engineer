/**
 * Path resolution for installer module
 *
 * Provides cross-platform path resolution for AI coding assistant runtimes.
 * Uses os.homedir() for global paths and path.join() for cross-platform compatibility.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import type { Runtime, Location, RuntimePaths } from './types.js';

/**
 * Get all supported runtime identifiers (excludes 'all' meta-runtime)
 *
 * @returns Array of concrete runtime identifiers
 */
export function getAllRuntimes(): Array<Exclude<Runtime, 'all'>> {
  return ['claude', 'opencode', 'gemini'];
}

/**
 * Get path configuration for a specific runtime
 *
 * Returns global and local installation paths plus settings file location.
 * All paths are cross-platform using os.homedir() and path.join().
 *
 * Environment variable overrides (in priority order):
 * - Claude: CLAUDE_CONFIG_DIR
 * - OpenCode: OPENCODE_CONFIG_DIR > XDG_CONFIG_HOME/opencode
 * - Gemini: GEMINI_CONFIG_DIR
 *
 * @param runtime - Target runtime (claude, opencode, or gemini)
 * @returns Path configuration object with global, local, and settingsFile paths
 */
export function getRuntimePaths(runtime: Exclude<Runtime, 'all'>): RuntimePaths {
  const home = os.homedir();

  switch (runtime) {
    case 'claude': {
      // CLAUDE_CONFIG_DIR overrides default ~/.claude
      const globalPath = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
      return {
        global: globalPath,
        local: '.claude',
        settingsFile: path.join(globalPath, 'settings.json'),
      };
    }

    case 'opencode': {
      // OPENCODE_CONFIG_DIR > XDG_CONFIG_HOME/opencode > ~/.config/opencode
      const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
      const globalPath = process.env.OPENCODE_CONFIG_DIR || path.join(xdgConfig, 'opencode');
      return {
        global: globalPath,
        local: '.opencode',
        settingsFile: path.join(globalPath, 'settings.json'),
      };
    }

    case 'gemini': {
      // GEMINI_CONFIG_DIR overrides default ~/.gemini
      const globalPath = process.env.GEMINI_CONFIG_DIR || path.join(home, '.gemini');
      return {
        global: globalPath,
        local: '.gemini',
        settingsFile: path.join(globalPath, 'settings.json'),
      };
    }
  }
}

/**
 * Resolve full installation path for a runtime and location
 *
 * For global location, returns the absolute global path.
 * For local location, returns the local path joined with project root.
 *
 * @param runtime - Target runtime (claude, opencode, or gemini)
 * @param location - Installation location (global or local)
 * @param projectRoot - Project root directory for local installs (defaults to cwd)
 * @returns Resolved absolute path for installation
 */
export function resolveInstallPath(
  runtime: Exclude<Runtime, 'all'>,
  location: Location,
  projectRoot?: string,
): string {
  const paths = getRuntimePaths(runtime);

  if (location === 'global') {
    return paths.global;
  }

  // Local installation - join with project root or cwd
  const root = projectRoot || process.cwd();
  return path.join(root, paths.local);
}

/**
 * Get the settings file path for a runtime
 *
 * Settings files are used for hook registration (Claude Code uses settings.json).
 *
 * @param runtime - Target runtime (claude, opencode, or gemini)
 * @returns Absolute path to the settings file
 */
export function getSettingsPath(runtime: Exclude<Runtime, 'all'>): string {
  return getRuntimePaths(runtime).settingsFile;
}

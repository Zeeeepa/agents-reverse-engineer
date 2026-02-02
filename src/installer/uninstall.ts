/**
 * Uninstall module for agents-reverse-engineer installer
 *
 * Handles removing installed command files, hooks, and hook registrations.
 * Mirrors the installation logic in operations.ts for clean reversal.
 */

import { existsSync, unlinkSync, readFileSync, writeFileSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import type { Runtime, Location, InstallerResult } from './types.js';
import { resolveInstallPath, getAllRuntimes, getRuntimePaths } from './paths.js';
import {
  getClaudeTemplates,
  getOpenCodeTemplates,
  getGeminiTemplates,
  getHookTemplate,
} from '../integration/templates.js';

/**
 * Session hook configuration for settings.json (matches operations.ts)
 */
interface SessionHook {
  type: 'command';
  command: string;
}

interface HookEvent {
  hooks: SessionHook[];
}

interface SettingsJson {
  hooks?: {
    SessionEnd?: HookEvent[];
  };
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  [key: string]: unknown;
}

/**
 * Permissions to remove during uninstall (must match operations.ts)
 */
const ARE_PERMISSIONS = [
  'Bash(npx agents-reverse-engineer@latest init*)',
  'Bash(npx agents-reverse-engineer@latest discover*)',
  'Bash(npx agents-reverse-engineer@latest generate*)',
  'Bash(npx agents-reverse-engineer@latest update*)',
  'Bash(npx agents-reverse-engineer@latest clean*)',
];

/**
 * Get templates for a specific runtime
 *
 * @param runtime - Target runtime (claude, opencode, or gemini)
 * @returns Array of template objects for the runtime
 */
function getTemplatesForRuntime(runtime: Exclude<Runtime, 'all'>) {
  switch (runtime) {
    case 'claude':
      return getClaudeTemplates();
    case 'opencode':
      return getOpenCodeTemplates();
    case 'gemini':
      return getGeminiTemplates();
  }
}

/**
 * Uninstall files for one or all runtimes
 *
 * If runtime is 'all', uninstalls from all supported runtimes.
 * Otherwise, uninstalls from the specified runtime only.
 *
 * @param runtime - Target runtime or 'all'
 * @param location - Installation location (global or local)
 * @param dryRun - If true, don't actually delete files
 * @returns Array of uninstallation results (one per runtime)
 */
export function uninstallFiles(
  runtime: Runtime,
  location: Location,
  dryRun: boolean = false,
): InstallerResult[] {
  if (runtime === 'all') {
    return getAllRuntimes().map((r) => uninstallFilesForRuntime(r, location, dryRun));
  }
  return [uninstallFilesForRuntime(runtime, location, dryRun)];
}

/**
 * Uninstall files for a specific runtime
 *
 * Removes command templates, hook files, and VERSION file from the installation directory.
 * Also unregisters hooks from settings.json for Claude global installs.
 *
 * @param runtime - Target runtime (claude, opencode, or gemini)
 * @param location - Installation location (global or local)
 * @param dryRun - If true, don't actually delete files
 * @returns Uninstallation result with files deleted
 */
function uninstallFilesForRuntime(
  runtime: Exclude<Runtime, 'all'>,
  location: Location,
  dryRun: boolean,
): InstallerResult {
  const basePath = resolveInstallPath(runtime, location);
  const templates = getTemplatesForRuntime(runtime);
  const filesCreated: string[] = []; // In uninstall context, this tracks files deleted
  const filesSkipped: string[] = []; // Files that didn't exist
  const errors: string[] = [];

  // Remove command templates
  for (const template of templates) {
    // Template path is relative (e.g., .claude/commands/are/generate.md)
    // Extract the part after the runtime directory (e.g., commands/are/generate.md)
    const relativePath = template.path.split('/').slice(1).join('/');
    const fullPath = path.join(basePath, relativePath);

    if (existsSync(fullPath)) {
      if (!dryRun) {
        try {
          unlinkSync(fullPath);
        } catch (err) {
          errors.push(`Failed to delete ${fullPath}: ${err}`);
          continue;
        }
      }
      filesCreated.push(fullPath); // Track as "deleted"
    } else {
      filesSkipped.push(fullPath); // File didn't exist
    }
  }

  // For Claude and Gemini runtimes, also remove the session hook file
  let hookUnregistered = false;
  if (runtime === 'claude' || runtime === 'gemini') {
    const hookPath = path.join(basePath, 'hooks', 'are-session-end.js');
    if (existsSync(hookPath)) {
      if (!dryRun) {
        try {
          unlinkSync(hookPath);
        } catch (err) {
          errors.push(`Failed to delete hook ${hookPath}: ${err}`);
        }
      }
      if (!errors.some((e) => e.includes(hookPath))) {
        filesCreated.push(hookPath);
      }
    }

    // Unregister hook from settings.json
    hookUnregistered = unregisterHooks(basePath, runtime, dryRun);

    // Unregister permissions from settings.json (Claude only)
    if (runtime === 'claude') {
      unregisterPermissions(basePath, dryRun);
    }
  }

  // Remove VERSION file if exists
  const versionPath = path.join(basePath, 'VERSION');
  if (existsSync(versionPath)) {
    if (!dryRun) {
      try {
        unlinkSync(versionPath);
      } catch (err) {
        errors.push(`Failed to delete VERSION: ${err}`);
      }
    }
    if (!errors.some((e) => e.includes('VERSION'))) {
      filesCreated.push(versionPath);
    }
  }

  // Try to clean up empty directories
  if (!dryRun) {
    // Clean up are/ commands directory
    const areCommandsDir = path.join(basePath, 'commands', 'are');
    cleanupEmptyDirs(areCommandsDir);

    // Clean up commands/ directory if empty
    const commandsDir = path.join(basePath, 'commands');
    cleanupEmptyDirs(commandsDir);

    // Clean up hooks/ directory if empty (Claude and Gemini)
    if (runtime === 'claude' || runtime === 'gemini') {
      const hooksDir = path.join(basePath, 'hooks');
      cleanupEmptyDirs(hooksDir);
    }
  }

  return {
    success: errors.length === 0,
    runtime,
    location,
    filesCreated, // Actually files deleted in uninstall context
    filesSkipped, // Files that didn't exist
    errors,
    hookRegistered: hookUnregistered, // Repurpose: true if hook was unregistered
  };
}

/**
 * Gemini hook configuration (simpler format)
 */
interface GeminiHook {
  name: string;
  type: 'command';
  command: string;
}

interface GeminiSettingsJson {
  hooks?: {
    SessionEnd?: GeminiHook[];
  };
  [key: string]: unknown;
}

/**
 * Unregister session-end hook from settings.json
 *
 * Removes the ARE hook entry from the SessionEnd hooks array.
 * Cleans up empty hooks structures. Handles both old and new hook paths.
 *
 * @param basePath - Base installation path (e.g., ~/.claude or ~/.gemini)
 * @param runtime - Target runtime (claude or gemini)
 * @param dryRun - If true, don't write changes
 * @returns true if hook was removed, false if not found
 */
export function unregisterHooks(
  basePath: string,
  runtime: Exclude<Runtime, 'all'>,
  dryRun: boolean,
): boolean {
  if (runtime === 'gemini') {
    return unregisterGeminiHook(basePath, dryRun);
  }
  return unregisterClaudeHook(basePath, dryRun);
}

/**
 * Unregister hook from Claude Code settings.json
 */
function unregisterClaudeHook(basePath: string, dryRun: boolean): boolean {
  const settingsPath = path.join(basePath, 'settings.json');

  // Settings file must exist
  if (!existsSync(settingsPath)) {
    return false;
  }

  // Load settings
  let settings: SettingsJson;
  try {
    const content = readFileSync(settingsPath, 'utf-8');
    settings = JSON.parse(content) as SettingsJson;
  } catch {
    return false;
  }

  // Check if hooks.SessionEnd exists
  if (!settings.hooks?.SessionEnd) {
    return false;
  }

  // Match both old and new hook command paths
  const hookPatterns = [
    'node hooks/are-session-end.js',
    'node .claude/hooks/are-session-end.js',
  ];
  const originalLength = settings.hooks.SessionEnd.length;

  settings.hooks.SessionEnd = settings.hooks.SessionEnd.filter(
    (event) => !event.hooks?.some((h) => hookPatterns.includes(h.command)),
  );

  // Check if we actually removed something
  if (settings.hooks.SessionEnd.length === originalLength) {
    return false;
  }

  // Clean up empty structures
  if (settings.hooks.SessionEnd.length === 0) {
    delete settings.hooks.SessionEnd;
  }

  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  // Write updated settings
  if (!dryRun) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  return true;
}

/**
 * Unregister ARE permissions from Claude Code settings.json
 *
 * Removes all ARE-related bash command permissions from the allow list.
 *
 * @param basePath - Base installation path (e.g., ~/.claude)
 * @param dryRun - If true, don't write changes
 * @returns true if any permissions were removed, false if none found
 */
export function unregisterPermissions(basePath: string, dryRun: boolean): boolean {
  const settingsPath = path.join(basePath, 'settings.json');

  // Settings file must exist
  if (!existsSync(settingsPath)) {
    return false;
  }

  // Load settings
  let settings: SettingsJson;
  try {
    const content = readFileSync(settingsPath, 'utf-8');
    settings = JSON.parse(content) as SettingsJson;
  } catch {
    return false;
  }

  // Check if permissions.allow exists
  if (!settings.permissions?.allow) {
    return false;
  }

  const originalLength = settings.permissions.allow.length;

  // Remove all ARE permissions
  settings.permissions.allow = settings.permissions.allow.filter(
    (perm) => !ARE_PERMISSIONS.includes(perm),
  );

  // Check if we actually removed something
  if (settings.permissions.allow.length === originalLength) {
    return false;
  }

  // Clean up empty structures
  if (settings.permissions.allow.length === 0) {
    delete settings.permissions.allow;
  }

  if (settings.permissions && Object.keys(settings.permissions).length === 0) {
    delete settings.permissions;
  }

  // Write updated settings
  if (!dryRun) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  return true;
}

/**
 * Unregister hook from Gemini CLI settings.json
 */
function unregisterGeminiHook(basePath: string, dryRun: boolean): boolean {
  const settingsPath = path.join(basePath, 'settings.json');

  // Settings file must exist
  if (!existsSync(settingsPath)) {
    return false;
  }

  // Load settings
  let settings: GeminiSettingsJson;
  try {
    const content = readFileSync(settingsPath, 'utf-8');
    settings = JSON.parse(content) as GeminiSettingsJson;
  } catch {
    return false;
  }

  // Check if hooks.SessionEnd exists
  if (!settings.hooks?.SessionEnd) {
    return false;
  }

  // Match both old and new hook command paths
  const hookPatterns = [
    'node hooks/are-session-end.js',
    'node .gemini/hooks/are-session-end.js',
  ];
  const originalLength = settings.hooks.SessionEnd.length;

  settings.hooks.SessionEnd = settings.hooks.SessionEnd.filter(
    (h) => !hookPatterns.includes(h.command),
  );

  // Check if we actually removed something
  if (settings.hooks.SessionEnd.length === originalLength) {
    return false;
  }

  // Clean up empty structures
  if (settings.hooks.SessionEnd.length === 0) {
    delete settings.hooks.SessionEnd;
  }

  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  // Write updated settings
  if (!dryRun) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  return true;
}

/**
 * Clean up empty directories recursively
 *
 * Removes a directory if it's empty, then tries parent directories.
 * Stops when hitting a non-empty directory or the runtime root.
 *
 * @param dirPath - Directory path to check and potentially remove
 */
function cleanupEmptyDirs(dirPath: string): void {
  try {
    if (!existsSync(dirPath)) {
      return;
    }

    const entries = readdirSync(dirPath);
    if (entries.length === 0) {
      rmdirSync(dirPath);

      // Try parent directory (but don't go above runtime root)
      const parent = path.dirname(dirPath);
      // Stop at common runtime roots (.claude, .opencode, .gemini)
      const baseName = path.basename(parent);
      if (
        baseName !== '.claude' &&
        baseName !== '.opencode' &&
        baseName !== '.gemini' &&
        baseName !== '.config'
      ) {
        cleanupEmptyDirs(parent);
      }
    }
  } catch {
    // Ignore errors - directory might be in use or we don't have permissions
  }
}

/**
 * Configuration directory name (matches config/loader.ts)
 */
const CONFIG_DIR = '.agents-reverse-engineer';

/**
 * Delete the .agents-reverse-engineer configuration folder
 *
 * Only applicable for local installations. Removes the entire folder
 * including configuration files and generation plans.
 *
 * @param location - Installation location (only 'local' triggers deletion)
 * @param dryRun - If true, don't actually delete
 * @returns true if folder was deleted, false if not found or not local
 */
export function deleteConfigFolder(location: Location, dryRun: boolean): boolean {
  // Only delete for local installations
  if (location !== 'local') {
    return false;
  }

  const configPath = path.join(process.cwd(), CONFIG_DIR);

  if (!existsSync(configPath)) {
    return false;
  }

  if (!dryRun) {
    try {
      rmSync(configPath, { recursive: true, force: true });
    } catch {
      return false;
    }
  }

  return true;
}

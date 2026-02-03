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
    SessionStart?: HookEvent[];
    SessionEnd?: HookEvent[];
  };
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  [key: string]: unknown;
}

/**
 * Hook definitions for ARE (must match operations.ts)
 */
interface HookDefinition {
  event: 'SessionStart' | 'SessionEnd';
  filename: string;
}

const ARE_HOOKS: HookDefinition[] = [
  { event: 'SessionStart', filename: 'are-check-update.js' },
  { event: 'SessionEnd', filename: 'are-session-end.js' },
];

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

  // For Claude and Gemini runtimes, also remove the session hook files
  let hookUnregistered = false;
  if (runtime === 'claude' || runtime === 'gemini') {
    // Remove all ARE hook files
    for (const hookDef of ARE_HOOKS) {
      const hookPath = path.join(basePath, 'hooks', hookDef.filename);
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
    }

    // Unregister hooks from settings.json
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
    if (runtime === 'claude') {
      // Claude uses skills format: clean up skills/are-* directories
      const skillsDir = path.join(basePath, 'skills');
      cleanupAreSkillDirs(skillsDir);
      cleanupEmptyDirs(skillsDir);
    } else {
      // OpenCode and Gemini use commands format
      const commandsDir = path.join(basePath, 'commands');
      cleanupEmptyDirs(commandsDir);
    }

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
    SessionStart?: GeminiHook[];
    SessionEnd?: GeminiHook[];
  };
  [key: string]: unknown;
}

/**
 * Unregister ARE hooks from settings.json
 *
 * Removes all ARE hook entries from SessionStart and SessionEnd arrays.
 * Cleans up empty hooks structures. Handles both old and new hook paths.
 *
 * @param basePath - Base installation path (e.g., ~/.claude or ~/.gemini)
 * @param runtime - Target runtime (claude or gemini)
 * @param dryRun - If true, don't write changes
 * @returns true if any hook was removed, false if none found
 */
export function unregisterHooks(
  basePath: string,
  runtime: Exclude<Runtime, 'all'>,
  dryRun: boolean,
): boolean {
  if (runtime === 'gemini') {
    return unregisterGeminiHooks(basePath, dryRun);
  }
  return unregisterClaudeHooks(basePath, dryRun);
}

/**
 * Build hook command patterns for matching (includes legacy paths)
 */
function getHookPatterns(runtimeDir: string): string[] {
  const patterns: string[] = [];
  for (const hookDef of ARE_HOOKS) {
    // Current path format
    patterns.push(`node ${runtimeDir}/hooks/${hookDef.filename}`);
    // Legacy path format
    patterns.push(`node hooks/${hookDef.filename}`);
  }
  return patterns;
}

/**
 * Unregister ARE hooks from Claude Code settings.json
 */
function unregisterClaudeHooks(basePath: string, dryRun: boolean): boolean {
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

  if (!settings.hooks) {
    return false;
  }

  const hookPatterns = getHookPatterns('.claude');
  let removedAny = false;

  // Process both SessionStart and SessionEnd
  for (const eventType of ['SessionStart', 'SessionEnd'] as const) {
    if (!settings.hooks[eventType]) {
      continue;
    }

    const originalLength = settings.hooks[eventType]!.length;

    settings.hooks[eventType] = settings.hooks[eventType]!.filter(
      (event) => !event.hooks?.some((h) => hookPatterns.includes(h.command)),
    );

    if (settings.hooks[eventType]!.length < originalLength) {
      removedAny = true;
    }

    // Clean up empty array
    if (settings.hooks[eventType]!.length === 0) {
      delete settings.hooks[eventType];
    }
  }

  if (!removedAny) {
    return false;
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
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
 * Unregister ARE hooks from Gemini CLI settings.json
 */
function unregisterGeminiHooks(basePath: string, dryRun: boolean): boolean {
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

  if (!settings.hooks) {
    return false;
  }

  const hookPatterns = getHookPatterns('.gemini');
  let removedAny = false;

  // Process both SessionStart and SessionEnd
  for (const eventType of ['SessionStart', 'SessionEnd'] as const) {
    if (!settings.hooks[eventType]) {
      continue;
    }

    const originalLength = settings.hooks[eventType]!.length;

    settings.hooks[eventType] = settings.hooks[eventType]!.filter(
      (h) => !hookPatterns.includes(h.command),
    );

    if (settings.hooks[eventType]!.length < originalLength) {
      removedAny = true;
    }

    // Clean up empty array
    if (settings.hooks[eventType]!.length === 0) {
      delete settings.hooks[eventType];
    }
  }

  if (!removedAny) {
    return false;
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  // Write updated settings
  if (!dryRun) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  return true;
}

/**
 * Clean up ARE skill directories
 *
 * Removes all empty are-* skill directories from the skills folder.
 *
 * @param skillsDir - Path to the skills directory
 */
function cleanupAreSkillDirs(skillsDir: string): void {
  try {
    if (!existsSync(skillsDir)) {
      return;
    }

    const entries = readdirSync(skillsDir);
    for (const entry of entries) {
      // Only clean up are-* directories
      if (entry.startsWith('are-')) {
        const skillDir = path.join(skillsDir, entry);
        cleanupEmptyDirs(skillDir);
      }
    }
  } catch {
    // Ignore errors
  }
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

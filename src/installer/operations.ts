/**
 * File operations for installer module
 *
 * Handles copying command/hook files to runtime directories,
 * verifying installations, and registering hooks in settings.json.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Runtime, Location, InstallerResult } from './types.js';
import { resolveInstallPath, getAllRuntimes } from './paths.js';
import {
  getClaudeTemplates,
  getOpenCodeTemplates,
  getGeminiTemplates,
  getHookTemplate,
} from '../integration/templates.js';

/**
 * Options for install operations
 */
export interface InstallOptions {
  /** Overwrite existing files */
  force: boolean;
  /** Preview mode - don't write files */
  dryRun: boolean;
}

/**
 * Ensure directory exists for a file path
 *
 * @param filePath - Full path to the file
 */
function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

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
 * Install files for one or all runtimes
 *
 * If runtime is 'all', installs to all supported runtimes.
 * Otherwise, installs to the specified runtime only.
 *
 * @param runtime - Target runtime or 'all'
 * @param location - Installation location (global or local)
 * @param options - Install options (force, dryRun)
 * @returns Array of installation results (one per runtime)
 */
export function installFiles(
  runtime: Runtime,
  location: Location,
  options: InstallOptions,
): InstallerResult[] {
  if (runtime === 'all') {
    return getAllRuntimes().map((r) => installFilesForRuntime(r, location, options));
  }
  return [installFilesForRuntime(runtime, location, options)];
}

/**
 * Install files for a specific runtime
 *
 * Copies command templates and hook files to the installation directory.
 * Skips existing files unless force=true.
 *
 * @param runtime - Target runtime (claude, opencode, or gemini)
 * @param location - Installation location (global or local)
 * @param options - Install options (force, dryRun)
 * @returns Installation result with files created/skipped
 */
function installFilesForRuntime(
  runtime: Exclude<Runtime, 'all'>,
  location: Location,
  options: InstallOptions,
): InstallerResult {
  const basePath = resolveInstallPath(runtime, location);
  const templates = getTemplatesForRuntime(runtime);
  const filesCreated: string[] = [];
  const filesSkipped: string[] = [];
  const errors: string[] = [];

  // Install command templates
  for (const template of templates) {
    // Template path is relative (e.g., .claude/commands/are/generate.md)
    // Extract the part after the runtime directory (e.g., commands/are/generate.md)
    const relativePath = template.path.split('/').slice(1).join('/');
    const fullPath = path.join(basePath, relativePath);

    if (existsSync(fullPath) && !options.force) {
      filesSkipped.push(fullPath);
    } else {
      if (!options.dryRun) {
        try {
          ensureDir(fullPath);
          writeFileSync(fullPath, template.content, 'utf-8');
        } catch (err) {
          errors.push(`Failed to write ${fullPath}: ${err}`);
          continue;
        }
      }
      filesCreated.push(fullPath);
    }
  }

  // For Claude and Gemini runtimes, also install the session hook
  let hookRegistered = false;
  if (runtime === 'claude' || runtime === 'gemini') {
    const hookPath = path.join(basePath, 'hooks', 'are-session-end.js');
    if (existsSync(hookPath) && !options.force) {
      filesSkipped.push(hookPath);
    } else {
      if (!options.dryRun) {
        try {
          ensureDir(hookPath);
          writeFileSync(hookPath, getHookTemplate(), 'utf-8');
        } catch (err) {
          errors.push(`Failed to write hook ${hookPath}: ${err}`);
        }
      }
      if (!errors.some((e) => e.includes(hookPath))) {
        filesCreated.push(hookPath);
      }
    }

    // Register hook in settings.json
    hookRegistered = registerHooks(basePath, runtime, options.dryRun);

    // Register permissions for Claude (reduces friction for users)
    if (runtime === 'claude') {
      const settingsPath = path.join(basePath, 'settings.json');
      registerPermissions(settingsPath, options.dryRun);
    }
  }

  // Write VERSION file if files were created and not dry run
  let versionWritten = false;
  if (filesCreated.length > 0 && !options.dryRun) {
    try {
      writeVersionFile(basePath, options.dryRun);
      versionWritten = true;
    } catch {
      // Non-fatal, don't add to errors
    }
  }

  return {
    success: errors.length === 0,
    runtime,
    location,
    filesCreated,
    filesSkipped,
    errors,
    hookRegistered,
    versionWritten,
  };
}

/**
 * Verify that installed files exist
 *
 * @param files - Array of file paths to verify
 * @returns Object with success status and list of missing files
 */
export function verifyInstallation(files: string[]): { success: boolean; missing: string[] } {
  const missing = files.filter((f) => !existsSync(f));
  return {
    success: missing.length === 0,
    missing,
  };
}

/**
 * Session hook configuration for settings.json
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
 * Register session-end hook in settings.json
 *
 * Supports both Claude Code and Gemini CLI formats.
 * Merges with existing hooks, doesn't overwrite.
 *
 * @param basePath - Base installation path (e.g., ~/.claude or ~/.gemini)
 * @param runtime - Target runtime (claude or gemini)
 * @param dryRun - If true, don't write changes
 * @returns true if hook was added, false if already existed
 */
export function registerHooks(
  basePath: string,
  runtime: Exclude<Runtime, 'all'>,
  dryRun: boolean,
): boolean {
  // Only for Claude and Gemini installations
  if (runtime !== 'claude' && runtime !== 'gemini') {
    return false;
  }

  const settingsPath = path.join(basePath, 'settings.json');
  // Use full path from project root (e.g., .claude/hooks/are-session-end.js)
  const runtimeDir = runtime === 'claude' ? '.claude' : '.gemini';
  const hookCommand = `node ${runtimeDir}/hooks/are-session-end.js`;

  if (runtime === 'gemini') {
    return registerGeminiHook(settingsPath, hookCommand, dryRun);
  }

  return registerClaudeHook(settingsPath, hookCommand, dryRun);
}

/**
 * Register hook in Claude Code settings.json format
 */
function registerClaudeHook(settingsPath: string, hookCommand: string, dryRun: boolean): boolean {
  // Load or create settings
  let settings: SettingsJson = {};
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content) as SettingsJson;
    } catch {
      // If can't parse, start fresh
      settings = {};
    }
  }

  // Ensure hooks structure exists
  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!settings.hooks.SessionEnd) {
    settings.hooks.SessionEnd = [];
  }

  // Define our hook (Claude format: nested hooks array)
  const newHook: HookEvent = {
    hooks: [
      {
        type: 'command',
        command: hookCommand,
      },
    ],
  };

  // Check if hook already exists (by command string match)
  const hookExists = settings.hooks.SessionEnd.some((event) =>
    event.hooks?.some((h) => h.command === hookCommand),
  );

  if (hookExists) {
    return false;
  }

  // Add the hook
  settings.hooks.SessionEnd.push(newHook);

  // Write settings if not dry run
  if (!dryRun) {
    ensureDir(settingsPath);
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  return true;
}

/**
 * Permissions to auto-allow for ARE commands
 */
const ARE_PERMISSIONS = [
  'Bash(npx are init*)',
  'Bash(npx are discover*)',
  'Bash(npx are generate*)',
  'Bash(npx are update*)',
  'Bash(npx are clean*)',
];

/**
 * Register ARE permissions in Claude Code settings.json
 *
 * Adds bash command permissions for ARE commands to reduce friction.
 *
 * @param settingsPath - Path to settings.json
 * @param dryRun - If true, don't write changes
 * @returns true if permissions were added, false if already existed
 */
export function registerPermissions(settingsPath: string, dryRun: boolean): boolean {
  // Load or create settings
  let settings: SettingsJson = {};
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content) as SettingsJson;
    } catch {
      // If can't parse, start fresh
      settings = {};
    }
  }

  // Ensure permissions structure exists
  if (!settings.permissions) {
    settings.permissions = {};
  }
  if (!settings.permissions.allow) {
    settings.permissions.allow = [];
  }

  // Add any missing ARE permissions
  let addedAny = false;
  for (const perm of ARE_PERMISSIONS) {
    if (!settings.permissions.allow.includes(perm)) {
      settings.permissions.allow.push(perm);
      addedAny = true;
    }
  }

  if (!addedAny) {
    return false;
  }

  // Write settings if not dry run
  if (!dryRun) {
    ensureDir(settingsPath);
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  return true;
}

/**
 * Register hook in Gemini CLI settings.json format
 */
function registerGeminiHook(settingsPath: string, hookCommand: string, dryRun: boolean): boolean {
  // Load or create settings
  let settings: GeminiSettingsJson = {};
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content) as GeminiSettingsJson;
    } catch {
      // If can't parse, start fresh
      settings = {};
    }
  }

  // Ensure hooks structure exists
  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!settings.hooks.SessionEnd) {
    settings.hooks.SessionEnd = [];
  }

  // Define our hook (Gemini format: flat object with name)
  const newHook: GeminiHook = {
    name: 'are-session-end',
    type: 'command',
    command: hookCommand,
  };

  // Check if hook already exists (by command string match)
  const hookExists = settings.hooks.SessionEnd.some((h) => h.command === hookCommand);

  if (hookExists) {
    return false;
  }

  // Add the hook
  settings.hooks.SessionEnd.push(newHook);

  // Write settings if not dry run
  if (!dryRun) {
    ensureDir(settingsPath);
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  return true;
}

/**
 * Get package version from package.json
 *
 * @returns Version string or 'unknown' if can't read
 */
export function getPackageVersion(): string {
  try {
    // Navigate from dist/installer/operations.js to package.json
    // In ESM, we need to use import.meta.url
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // From src/installer/ go up two levels to project root
    const packagePath = path.join(__dirname, '..', '..', 'package.json');
    const content = readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(content) as { version?: string };
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Write VERSION file to track installed version
 *
 * @param basePath - Base installation path
 * @param dryRun - If true, don't write the file
 */
export function writeVersionFile(basePath: string, dryRun: boolean): void {
  if (dryRun) {
    return;
  }

  const versionPath = path.join(basePath, 'VERSION');
  const version = getPackageVersion();

  ensureDir(versionPath);
  writeFileSync(versionPath, version, 'utf-8');
}

/**
 * Format installation result for display
 *
 * Generates human-readable lines showing created/skipped files.
 *
 * @param result - Installation result to format
 * @returns Array of formatted lines for display
 */
export function formatInstallResult(result: InstallerResult): string[] {
  const lines: string[] = [];

  // Header with runtime and location
  lines.push(`  ${result.runtime} (${result.location}):`);

  // Created files
  for (const file of result.filesCreated) {
    lines.push(`    Created: ${file}`);
  }

  // Skipped files
  for (const file of result.filesSkipped) {
    lines.push(`    Skipped: ${file} (already exists)`);
  }

  // Hook registration status (Claude only)
  if (result.hookRegistered) {
    lines.push(`    Registered: SessionEnd hook in settings.json`);
  }

  // Summary line
  const created = result.filesCreated.length;
  const skipped = result.filesSkipped.length;
  lines.push(`    ${created} files installed, ${skipped} skipped`);

  return lines;
}

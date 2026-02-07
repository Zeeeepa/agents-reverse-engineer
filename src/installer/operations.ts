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
 * Get the path to a bundled hook file
 *
 * Hooks are bundled in hooks/dist/ during npm prepublishOnly.
 *
 * @param hookName - Name of the hook file (e.g., 'are-session-end.js')
 * @returns Absolute path to the bundled hook file
 */
function getBundledHookPath(hookName: string): string {
  // Navigate from dist/installer/operations.js to hooks/dist/
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // From dist/installer/ go up two levels to project root, then to hooks/dist/
  return path.join(__dirname, '..', '..', 'hooks', 'dist', hookName);
}

/**
 * Read bundled hook content
 *
 * @param hookName - Name of the hook file
 * @returns Hook file content as string
 * @throws Error if hook file not found
 */
function readBundledHook(hookName: string): string {
  const hookPath = getBundledHookPath(hookName);
  if (!existsSync(hookPath)) {
    throw new Error(`Bundled hook not found: ${hookPath}`);
  }
  return readFileSync(hookPath, 'utf-8');
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

  // Install hooks/plugins based on runtime
  let hookRegistered = false;
  if (runtime === 'claude' || runtime === 'gemini') {
    // Claude and Gemini: install session hooks
    for (const hookDef of ARE_HOOKS) {
      const hookPath = path.join(basePath, 'hooks', hookDef.filename);
      if (existsSync(hookPath) && !options.force) {
        filesSkipped.push(hookPath);
      } else {
        if (!options.dryRun) {
          try {
            ensureDir(hookPath);
            const hookContent = readBundledHook(hookDef.filename);
            writeFileSync(hookPath, hookContent, 'utf-8');
          } catch (err) {
            errors.push(`Failed to write hook ${hookPath}: ${err}`);
          }
        }
        if (!errors.some((e) => e.includes(hookPath))) {
          filesCreated.push(hookPath);
        }
      }
    }

    // Register hooks in settings.json
    hookRegistered = registerHooks(basePath, runtime, options.dryRun);

    // Register permissions for Claude (reduces friction for users)
    if (runtime === 'claude') {
      const settingsPath = path.join(basePath, 'settings.json');
      registerPermissions(settingsPath, options.dryRun);
    }
  } else if (runtime === 'opencode') {
    // OpenCode: install plugins (auto-loaded from plugins/ directory)
    for (const pluginDef of ARE_PLUGINS) {
      const pluginPath = path.join(basePath, 'plugins', pluginDef.destFilename);
      if (existsSync(pluginPath) && !options.force) {
        filesSkipped.push(pluginPath);
      } else {
        if (!options.dryRun) {
          try {
            ensureDir(pluginPath);
            const pluginContent = readBundledHook(pluginDef.srcFilename);
            writeFileSync(pluginPath, pluginContent, 'utf-8');
          } catch (err) {
            errors.push(`Failed to write plugin ${pluginPath}: ${err}`);
          }
        }
        if (!errors.some((e) => e.includes(pluginPath))) {
          filesCreated.push(pluginPath);
          hookRegistered = true;
        }
      }
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
 * Hook definitions for ARE (Claude and Gemini)
 */
interface HookDefinition {
  event: 'SessionStart' | 'SessionEnd';
  filename: string;
  name: string; // For Gemini format
}

const ARE_HOOKS: HookDefinition[] = [
  { event: 'SessionStart', filename: 'are-check-update.js', name: 'are-check-update' },
  { event: 'SessionEnd', filename: 'are-session-end.js', name: 'are-session-end' },
];

/**
 * Plugin definitions for ARE (OpenCode)
 *
 * OpenCode uses a plugin system (.opencode/plugins/) instead of hooks.
 * Plugins are JS/TS modules that export async functions returning event handlers.
 */
interface PluginDefinition {
  /** Source filename in hooks/dist/ (prefixed with opencode-) */
  srcFilename: string;
  /** Destination filename in .opencode/plugins/ */
  destFilename: string;
}

const ARE_PLUGINS: PluginDefinition[] = [
  { srcFilename: 'opencode-are-check-update.js', destFilename: 'are-check-update.js' },
  { srcFilename: 'opencode-are-session-end.js', destFilename: 'are-session-end.js' },
];

/**
 * Register ARE hooks in settings.json
 *
 * Registers both SessionStart (update check) and SessionEnd (auto-update) hooks.
 * Supports both Claude Code and Gemini CLI formats.
 * Merges with existing hooks, doesn't overwrite.
 *
 * @param basePath - Base installation path (e.g., ~/.claude or ~/.gemini)
 * @param runtime - Target runtime (claude or gemini)
 * @param dryRun - If true, don't write changes
 * @returns true if any hook was added, false if all already existed
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
  const runtimeDir = runtime === 'claude' ? '.claude' : '.gemini';

  if (runtime === 'gemini') {
    return registerGeminiHooks(settingsPath, runtimeDir, dryRun);
  }

  return registerClaudeHooks(settingsPath, runtimeDir, dryRun);
}

/**
 * Register ARE hooks in Claude Code settings.json format
 */
function registerClaudeHooks(settingsPath: string, runtimeDir: string, dryRun: boolean): boolean {
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

  let addedAny = false;

  for (const hookDef of ARE_HOOKS) {
    const hookCommand = `node ${runtimeDir}/hooks/${hookDef.filename}`;

    // Ensure event array exists
    if (!settings.hooks[hookDef.event]) {
      settings.hooks[hookDef.event] = [];
    }

    // Check if hook already exists (by command string match)
    const hookExists = settings.hooks[hookDef.event]!.some((event) =>
      event.hooks?.some((h) => h.command === hookCommand),
    );

    if (!hookExists) {
      // Define our hook (Claude format: nested hooks array)
      const newHook: HookEvent = {
        hooks: [
          {
            type: 'command',
            command: hookCommand,
          },
        ],
      };
      settings.hooks[hookDef.event]!.push(newHook);
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
 * Permissions to auto-allow for ARE commands
 */
const ARE_PERMISSIONS = [
  'Bash(npx agents-reverse-engineer@latest init*)',
  'Bash(npx agents-reverse-engineer@latest discover*)',
  'Bash(npx agents-reverse-engineer@latest generate*)',
  'Bash(npx agents-reverse-engineer@latest update*)',
  'Bash(npx agents-reverse-engineer@latest clean*)',
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
 * Register ARE hooks in Gemini CLI settings.json format
 */
function registerGeminiHooks(settingsPath: string, runtimeDir: string, dryRun: boolean): boolean {
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

  let addedAny = false;

  for (const hookDef of ARE_HOOKS) {
    const hookCommand = `node ${runtimeDir}/hooks/${hookDef.filename}`;

    // Ensure event array exists
    if (!settings.hooks[hookDef.event]) {
      settings.hooks[hookDef.event] = [];
    }

    // Check if hook already exists (by command string match)
    const hookExists = settings.hooks[hookDef.event]!.some((h) => h.command === hookCommand);

    if (!hookExists) {
      // Define our hook (Gemini format: flat object with name)
      const newHook: GeminiHook = {
        name: hookDef.name,
        type: 'command',
        command: hookCommand,
      };
      settings.hooks[hookDef.event]!.push(newHook);
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
 * Write ARE-VERSION file to track installed version
 *
 * @param basePath - Base installation path
 * @param dryRun - If true, don't write the file
 */
export function writeVersionFile(basePath: string, dryRun: boolean): void {
  if (dryRun) {
    return;
  }

  const versionPath = path.join(basePath, 'ARE-VERSION');
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

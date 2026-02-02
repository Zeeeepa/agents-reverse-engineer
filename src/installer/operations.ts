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

  // For Claude runtime, also install the session hook
  if (runtime === 'claude') {
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
  }

  return {
    success: errors.length === 0,
    runtime,
    location,
    filesCreated,
    filesSkipped,
    errors,
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

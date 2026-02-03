/**
 * Integration file generation for AI coding assistants
 *
 * Generates command files and hooks for detected AI assistant environments.
 * Handles file creation with directory creation and skip-if-exists behavior.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IntegrationResult, EnvironmentType } from './types.js';
import { detectEnvironments } from './detect.js';
import {
  getClaudeTemplates,
  getOpenCodeTemplates,
  getGeminiTemplates,
} from './templates.js';

/**
 * Get the path to a bundled hook file
 *
 * @param hookName - Name of the hook file (e.g., 'are-session-end.js')
 * @returns Absolute path to the bundled hook file
 */
function getBundledHookPath(hookName: string): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // From dist/integration/ go up two levels to project root, then to hooks/dist/
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
 * Options for generating integration files
 */
export interface GenerateOptions {
  /** If true, don't actually write files - just report what would be done */
  dryRun?: boolean;
  /** If true, overwrite existing files instead of skipping them */
  force?: boolean;
  /** Specific environment to generate for (bypasses auto-detection) */
  environment?: EnvironmentType;
}

/**
 * Ensure parent directories exist for a file path
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
 * Generate integration files for all detected AI assistant environments
 *
 * For each detected environment:
 * - Gets appropriate templates (command files)
 * - Creates files if they don't exist (or if force=true)
 * - For Claude: also creates the session-end hook
 *
 * @param projectRoot - Root directory of the project
 * @param options - Generation options
 * @returns Array of results, one per environment
 *
 * @example
 * ```typescript
 * const results = await generateIntegrationFiles('/path/to/project');
 * // [{ environment: 'claude', filesCreated: ['...'], filesSkipped: [] }]
 * ```
 */
export async function generateIntegrationFiles(
  projectRoot: string,
  options: GenerateOptions = {}
): Promise<IntegrationResult[]> {
  const { dryRun = false, force = false, environment: specificEnv } = options;
  const results: IntegrationResult[] = [];

  // Use specific environment if provided, otherwise auto-detect
  let environments: { type: EnvironmentType; configDir: string }[];
  if (specificEnv) {
    // Map environment type to config directory
    const configDirMap: Record<EnvironmentType, string> = {
      claude: '.claude',
      opencode: '.opencode',
      aider: '.aider',
      gemini: '.gemini',
    };
    environments = [{ type: specificEnv, configDir: configDirMap[specificEnv] }];
  } else {
    // Detect which environments are present
    environments = detectEnvironments(projectRoot);
  }

  for (const env of environments) {
    const result: IntegrationResult = {
      environment: env.type,
      filesCreated: [],
      filesSkipped: [],
    };

    // Get templates for this environment
    const templates = getTemplatesForEnvironment(env.type);

    // Process each template
    for (const template of templates) {
      const fullPath = path.join(projectRoot, template.path);

      if (existsSync(fullPath) && !force) {
        // File exists and force is not set - skip it
        result.filesSkipped.push(template.path);
      } else {
        // Create the file
        if (!dryRun) {
          ensureDir(fullPath);
          writeFileSync(fullPath, template.content, 'utf-8');
        }
        result.filesCreated.push(template.path);
      }
    }

    // For Claude, also generate the hook file
    if (env.type === 'claude') {
      const hookPath = '.claude/hooks/are-session-end.js';
      const fullHookPath = path.join(projectRoot, hookPath);

      if (existsSync(fullHookPath) && !force) {
        result.filesSkipped.push(hookPath);
      } else {
        if (!dryRun) {
          ensureDir(fullHookPath);
          const hookContent = readBundledHook('are-session-end.js');
          writeFileSync(fullHookPath, hookContent, 'utf-8');
        }
        result.filesCreated.push(hookPath);
      }
    }

    results.push(result);
  }

  return results;
}

/**
 * Get templates for a specific environment type
 *
 * @param type - Environment type
 * @returns Array of templates for that environment
 */
function getTemplatesForEnvironment(
  type: EnvironmentType
): ReturnType<typeof getClaudeTemplates> {
  switch (type) {
    case 'claude':
      return getClaudeTemplates();
    case 'opencode':
      return getOpenCodeTemplates();
    case 'gemini':
      return getGeminiTemplates();
    case 'aider':
      // Aider doesn't have command files yet - return empty
      return [];
    default:
      return [];
  }
}

/**
 * Environment detection for AI coding assistants
 *
 * Detects which AI coding assistant environments are present in a project
 * by checking for their configuration directories and files.
 */

import { existsSync } from 'node:fs';
import * as path from 'node:path';
import type { DetectedEnvironment, EnvironmentType } from './types.js';

/**
 * Detect all AI coding assistant environments present in a project
 *
 * Checks for:
 * - Claude Code: .claude/ directory OR CLAUDE.md file
 * - OpenCode: .opencode/ directory
 * - Aider: .aider.conf.yml file OR .aider/ directory
 *
 * @param projectRoot - Root directory to check for environments
 * @returns Array of detected environments (may include multiple)
 */
export function detectEnvironments(projectRoot: string): DetectedEnvironment[] {
  const environments: DetectedEnvironment[] = [];

  // Check for Claude Code
  const claudeDir = path.join(projectRoot, '.claude');
  const claudeMd = path.join(projectRoot, 'CLAUDE.md');
  if (existsSync(claudeDir) || existsSync(claudeMd)) {
    environments.push({
      type: 'claude',
      configDir: '.claude',
      detected: true,
    });
  }

  // Check for OpenCode
  const openCodeDir = path.join(projectRoot, '.opencode');
  if (existsSync(openCodeDir)) {
    environments.push({
      type: 'opencode',
      configDir: '.opencode',
      detected: true,
    });
  }

  // Check for Aider
  const aiderConfig = path.join(projectRoot, '.aider.conf.yml');
  const aiderDir = path.join(projectRoot, '.aider');
  if (existsSync(aiderConfig) || existsSync(aiderDir)) {
    environments.push({
      type: 'aider',
      configDir: '.aider',
      detected: true,
    });
  }

  return environments;
}

/**
 * Check if a specific AI coding assistant environment is present
 *
 * @param projectRoot - Root directory to check
 * @param type - Environment type to check for
 * @returns true if the environment is detected
 */
export function hasEnvironment(
  projectRoot: string,
  type: EnvironmentType
): boolean {
  const environments = detectEnvironments(projectRoot);
  return environments.some((env) => env.type === type);
}

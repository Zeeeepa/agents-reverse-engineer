/**
 * Integration types for AI coding assistant environments
 *
 * Defines types for detecting AI assistant environments (Claude Code, OpenCode, etc.)
 * and generating appropriate integration templates (command files, hooks).
 */

/**
 * Supported AI coding assistant environment types
 */
export type EnvironmentType = 'claude' | 'opencode' | 'aider' | 'gemini';

/**
 * Result of detecting an AI coding assistant environment
 */
export interface DetectedEnvironment {
  /** Type of AI assistant detected */
  type: EnvironmentType;
  /** Configuration directory for this environment (e.g., '.claude', '.opencode') */
  configDir: string;
  /** Whether this environment was detected in the project */
  detected: boolean;
}

/**
 * Template for integration files (command files, hooks, etc.)
 */
export interface IntegrationTemplate {
  /** File name (e.g., 'generate.md') */
  filename: string;
  /** Relative path from project root (e.g., '.claude/commands/ar/generate.md') */
  path: string;
  /** Template content to write to the file */
  content: string;
}

/**
 * Result of generating integration files for an environment
 */
export interface IntegrationResult {
  /** Environment type that was configured */
  environment: EnvironmentType;
  /** Files that were successfully created */
  filesCreated: string[];
  /** Files that were skipped (already exist) */
  filesSkipped: string[];
}

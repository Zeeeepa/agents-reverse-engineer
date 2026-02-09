import * as path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

/**
 * A collected AGENTS.md document with its project-relative path and content.
 */
export type AgentsDocs = Array<{ relativePath: string; content: string }>;

/** Directories to skip during recursive AGENTS.md collection. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.agents-reverse-engineer',
  'vendor', 'dist', 'build', '__pycache__', '.next',
  'venv', '.venv', 'target', '.cargo', '.gradle',
]);

/**
 * Recursively collect all AGENTS.md files under `projectRoot`,
 * returning their relative paths and content sorted alphabetically.
 *
 * Skips vendor/build/meta directories and gracefully handles
 * unreadable directories or files.
 */
export async function collectAgentsDocs(projectRoot: string): Promise<AgentsDocs> {
  const results: AgentsDocs = [];

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return; // Permission denied or inaccessible
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        await walk(path.join(currentDir, entry.name));
      } else if (entry.name === 'AGENTS.md') {
        try {
          const filePath = path.join(currentDir, entry.name);
          const content = await readFile(filePath, 'utf-8');
          results.push({
            relativePath: path.relative(projectRoot, filePath),
            content,
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  await walk(projectRoot);
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}

/**
 * Recursively collect all `.annex.md` files under `projectRoot`,
 * returning their relative paths and content sorted alphabetically.
 *
 * Uses the same skip-list as `collectAgentsDocs()`.
 */
export async function collectAnnexFiles(projectRoot: string): Promise<AgentsDocs> {
  const results: AgentsDocs = [];

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        await walk(path.join(currentDir, entry.name));
      } else if (entry.isFile() && entry.name.endsWith('.annex.md')) {
        try {
          const filePath = path.join(currentDir, entry.name);
          const content = await readFile(filePath, 'utf-8');
          results.push({
            relativePath: path.relative(projectRoot, filePath),
            content,
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  await walk(projectRoot);
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}

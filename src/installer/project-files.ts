/**
 * Helpers that add / remove ARE artefacts from project files.
 *
 * Used by `cli/init.ts` (ensure*) and `installer/uninstall.ts` (remove*).
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { parse, modify, applyEdits, type ParseError } from 'jsonc-parser';

const GITIGNORE_SECTION = '# agents-reverse-engineer';
const SUM_PATTERN = '*.sum';

// ── .gitignore ──────────────────────────────────────────────────────

/**
 * Ensure `*.sum` is listed in `.gitignore`.
 *
 * If a `# agents-reverse-engineer` section already exists, appends within it.
 * Otherwise creates the section. Idempotent — skips if already present.
 *
 * @returns true if the file was modified
 */
export async function ensureGitignoreEntry(root: string): Promise<boolean> {
  const gitignorePath = path.join(root, '.gitignore');

  let content = '';
  try {
    content = await readFile(gitignorePath, 'utf-8');
  } catch {
    // File doesn't exist — will create
  }

  // Already has the entry
  if (content.split('\n').some((line) => line.trim() === SUM_PATTERN)) {
    return false;
  }

  const sectionIdx = content.indexOf(GITIGNORE_SECTION);
  if (sectionIdx !== -1) {
    // Insert after the section header line
    const endOfLine = content.indexOf('\n', sectionIdx);
    const insertAt = endOfLine === -1 ? content.length : endOfLine;
    content = content.slice(0, insertAt) + '\n' + SUM_PATTERN + content.slice(insertAt);
  } else {
    // Append new section
    const separator = content.length > 0 && !content.endsWith('\n') ? '\n\n' : content.length > 0 ? '\n' : '';
    content += `${separator}${GITIGNORE_SECTION}\n${SUM_PATTERN}\n`;
  }

  await writeFile(gitignorePath, content, 'utf-8');
  return true;
}

/**
 * Remove the `# agents-reverse-engineer` section and `*.sum` entry from `.gitignore`.
 *
 * Removes the section header line, the `*.sum` line beneath it, and any resulting
 * excess blank lines. Idempotent — returns false if nothing was changed.
 *
 * @param dryRun - If true, don't write changes
 * @returns true if the file was modified
 */
export async function removeGitignoreEntry(dryRun: boolean): Promise<boolean> {
  const gitignorePath = path.join(process.cwd(), '.gitignore');

  if (!existsSync(gitignorePath)) {
    return false;
  }

  let content: string;
  try {
    content = await readFile(gitignorePath, 'utf-8');
  } catch {
    return false;
  }

  const lines = content.split('\n');
  const filtered: string[] = [];
  let changed = false;
  let i = 0;

  while (i < lines.length) {
    if (lines[i].trim() === GITIGNORE_SECTION) {
      // Skip the section header
      changed = true;
      i++;
      // Skip subsequent lines that belong to this section (*.sum and blank lines)
      while (i < lines.length) {
        const trimmed = lines[i].trim();
        if (trimmed === SUM_PATTERN) {
          i++;
          continue;
        }
        // Stop at the next non-blank line (new section or content)
        if (trimmed !== '') {
          break;
        }
        // Skip blank lines immediately after the section
        i++;
      }
      continue;
    }
    filtered.push(lines[i]);
    i++;
  }

  if (!changed) {
    return false;
  }

  // Trim trailing blank lines to keep the file tidy
  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === '') {
    filtered.pop();
  }

  if (!dryRun) {
    const result = filtered.length > 0 ? filtered.join('\n') + '\n' : '';
    await writeFile(gitignorePath, result, 'utf-8');
  }

  return true;
}

// ── .vscode/settings.json ───────────────────────────────────────────

/**
 * Ensure `.vscode/settings.json` has `files.exclude["**\/*.sum"] = true`.
 *
 * Creates the file and directory if needed. Handles JSONC (comments,
 * trailing commas) used by VS Code — edits are applied surgically via
 * `jsonc-parser` so existing comments and formatting are preserved.
 * If an existing file cannot be parsed, the file is left untouched.
 * Idempotent.
 *
 * @returns true if the file was modified
 */
export async function ensureVscodeExclude(root: string): Promise<boolean> {
  const vscodePath = path.join(root, '.vscode');
  const settingsPath = path.join(vscodePath, 'settings.json');

  let content = '{}';
  if (existsSync(settingsPath)) {
    content = await readFile(settingsPath, 'utf-8');
  }

  // Parse JSONC — bail out on truly broken files
  const errors: ParseError[] = [];
  const settings = (parse(content, errors) ?? {}) as Record<string, unknown>;
  if (errors.length > 0 && Object.keys(settings).length === 0) {
    // Truly unparseable — leave untouched to avoid data loss
    return false;
  }

  const filesExclude = (settings['files.exclude'] ?? {}) as Record<string, boolean>;
  if (filesExclude['**/*.sum'] === true) {
    return false;
  }

  // Targeted edit preserving existing comments and formatting
  const edits = modify(content, ['files.exclude', '**/*.sum'], true, {
    formattingOptions: { tabSize: 1, insertSpaces: false },
  });
  const updated = applyEdits(content, edits);

  await mkdir(vscodePath, { recursive: true });
  await writeFile(settingsPath, updated, 'utf-8');
  return true;
}

/**
 * Remove `files.exclude["**\/*.sum"]` from `.vscode/settings.json`.
 *
 * Uses `jsonc-parser` to surgically remove the key while preserving comments
 * and formatting. Cleans up the empty `files.exclude` object if no other keys
 * remain. Idempotent — returns false if nothing was changed.
 *
 * @param dryRun - If true, don't write changes
 * @returns true if the file was modified
 */
export async function removeVscodeExclude(dryRun: boolean): Promise<boolean> {
  const settingsPath = path.join(process.cwd(), '.vscode', 'settings.json');

  if (!existsSync(settingsPath)) {
    return false;
  }

  let content: string;
  try {
    content = await readFile(settingsPath, 'utf-8');
  } catch {
    return false;
  }

  const errors: ParseError[] = [];
  const settings = (parse(content, errors) ?? {}) as Record<string, unknown>;
  if (errors.length > 0 && Object.keys(settings).length === 0) {
    return false;
  }

  const filesExclude = (settings['files.exclude'] ?? {}) as Record<string, boolean>;
  if (filesExclude['**/*.sum'] === undefined) {
    return false;
  }

  const fmt = { formattingOptions: { tabSize: 1, insertSpaces: false } };

  // Remove the **/*.sum key
  let updated = applyEdits(content, modify(content, ['files.exclude', '**/*.sum'], undefined, fmt));

  // If files.exclude is now empty, remove it entirely
  const afterParse = (parse(updated) ?? {}) as Record<string, unknown>;
  const remaining = afterParse['files.exclude'] as Record<string, unknown> | undefined;
  if (remaining && Object.keys(remaining).length === 0) {
    updated = applyEdits(updated, modify(updated, ['files.exclude'], undefined, fmt));
  }

  if (!dryRun) {
    await writeFile(settingsPath, updated, 'utf-8');
  }

  return true;
}

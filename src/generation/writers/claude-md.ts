import { readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { GENERATED_MARKER, GENERATED_MARKER_PREFIX } from './agents-md.js';

/**
 * Write a CLAUDE.md file that imports the companion AGENTS.md via @ reference.
 * If a user-authored CLAUDE.md already exists (no marker), rename it to
 * CLAUDE.local.md and add an @CLAUDE.local.md import to preserve user content.
 * No AI call needed — this is a deterministic template.
 */
export async function writeClaudeMdPointer(dirAbsolutePath: string): Promise<string> {
  const claudeMdPath = path.join(dirAbsolutePath, 'CLAUDE.md');
  const claudeLocalPath = path.join(dirAbsolutePath, 'CLAUDE.local.md');
  let hasLocalContent = false;

  // Check for existing CLAUDE.md
  if (existsSync(claudeMdPath)) {
    try {
      const existing = await readFile(claudeMdPath, 'utf-8');
      if (!existing.includes(GENERATED_MARKER_PREFIX)) {
        // User-authored — preserve as CLAUDE.local.md
        await rename(claudeMdPath, claudeLocalPath);
        hasLocalContent = true;
      }
    } catch {
      // Unreadable — overwrite
    }
  }

  // Check if CLAUDE.local.md exists (from this run or a previous one)
  if (!hasLocalContent && existsSync(claudeLocalPath)) {
    hasLocalContent = true;
  }

  // Build content with imports
  const lines = [GENERATED_MARKER, ''];
  if (hasLocalContent) {
    lines.push('@CLAUDE.local.md');
  }
  lines.push('@AGENTS.md', '');

  await writeFile(claudeMdPath, lines.join('\n'), 'utf-8');
  return claudeMdPath;
}

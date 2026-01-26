import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Standard CLAUDE.md content - simple pointer to AGENTS.md.
 *
 * Per CONTEXT.md: "Simple pointer to AGENTS.md for Anthropic compatibility"
 */
const CLAUDE_MD_CONTENT = `# CLAUDE.md

See [AGENTS.md](./AGENTS.md) for codebase documentation.

This file exists for Anthropic compatibility. The actual documentation
is maintained in AGENTS.md files throughout the codebase.
`;

/**
 * Write CLAUDE.md at the project root.
 *
 * @param projectRoot - Project root directory
 * @returns Path to written CLAUDE.md
 */
export async function writeClaudeMd(projectRoot: string): Promise<string> {
  const claudePath = path.join(projectRoot, 'CLAUDE.md');
  await writeFile(claudePath, CLAUDE_MD_CONTENT, 'utf-8');
  return claudePath;
}

/**
 * Get the content that would be written to CLAUDE.md.
 * Useful for previewing without writing.
 */
export function getClaudeMdContent(): string {
  return CLAUDE_MD_CONTENT;
}

import { existsSync } from 'node:fs';
import * as path from 'node:path';
import type { PhantomPathInconsistency } from '../types.js';

/**
 * Regex patterns matching path-like references in AGENTS.md content.
 *
 * Matches patterns like:
 * - `src/foo/bar.ts` (source file paths in backticks)
 * - `../foo/bar.js` (relative import paths in backticks)
 * - [text](./path) (markdown links)
 */
const PATH_PATTERNS: RegExp[] = [
  // Markdown links: [text](./path) or [text](path)
  /\[(?:[^\]]*)\]\((\.[^)]+)\)/g,
  // Backtick-quoted paths: `src/foo/bar.ts` or `../foo/bar.js`
  /`((?:src\/|\.\.?\/)[^`]+\.[a-z]{1,4})`/g,
  // Prose paths: "from src/foo/" or "in src/foo/bar.ts"
  /(?:from|in|by|via|see)\s+`?(src\/[\w\-./]+)`?/gi,
];

/**
 * Paths/patterns to skip during validation (not actual file references).
 */
const SKIP_PATTERNS: RegExp[] = [
  /node_modules/,
  /\.git\//,
  /^https?:/,
  /\{\{/,          // template placeholders
  /\$\{/,          // template literals
  /\*/,            // glob patterns
  /\{[^}]*,[^}]*\}/,  // brace expansion: {a,b,c}
];

/**
 * Check an AGENTS.md file for phantom path references.
 *
 * Extracts all path-like strings from the document, resolves them
 * relative to the AGENTS.md file location, and verifies they exist.
 *
 * @param agentsMdPath - Absolute path to the AGENTS.md file
 * @param content - Content of the AGENTS.md file
 * @param projectRoot - Project root for resolving src/ paths
 * @returns Array of phantom path inconsistencies
 */
export function checkPhantomPaths(
  agentsMdPath: string,
  content: string,
  projectRoot: string,
): PhantomPathInconsistency[] {
  const issues: PhantomPathInconsistency[] = [];
  const agentsMdDir = path.dirname(agentsMdPath);
  const seen = new Set<string>();

  for (const pattern of PATH_PATTERNS) {
    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const rawPath = match[1];
      if (!rawPath || seen.has(rawPath)) continue;
      if (SKIP_PATTERNS.some((p) => p.test(rawPath))) continue;

      seen.add(rawPath);

      // Try resolving relative to AGENTS.md location
      const fromAgentsMd = path.resolve(agentsMdDir, rawPath);
      // Try resolving relative to project root (for src/ paths)
      const fromRoot = path.resolve(projectRoot, rawPath);

      // Strip .js extension and try .ts (TypeScript import convention)
      const tryPaths = [fromAgentsMd, fromRoot];
      if (rawPath.endsWith('.js')) {
        tryPaths.push(fromAgentsMd.replace(/\.js$/, '.ts'));
        tryPaths.push(fromRoot.replace(/\.js$/, '.ts'));
      }

      const exists = tryPaths.some((p) => existsSync(p));

      if (!exists) {
        // Find the line containing this reference for context
        const lines = content.split('\n');
        const contextLine = lines.find((l) => l.includes(rawPath)) ?? '';

        issues.push({
          type: 'phantom-path',
          severity: 'warning',
          agentsMdPath: path.relative(projectRoot, agentsMdPath),
          description: `Phantom path reference: "${rawPath}" does not exist`,
          details: {
            referencedPath: rawPath,
            resolvedTo: path.relative(projectRoot, fromAgentsMd),
            context: contextLine.trim().slice(0, 120),
          },
        });
      }
    }
  }

  return issues;
}

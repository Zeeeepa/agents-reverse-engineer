import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { ImportEntry, FileImports } from './types.js';

/**
 * Regex matching TypeScript/JavaScript import statements.
 *
 * Captures:
 * - Group 1: 'type' keyword if present (type-only import)
 * - Group 2: named symbols (between braces)
 * - Group 3: namespace import (* as name)
 * - Group 4: default import (bare identifier)
 * - Group 5: module specifier (the string after 'from')
 */
const IMPORT_REGEX =
  /^import\s+(type\s+)?(?:\{([^}]*)\}|(\*\s+as\s+\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/gm;

/**
 * Extract import statements from source content.
 *
 * Only processes lines starting with 'import' to avoid matching
 * dynamic imports or imports inside comments/strings.
 */
export function extractImports(sourceContent: string): ImportEntry[] {
  const entries: ImportEntry[] = [];
  let match;
  IMPORT_REGEX.lastIndex = 0;

  while ((match = IMPORT_REGEX.exec(sourceContent)) !== null) {
    const typeOnly = !!match[1];
    const namedSymbols = match[2]; // { Foo, Bar }
    const namespaceImport = match[3]; // * as name
    const defaultImport = match[4]; // name
    const specifier = match[5];

    let symbols: string[] = [];
    if (namedSymbols) {
      symbols = namedSymbols
        .split(',')
        .map((s) => s.trim().replace(/\s+as\s+\w+/, ''))
        .filter(Boolean);
    } else if (namespaceImport) {
      symbols = [namespaceImport.replace('* as ', '').trim()];
    } else if (defaultImport) {
      symbols = [defaultImport];
    }

    entries.push({ specifier, symbols, typeOnly });
  }

  return entries;
}

/**
 * Extract and classify imports for all source files in a directory.
 *
 * Reads only the first 100 lines of each file (imports are at the top)
 * for performance. Classifies imports as internal (same directory via './')
 * or external (everything else).
 *
 * Skips node: built-ins and bare package specifiers (npm packages).
 */
export async function extractDirectoryImports(
  dirPath: string,
  fileNames: string[],
): Promise<FileImports[]> {
  const results: FileImports[] = [];

  for (const fileName of fileNames) {
    const filePath = path.join(dirPath, fileName);
    try {
      const content = await readFile(filePath, 'utf-8');
      // Only read import region (first 100 lines) for performance
      const importRegion = content.split('\n').slice(0, 100).join('\n');
      const imports = extractImports(importRegion);

      // Filter out bare specifiers (npm packages) and node: builtins
      const relativeImports = imports.filter(
        (i) => i.specifier.startsWith('.') || i.specifier.startsWith('..'),
      );

      const internal = relativeImports.filter((i) =>
        i.specifier.startsWith('./'),
      );
      const external = relativeImports.filter((i) =>
        i.specifier.startsWith('../'),
      );

      if (external.length > 0 || internal.length > 0) {
        results.push({
          fileName,
          externalImports: external,
          internalImports: internal,
        });
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}

/**
 * Format import data as a structured text block for LLM prompts.
 *
 * Example output:
 * ```
 * runner.ts:
 *   ../ai/index.js → AIService
 *   ../generation/executor.js → ExecutionPlan, ExecutionTask
 *
 * pool.ts:
 *   ./trace.js → ITraceWriter (type)
 * ```
 */
export function formatImportMap(fileImports: FileImports[]): string {
  const sections: string[] = [];

  for (const fi of fileImports) {
    const lines: string[] = [`${fi.fileName}:`];
    for (const imp of fi.externalImports) {
      const typeTag = imp.typeOnly ? ' (type)' : '';
      lines.push(`  ${imp.specifier} → ${imp.symbols.join(', ')}${typeTag}`);
    }
    if (lines.length > 1) {
      sections.push(lines.join('\n'));
    }
  }

  return sections.join('\n\n');
}

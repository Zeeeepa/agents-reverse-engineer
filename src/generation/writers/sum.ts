import { writeFile, readFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import type { SummaryMetadata } from '../types.js';

/**
 * Content structure for a .sum file.
 */
export interface SumFileContent {
  /** Main summary text (detailed description) */
  summary: string;
  /** Extracted metadata */
  metadata: SummaryMetadata;
  /** Generation timestamp */
  generatedAt: string;
  /** SHA-256 hash of source file content (for change detection) */
  contentHash: string;
}

/**
 * Parse a .sum file back into structured content.
 * Returns null if file doesn't exist or is invalid.
 */
export async function readSumFile(sumPath: string): Promise<SumFileContent | null> {
  try {
    const content = await readFile(sumPath, 'utf-8');
    return parseSumFile(content);
  } catch {
    return null;
  }
}

/**
 * Parse a YAML-style array from frontmatter.
 * Supports both inline [a, b, c] and multi-line formats.
 */
function parseYamlArray(frontmatter: string, key: string): string[] {
  // Try inline format first: key: [a, b, c]
  const inlineMatch = frontmatter.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`));
  if (inlineMatch) {
    return inlineMatch[1]
      .split(',')
      .map(s => s.trim().replace(/^["']|["']$/g, ''))
      .filter(s => s.length > 0);
  }

  // Try multi-line format:
  // key:
  //   - item1
  //   - item2
  const multiLineMatch = frontmatter.match(new RegExp(`${key}:\\s*\\n((?:\\s+-\\s+.+\\n?)+)`, 'm'));
  if (multiLineMatch) {
    return multiLineMatch[1]
      .split('\n')
      .map(line => line.replace(/^\s*-\s*/, '').trim())
      .filter(s => s.length > 0);
  }

  return [];
}

/**
 * Parse .sum file content into structured data.
 */
function parseSumFile(content: string): SumFileContent | null {
  try {
    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!frontmatterMatch) return null;

    const frontmatter = frontmatterMatch[1];
    const summary = content.slice(frontmatterMatch[0].length).trim();

    // Parse frontmatter (simple YAML-like parsing)
    const generatedAt = frontmatter.match(/generated_at:\s*(.+)/)?.[1]?.trim() ?? '';
    const contentHash = frontmatter.match(/content_hash:\s*(.+)/)?.[1]?.trim() ?? '';

    // Parse purpose (single line value)
    const purpose = frontmatter.match(/purpose:\s*(.+)/)?.[1]?.trim() ?? '';

    const metadata: SummaryMetadata = {
      purpose,
    };

    // Parse optional fields
    const criticalTodos = parseYamlArray(frontmatter, 'critical_todos');
    if (criticalTodos.length > 0) {
      metadata.criticalTodos = criticalTodos;
    }

    const relatedFiles = parseYamlArray(frontmatter, 'related_files');
    if (relatedFiles.length > 0) {
      metadata.relatedFiles = relatedFiles;
    }

    return {
      summary,
      metadata,
      generatedAt,
      contentHash,
    };
  } catch {
    return null;
  }
}

/**
 * Format a YAML array for frontmatter.
 * Uses inline format for short arrays, multi-line for longer ones.
 */
function formatYamlArray(key: string, values: string[]): string {
  if (values.length === 0) {
    return `${key}: []`;
  }
  if (values.length <= 3 && values.every(v => v.length < 40)) {
    // Inline format for short arrays
    return `${key}: [${values.join(', ')}]`;
  }
  // Multi-line format for longer arrays
  return `${key}:\n${values.map(v => `  - ${v}`).join('\n')}`;
}

/**
 * Format .sum file content for writing.
 */
function formatSumFile(content: SumFileContent): string {
  const lines = [
    '---',
    `generated_at: ${content.generatedAt}`,
    `content_hash: ${content.contentHash}`,
    `purpose: ${content.metadata.purpose}`,
  ];

  // Add optional fields if present
  if (content.metadata.criticalTodos && content.metadata.criticalTodos.length > 0) {
    lines.push(formatYamlArray('critical_todos', content.metadata.criticalTodos));
  }
  if (content.metadata.relatedFiles && content.metadata.relatedFiles.length > 0) {
    lines.push(formatYamlArray('related_files', content.metadata.relatedFiles));
  }

  lines.push('---', '');

  return lines.join('\n') + content.summary;
}

/**
 * Write a .sum file alongside a source file.
 * Creates: foo.ts -> foo.ts.sum
 *
 * @param sourcePath - Path to the source file
 * @param content - Summary content to write
 * @returns Path to the written .sum file
 */
export async function writeSumFile(
  sourcePath: string,
  content: SumFileContent
): Promise<string> {
  const sumPath = `${sourcePath}.sum`;
  const dir = path.dirname(sumPath);

  // Ensure directory exists
  await mkdir(dir, { recursive: true });

  // Write file
  const formatted = formatSumFile(content);
  await writeFile(sumPath, formatted, 'utf-8');

  return sumPath;
}

/**
 * Get the .sum path for a source file.
 */
export function getSumPath(sourcePath: string): string {
  return `${sourcePath}.sum`;
}

/**
 * Check if a .sum file exists for a source file.
 */
export async function sumFileExists(sourcePath: string): Promise<boolean> {
  const sumPath = getSumPath(sourcePath);
  const content = await readSumFile(sumPath);
  return content !== null;
}

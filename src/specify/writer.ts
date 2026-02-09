import { writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import * as path from 'node:path';

/**
 * Options controlling spec output writing behavior.
 */
export interface WriteSpecOptions {
  /** Full path to the output file (e.g., /project/specs/SPEC.md). */
  outputPath: string;
  /** Overwrite existing files without error. */
  force: boolean;
  /** Split AI output into multiple files by top-level `# ` headings. */
  multiFile: boolean;
}

/**
 * Thrown when writeSpec() detects existing file(s) and force=false.
 * Callers should catch this and present a user-friendly message.
 */
export class SpecExistsError extends Error {
  /** Paths of the files that already exist. */
  readonly paths: string[];

  constructor(paths: string[]) {
    const list = paths.map((p) => `  - ${p}`).join('\n');
    super(`Spec file(s) already exist:\n${list}\nUse --force to overwrite.`);
    this.name = 'SpecExistsError';
    this.paths = paths;
  }
}

/**
 * Check whether a file exists at the given path.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize a heading string into a filename-safe slug.
 *
 * Lowercases, replaces whitespace with hyphens, strips non-alphanumeric
 * characters (except hyphens), collapses consecutive hyphens, and trims
 * leading/trailing hyphens.
 */
function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Split markdown content on top-level `# ` headings into named sections.
 *
 * Returns an array of `{ filename, content }` pairs. Any content before
 * the first `# ` heading is placed into `00-preamble.md`.
 */
function splitByHeadings(content: string): Array<{ filename: string; content: string }> {
  const sections: Array<{ filename: string; content: string }> = [];

  // Split on lines that start with exactly "# " (top-level heading)
  const parts = content.split(/^(?=# )/m);

  for (const part of parts) {
    const trimmed = part.trimEnd();
    if (!trimmed) continue;

    const headingMatch = trimmed.match(/^# (.+)/);
    if (headingMatch) {
      const slug = slugify(headingMatch[1]);
      const filename = slug ? `${slug}.md` : '00-preamble.md';
      sections.push({ filename, content: trimmed + '\n' });
    } else {
      // Content before the first heading
      sections.push({ filename: '00-preamble.md', content: trimmed + '\n' });
    }
  }

  return sections;
}

/**
 * Write spec output to disk with overwrite protection.
 *
 * In single-file mode, writes content directly to `outputPath`.
 * In multi-file mode, splits content on top-level `# ` headings and
 * writes each section to a separate file in the directory of `outputPath`.
 *
 * @param content - The full AI-generated spec markdown
 * @param options - Output path, force flag, and multi-file mode
 * @returns Array of absolute paths to all written files
 * @throws SpecExistsError if files exist and force=false
 */
export async function writeSpec(content: string, options: WriteSpecOptions): Promise<string[]> {
  const { outputPath, force, multiFile } = options;

  if (!multiFile) {
    // Single-file mode
    if (!force && await fileExists(outputPath)) {
      throw new SpecExistsError([outputPath]);
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf-8');
    return [outputPath];
  }

  // Multi-file mode: split on top-level headings
  const outputDir = path.dirname(outputPath);
  const sections = splitByHeadings(content);

  // Check all target files for existence before writing any
  if (!force) {
    const conflicts: string[] = [];
    for (const section of sections) {
      const filePath = path.join(outputDir, section.filename);
      if (await fileExists(filePath)) {
        conflicts.push(filePath);
      }
    }
    if (conflicts.length > 0) {
      throw new SpecExistsError(conflicts);
    }
  }

  // Create output directory and write all sections
  await mkdir(outputDir, { recursive: true });

  const writtenPaths: string[] = [];
  for (const section of sections) {
    const filePath = path.join(outputDir, section.filename);
    await writeFile(filePath, section.content, 'utf-8');
    writtenPaths.push(filePath);
  }

  return writtenPaths;
}

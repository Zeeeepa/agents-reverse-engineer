/**
 * Spec file reader and partitioner for the rebuild module.
 *
 * Reads spec files from `specs/` and partitions them into rebuild units
 * based on the Build Plan section or top-level headings.
 *
 * @module
 */

import * as path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import type { RebuildUnit } from './types.js';

/**
 * Read all `.md` spec files from the `specs/` directory.
 *
 * Files are returned sorted alphabetically by filename.
 * Throws a descriptive error if `specs/` doesn't exist or has no `.md` files.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Array of spec file objects with relative path and content
 */
export async function readSpecFiles(
  projectRoot: string,
): Promise<Array<{ relativePath: string; content: string }>> {
  const specsDir = path.join(projectRoot, 'specs');

  let entries: string[];
  try {
    entries = await readdir(specsDir);
  } catch {
    throw new Error(
      'No spec files found in specs/. Run "are specify" first.',
    );
  }

  const mdFiles = entries.filter((e) => e.endsWith('.md')).sort();

  if (mdFiles.length === 0) {
    throw new Error(
      'No spec files found in specs/. Run "are specify" first.',
    );
  }

  const results: Array<{ relativePath: string; content: string }> = [];
  for (const file of mdFiles) {
    const filePath = path.join(specsDir, file);
    const content = await readFile(filePath, 'utf-8');
    results.push({ relativePath: `specs/${file}`, content });
  }

  return results;
}

/**
 * Partition spec content into ordered rebuild units.
 *
 * Strategy:
 * 1. Concatenate all spec file contents
 * 2. Look for a "Build Plan" section with phase headings
 * 3. Each phase becomes a RebuildUnit with context from Architecture and Public API Surface
 * 4. Falls back to splitting on top-level `## ` headings if no Build Plan found
 *
 * Throws a descriptive error if no rebuild units can be extracted.
 * Logs a warning and skips units with empty content.
 *
 * @param specFiles - Spec files from readSpecFiles()
 * @returns Ordered array of rebuild units
 */
export function partitionSpec(
  specFiles: Array<{ relativePath: string; content: string }>,
): RebuildUnit[] {
  const fullContent = specFiles.map((f) => f.content).join('\n\n');

  // Try Build Plan strategy first
  let units = extractFromBuildPlan(fullContent);

  // Fall back to top-level headings
  if (units.length === 0) {
    units = extractFromTopLevelHeadings(fullContent);
  }

  // Validate: must have at least one unit
  if (units.length === 0) {
    throw new Error(
      'Could not extract rebuild units from spec files. Expected either a "## Build Plan" section with "### Phase N:" subsections, or top-level "## " headings. Check your spec file format.',
    );
  }

  // Filter out empty units with warning
  const validUnits: RebuildUnit[] = [];
  for (const unit of units) {
    if (!unit.specContent.trim()) {
      console.error(`[warn] Skipping empty spec section: "${unit.name}"`);
      continue;
    }
    validUnits.push(unit);
  }

  // Re-validate after filtering
  if (validUnits.length === 0) {
    throw new Error(
      'Could not extract rebuild units from spec files. Expected either a "## Build Plan" section with "### Phase N:" subsections, or top-level "## " headings. Check your spec file format.',
    );
  }

  return validUnits.sort((a, b) => a.order - b.order);
}

/**
 * Extract rebuild units from the Build Plan section.
 *
 * Looks for `## 9. Build Plan` or `## Build Plan`, then extracts
 * `### Phase N:` subsections. Each phase gets context from the
 * Architecture and Public API Surface sections.
 */
function extractFromBuildPlan(fullContent: string): RebuildUnit[] {
  // Find the Build Plan section
  const buildPlanMatch = fullContent.match(
    /^(## (?:\d+\.\s*)?Build Plan)\s*$/m,
  );
  if (!buildPlanMatch) return [];

  const buildPlanStart = buildPlanMatch.index!;

  // Find the end of the Build Plan section (next ## heading or end of content)
  const afterBuildPlan = fullContent.slice(
    buildPlanStart + buildPlanMatch[0].length,
  );
  const nextH2Match = afterBuildPlan.match(/^## /m);
  const buildPlanContent = nextH2Match
    ? afterBuildPlan.slice(0, nextH2Match.index)
    : afterBuildPlan;

  // Extract Architecture section for context (always included in full)
  const architectureContent = extractSection(fullContent, 'Architecture');

  // Extract Public API Surface section for targeted injection
  const apiContent = extractSection(fullContent, 'Public API Surface');
  const apiSubsections = apiContent ? extractSubsections(apiContent) : new Map<string, string>();

  // Extract Data Structures and Behavioral Contracts for targeted injection
  const dataStructuresContent = extractSection(fullContent, 'Data Structures');
  const dataSubsections = dataStructuresContent ? extractSubsections(dataStructuresContent) : new Map<string, string>();

  const behavioralContent = extractSection(fullContent, 'Behavioral Contracts');
  const behavioralSubsections = behavioralContent ? extractSubsections(behavioralContent) : new Map<string, string>();

  // Extract File Manifest for per-phase file list injection
  const manifestContent = extractSection(fullContent, 'File Manifest');

  // Check if any phase has Defines:/Consumes: lists (Change 2 format)
  const hasDefinesConsumes = buildPlanContent.match(/^\*\*Defines:\*\*|^Defines:/m) !== null;

  // Extract phase subsections (### Phase N: ...)
  const phasePattern = /^### Phase (\d+):\s*(.+)$/gm;
  const phases: Array<{ number: number; name: string; startIndex: number }> = [];

  let phaseMatch: RegExpExecArray | null;
  while ((phaseMatch = phasePattern.exec(buildPlanContent)) !== null) {
    phases.push({
      number: parseInt(phaseMatch[1], 10),
      name: phaseMatch[2].trim(),
      startIndex: phaseMatch.index,
    });
  }

  if (phases.length === 0) return [];

  // Extract content for each phase with targeted API injection
  const units: RebuildUnit[] = [];
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const contentStart = phase.startIndex;
    const contentEnd = i + 1 < phases.length
      ? phases[i + 1].startIndex
      : buildPlanContent.length;
    const phaseContent = buildPlanContent.slice(contentStart, contentEnd).trim();

    // Build context prefix per phase
    const contextParts: string[] = [];
    if (architectureContent) {
      contextParts.push(`## Architecture\n\n${architectureContent}`);
    }

    if (hasDefinesConsumes && apiSubsections.size > 0) {
      // Targeted injection: only relevant API subsections
      const relevantApi = findRelevantSubsections(phaseContent, apiSubsections);
      if (relevantApi) {
        contextParts.push(`## Interfaces for This Phase\n\n${relevantApi}`);
      }
      const relevantData = findRelevantSubsections(phaseContent, dataSubsections);
      if (relevantData) {
        contextParts.push(`## Data Structures for This Phase\n\n${relevantData}`);
      }
      const relevantBehavior = findRelevantSubsections(phaseContent, behavioralSubsections);
      if (relevantBehavior) {
        contextParts.push(`## Behavioral Contracts for This Phase\n\n${relevantBehavior}`);
      }
      if (manifestContent) {
        const phaseFileEntries = extractManifestEntriesForPhase(manifestContent, phaseContent);
        if (phaseFileEntries) {
          contextParts.push(`## Files to Generate in This Phase\n\n${phaseFileEntries}`);
        }
      }
    } else {
      // Graceful degradation: full API Surface for older specs without Defines:/Consumes:
      if (apiContent) {
        contextParts.push(`## Public API Surface\n\n${apiContent}`);
      }
    }

    const contextPrefix = contextParts.length > 0
      ? contextParts.join('\n\n') + '\n\n'
      : '';

    units.push({
      name: `Phase ${phase.number}: ${phase.name}`,
      specContent: contextPrefix + phaseContent,
      order: phase.number,
    });
  }

  return units;
}

/**
 * Fallback: extract rebuild units from top-level `## ` headings.
 *
 * Each `## ` section becomes a unit with order matching its position.
 */
function extractFromTopLevelHeadings(fullContent: string): RebuildUnit[] {
  const headingPattern = /^## (.+)$/gm;
  const headings: Array<{ name: string; startIndex: number }> = [];

  let headingMatch: RegExpExecArray | null;
  while ((headingMatch = headingPattern.exec(fullContent)) !== null) {
    headings.push({
      name: headingMatch[1].trim(),
      startIndex: headingMatch.index,
    });
  }

  if (headings.length === 0) return [];

  const units: RebuildUnit[] = [];
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const contentStart = heading.startIndex;
    const contentEnd = i + 1 < headings.length
      ? headings[i + 1].startIndex
      : fullContent.length;
    const sectionContent = fullContent.slice(contentStart, contentEnd).trim();

    units.push({
      name: heading.name,
      specContent: sectionContent,
      order: i + 1,
    });
  }

  return units;
}

/**
 * Parse a section's content into subsections keyed by `### ` headings.
 *
 * @param sectionContent - Content of a spec section (without the `## ` heading)
 * @returns Map from heading text to full subsection content (including the heading)
 */
function extractSubsections(sectionContent: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /^### (.+)$/gm;
  const headings: Array<{ key: string; startIndex: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sectionContent)) !== null) {
    headings.push({ key: match[1].trim(), startIndex: match.index });
  }

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const end = i + 1 < headings.length
      ? headings[i + 1].startIndex
      : sectionContent.length;
    result.set(heading.key, sectionContent.slice(heading.startIndex, end).trim());
  }

  return result;
}

/**
 * Find subsections relevant to a phase based on its content.
 *
 * Matches using:
 * 1. "Defines:" and "Consumes:" lists (exact symbol names)
 * 2. File paths and module names mentioned in the phase's task list
 *
 * @param phaseContent - Raw text of the phase section
 * @param subsections - Map of subsection heading → content
 * @returns Concatenated matching subsections, or null if none match
 */
function findRelevantSubsections(
  phaseContent: string,
  subsections: Map<string, string>,
): string | null {
  if (subsections.size === 0) return null;

  // Extract words from Defines: and Consumes: lines
  const definesMatch = phaseContent.match(/(?:\*\*Defines:\*\*|^Defines:)\s*(.+)/m);
  const consumesMatch = phaseContent.match(/(?:\*\*Consumes:\*\*|^Consumes:)\s*(.+)/m);

  const keywords: string[] = [];
  if (definesMatch) {
    // Split on commas and semicolons, extract identifiers
    keywords.push(...definesMatch[1].split(/[,;]/).map((s) => s.trim()).filter(Boolean));
  }
  if (consumesMatch) {
    keywords.push(...consumesMatch[1].split(/[,;]/).map((s) => s.trim()).filter(Boolean));
  }

  // Also extract file paths and module-like references from the phase text
  const pathRefs = phaseContent.match(/\b(?:src\/[\w\-./]+|[\w-]+\.(?:ts|js|py|rs|go))\b/g);
  if (pathRefs) {
    keywords.push(...pathRefs);
  }

  if (keywords.length === 0) {
    // No structured references found — return all subsections as fallback
    return [...subsections.values()].join('\n\n');
  }

  // Lowercase the keywords for case-insensitive matching
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  const matched: string[] = [];
  for (const [key, content] of subsections) {
    const lowerKey = key.toLowerCase();
    // Check if any keyword appears in the subsection heading
    const isRelevant = lowerKeywords.some((kw) =>
      lowerKey.includes(kw) || kw.includes(lowerKey) ||
      // Fuzzy: check individual words from the keyword against the key
      kw.split(/[\s/()]+/).some((word) => word.length > 3 && lowerKey.includes(word)),
    );
    if (isRelevant) {
      matched.push(content);
    }
  }

  return matched.length > 0 ? matched.join('\n\n') : null;
}

/**
 * Extract file manifest entries relevant to a specific phase.
 *
 * Matches manifest lines against the phase's "Defines:" list symbols.
 * Returns null if no "Defines:" list or no matching manifest lines found.
 *
 * @param manifestContent - Full File Manifest section content
 * @param phaseContent - Raw text of the phase section
 * @returns Matching manifest lines, or null if none match
 */
function extractManifestEntriesForPhase(
  manifestContent: string,
  phaseContent: string,
): string | null {
  // Extract "Defines:" list from phase
  const definesMatch = phaseContent.match(/(?:\*\*Defines:\*\*|^Defines:)\s*(.+)/m);
  if (!definesMatch) return null;

  const symbols = definesMatch[1].split(/[,;]/).map(s => s.trim()).filter(Boolean);
  if (symbols.length === 0) return null;

  // Find manifest lines that mention any defined symbol
  const lines = manifestContent.split('\n');
  const matches = lines.filter(line =>
    symbols.some(sym => line.includes(sym)),
  );

  return matches.length > 0 ? matches.join('\n') : null;
}

/**
 * Extract a named section's content from the full spec.
 *
 * Looks for `## N. Name` or `## Name` and returns content up to next `## `.
 */
function extractSection(
  fullContent: string,
  sectionName: string,
): string | null {
  const pattern = new RegExp(
    `^## (?:\\d+\\.\\s*)?${sectionName}\\s*$`,
    'm',
  );
  const match = fullContent.match(pattern);
  if (!match) return null;

  const sectionStart = match.index! + match[0].length;
  const afterSection = fullContent.slice(sectionStart);
  const nextH2 = afterSection.match(/^## /m);
  const content = nextH2
    ? afterSection.slice(0, nextH2.index)
    : afterSection;

  return content.trim() || null;
}

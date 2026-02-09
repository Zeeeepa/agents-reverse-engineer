/**
 * Prompt templates for AI-driven project reconstruction.
 *
 * Provides the system prompt that instructs the AI to generate source files
 * using `===FILE:===` / `===END_FILE===` delimiters, and a per-unit user
 * prompt builder that combines the full spec, current phase, and already-built
 * context.
 *
 * @module
 */

import type { RebuildUnit } from './types.js';

/**
 * System prompt for AI-driven project reconstruction.
 *
 * Instructs the model to emit source files using `===FILE: path===` /
 * `===END_FILE===` delimiters with production-quality code that follows
 * the spec's architecture and type definitions.
 */
export const REBUILD_SYSTEM_PROMPT = `You reconstruct source code from a project specification.

TASK:
Generate all source files for the described module/phase. The code must be complete, compilable, and production-ready.

OUTPUT FORMAT:
Use this exact delimiter format for EVERY file:

===FILE: relative/path.ext===
[file content]
===END_FILE===

Generate ONLY the file content between delimiters. No markdown fencing, no commentary, no explanations outside the file delimiters.

QUALITY:
- Code must compile. Use exact type names, function signatures, and constants from the spec.
- Follow the architecture and patterns described in the specification.
- Imports must reference real modules described in the spec.
- Generate production code only (no tests, no stubs, no placeholders).
- Do not invent features not in the spec.
- Do not add comments explaining what the spec says — write the code the spec describes.

CONTEXT AWARENESS:
When "Already Built" context is provided, import from those modules and use their exported types/functions. Do not redefine types that already exist in built modules.`;

/**
 * Build the system + user prompt pair for a single rebuild unit.
 *
 * The user prompt includes:
 * 1. Full specification for reference
 * 2. Current phase/module to build
 * 3. Already-built context (exported signatures from prior groups)
 * 4. Output format reminder
 *
 * @param unit - The rebuild unit to generate code for
 * @param fullSpec - Concatenated content of all spec files
 * @param builtContext - Exported type signatures from previously built modules
 * @returns Prompt pair with system and user strings
 */
export function buildRebuildPrompt(
  unit: RebuildUnit,
  fullSpec: string,
  builtContext: string | undefined,
): { system: string; user: string } {
  const sections: string[] = [
    'Reconstruct the following module from this specification.',
    '',
    '## Full Specification',
    '',
    fullSpec,
    '',
    '## Current Phase',
    '',
    'Build the module described in this phase:',
    '',
    unit.specContent,
  ];

  if (builtContext) {
    sections.push(
      '',
      '## Already Built',
      '',
      'The following modules have been built. Import from them as needed:',
      '',
      builtContext,
    );
  }

  sections.push(
    '',
    '## Output Format',
    '',
    'Emit each file using:',
    '===FILE: path/to/file.ext===',
    '[content]',
    '===END_FILE===',
    '',
    'Generate ALL files needed for this phase. Use relative paths from the project root.',
  );

  return {
    system: REBUILD_SYSTEM_PROMPT,
    user: sections.join('\n'),
  };
}

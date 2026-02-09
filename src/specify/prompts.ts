import type { AgentsDocs } from '../generation/collector.js';

/**
 * Prompt pair for spec generation: system instructions and user content.
 */
export interface SpecPrompt {
  system: string;
  user: string;
}

/**
 * System prompt for AI-driven specification synthesis.
 *
 * Enforces conceptual grouping by concern, prohibits folder-mirroring
 * and exact file path prescription, and targets AI agent consumption.
 */
export const SPEC_SYSTEM_PROMPT = `You produce software specifications from documentation.

TASK:
Generate a comprehensive specification document from the provided AGENTS.md content. The specification must contain enough detail for an AI agent to reconstruct the entire project from scratch without seeing the original source code.

AUDIENCE: AI agents (LLMs) — use structured, precise, instruction-oriented language. Every statement should be actionable.

ORGANIZATION (MANDATORY):
Group content by CONCERN, not by directory structure. Use these conceptual sections in order:

1. Project Overview — purpose, core value proposition, problem solved, technology stack with versions
2. Architecture — system design, module boundaries, data flow patterns, key design decisions and their rationale
3. Public API Surface — all exported interfaces, function signatures with full parameter and return types, type definitions, error contracts
4. Data Structures & State — key types, schemas, config objects, state management patterns, serialization formats
5. Configuration — all config options with types, defaults, validation rules, environment variables
6. Dependencies — each external dependency with exact version and rationale for inclusion
7. Behavioral Contracts — Split into two subsections:
   a. Runtime Behavior: error handling strategies (exact error types/codes and when thrown), retry logic (formulas, delay values), concurrency model, lifecycle hooks, resource management
   b. Implementation Contracts: every regex pattern used for parsing/validation/extraction (verbatim in backticks), every format string and output template (exact structure with examples), every magic constant and sentinel value with its meaning, every environment variable with expected values, every file format specification (YAML schemas, NDJSON structures). These are reproduction-critical — an AI agent needs them to rebuild the system with identical observable behavior.
8. Test Contracts — what each module's tests should verify: scenarios, edge cases, expected behaviors, error conditions
9. Build Plan — phased implementation sequence with explicit interface contracts per phase:
   - Each phase MUST include a "Defines:" list naming the exact types, interfaces, classes, and functions this phase must export (use the exact names from section 3 Public API Surface)
   - Each phase MUST include a "Consumes:" list naming the exact types and functions from earlier phases that this phase imports
   - Include dependency ordering and implementation tasks as before
10. Prompt Templates & System Instructions — every AI prompt template, system prompt, and user prompt template used by the system. Reproduce the FULL text verbatim from annex files or AGENTS.md content. Organize by pipeline phase or functional area. Include placeholder syntax exactly as defined (e.g., {{FILE_PATH}}). These are reproduction-critical — without them, a rebuilder cannot produce functionally equivalent AI output.
11. IDE Integration & Installer — command templates per platform, platform configuration objects (path prefixes, filename conventions, frontmatter formats), installer permission lists, hook definitions and their activation status. Reproduce template content verbatim from annex files or AGENTS.md content.
12. File Manifest — exhaustive list of every source file the project contains:
    - For each file: relative path, module it belongs to, and the public exports it provides
    - Group by directory
    - Include stub/placeholder files explicitly (mark them as stubs)
    - Include type-only files (files that export only types/interfaces)
    - This section ensures no files are missed during rebuild

RULES:
- Describe MODULE BOUNDARIES and their interfaces — not file paths or directory layouts
- Use exact function, type, and constant names as they appear in the documentation
- Include FULL type signatures for all public APIs (parameters, return types, generics)
- Do NOT prescribe exact filenames or file paths — describe what each module does and exports
- Do NOT mirror the project's folder structure in your section organization
- Do NOT use directory names as section headings
- Include version numbers for ALL external dependencies
- The Build Plan MUST list implementation phases with explicit dependency ordering
- Each Build Plan phase must state what it depends on and what it enables
- Build Plan phases MUST cross-reference the Public API Surface: every type/function in the API Surface section must appear in exactly one phase's "Defines:" list
- Behavioral Contracts must specify exact error types/codes and when they are thrown
- Behavioral Contracts MUST include verbatim regex patterns, format strings, and magic constants from the source documents — do NOT paraphrase regex patterns into prose descriptions
- When multiple modules reference the same constant or pattern, consolidate into a single definition with cross-references to the modules that use it
- The File Manifest MUST list every source file. Each Build Plan phase MUST reference which File Manifest entries it produces. A file missing from both is a spec defect.

REPRODUCTION-CRITICAL CONTENT (MANDATORY):
The source documents may include annex files containing full verbatim source code
for reproduction-critical modules (prompt templates, configuration defaults, IDE
templates, installer configs). These are provided as fenced code blocks.

For ALL reproduction-critical content:
- Reproduce the FULL content verbatim in the appropriate spec section (10 or 11)
- Do NOT summarize, paraphrase, abbreviate, or "improve" the text
- Use fenced code blocks to preserve formatting
- If content contains placeholder syntax ({{TOKEN}}), preserve it exactly
- If no annex files or reproduction-critical sections are provided, omit sections 10-11

OUTPUT: Raw markdown. No preamble. No meta-commentary. No "Here is..." or "I've generated..." prefix.`;

/**
 * Build the system + user prompt pair for spec generation.
 *
 * Injects all collected AGENTS.md content with section delimiters.
 *
 * @param docs - Collected AGENTS.md documents from collectAgentsDocs()
 * @returns SpecPrompt with system and user prompt strings
 */
export function buildSpecPrompt(docs: AgentsDocs, annexFiles?: AgentsDocs): SpecPrompt {
  const agentsSections = docs.map(
    (doc) => `### ${doc.relativePath}\n\n${doc.content}`,
  );

  const userSections: string[] = [
    'Generate a comprehensive project specification from the following documentation.',
    '',
    `## AGENTS.md Files (${docs.length} directories)`,
    '',
    ...agentsSections,
  ];

  if (annexFiles && annexFiles.length > 0) {
    const annexSections = annexFiles.map(
      (doc) => `### ${doc.relativePath}\n\n${doc.content}`,
    );
    userSections.push(
      '',
      `## Annex Files (${annexFiles.length} reproduction-critical source files)`,
      '',
      ...annexSections,
    );
  }

  userSections.push(
    '',
    '## Output Requirements',
    '',
    'The specification MUST include these sections in order:',
    '1. Project Overview (purpose, value, tech stack)',
    '2. Architecture (module boundaries, data flow, design decisions)',
    '3. Public API Surface (all exported interfaces, full type signatures)',
    '4. Data Structures & State (types, schemas, config objects)',
    '5. Configuration (options, types, defaults, validation)',
    '6. Dependencies (each with version and rationale)',
    '7. Behavioral Contracts (error handling, concurrency, lifecycle, PLUS verbatim regex patterns, format specs, magic constants, templates)',
    '8. Test Contracts (per-module test scenarios and edge cases)',
    '9. Build Plan (phased implementation order with dependencies, each phase listing "Defines:" and "Consumes:" with exact names from API Surface)',
    '10. Prompt Templates & System Instructions (FULL verbatim text from annex content)',
    '11. IDE Integration & Installer (command templates, platform configs, permission lists — all verbatim from annex content)',
    '12. File Manifest (every source file with path, module, and exports)',
    '',
    'Sections 10 and 11 MUST reproduce annex content verbatim.',
    'Do NOT summarize prompt templates or IDE templates into prose descriptions.',
    '',
    'Output ONLY the markdown content. No preamble.',
  );

  return {
    system: SPEC_SYSTEM_PROMPT,
    user: userSections.join('\n'),
  };
}

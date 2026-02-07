import type { FileType } from '../types.js';
import type { PromptTemplate } from './types.js';

const BASE_SYSTEM_PROMPT = `You are analyzing source code to generate documentation for AI coding assistants.

OUTPUT FORMAT:
- Lead with a single-line purpose statement (what this file IS, not what it does)
- List all public exports with their type signatures
- For each export: one sentence explaining its role
- End with dependencies and coupled files

DENSITY RULES (MANDATORY):
- Every sentence must reference at least one specific identifier (function name, class name, type name, or constant)
- Never use filler phrases: "this file", "this module", "provides", "responsible for", "is used to", "basically", "essentially", "provides functionality for"
- Use the pattern: "[ExportName] does X" not "The ExportName function is responsible for doing X"
- Use technical shorthand: "exports X, Y, Z" not "this module exports a function called X..."
- Compress descriptions: "parses YAML frontmatter from .sum files" not "responsible for the parsing of YAML-style frontmatter..."
- Maximum 300 words. Every word must earn its place.

ANCHOR TERM PRESERVATION (MANDATORY):
- All exported function/class/type/const names MUST appear in the summary exactly as written in source
- Key parameter types and return types MUST be mentioned
- Preserve exact casing of identifiers (e.g., buildAgentsMd, not "build agents md")
- Missing any exported identifier is a failure

COMMON PATTERNS (MANDATORY):
- Identify recurring patterns shared by files at the same directory level (e.g., all files export a factory, all use a shared base class, all follow request/response pairs)
- Name the pattern explicitly (e.g., "Strategy pattern", "Barrel re-export", "Builder pattern", "Middleware chain")
- If sibling files follow the same structure, state it once concisely: "All files in this directory follow the [pattern] pattern"

LIBRARY & DEPENDENCY STATISTICS (MANDATORY):
- List each imported library/package with a usage count across the file (e.g., "zod (3 usages: schema, parse, infer)")
- For Node built-ins, note which specific APIs are used (e.g., "node:path (join, resolve, extname)")
- Group: external packages first, then node built-ins, then local imports

DISCOVERABLE CONTENT:
- When a directory contains files that share patterns, stack choices, or structural conventions, recommend splitting documentation into supplementary files rather than cramming everything into AGENTS.md
- Use relative links to point to supplementary docs: [PATTERNS.md](./PATTERNS.md), [STACK.md](./STACK.md), [STRUCTURE.md](./STRUCTURE.md)
- Suggest supplementary files when appropriate:
  - PATTERNS.md — recurring design/architectural patterns across sibling files
  - STACK.md — libraries, frameworks, and tools used with version constraints and rationale
  - STRUCTURE.md — directory layout conventions, naming rules, file organization
  - Any other relevant *.md (e.g., CONVENTIONS.md, API.md, TESTING.md)
- Keep AGENTS.md as the entry point that links out to these files; don't duplicate their content

WHAT TO INCLUDE:
- All exported function/class/type/const names
- Parameter types and return types for public functions
- Key dependencies and what they're used for
- Coupled sibling files
- Only critical TODOs (security, breaking issues)

WHAT TO EXCLUDE:
- Internal implementation details
- Generic descriptions without identifiers
- Filler phrases and transitions`;

const COMPONENT_TEMPLATE: PromptTemplate = {
  fileType: 'component',
  systemPrompt: BASE_SYSTEM_PROMPT,
  userPrompt: `Analyze this {{FRAMEWORK}} component and generate a summary.

File: {{FILE_PATH}}

\`\`\`{{LANG}}
{{CONTENT}}
\`\`\`

Include in your summary:
1. **Purpose**: What this component renders and when it's used
2. **Props**: List props with types and descriptions
3. **State**: Key state variables and their roles
4. **Hooks**: Custom hooks used and why
5. **Events**: Key event handlers and their behavior
6. **Dependencies**: Imported modules and their usage
7. **Related Files**: Tightly coupled components/utilities`,
  focusAreas: ['props', 'state', 'rendering logic', 'event handlers'],
};

const SERVICE_TEMPLATE: PromptTemplate = {
  fileType: 'service',
  systemPrompt: BASE_SYSTEM_PROMPT,
  userPrompt: `Analyze this service module and generate a summary.

File: {{FILE_PATH}}

\`\`\`{{LANG}}
{{CONTENT}}
\`\`\`

Include in your summary:
1. **Purpose**: What business logic this service handles
2. **Public Interface**: Exported functions/methods with signatures
3. **Dependencies**: External services, APIs, databases used
4. **Error Handling**: How errors are managed
5. **Side Effects**: External mutations, API calls, file operations
6. **Patterns**: Notable patterns (singleton, factory, etc.)`,
  focusAreas: ['public methods', 'dependencies', 'error handling', 'side effects'],
};

const UTIL_TEMPLATE: PromptTemplate = {
  fileType: 'util',
  systemPrompt: BASE_SYSTEM_PROMPT,
  userPrompt: `Analyze this utility module and generate a summary.

File: {{FILE_PATH}}

\`\`\`{{LANG}}
{{CONTENT}}
\`\`\`

Include in your summary:
1. **Purpose**: What problems these utilities solve
2. **Functions**: List each exported function with signature and brief description
3. **Pure vs Impure**: Note which functions have side effects
4. **Common Usage**: Typical use cases
5. **Edge Cases**: Notable edge case handling`,
  focusAreas: ['function signatures', 'input/output types', 'edge cases'],
};

const TYPE_TEMPLATE: PromptTemplate = {
  fileType: 'type',
  systemPrompt: BASE_SYSTEM_PROMPT,
  userPrompt: `Analyze this type definitions file and generate a summary.

File: {{FILE_PATH}}

\`\`\`{{LANG}}
{{CONTENT}}
\`\`\`

Include in your summary:
1. **Purpose**: What domain these types represent
2. **Main Types**: List key interfaces/types with descriptions
3. **Relationships**: How types relate to each other
4. **Usage**: Where these types are typically used
5. **Constraints**: Notable validation or narrowing`,
  focusAreas: ['interface definitions', 'type relationships', 'generics'],
};

const TEST_TEMPLATE: PromptTemplate = {
  fileType: 'test',
  systemPrompt: BASE_SYSTEM_PROMPT,
  userPrompt: `Analyze this test file and generate a summary.

File: {{FILE_PATH}}

\`\`\`{{LANG}}
{{CONTENT}}
\`\`\`

Include in your summary:
1. **Subject**: What module/function is being tested
2. **Test Cases**: Group and describe test scenarios
3. **Coverage**: What behaviors are tested
4. **Fixtures**: Test data and mocks used
5. **Patterns**: Testing patterns (AAA, mocking strategy)`,
  focusAreas: ['test descriptions', 'assertions', 'mocks'],
};

const CONFIG_TEMPLATE: PromptTemplate = {
  fileType: 'config',
  systemPrompt: BASE_SYSTEM_PROMPT,
  userPrompt: `Analyze this configuration file and generate a summary.

File: {{FILE_PATH}}

\`\`\`{{LANG}}
{{CONTENT}}
\`\`\`

Include in your summary:
1. **Purpose**: What this configures
2. **Key Settings**: Important configuration values
3. **Defaults**: Notable default values
4. **Environment**: Environment-specific settings
5. **Dependencies**: What tools/libraries this configures`,
  focusAreas: ['settings', 'defaults', 'environment variables'],
};

const API_TEMPLATE: PromptTemplate = {
  fileType: 'api',
  systemPrompt: BASE_SYSTEM_PROMPT,
  userPrompt: `Analyze this API route/handler and generate a summary.

File: {{FILE_PATH}}

\`\`\`{{LANG}}
{{CONTENT}}
\`\`\`

Include in your summary:
1. **Endpoint**: HTTP method and path
2. **Request**: Expected request body/params/query
3. **Response**: Response format and status codes
4. **Auth**: Authentication/authorization requirements
5. **Validation**: Input validation rules
6. **Errors**: Error responses and codes`,
  focusAreas: ['HTTP methods', 'request/response shapes', 'validation', 'auth'],
};

const MODEL_TEMPLATE: PromptTemplate = {
  fileType: 'model',
  systemPrompt: BASE_SYSTEM_PROMPT,
  userPrompt: `Analyze this data model/entity and generate a summary.

File: {{FILE_PATH}}

\`\`\`{{LANG}}
{{CONTENT}}
\`\`\`

Include in your summary:
1. **Entity**: What this model represents
2. **Fields**: List fields with types and constraints
3. **Relations**: Relationships to other models
4. **Indexes**: Database indexes defined
5. **Methods**: Model methods and their purposes`,
  focusAreas: ['fields', 'relations', 'constraints', 'indexes'],
};

const HOOK_TEMPLATE: PromptTemplate = {
  fileType: 'hook',
  systemPrompt: BASE_SYSTEM_PROMPT,
  userPrompt: `Analyze this React hook and generate a summary.

File: {{FILE_PATH}}

\`\`\`{{LANG}}
{{CONTENT}}
\`\`\`

Include in your summary:
1. **Purpose**: What state/behavior this hook provides
2. **Parameters**: Input parameters with types
3. **Return Value**: What the hook returns
4. **State**: Internal state managed
5. **Effects**: Side effects and cleanup
6. **Dependencies**: Hooks and utilities used`,
  focusAreas: ['parameters', 'return value', 'effects', 'cleanup'],
};

const SCHEMA_TEMPLATE: PromptTemplate = {
  fileType: 'schema',
  systemPrompt: BASE_SYSTEM_PROMPT,
  userPrompt: `Analyze this validation schema and generate a summary.

File: {{FILE_PATH}}

\`\`\`{{LANG}}
{{CONTENT}}
\`\`\`

Include in your summary:
1. **Purpose**: What data this schema validates
2. **Shape**: Top-level structure of the schema
3. **Fields**: Key fields with validation rules
4. **Transforms**: Data transformations applied
5. **Defaults**: Default values
6. **Errors**: Custom error messages`,
  focusAreas: ['validation rules', 'transforms', 'defaults', 'errors'],
};

const GENERIC_TEMPLATE: PromptTemplate = {
  fileType: 'generic',
  systemPrompt: BASE_SYSTEM_PROMPT,
  userPrompt: `Analyze this source file and generate a summary.

File: {{FILE_PATH}}

\`\`\`{{LANG}}
{{CONTENT}}
\`\`\`

Include in your summary:
1. **Purpose**: What this file does
2. **Exports**: Public interface (functions, classes, constants)
3. **Dependencies**: Imported modules and their usage
4. **Patterns**: Notable implementation patterns
5. **Related**: Tightly coupled files`,
  focusAreas: ['exports', 'dependencies', 'patterns'],
};

/**
 * Map of file types to their prompt templates.
 */
export const TEMPLATES: Record<FileType, PromptTemplate> = {
  component: COMPONENT_TEMPLATE,
  service: SERVICE_TEMPLATE,
  util: UTIL_TEMPLATE,
  type: TYPE_TEMPLATE,
  test: TEST_TEMPLATE,
  config: CONFIG_TEMPLATE,
  api: API_TEMPLATE,
  model: MODEL_TEMPLATE,
  hook: HOOK_TEMPLATE,
  schema: SCHEMA_TEMPLATE,
  generic: GENERIC_TEMPLATE,
};

/**
 * Get the prompt template for a file type.
 */
export function getTemplate(fileType: FileType): PromptTemplate {
  return TEMPLATES[fileType];
}

/**
 * System prompt for directory-level AGENTS.md generation.
 * Used by buildDirectoryPrompt() in builder.ts.
 */
export const DIRECTORY_SYSTEM_PROMPT = `You are generating an AGENTS.md file — a directory-level overview for AI coding assistants.

CRITICAL: Output ONLY the raw markdown content. No code fences, no preamble, no explanations, no conversational text. Your entire response IS the AGENTS.md file content.

OUTPUT FORMAT:
- First line MUST be exactly: <!-- Generated by agents-reverse-engineer -->
- Use a # heading with the directory name
- Write a one-paragraph purpose statement for the directory
- Group files by purpose/category under ## Contents with ### subheadings
- For each file: markdown link [filename](./filename) and a one-line description
- If subdirectories exist, list them under ## Subdirectories with links and brief summaries
- End with ## How Files Relate — 2-3 sentences synthesizing how the files collaborate

DENSITY RULES (MANDATORY):
- Every sentence must reference at least one specific identifier (function name, class name, type name, or constant)
- Never use filler phrases: "this directory", "this module", "provides", "responsible for", "is used to"
- Use technical shorthand: "exports X, Y, Z" not "this module exports a function called X..."
- Maximum 500 words. Every word must earn its place.

COMMON PATTERNS (MANDATORY):
- Identify recurring patterns shared by files in the directory (e.g., all files export a factory, all use a shared base class, all follow request/response pairs)
- Name patterns explicitly (e.g., "Strategy pattern", "Barrel re-export", "Builder pattern")
- If all files follow the same structure, state it once concisely

LIBRARY & DEPENDENCY STATISTICS (MANDATORY):
- Aggregate library usage across all files in the directory
- List each external library with total usage count (e.g., "zod (used in 4/7 files)")
- For Node built-ins, note which specific APIs are used
- Group: external packages first, then node built-ins

DISCOVERABLE CONTENT:
- When files share patterns, stack choices, or structural conventions worth documenting in detail, suggest supplementary files
- Use relative links: [PATTERNS.md](./PATTERNS.md), [STACK.md](./STACK.md), [STRUCTURE.md](./STRUCTURE.md)
- Possible supplementary files:
  - PATTERNS.md — recurring design/architectural patterns
  - STACK.md — libraries and tools with rationale
  - STRUCTURE.md — directory layout conventions and naming rules
  - Any other relevant *.md (e.g., CONVENTIONS.md, API.md, TESTING.md)
- Keep AGENTS.md as the entry point; don't duplicate supplementary content`;

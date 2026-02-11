import * as path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import type { PromptContext } from './types.js';
import { FILE_SYSTEM_PROMPT, FILE_USER_PROMPT, FILE_UPDATE_SYSTEM_PROMPT, DIRECTORY_SYSTEM_PROMPT, DIRECTORY_UPDATE_SYSTEM_PROMPT } from './templates.js';
import { readSumFile, getSumPath } from '../writers/sum.js';
import { GENERATED_MARKER_PREFIX } from '../writers/agents-md.js';
import { extractDirectoryImports, formatImportMap } from '../../imports/index.js';
import type { Logger } from '../../core/logger.js';
import { nullLogger } from '../../core/logger.js';

function logTemplate(logger: Logger, action: string, filePath: string, extra?: string): void {
  const rel = path.relative(process.cwd(), filePath);
  const msg = `[prompt] ${action} → ${rel}`;
  logger.debug(extra ? `${msg} ${extra}` : msg);
}

/**
 * Detect language from file extension for syntax highlighting.
 */
export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.kt': 'kotlin',
    '.swift': 'swift',
    '.cs': 'csharp',
    '.php': 'php',
    '.vue': 'vue',
    '.svelte': 'svelte',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
  };
  return langMap[ext] ?? 'text';
}

/**
 * Build a complete prompt for file analysis.
 */
export function buildFilePrompt(context: PromptContext, debug = false, logger?: Logger): {
  system: string;
  user: string;
} {
  const lang = detectLanguage(context.filePath);
  if (debug) logTemplate(logger ?? nullLogger, 'buildFilePrompt', context.filePath, `lang=${lang}`);

  const planSection = context.projectPlan
    ? `\n\n## Project Structure\n\nFull project file listing for context:\n\n<project-structure>\n${context.projectPlan}\n</project-structure>`
    : '';

  let userPrompt = FILE_USER_PROMPT
    .replace(/\{\{FILE_PATH\}\}/g, context.filePath)
    .replace(/\{\{CONTENT\}\}/g, context.content)
    .replace(/\{\{LANG\}\}/g, lang)
    .replace(/\{\{PROJECT_PLAN_SECTION\}\}/g, planSection);

  // Add context files if provided
  if (context.contextFiles && context.contextFiles.length > 0) {
    const contextSection = context.contextFiles
      .map(
        (f) =>
          `\n### ${f.path}\n\`\`\`${detectLanguage(f.path)}\n${f.content}\n\`\`\``
      )
      .join('\n');
    userPrompt += `\n\n## Related Files\n${contextSection}`;
  }

  // Build system prompt with optional compression instructions
  const ratio = context.compressionRatio ?? 0.25;
  const sourceSize = context.sourceFileSize ?? 0;
  let systemPrompt = context.existingSum ? FILE_UPDATE_SYSTEM_PROMPT : FILE_SYSTEM_PROMPT;

  // Add aggressive compression instructions when ratio < 0.5
  if (ratio < 0.5 && sourceSize > 0) {
    const targetSize = Math.round(sourceSize * ratio);
    const maxSize = Math.round(targetSize * 1.2);
    const compressionPercentage = Math.round(ratio * 100);

    const aggressiveRules = `
TARGET LENGTH (MANDATORY):
- Source file: ${sourceSize} characters
- Target summary: ~${targetSize} characters (${compressionPercentage}% compression)
- Maximum: ${maxSize} characters
- Achieve this by: ultra-dense writing, minimal examples, single-sentence descriptions

ULTRA-COMPRESSION TECHNIQUES:
- Use telegraphic style: "exports foo, bar, baz" not "this file exports three functions"
- No code examples unless critical to understanding
- One sentence per export maximum
- Omit obvious parameter names ("opts: Options" not "options: Options - configuration object")
- Use abbreviations: "params" not "parameters", "config" not "configuration"
- Skip section if empty (don't write "No special concerns" or "N/A")

`;
    // Insert compression rules before DENSITY RULES section
    systemPrompt = systemPrompt.replace(
      'DENSITY RULES (MANDATORY):',
      aggressiveRules + 'DENSITY RULES (MANDATORY):'
    );

    if (debug) {
      (logger ?? nullLogger).debug(`[prompt] Aggressive compression: ${sourceSize} → ${targetSize} chars (${compressionPercentage}%)`);
    }
  }

  // For incremental updates: include existing summary
  if (context.existingSum) {
    userPrompt += `\n\n## Existing Summary (update this — preserve stable content, modify only what changed)\n\n${context.existingSum}`;
    return {
      system: systemPrompt,
      user: userPrompt,
    };
  }

  return {
    system: systemPrompt,
    user: userPrompt,
  };
}

/**
 * Build a prompt for generating a directory-level AGENTS.md.
 *
 * Reads all .sum files in the directory, child AGENTS.md files,
 * and AGENTS.local.md to provide full context to the LLM.
 */
export async function buildDirectoryPrompt(
  dirPath: string,
  projectRoot: string,
  debug = false,
  knownDirs?: Set<string>,
  projectStructure?: string,
  existingAgentsMd?: string,
  logger?: Logger,
): Promise<{ system: string; user: string }> {
  const relativePath = path.relative(projectRoot, dirPath) || '.';
  const dirName = path.basename(dirPath) || 'root';

  // Collect .sum file summaries and subdirectory sections in parallel
  const entries = await readdir(dirPath, { withFileTypes: true });

  const fileEntries = entries.filter(
    (e) => e.isFile() && !e.name.endsWith('.sum') && !e.name.startsWith('.'),
  );
  const dirEntries = entries.filter((e) => {
    if (!e.isDirectory()) return false;
    if (!knownDirs) return true;
    const relDir = path.relative(projectRoot, path.join(dirPath, e.name));
    return knownDirs.has(relDir);
  });

  // Read all .sum files in parallel
  const fileResults = await Promise.all(
    fileEntries.map(async (entry) => {
      const entryPath = path.join(dirPath, entry.name);
      const sumPath = getSumPath(entryPath);
      const sumContent = await readSumFile(sumPath);
      if (sumContent) {
        return `### ${entry.name}\n**Purpose:** ${sumContent.metadata.purpose}\n\n${sumContent.summary}`;
      }
      return null;
    }),
  );
  const fileSummaries = fileResults.filter((r): r is string => r !== null);

  // Read all child AGENTS.md in parallel
  const subdirResults = await Promise.all(
    dirEntries.map(async (entry) => {
      const childAgentsPath = path.join(dirPath, entry.name, 'AGENTS.md');
      try {
        const childContent = await readFile(childAgentsPath, 'utf-8');
        return `### ${entry.name}/\n${childContent}`;
      } catch {
        if (debug) {
          (logger ?? nullLogger).debug(`[prompt] Skipping missing ${childAgentsPath}`);
        }
        return null;
      }
    }),
  );
  const subdirSections = subdirResults.filter((r): r is string => r !== null);

  // Check for user-defined documentation: AGENTS.local.md or non-ARE AGENTS.md
  let localSection = '';
  try {
    const localContent = await readFile(path.join(dirPath, 'AGENTS.local.md'), 'utf-8');
    localSection = `\n## User Notes (AGENTS.local.md)\n\n${localContent}\n\nNote: Reference [AGENTS.local.md](./AGENTS.local.md) for additional documentation.`;
  } catch {
    // No AGENTS.local.md — check if current AGENTS.md is user-authored (first run)
    try {
      const agentsContent = await readFile(path.join(dirPath, 'AGENTS.md'), 'utf-8');
      if (!agentsContent.includes(GENERATED_MARKER_PREFIX)) {
        localSection = `\n## User Notes (existing AGENTS.md)\n\n${agentsContent}\n\nNote: This user-defined content will be preserved as [AGENTS.local.md](./AGENTS.local.md).`;
      }
    } catch {
      // No AGENTS.md either
    }
  }

  // Detect manifest files to hint at package root
  const manifestNames = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'pom.xml', 'build.gradle', 'Gemfile', 'composer.json', 'CMakeLists.txt', 'Makefile'];
  const foundManifests = fileEntries
    .filter((e) => manifestNames.includes(e.name))
    .map((e) => e.name);

  // Extract actual import statements for cross-reference accuracy
  const sourceExtensions = /\.(ts|tsx|js|jsx|py|go|rs|java|kt)$/;
  const sourceFileNames = fileEntries
    .filter((e) => sourceExtensions.test(e.name))
    .map((e) => e.name);

  const fileImports = await extractDirectoryImports(dirPath, sourceFileNames);
  const importMapText = formatImportMap(fileImports);

  if (debug) logTemplate(logger ?? nullLogger, 'buildDirectoryPrompt', dirPath, `files=${fileSummaries.length} subdirs=${subdirSections.length} imports=${fileImports.length}`);

  const userSections: string[] = [
    `Generate AGENTS.md for directory: "${relativePath}" (${dirName})`,
    '',
    `## File Summaries (${fileSummaries.length} files)`,
    '',
    ...fileSummaries,
  ];

  if (importMapText) {
    userSections.push(
      '',
      '## Import Map (verified — use these exact paths)',
      '',
      importMapText,
    );
  }

  if (projectStructure) {
    userSections.push(
      '',
      '## Project Directory Structure',
      '',
      '<project-structure>',
      projectStructure,
      '</project-structure>',
    );
  }

  // Scan for annex files in the directory
  const annexFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.annex.sum'))
    .map((e) => e.name);
  if (annexFiles.length > 0) {
    userSections.push(
      '',
      '## Annex Files (reproduction-critical constants)',
      '',
      ...annexFiles.map((f) => `- ${f}`),
    );
  }

  if (subdirSections.length > 0) {
    userSections.push('', '## Subdirectories', '', ...subdirSections);
  }

  if (foundManifests.length > 0) {
    userSections.push('', '## Directory Hints', '', `Contains manifest file(s): ${foundManifests.join(', ')} — likely a package or project root.`);
  }

  if (localSection) {
    userSections.push(localSection);
  }

  // For incremental updates: include existing AGENTS.md and use update-specific system prompt
  if (existingAgentsMd) {
    userSections.push(
      '',
      '## Existing AGENTS.md (update this — preserve stable content, modify only what changed)',
      '',
      existingAgentsMd,
    );
    return {
      system: DIRECTORY_UPDATE_SYSTEM_PROMPT,
      user: userSections.join('\n'),
    };
  }

  return {
    system: DIRECTORY_SYSTEM_PROMPT,
    user: userSections.join('\n'),
  };
}


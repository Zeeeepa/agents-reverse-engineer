import * as path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import pc from 'picocolors';
import type { PromptContext } from './types.js';
import { FILE_SYSTEM_PROMPT, FILE_USER_PROMPT, DIRECTORY_SYSTEM_PROMPT, ROOT_SYSTEM_PROMPT } from './templates.js';
import { readSumFile, getSumPath } from '../writers/sum.js';
import { GENERATED_MARKER } from '../writers/agents-md.js';
import { extractDirectoryImports, formatImportMap } from '../../imports/index.js';

function logTemplate(debug: boolean, action: string, filePath: string, extra?: string): void {
  if (!debug) return;
  const rel = path.relative(process.cwd(), filePath);
  const msg = `${pc.dim('[prompt]')} ${pc.cyan(action)} ${pc.dim('→')} ${rel}`;
  console.error(extra ? `${msg} ${pc.dim(extra)}` : msg);
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
export function buildFilePrompt(context: PromptContext, debug = false): {
  system: string;
  user: string;
} {
  const lang = detectLanguage(context.filePath);
  logTemplate(debug, 'buildFilePrompt', context.filePath, `lang=${lang}`);

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

  return {
    system: FILE_SYSTEM_PROMPT,
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
          console.error(pc.dim(`[prompt] Skipping missing ${childAgentsPath}`));
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
      if (!agentsContent.includes(GENERATED_MARKER)) {
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

  logTemplate(debug, 'buildDirectoryPrompt', dirPath, `files=${fileSummaries.length} subdirs=${subdirSections.length} imports=${fileImports.length}`);

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

  if (subdirSections.length > 0) {
    userSections.push('', '## Subdirectories', '', ...subdirSections);
  }

  if (foundManifests.length > 0) {
    userSections.push('', '## Directory Hints', '', `Contains manifest file(s): ${foundManifests.join(', ')} — likely a package or project root.`);
  }

  if (localSection) {
    userSections.push(localSection);
  }

  return {
    system: DIRECTORY_SYSTEM_PROMPT,
    user: userSections.join('\n'),
  };
}

/**
 * Recursively collect all AGENTS.md file paths under a directory,
 * skipping vendor/meta directories.
 */
async function collectAgentsMdFiles(dir: string): Promise<string[]> {
  const SKIP_DIRS = new Set([
    'node_modules', '.git', '.agents-reverse-engineer',
    'vendor', 'dist', 'build', '__pycache__', '.next',
    'venv', '.venv', 'target', '.cargo', '.gradle',
  ]);
  const results: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return; // Permission denied or inaccessible
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        await walk(path.join(currentDir, entry.name));
      } else if (entry.name === 'AGENTS.md') {
        results.push(path.join(currentDir, entry.name));
      }
    }
  }

  await walk(dir);
  results.sort();
  return results;
}

/**
 * Build a prompt for generating the root CLAUDE.md document.
 *
 * Collects all generated AGENTS.md files and optional package.json,
 * embedding them directly in the prompt so the LLM does not need
 * tool access to read files.
 */
export async function buildRootPrompt(
  projectRoot: string,
  debug = false,
): Promise<{ system: string; user: string }> {
  // 1. Collect all AGENTS.md files
  const agentsFiles = await collectAgentsMdFiles(projectRoot);

  // 2. Read each and build context sections
  const agentsSections: string[] = [];
  for (const filePath of agentsFiles) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const relativePath = path.relative(projectRoot, filePath);
      agentsSections.push(`### ${relativePath}\n\n${content}`);
    } catch {
      if (debug) {
        console.error(pc.dim(`[prompt] Skipping unreadable ${filePath}`));
      }
    }
  }

  // 3. Read root package.json for project metadata
  let packageSection = '';
  try {
    const pkgRaw = await readFile(path.join(projectRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    const parts: string[] = [];
    if (pkg.name) parts.push(`- **Name**: ${pkg.name}`);
    if (pkg.version) parts.push(`- **Version**: ${pkg.version}`);
    if (pkg.description) parts.push(`- **Description**: ${pkg.description}`);
    if (pkg.packageManager) parts.push(`- **Package Manager**: ${pkg.packageManager}`);
    if (pkg.scripts && typeof pkg.scripts === 'object') {
      const scripts = Object.entries(pkg.scripts as Record<string, string>)
        .map(([k, v]) => `  - \`${k}\`: \`${v}\``)
        .join('\n');
      parts.push(`- **Scripts**:\n${scripts}`);
    }
    if (parts.length > 0) {
      packageSection = `\n## Package Metadata (package.json)\n\n${parts.join('\n')}`;
    }
  } catch {
    // No package.json or parse error
  }

  logTemplate(debug, 'buildRootPrompt', projectRoot, `agents=${agentsSections.length}`);

  const userSections: string[] = [
    'Generate CLAUDE.md for the project root.',
    '',
    'Synthesize the following AGENTS.md files into a single comprehensive project overview document.',
    'Use ONLY the information provided below. Do NOT invent features, hooks, patterns, or APIs that are not explicitly mentioned in the AGENTS.md content.',
    '',
    `## AGENTS.md Files (${agentsSections.length} directories)`,
    '',
    ...agentsSections,
  ];

  if (packageSection) {
    userSections.push(packageSection);
  }

  userSections.push(
    '',
    '## Output Requirements',
    '',
    'The document MUST include:',
    '- Project purpose and description',
    '- Architecture overview with directory structure',
    '- Key directories table',
    '- Getting started (install, build, run commands)',
    '- Key technologies and dependencies',
    '',
    'This document is the COMPREHENSIVE reference for the entire project.',
    'It should contain architecture, configuration, build instructions, and project-wide patterns.',
    'Individual file details belong in directory-level AGENTS.md files — reference them, don\'t duplicate them.',
    '',
    'Output ONLY the markdown content. No preamble.',
  );

  return {
    system: ROOT_SYSTEM_PROMPT,
    user: userSections.join('\n'),
  };
}

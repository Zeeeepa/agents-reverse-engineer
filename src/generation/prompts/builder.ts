import * as path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import pc from 'picocolors';
import type { PromptContext } from './types.js';
import { getTemplate, DIRECTORY_SYSTEM_PROMPT } from './templates.js';
import { readSumFile, getSumPath } from '../writers/sum.js';

const DEBUG = process.env.DEBUG_PROMPTS === '1' || process.env.DEBUG === '1';

function logTemplate(action: string, filePath: string, fileType: string, extra?: string): void {
  if (!DEBUG) return;
  const rel = path.relative(process.cwd(), filePath);
  const msg = `${pc.dim('[prompt]')} ${pc.cyan(action)} ${pc.bold(fileType)} ${pc.dim('→')} ${rel}`;
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
 * Detect framework from file content for component templates.
 */
export function detectFramework(content: string): string {
  if (content.includes("from 'react'") || content.includes('from "react"')) {
    return 'React';
  }
  if (content.includes("from 'vue'") || content.includes('from "vue"')) {
    return 'Vue';
  }
  if (content.includes("from 'svelte'") || content.includes('.svelte')) {
    return 'Svelte';
  }
  if (content.includes('@angular')) {
    return 'Angular';
  }
  return 'JavaScript';
}

/**
 * Build a complete prompt for file analysis.
 */
export function buildFilePrompt(context: PromptContext): {
  system: string;
  user: string;
} {
  const template = getTemplate(context.fileType);
  const lang = detectLanguage(context.filePath);
  const framework = detectFramework(context.content);
  logTemplate('buildFilePrompt', context.filePath, context.fileType, `lang=${lang} framework=${framework}`);

  let userPrompt = template.userPrompt
    .replace(/\{\{FILE_PATH\}\}/g, context.filePath)
    .replace(/\{\{CONTENT\}\}/g, context.content)
    .replace(/\{\{LANG\}\}/g, lang)
    .replace(/\{\{FRAMEWORK\}\}/g, framework);

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
    system: template.systemPrompt,
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
): Promise<{ system: string; user: string }> {
  const relativePath = path.relative(projectRoot, dirPath) || '.';
  const dirName = path.basename(dirPath) || 'root';

  // Collect .sum file summaries and subdirectory sections in parallel
  const entries = await readdir(dirPath, { withFileTypes: true });

  const fileEntries = entries.filter(
    (e) => e.isFile() && !e.name.endsWith('.sum') && !e.name.startsWith('.'),
  );
  const dirEntries = entries.filter((e) => e.isDirectory());

  // Read all .sum files in parallel
  const fileResults = await Promise.all(
    fileEntries.map(async (entry) => {
      const entryPath = path.join(dirPath, entry.name);
      const sumPath = getSumPath(entryPath);
      const sumContent = await readSumFile(sumPath);
      if (sumContent) {
        return `### ${entry.name}\n**Type:** ${sumContent.fileType}\n**Purpose:** ${sumContent.metadata.purpose}\n\n${sumContent.summary}`;
      }
      return null;
    }),
  );
  const fileSummaries = fileResults.filter((r): r is string => r !== null);

  // Read all child AGENTS.md in parallel
  const subdirSections = await Promise.all(
    dirEntries.map(async (entry) => {
      const childAgentsPath = path.join(dirPath, entry.name, 'AGENTS.md');
      try {
        const childContent = await readFile(childAgentsPath, 'utf-8');
        return `### ${entry.name}/\n${childContent}`;
      } catch {
        // It should not happen, throw an error
        throw new Error(`Failed to read child AGENTS.md: ${childAgentsPath}`);
      }
    }),
  );

  // Check for user-defined AGENTS.local.md
  let localSection = '';
  try {
    const localContent = await readFile(path.join(dirPath, 'AGENTS.local.md'), 'utf-8');
    localSection = `\n## User Notes (AGENTS.local.md)\n\n${localContent}\n\nNote: Reference [AGENTS.local.md](./AGENTS.local.md) for additional documentation.`;
  } catch {
    // No local file
  }

  logTemplate('buildDirectoryPrompt', dirPath, 'directory', `files=${fileSummaries.length} subdirs=${subdirSections.length}`);

  const userSections: string[] = [
    `Generate AGENTS.md for directory: "${relativePath}" (${dirName})`,
    '',
    `## File Summaries (${fileSummaries.length} files)`,
    '',
    ...fileSummaries,
  ];

  if (subdirSections.length > 0) {
    userSections.push('', '## Subdirectories', '', ...subdirSections);
  }

  if (localSection) {
    userSections.push(localSection);
  }

  return {
    system: DIRECTORY_SYSTEM_PROMPT,
    user: userSections.join('\n'),
  };
}

import * as path from 'node:path';
import type { PromptContext, ChunkContext, SynthesisContext } from './types.js';
import { getTemplate } from './templates.js';

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
export function buildPrompt(context: PromptContext): {
  system: string;
  user: string;
} {
  const template = getTemplate(context.fileType);
  const lang = detectLanguage(context.filePath);
  const framework = detectFramework(context.content);

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
 * Build a prompt for summarizing a chunk of a large file.
 */
export function buildChunkPrompt(context: ChunkContext): {
  system: string;
  user: string;
} {
  const template = getTemplate(context.fileType);
  const lang = detectLanguage(context.filePath);

  const system = `${template.systemPrompt}

This is chunk ${context.chunkIndex + 1} of ${context.totalChunks} from a large file.
Focus on what THIS chunk contains. The chunks will be synthesized later.`;

  const user = `Analyze this code chunk and generate a partial summary.

File: ${context.filePath} (lines ${context.lineRange.start}-${context.lineRange.end})
Chunk: ${context.chunkIndex + 1} of ${context.totalChunks}

\`\`\`${lang}
${context.content}
\`\`\`

Summarize what this chunk contains:
- Functions/classes defined
- Key logic and patterns
- Dependencies used
- Notable details

Keep it concise - this will be combined with other chunks.`;

  return { system, user };
}

/**
 * Build a prompt for synthesizing chunk summaries into final summary.
 */
export function buildSynthesisPrompt(context: SynthesisContext): {
  system: string;
  user: string;
} {
  const template = getTemplate(context.fileType);

  const system = `${template.systemPrompt}

You are synthesizing chunk summaries into a final, cohesive summary.`;

  const chunkSection = context.chunkSummaries
    .map((summary, i) => `### Chunk ${i + 1}\n${summary}`)
    .join('\n\n');

  const user = `Synthesize these chunk summaries into a final summary for the file.

File: ${context.filePath}
File Type: ${context.fileType}

## Chunk Summaries

${chunkSection}

## Instructions

Create a unified summary (300-500 words) that:
1. Combines insights from all chunks
2. Eliminates redundancy
3. Presents a coherent overview of the entire file
4. Follows the format for ${context.fileType} files

Focus on:
${template.focusAreas.map((area) => `- ${area}`).join('\n')}`;

  return { system, user };
}

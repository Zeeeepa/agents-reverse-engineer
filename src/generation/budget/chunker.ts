import { countTokens } from './counter.js';

export interface Chunk {
  index: number;
  content: string;
  tokens: number;
  startLine: number;
  endLine: number;
}

export interface ChunkOptions {
  /** Target tokens per chunk (default: 3000) */
  chunkSize?: number;
  /** Lines of overlap between chunks (default: 10) */
  overlapLines?: number;
}

const DEFAULT_CHUNK_SIZE = 3000;
const DEFAULT_OVERLAP_LINES = 10;

/**
 * Fast token estimation from character count.
 * Avoids full BPE encoding during chunking. Average is ~3.5-4 chars per
 * token for typical source code; we use 3.5 to slightly over-estimate
 * (prefer smaller chunks over exceeding the budget).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Check if a file needs to be chunked for processing.
 *
 * @param contentOrTokens - File content string, or pre-computed token count (number)
 * @param threshold - Token threshold for chunking (default: 4000)
 * @returns true if file should be chunked
 */
export function needsChunking(contentOrTokens: string | number, threshold: number = 4000): boolean {
  const tokens = typeof contentOrTokens === 'number' ? contentOrTokens : countTokens(contentOrTokens);
  return tokens > threshold;
}

/**
 * Split a large file into overlapping chunks for map-reduce summarization.
 *
 * Each chunk includes some overlap with the previous chunk to maintain
 * context continuity. The overlap uses line-based boundaries to avoid
 * cutting in the middle of statements.
 *
 * Uses fast character-based token estimation during splitting, then
 * computes accurate BPE token counts once per final chunk.
 *
 * @param content - File content to chunk
 * @param options - Chunking options
 * @returns Array of chunks with metadata
 */
export function chunkFile(content: string, options: ChunkOptions = {}): Chunk[] {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    overlapLines = DEFAULT_OVERLAP_LINES,
  } = options;

  const lines = content.split('\n');
  const chunks: Chunk[] = [];

  let currentLines: string[] = [];
  let currentEstimatedTokens = 0;
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineEstTokens = estimateTokens(line + '\n');

    // Check if adding this line would exceed chunk size
    if (currentEstimatedTokens + lineEstTokens > chunkSize && currentLines.length > 0) {
      // Save current chunk with accurate token count
      const chunkContent = currentLines.join('\n');
      chunks.push({
        index: chunks.length,
        content: chunkContent,
        tokens: countTokens(chunkContent),
        startLine,
        endLine: i - 1,
      });

      // Start new chunk with overlap from previous
      const overlapStart = Math.max(0, currentLines.length - overlapLines);
      const overlapContent = currentLines.slice(overlapStart);
      currentLines = overlapContent;
      currentEstimatedTokens = estimateTokens(overlapContent.join('\n'));
      startLine = i - overlapContent.length;
    }

    currentLines.push(line);
    currentEstimatedTokens += lineEstTokens;
  }

  // Add final chunk if there's remaining content
  if (currentLines.length > 0) {
    const chunkContent = currentLines.join('\n');
    chunks.push({
      index: chunks.length,
      content: chunkContent,
      tokens: countTokens(chunkContent),
      startLine,
      endLine: lines.length - 1,
    });
  }

  return chunks;
}

/**
 * Get total tokens across all chunks.
 */
export function getTotalChunkTokens(chunks: Chunk[]): number {
  return chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);
}

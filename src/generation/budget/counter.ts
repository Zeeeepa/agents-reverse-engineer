import { encode, isWithinTokenLimit as checkLimit } from 'gpt-tokenizer';

/**
 * Count tokens in content using BPE tokenization.
 * Uses cl100k_base encoding (compatible with Claude/GPT-4).
 *
 * @param content - Text to count tokens in
 * @returns Token count
 */
export function countTokens(content: string): number {
  return encode(content).length;
}

/**
 * Check if content fits within token limit without fully encoding.
 * More efficient than counting when you only need a boolean check.
 *
 * @param content - Text to check
 * @param limit - Maximum allowed tokens
 * @returns true if content is within limit
 */
export function isWithinLimit(content: string, limit: number): boolean {
  // checkLimit returns token count if within limit, false if exceeded
  return checkLimit(content, limit) !== false;
}

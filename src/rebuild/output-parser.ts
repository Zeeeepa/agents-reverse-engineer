/**
 * AI output parser for multi-file rebuild responses.
 *
 * Extracts individual files from AI-generated responses using
 * `===FILE: path===` / `===END_FILE===` delimiters, with a fallback
 * to markdown fenced code blocks with file path annotations.
 *
 * @module
 */

/**
 * Parse multi-file AI output into a Map of file paths to contents.
 *
 * Primary format: `===FILE: path===` / `===END_FILE===` delimiters.
 * Fallback format: Markdown fenced code blocks with `language:path` annotation.
 *
 * File paths are trimmed. File content is NOT trimmed (preserves indentation).
 * Returns an empty Map if neither format matches (caller handles error case).
 *
 * @param responseText - Raw AI response text
 * @returns Map of relative file paths to file contents
 */
export function parseModuleOutput(responseText: string): Map<string, string> {
  // Primary: ===FILE: path=== / ===END_FILE=== delimiters
  const files = parseDelimiterFormat(responseText);
  if (files.size > 0) return files;

  // Fallback: markdown fenced code blocks with file path annotation
  return parseFencedBlockFormat(responseText);
}

/**
 * Parse `===FILE: path===` / `===END_FILE===` delimited output.
 */
function parseDelimiterFormat(text: string): Map<string, string> {
  const files = new Map<string, string>();
  const pattern = /===FILE:\s*(.+?)===\n([\s\S]*?)===END_FILE===/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const filePath = match[1].trim();
    const content = match[2];
    files.set(filePath, content);
  }

  return files;
}

/**
 * Parse markdown fenced code blocks with file path annotations.
 *
 * Matches blocks like:
 * ```language:path/to/file
 * content
 * ```
 */
function parseFencedBlockFormat(text: string): Map<string, string> {
  const files = new Map<string, string>();
  const pattern = /```\w*:([^\n]+)\n([\s\S]*?)```/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const filePath = match[1].trim();
    const content = match[2];
    files.set(filePath, content);
  }

  return files;
}

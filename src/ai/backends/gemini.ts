/**
 * Gemini CLI backend stub.
 *
 * Implements the {@link AIBackend} interface for the Gemini CLI (`gemini`).
 * This is a stub that demonstrates the extension pattern -- `parseResponse`
 * throws "not implemented". Full implementation deferred to a future phase
 * once the Gemini CLI JSON output is stable (see RESEARCH.md Open Question 2).
 *
 * @module
 */

import type { AIBackend, AICallOptions, AIResponse } from '../types.js';
import { AIServiceError } from '../types.js';
import { isCommandOnPath } from './claude.js';

/**
 * Gemini CLI backend stub.
 *
 * Detects CLI availability and builds argument arrays, but throws when
 * `parseResponse` is called since the Gemini adapter is not yet implemented.
 *
 * @example
 * ```typescript
 * const backend = new GeminiBackend();
 * console.log(await backend.isAvailable()); // true if `gemini` is on PATH
 * backend.parseResponse('{}', 0, 0);        // throws AIServiceError
 * ```
 */
export class GeminiBackend implements AIBackend {
  readonly name = 'gemini';
  readonly cliCommand = 'gemini';

  /**
   * Check if the `gemini` CLI is available on PATH.
   */
  async isAvailable(): Promise<boolean> {
    return isCommandOnPath(this.cliCommand);
  }

  /**
   * Build CLI arguments for a Gemini invocation.
   *
   * Based on documented Gemini CLI flags from RESEARCH.md.
   * The prompt goes to stdin via the subprocess wrapper.
   *
   * @param _options - Call options (unused in stub)
   * @returns Argument array for the Gemini CLI
   */
  buildArgs(_options: AICallOptions): string[] {
    return ['-p', '--output-format', 'json'];
  }

  /**
   * Parse Gemini CLI output into a normalized {@link AIResponse}.
   *
   * @throws {AIServiceError} Always -- Gemini backend is not yet implemented
   */
  parseResponse(_stdout: string, _durationMs: number, _exitCode: number): AIResponse {
    throw new AIServiceError(
      'SUBPROCESS_ERROR',
      'Gemini backend is not yet implemented. Use Claude backend.',
    );
  }

  /**
   * Get user-facing install instructions for the Gemini CLI.
   */
  getInstallInstructions(): string {
    return [
      'Gemini CLI (experimental):',
      '  npm install -g @anthropic-ai/gemini-cli',
      '  https://github.com/google-gemini/gemini-cli',
    ].join('\n');
  }
}

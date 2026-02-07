/**
 * OpenCode CLI backend stub.
 *
 * Implements the {@link AIBackend} interface for the OpenCode CLI (`opencode`).
 * This is a stub that demonstrates the extension pattern -- `parseResponse`
 * throws "not implemented". Full implementation deferred to a future phase
 * once the OpenCode JSONL output parsing is built (see RESEARCH.md Open Question 3).
 *
 * @module
 */

import type { AIBackend, AICallOptions, AIResponse } from '../types.js';
import { AIServiceError } from '../types.js';
import { isCommandOnPath } from './claude.js';

/**
 * OpenCode CLI backend stub.
 *
 * Detects CLI availability and builds argument arrays, but throws when
 * `parseResponse` is called since the OpenCode adapter is not yet implemented.
 *
 * @example
 * ```typescript
 * const backend = new OpenCodeBackend();
 * console.log(await backend.isAvailable()); // true if `opencode` is on PATH
 * backend.parseResponse('{}', 0, 0);        // throws AIServiceError
 * ```
 */
export class OpenCodeBackend implements AIBackend {
  readonly name = 'opencode';
  readonly cliCommand = 'opencode';

  /**
   * Check if the `opencode` CLI is available on PATH.
   */
  async isAvailable(): Promise<boolean> {
    return isCommandOnPath(this.cliCommand);
  }

  /**
   * Build CLI arguments for an OpenCode invocation.
   *
   * Based on documented OpenCode CLI flags from RESEARCH.md.
   * The prompt goes to stdin via the subprocess wrapper.
   *
   * @param _options - Call options (unused in stub)
   * @returns Argument array for the OpenCode CLI
   */
  buildArgs(_options: AICallOptions): string[] {
    return ['run', '--format', 'json'];
  }

  /**
   * Parse OpenCode CLI output into a normalized {@link AIResponse}.
   *
   * @throws {AIServiceError} Always -- OpenCode backend is not yet implemented
   */
  parseResponse(_stdout: string, _durationMs: number, _exitCode: number): AIResponse {
    throw new AIServiceError(
      'SUBPROCESS_ERROR',
      'OpenCode backend is not yet implemented. Use Claude backend.',
    );
  }

  /**
   * Get user-facing install instructions for the OpenCode CLI.
   */
  getInstallInstructions(): string {
    return [
      'OpenCode (experimental):',
      '  curl -fsSL https://opencode.ai/install | bash',
      '  https://opencode.ai',
    ].join('\n');
  }
}

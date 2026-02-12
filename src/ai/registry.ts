/**
 * Backend registry, factory, and auto-detection.
 *
 * Manages the set of registered AI CLI backends, selects the appropriate
 * backend at runtime via auto-detection or explicit request, and provides
 * actionable error messages when no CLI is found.
 *
 * @module
 */

import type { AIBackend } from './types.js';
import { AIServiceError } from './types.js';
import { ClaudeBackend } from './backends/claude.js';
import { GeminiBackend } from './backends/gemini.js';
import { OpenCodeBackend } from './backends/opencode.js';

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

/**
 * Registry of available AI CLI backends.
 *
 * Stores backends in insertion order, which determines the priority for
 * auto-detection. Use {@link createBackendRegistry} to get a pre-populated
 * registry with all supported backends.
 *
 * @example
 * ```typescript
 * const registry = createBackendRegistry();
 * const claude = registry.get('claude');
 * const all = registry.getAll(); // [ClaudeBackend, GeminiBackend, OpenCodeBackend]
 * ```
 */
export class BackendRegistry {
  private readonly backends = new Map<string, AIBackend>();

  /**
   * Register a backend adapter.
   *
   * @param backend - The backend to register (keyed by its `name` property)
   */
  register(backend: AIBackend): void {
    this.backends.set(backend.name, backend);
  }

  /**
   * Get a specific backend by name.
   *
   * @param name - The backend name (e.g., "claude", "gemini", "opencode")
   * @returns The backend, or `undefined` if not registered
   */
  get(name: string): AIBackend | undefined {
    return this.backends.get(name);
  }

  /**
   * Get all registered backends in priority order.
   *
   * @returns Array of all registered backends
   */
  getAll(): AIBackend[] {
    return Array.from(this.backends.values());
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new backend registry pre-populated with all supported backends.
 *
 * Registration order determines auto-detection priority:
 * 1. Claude (recommended, fully implemented)
 * 2. Gemini (experimental, stub)
 * 3. OpenCode (experimental, stub)
 *
 * @returns A populated {@link BackendRegistry}
 *
 * @example
 * ```typescript
 * const registry = createBackendRegistry();
 * const backend = await detectBackend(registry);
 * ```
 */
export function createBackendRegistry(): BackendRegistry {
  const registry = new BackendRegistry();
  registry.register(new ClaudeBackend());
  registry.register(new GeminiBackend());
  registry.register(new OpenCodeBackend());
  return registry;
}

// ---------------------------------------------------------------------------
// Auto-detection
// ---------------------------------------------------------------------------

/**
 * Detect the first available backend on PATH in priority order.
 *
 * Iterates all registered backends and calls `isAvailable()` on each.
 * Returns the first backend whose CLI is found, or `null` if none are
 * available.
 *
 * Priority order is determined by registration order in
 * {@link createBackendRegistry}: Claude > Gemini > OpenCode.
 *
 * @param registry - The backend registry to search
 * @returns The first available backend, or `null` if none found
 *
 * @example
 * ```typescript
 * const registry = createBackendRegistry();
 * const backend = await detectBackend(registry);
 * if (backend) {
 *   console.log(`Using ${backend.name} backend`);
 * }
 * ```
 */
export async function detectBackend(registry: BackendRegistry): Promise<AIBackend | null> {
  for (const backend of registry.getAll()) {
    if (await backend.isAvailable()) {
      return backend;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Install instructions
// ---------------------------------------------------------------------------

/**
 * Get formatted install instructions for all registered backends.
 *
 * Returns a multi-line string suitable for error messages when no CLI
 * is found. Matches the error message template from RESEARCH.md.
 *
 * @param registry - The backend registry
 * @returns Formatted install instructions string
 *
 * @example
 * ```typescript
 * const instructions = getInstallInstructions(registry);
 * console.error(`No AI CLI found.\n\nInstall one of the following:\n\n${instructions}`);
 * ```
 */
export function getInstallInstructions(registry: BackendRegistry): string {
  return registry
    .getAll()
    .map((backend) => backend.getInstallInstructions())
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a backend by name or auto-detect the best available one.
 *
 * - If `requested` is `'auto'`: runs {@link detectBackend} and throws with
 *   install instructions if nothing is found.
 * - If `requested` is a specific name: looks it up in the registry, checks
 *   availability, and throws if not found or not available.
 *
 * @param registry - The backend registry
 * @param requested - Backend name or `'auto'` for auto-detection
 * @returns The resolved backend adapter
 * @throws {AIServiceError} With code `CLI_NOT_FOUND` if no backend is available
 *
 * @example
 * ```typescript
 * const registry = createBackendRegistry();
 *
 * // Auto-detect
 * const backend = await resolveBackend(registry, 'auto');
 *
 * // Explicit selection
 * const claude = await resolveBackend(registry, 'claude');
 * ```
 */
export async function resolveBackend(
  registry: BackendRegistry,
  requested: string | 'auto',
): Promise<AIBackend> {
  if (requested === 'auto') {
    // PATH scan in registration order (Claude > Gemini > OpenCode)
    const detected = await detectBackend(registry);
    if (detected) {
      return detected;
    }

    const instructions = getInstallInstructions(registry);
    throw new AIServiceError(
      'CLI_NOT_FOUND',
      `No AI CLI found on your system.\n\nInstall one of the following:\n\n${instructions}\n\nThen run this command again.`,
    );
  }

  // Explicit backend requested
  const backend = registry.get(requested);
  if (!backend) {
    const known = registry
      .getAll()
      .map((b) => b.name)
      .join(', ');
    throw new AIServiceError(
      'CLI_NOT_FOUND',
      `Unknown backend "${requested}". Available backends: ${known}`,
    );
  }

  if (!(await backend.isAvailable())) {
    throw new AIServiceError(
      'CLI_NOT_FOUND',
      `Backend "${requested}" is not available. The "${backend.cliCommand}" CLI was not found on PATH.\n\n${backend.getInstallInstructions()}`,
    );
  }

  return backend;
}

/**
 * Configuration loader for agents-reverse
 *
 * Loads and validates configuration from `.agents-reverse/config.yaml`.
 * Returns sensible defaults when no config file exists.
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { ZodError } from 'zod';
import pc from 'picocolors';
import { ConfigSchema, Config } from './schema.js';
import { DEFAULT_VENDOR_DIRS, DEFAULT_BINARY_EXTENSIONS, DEFAULT_MAX_FILE_SIZE } from './defaults.js';
import type { ITraceWriter } from '../orchestration/trace.js';

/** Directory name for agents-reverse-engineer configuration */
export const CONFIG_DIR = '.agents-reverse-engineer';

/** Configuration file name */
export const CONFIG_FILE = 'config.yaml';

/**
 * Error thrown when configuration parsing or validation fails
 */
export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Load configuration from `.agents-reverse/config.yaml`.
 *
 * If the file doesn't exist, returns default configuration.
 * If the file exists but is invalid, throws a ConfigError with details.
 *
 * @param root - Root directory containing `.agents-reverse/` folder
 * @param options - Optional configuration loading options
 * @param options.tracer - Trace writer for emitting config:loaded events
 * @param options.debug - Enable debug output for configuration loading
 * @returns Validated configuration object with all defaults applied
 * @throws ConfigError if the config file exists but is invalid
 *
 * @example
 * ```typescript
 * const config = await loadConfig('/path/to/project');
 * console.log(config.exclude.vendorDirs);
 * ```
 */
export async function loadConfig(
  root: string,
  options?: { tracer?: ITraceWriter; debug?: boolean }
): Promise<Config> {
  const configPath = path.join(root, CONFIG_DIR, CONFIG_FILE);
  let usingDefaults = false;

  try {
    const content = await readFile(configPath, 'utf-8');
    const raw = parse(content);

    try {
      const config = ConfigSchema.parse(raw);

      // Emit trace event
      options?.tracer?.emit({
        type: 'config:loaded',
        configPath: path.relative(root, configPath),
        model: config.ai.model,
        concurrency: config.ai.concurrency,
        budget: config.generation.tokenBudget,
      });

      // Debug output
      if (options?.debug) {
        console.error(pc.dim(`[debug] Config loaded from: ${path.relative(root, configPath)}`));
        console.error(
          pc.dim(`[debug] Model: ${config.ai.model}, Concurrency: ${config.ai.concurrency}, Budget: ${config.generation.tokenBudget}`)
        );
      }

      return config;
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = err.issues
          .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
          .join('\n');
        throw new ConfigError(
          `Invalid configuration in ${configPath}:\n${issues}`,
          configPath,
          err
        );
      }
      throw err;
    }
  } catch (err) {
    // File not found - return defaults
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      usingDefaults = true;
      const config = ConfigSchema.parse({});

      // Emit trace event for defaults
      options?.tracer?.emit({
        type: 'config:loaded',
        configPath: '(defaults)',
        model: config.ai.model,
        concurrency: config.ai.concurrency,
        budget: config.generation.tokenBudget,
      });

      // Debug output
      if (options?.debug) {
        console.error(pc.dim(`[debug] Config file not found, using defaults`));
        console.error(
          pc.dim(`[debug] Model: ${config.ai.model}, Concurrency: ${config.ai.concurrency}, Budget: ${config.generation.tokenBudget}`)
        );
      }

      return config;
    }

    // Re-throw ConfigError as-is
    if (err instanceof ConfigError) {
      throw err;
    }

    // YAML parse error
    throw new ConfigError(
      `Failed to parse ${configPath}: ${(err as Error).message}`,
      configPath,
      err as Error
    );
  }
}

/**
 * Check if a configuration file exists.
 *
 * @param root - Root directory to check
 * @returns true if `.agents-reverse/config.yaml` exists
 *
 * @example
 * ```typescript
 * if (!await configExists('.')) {
 *   console.log('Run `are init` to create configuration');
 * }
 * ```
 */
export async function configExists(root: string): Promise<boolean> {
  const configPath = path.join(root, CONFIG_DIR, CONFIG_FILE);
  try {
    await access(configPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a default configuration file with helpful comments.
 *
 * Creates the `.agents-reverse/` directory if it doesn't exist.
 * The generated file includes comments explaining each option.
 *
 * @param root - Root directory where `.agents-reverse/` will be created
 *
 * @example
 * ```typescript
 * await writeDefaultConfig('/path/to/project');
 * // Creates /path/to/project/.agents-reverse/config.yaml
 * ```
 */
export async function writeDefaultConfig(root: string): Promise<void> {
  const configDir = path.join(root, CONFIG_DIR);
  const configPath = path.join(configDir, CONFIG_FILE);

  // Create directory if needed
  await mkdir(configDir, { recursive: true });

  // Generate config content with comments
  const configContent = `# agents-reverse-engineer configuration
# See: https://github.com/your-org/agents-reverse-engineer

# ============================================================================
# FILE & DIRECTORY EXCLUSIONS
# ============================================================================
exclude:
  # Custom glob patterns to exclude (e.g., ["*.log", "temp/**"])
  patterns: []

  # Vendor directories to exclude from analysis
  # These are typically package managers, build outputs, or version control
  vendorDirs:
${DEFAULT_VENDOR_DIRS.map((dir) => `    - ${dir}`).join('\n')}

  # Binary file extensions to exclude from analysis
  # These files cannot be meaningfully analyzed as text
  binaryExtensions:
${DEFAULT_BINARY_EXTENSIONS.map((ext) => `    - ${ext}`).join('\n')}

# ============================================================================
# DISCOVERY OPTIONS
# ============================================================================
options:
  # Whether to follow symbolic links during traversal
  followSymlinks: false

  # Maximum file size in bytes (files larger than this are skipped)
  # Default: ${DEFAULT_MAX_FILE_SIZE} (1MB)
  maxFileSize: ${DEFAULT_MAX_FILE_SIZE}

# ============================================================================
# OUTPUT FORMATTING
# ============================================================================
output:
  # Whether to use colors in terminal output
  colors: true

  # Whether to show verbose output (each file as processed)
  verbose: true

# ============================================================================
# DOCUMENTATION GENERATION
# ============================================================================
generation:
  # Token budget for entire project (files analyzed until budget exhausted)
  # Default: 100,000 tokens
  tokenBudget: 100000

  # Chunk size for large files in tokens
  # Files larger than this are split into chunks
  # Default: 3000 tokens
  chunkSize: 3000

  # Root documents (generated at project root)
  generateArchitecture: true   # ARCHITECTURE.md - system design overview
  generateStack: true          # STACK.md - technology stack from package manifests

  # Supplementary docs (generated per package root)
  generateStructure: true      # STRUCTURE.md - codebase organization
  generateConventions: true    # CONVENTIONS.md - coding patterns and style
  generateTesting: true        # TESTING.md - testing approach and coverage
  generateIntegrations: true   # INTEGRATIONS.md - external services and APIs
  generateConcerns: true       # CONCERNS.md - technical debt and issues

# ============================================================================
# AI SERVICE CONFIGURATION
# ============================================================================
ai:
  # AI CLI backend to use
  # Options: 'claude', 'gemini', 'opencode', 'auto' (auto-detect from PATH)
  backend: auto

  # Model identifier (backend-specific)
  # Examples: "sonnet", "opus", "haiku" (for Claude)
  model: sonnet

  # Subprocess timeout in milliseconds
  # Default: 300,000ms (5 minutes)
  # Increase for very large files or slow connections
  timeoutMs: 300000

  # Maximum number of retries for transient errors
  # Default: 3
  maxRetries: 3

  # Number of concurrent AI calls (parallelism)
  # Range: 1-10, Default: 5
  # Lower values (2-3) recommended for:
  #   - WSL environments (limited resources)
  #   - Machines with <16GB RAM
  #   - Slow network connections
  concurrency: 5

  # Telemetry settings
  telemetry:
    # Number of most recent run logs to keep on disk
    # Logs stored in .agents-reverse-engineer/logs/
    keepRuns: 50

    # Optional: Cost threshold in USD (warns when exceeded)
    # Uncomment to enable:
    # costThresholdUsd: 10.0

  # Optional: Custom model pricing overrides
  # Use this to override default pricing for specific models
  # Uncomment to enable:
  # pricing:
  #   claude-opus-4:
  #     inputCostPerMTok: 15.0    # USD per 1M input tokens
  #     outputCostPerMTok: 75.0   # USD per 1M output tokens
`;

  await writeFile(configPath, configContent, 'utf-8');
}

/**
 * Zod schema for configuration validation
 *
 * This schema defines the structure of `.agents-reverse/config.yaml`
 * and provides sensible defaults for all fields.
 */

import { z } from 'zod';
import {
  DEFAULT_VENDOR_DIRS,
  DEFAULT_BINARY_EXTENSIONS,
  DEFAULT_MAX_FILE_SIZE,
} from './defaults.js';

/**
 * Schema for exclusion configuration
 */
const ExcludeSchema = z.object({
  /** Custom glob patterns to exclude (e.g., ["*.log", "temp/**"]) */
  patterns: z.array(z.string()).default([]),
  /** Vendor directories to exclude */
  vendorDirs: z.array(z.string()).default([...DEFAULT_VENDOR_DIRS]),
  /** Binary file extensions to exclude */
  binaryExtensions: z.array(z.string()).default([...DEFAULT_BINARY_EXTENSIONS]),
}).default({});

/**
 * Schema for options configuration
 */
const OptionsSchema = z.object({
  /** Whether to follow symbolic links during traversal */
  followSymlinks: z.boolean().default(false),
  /** Maximum file size in bytes (files larger than this are skipped) */
  maxFileSize: z.number().positive().default(DEFAULT_MAX_FILE_SIZE),
}).default({});

/**
 * Schema for output configuration
 */
const OutputSchema = z.object({
  /** Whether to use colors in terminal output */
  colors: z.boolean().default(true),
  /** Whether to show verbose output (each file as processed) */
  verbose: z.boolean().default(true),
}).default({});

/**
 * Main configuration schema for agents-reverse.
 *
 * All fields have sensible defaults, so an empty object `{}` is valid
 * and will result in a fully populated configuration.
 *
 * @example
 * ```typescript
 * // Parse with defaults
 * const config = ConfigSchema.parse({});
 *
 * // Parse with partial overrides
 * const config = ConfigSchema.parse({
 *   exclude: { patterns: ['*.log'] }
 * });
 * ```
 */
export const ConfigSchema = z.object({
  /** Exclusion rules for files and directories */
  exclude: ExcludeSchema,
  /** Discovery options */
  options: OptionsSchema,
  /** Output formatting options */
  output: OutputSchema,
}).default({});

/**
 * Inferred TypeScript type from the schema.
 * Use this type for function parameters and return types.
 */
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Type for the exclude section of config
 */
export type ExcludeConfig = z.infer<typeof ExcludeSchema>;

/**
 * Type for the options section of config
 */
export type OptionsConfig = z.infer<typeof OptionsSchema>;

/**
 * Type for the output section of config
 */
export type OutputConfig = z.infer<typeof OutputSchema>;

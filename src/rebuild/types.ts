/**
 * Types for the rebuild module.
 *
 * Provides Zod-validated checkpoint schema and interfaces for rebuild
 * units, plans, and results.
 *
 * @module
 */

import { z } from 'zod';

/**
 * Zod schema for the rebuild checkpoint file.
 *
 * Validated when reading from disk to detect corruption or version mismatch.
 */
export const RebuildCheckpointSchema = z.object({
  version: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  outputDir: z.string(),
  specHashes: z.record(z.string()),
  modules: z.record(z.object({
    status: z.enum(['pending', 'done', 'failed']),
    completedAt: z.string().optional(),
    error: z.string().optional(),
    filesWritten: z.array(z.string()).optional(),
  })),
});

/**
 * Checkpoint state persisted to `.rebuild-checkpoint` inside the output directory.
 *
 * Tracks per-module completion status and spec file hashes for drift detection.
 */
export type RebuildCheckpoint = z.infer<typeof RebuildCheckpointSchema>;

/**
 * A single rebuild unit representing one AI call.
 *
 * Each unit produces all files for a logical module/phase of the project.
 */
export interface RebuildUnit {
  /** Unit name derived from spec section heading */
  name: string;
  /** The spec section content for this unit */
  specContent: string;
  /** Execution order from Build Plan phase numbering */
  order: number;
}

/**
 * The full rebuild plan computed from spec files before execution.
 */
export interface RebuildPlan {
  /** Spec files read from specs/ directory */
  specFiles: Array<{ relativePath: string; content: string }>;
  /** Ordered rebuild units extracted from spec content */
  units: RebuildUnit[];
  /** Output directory for rebuilt project */
  outputDir: string;
}

/**
 * Result of rebuilding a single unit.
 */
export interface RebuildResult {
  /** Name of the rebuild unit */
  unitName: string;
  /** Whether the rebuild succeeded */
  success: boolean;
  /** Relative paths of files written within the output directory */
  filesWritten: string[];
  /** Input tokens consumed */
  tokensIn: number;
  /** Output tokens produced */
  tokensOut: number;
  /** Cache read tokens */
  cacheReadTokens: number;
  /** Cache creation tokens */
  cacheCreationTokens: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Model used for generation */
  model: string;
  /** Error message if rebuild failed */
  error?: string;
}

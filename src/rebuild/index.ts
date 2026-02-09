/**
 * Rebuild module barrel export.
 *
 * Re-exports all public types, schemas, functions, and classes
 * for the rebuild pipeline.
 *
 * @module
 */

export type {
  RebuildCheckpoint,
  RebuildUnit,
  RebuildPlan,
  RebuildResult,
} from './types.js';

export { RebuildCheckpointSchema } from './types.js';

export { readSpecFiles, partitionSpec } from './spec-reader.js';

export { parseModuleOutput } from './output-parser.js';

export { CheckpointManager } from './checkpoint.js';

export { REBUILD_SYSTEM_PROMPT, buildRebuildPrompt } from './prompts.js';

export { executeRebuild, type RebuildExecutionOptions } from './orchestrator.js';

/**
 * Update module
 *
 * Provides incremental documentation update functionality.
 * Coordinates state management, change detection, and orphan cleanup.
 */
export {
  UpdateOrchestrator,
  createUpdateOrchestrator,
  type UpdatePlan,
} from './orchestrator.js';

export {
  cleanupOrphans,
  cleanupEmptyDirectoryDocs,
  getAffectedDirectories,
} from './orphan-cleaner.js';

export type {
  UpdateOptions,
  UpdateResult,
  UpdateProgress,
  CleanupResult,
} from './types.js';

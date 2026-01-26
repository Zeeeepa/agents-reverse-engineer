/**
 * State management module
 *
 * Provides SQLite-based state persistence for tracking file generation.
 */
export { openDatabase } from './database.js';
export type { FileRecord, RunRecord, StateDatabase } from './types.js';

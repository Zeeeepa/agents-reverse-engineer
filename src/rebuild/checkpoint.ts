/**
 * Checkpoint manager for rebuild session continuity.
 *
 * Persists per-module completion status and spec file hashes inside the
 * output directory. Uses promise-chain write serialization (same pattern
 * as PlanTracker) to handle concurrent pool worker updates safely.
 *
 * @module
 */

import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { computeContentHashFromString } from '../change-detection/index.js';
import { RebuildCheckpointSchema, type RebuildCheckpoint } from './types.js';
import { getVersion } from '../version.js';

/**
 * Manages rebuild checkpoint state for session continuity.
 *
 * Create via the static `load()` or `createFresh()` factory methods.
 * Call `markDone()` / `markFailed()` as modules complete, and `flush()`
 * before returning to ensure all writes finish.
 */
export class CheckpointManager {
  private data: RebuildCheckpoint;
  private readonly checkpointPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(outputDir: string, initialData: RebuildCheckpoint) {
    this.checkpointPath = path.join(outputDir, '.rebuild-checkpoint');
    this.data = initialData;
  }

  /**
   * Load an existing checkpoint or create a new one.
   *
   * If a checkpoint file exists and is valid, checks for spec drift by
   * comparing stored hashes against current spec file content hashes.
   * Returns `isResume: true` only if the checkpoint is valid and specs
   * haven't changed.
   *
   * @param outputDir - Absolute path to the output directory
   * @param specFiles - Current spec files with content for drift detection
   * @param unitNames - Names of all rebuild units (for fresh checkpoint initialization)
   * @returns CheckpointManager instance and whether this is a resume
   */
  static async load(
    outputDir: string,
    specFiles: Array<{ relativePath: string; content: string }>,
    unitNames: string[],
  ): Promise<{ manager: CheckpointManager; isResume: boolean }> {
    const checkpointPath = path.join(outputDir, '.rebuild-checkpoint');

    let raw: string;
    try {
      raw = await readFile(checkpointPath, 'utf-8');
    } catch {
      // No checkpoint file -- create fresh
      const manager = CheckpointManager.createFresh(outputDir, specFiles, unitNames);
      return { manager, isResume: false };
    }

    // Parse and validate
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Corrupted JSON -- create fresh
      const manager = CheckpointManager.createFresh(outputDir, specFiles, unitNames);
      return { manager, isResume: false };
    }

    const result = RebuildCheckpointSchema.safeParse(parsed);
    if (!result.success) {
      // Schema validation failed -- create fresh
      const manager = CheckpointManager.createFresh(outputDir, specFiles, unitNames);
      return { manager, isResume: false };
    }

    const checkpoint = result.data;

    // Check for spec drift
    const currentHashes: Record<string, string> = {};
    for (const spec of specFiles) {
      currentHashes[spec.relativePath] = computeContentHashFromString(spec.content);
    }

    // Compare hash counts (files added or removed)
    const storedPaths = Object.keys(checkpoint.specHashes);
    const currentPaths = Object.keys(currentHashes);
    if (storedPaths.length !== currentPaths.length) {
      const manager = CheckpointManager.createFresh(outputDir, specFiles, unitNames);
      return { manager, isResume: false };
    }

    // Compare individual hashes
    for (const specPath of currentPaths) {
      if (checkpoint.specHashes[specPath] !== currentHashes[specPath]) {
        const manager = CheckpointManager.createFresh(outputDir, specFiles, unitNames);
        return { manager, isResume: false };
      }
    }

    // Valid checkpoint, no drift -- resume
    const manager = new CheckpointManager(outputDir, checkpoint);
    return { manager, isResume: true };
  }

  /**
   * Create a fresh checkpoint with all modules set to pending.
   *
   * @param outputDir - Absolute path to the output directory
   * @param specFiles - Spec files with content for hash computation
   * @param unitNames - Names of all rebuild units
   * @returns New CheckpointManager instance
   */
  static createFresh(
    outputDir: string,
    specFiles: Array<{ relativePath: string; content: string }>,
    unitNames: string[],
  ): CheckpointManager {
    const specHashes: Record<string, string> = {};
    for (const spec of specFiles) {
      specHashes[spec.relativePath] = computeContentHashFromString(spec.content);
    }

    const modules: RebuildCheckpoint['modules'] = {};
    for (const name of unitNames) {
      modules[name] = { status: 'pending' };
    }

    const now = new Date().toISOString();
    const data: RebuildCheckpoint = {
      version: getVersion(),
      createdAt: now,
      updatedAt: now,
      outputDir,
      specHashes,
      modules,
    };

    return new CheckpointManager(outputDir, data);
  }

  /**
   * Mark a unit as successfully completed.
   *
   * Queues a serialized write to the checkpoint file.
   */
  markDone(unitName: string, filesWritten: string[]): void {
    this.data.modules[unitName] = {
      status: 'done',
      completedAt: new Date().toISOString(),
      filesWritten,
    };
    this.data.updatedAt = new Date().toISOString();
    this.queueWrite();
  }

  /**
   * Mark a unit as failed.
   *
   * Queues a serialized write to the checkpoint file.
   */
  markFailed(unitName: string, error: string): void {
    this.data.modules[unitName] = {
      status: 'failed',
      error,
    };
    this.data.updatedAt = new Date().toISOString();
    this.queueWrite();
  }

  /**
   * Get names of units that are pending or failed (eligible for execution).
   */
  getPendingUnits(): string[] {
    return Object.entries(this.data.modules)
      .filter(([, mod]) => mod.status === 'pending' || mod.status === 'failed')
      .map(([name]) => name);
  }

  /**
   * Check if a unit has been completed.
   */
  isDone(unitName: string): boolean {
    return this.data.modules[unitName]?.status === 'done';
  }

  /**
   * Wait for all queued writes to finish.
   */
  async flush(): Promise<void> {
    await this.writeQueue;
  }

  /**
   * Create the output directory if needed and write the initial checkpoint file.
   */
  async initialize(): Promise<void> {
    try {
      await mkdir(path.dirname(this.checkpointPath), { recursive: true });
      await writeFile(
        this.checkpointPath,
        JSON.stringify(this.data, null, 2),
        'utf-8',
      );
    } catch {
      // Non-critical -- rebuild continues without persistent checkpoint
    }
  }

  /**
   * Return the current checkpoint data (for dry-run display or inspection).
   */
  getData(): RebuildCheckpoint {
    return this.data;
  }

  /**
   * Queue a serialized write to prevent file corruption from concurrent calls.
   *
   * Follows the PlanTracker promise-chain pattern.
   */
  private queueWrite(): void {
    this.writeQueue = this.writeQueue
      .then(() =>
        writeFile(
          this.checkpointPath,
          JSON.stringify(this.data, null, 2),
          'utf-8',
        ),
      )
      .catch(() => {
        /* non-critical */
      });
  }
}

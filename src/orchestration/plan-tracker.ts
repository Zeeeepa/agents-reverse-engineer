/**
 * Progress tracker that updates GENERATION-PLAN.md checkboxes during generation.
 *
 * Maintains the markdown content in memory for fast updates and serializes
 * disk writes via a promise chain to handle concurrent Phase 1 completions.
 *
 * @module
 */

import { writeFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { CONFIG_DIR } from '../config/loader.js';

/**
 * Tracks generation progress by ticking checkboxes in GENERATION-PLAN.md.
 *
 * Create one instance at the start of `executeGenerate()`, call `markDone()`
 * as tasks complete, and `flush()` before returning.
 */
export class PlanTracker {
  private content: string;
  private readonly planPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(projectRoot: string, initialMarkdown: string) {
    this.planPath = path.join(projectRoot, CONFIG_DIR, 'GENERATION-PLAN.md');
    this.content = initialMarkdown;
  }

  /** Write the initial plan file to disk. */
  async initialize(): Promise<void> {
    try {
      await mkdir(path.dirname(this.planPath), { recursive: true });
      await writeFile(this.planPath, this.content, 'utf8');
    } catch {
      // Non-critical — generation continues without tracking
    }
  }

  /**
   * Mark a task as done by replacing its checkbox.
   *
   * The caller must pass the exact path as it appears in the markdown:
   * - File: `src/cli/init.ts`
   * - Directory: `src/cli/AGENTS.md`  (caller appends `/AGENTS.md`)
   * - Root doc: `CLAUDE.md`
   */
  markDone(itemPath: string): void {
    const before = this.content;
    this.content = this.content.replace(
      `- [ ] \`${itemPath}\``,
      `- [x] \`${itemPath}\``,
    );

    if (this.content === before) return; // no match — skip write

    // Queue a serialized write so concurrent markDone() calls don't corrupt the file
    this.writeQueue = this.writeQueue
      .then(() => writeFile(this.planPath, this.content, 'utf8'))
      .catch(() => {/* non-critical */});
  }

  /** Wait for all queued writes to finish. */
  async flush(): Promise<void> {
    await this.writeQueue;
  }
}

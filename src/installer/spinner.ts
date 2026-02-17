/**
 * Terminal spinner with multi-line golden circle animation
 *
 * Cycles through 36 pre-rendered frames of a rotating 3D sphere.
 * Uses ANSI cursor positioning to update the frame region in-place.
 */

import { GOLDEN_CIRCLE_FRAMES, FRAME_WIDTH } from './frames/index.js';

/** Gold color using ANSI 256-color palette (#220) */
function gold(s: string): string {
  return `\x1b[38;5;220m${s}\x1b[0m`;
}

export interface SpinnerConfig {
  /** Array of multi-line frame strings */
  frames: string[];
  /** Milliseconds between frames (default: 80) */
  interval: number;
  /** Coloring function applied to each frame line */
  color: (s: string) => string;
}

export const GOLDEN_CIRCLE_SPINNER: SpinnerConfig = {
  frames: GOLDEN_CIRCLE_FRAMES,
  interval: 80,
  color: gold,
};

export class Spinner {
  private frames: string[];
  private interval: number;
  private currentFrame: number = 0;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private color: (s: string) => string;
  private frameHeight: number;
  private frameWidth: number;
  private startRow: number = 0;
  private startCol: number = 0;
  private running: boolean = false;

  constructor(config: Partial<SpinnerConfig> = {}) {
    const merged = { ...GOLDEN_CIRCLE_SPINNER, ...config };
    this.frames = merged.frames;
    this.interval = merged.interval;
    this.color = merged.color;
    this.frameHeight = this.frames[0]?.split('\n').length ?? 6;
    this.frameWidth = FRAME_WIDTH;
  }

  /**
   * Start the spinner animation at a fixed screen position.
   *
   * @param row - Starting row (1-based)
   * @param col - Starting column (1-based)
   */
  start(row: number, col: number): void {
    if (this.running) return;
    this.running = true;
    this.startRow = row;
    this.startCol = col;
    this.currentFrame = 0;

    // Hide cursor
    process.stdout.write('\x1b[?25l');

    this.render();
    this.timerId = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      this.render();
    }, this.interval);
  }

  /** Stop the spinner and optionally show a final symbol. */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    // Clear only the spinner's own columns (NOT to end of line, which would wipe the right pane)
    const blank = ' '.repeat(this.frameWidth);
    for (let i = 0; i < this.frameHeight; i++) {
      process.stdout.write(`\x1b[${this.startRow + i};${this.startCol}H${blank}`);
    }

    // Show cursor
    process.stdout.write('\x1b[?25h');
  }

  /** Render the current frame at the fixed position. */
  private render(): void {
    const frame = this.frames[this.currentFrame];
    const lines = frame.split('\n');

    for (let i = 0; i < lines.length; i++) {
      // Move cursor to position and write the colored line
      process.stdout.write(
        `\x1b[${this.startRow + i};${this.startCol}H${this.color(lines[i])}`,
      );
    }
  }
}

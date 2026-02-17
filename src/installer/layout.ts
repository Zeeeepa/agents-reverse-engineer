/**
 * Split-pane terminal layout for the installer UI
 *
 * Left pane (fixed): ARE ASCII banner + rotating golden circle + version info
 * Right pane (scrolling viewport): Interactive prompts, progress, results
 *
 * The right pane is locked to the same vertical height as the left pane.
 * When content overflows, older lines scroll up within the bounded region.
 *
 * Uses ANSI escape codes for cursor positioning and region management.
 */

import pc from 'picocolors';

export interface LayoutConfig {
  /** Width of the left pane in characters */
  leftWidth: number;
  /** Padding between panes */
  padding: number;
}

/** Minimum terminal width to enable split-pane layout */
const MIN_TERMINAL_WIDTH = 80;

/** ANSI escape helpers */
function moveTo(row: number, col: number): void {
  process.stdout.write(`\x1b[${row};${col}H`);
}

function clearLineFromCursor(): void {
  process.stdout.write('\x1b[0K');
}

export function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H');
}

/**
 * Strip ANSI escape codes from a string to get its visible length.
 */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

export class SplitPaneLayout {
  private leftWidth: number;
  private padding: number;
  private totalWidth: number;
  private rightCol: number;
  private rightWidth: number;
  private leftContent: string[] = [];
  private separatorCol: number;
  private enabled: boolean;

  /** All right-pane lines (the full buffer) */
  private rightBuffer: string[] = [];
  /** First row of the right pane viewport (1-based) */
  private viewportTop: number = 1;
  /** Maximum number of visible rows in the right pane (matches left pane height) */
  private viewportHeight: number = 10;
  /** Logical cursor: next line index in rightBuffer to write to */
  private rightCursor: number = 0;

  constructor(config: Partial<LayoutConfig> = {}) {
    this.leftWidth = config.leftWidth ?? 40;
    this.padding = config.padding ?? 2;
    this.totalWidth = process.stdout.columns || 100;
    this.separatorCol = this.leftWidth + this.padding;
    this.rightCol = this.separatorCol + 3; // After separator "│" + padding
    this.rightWidth = Math.max(30, this.totalWidth - this.rightCol);
    this.enabled = process.stdout.isTTY === true && this.totalWidth >= MIN_TERMINAL_WIDTH;
  }

  /** Whether the split-pane layout is active */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Get the column where the right pane starts */
  get rightPaneCol(): number {
    return this.rightCol;
  }

  /** Get the logical cursor position (index into rightBuffer) */
  get currentRightRow(): number {
    return this.rightCursor;
  }

  /** Get the width available for right pane content */
  get rightPaneWidth(): number {
    return this.rightWidth;
  }

  /**
   * Set left pane content (array of pre-formatted lines).
   * Also sets the right pane viewport height to match.
   */
  setLeftPane(lines: string[]): void {
    this.leftContent = lines;
    this.viewportHeight = Math.max(lines.length, 10);
  }

  /** Render the left pane content at its fixed position. */
  renderLeftPane(): void {
    if (!this.enabled) {
      for (const line of this.leftContent) {
        console.log(line);
      }
      return;
    }

    for (let i = 0; i < this.leftContent.length; i++) {
      moveTo(i + 1, 1);
      clearLineFromCursor();
      process.stdout.write(this.leftContent[i]);
    }
  }

  /**
   * Draw the vertical separator between panes.
   * @param height - Number of rows to draw
   */
  drawSeparator(height: number): void {
    if (!this.enabled) return;

    const col = this.separatorCol;
    const rows = Math.min(height, this.viewportHeight);
    for (let row = 1; row <= rows; row++) {
      moveTo(row, col);
      process.stdout.write(pc.dim('│'));
    }
  }

  /**
   * Append a line of text to the right pane.
   * If the viewport is full, older lines scroll up.
   */
  appendRight(text: string): void {
    if (!this.enabled) {
      console.log(text);
      return;
    }

    const wrapped = this.wrapText(text, this.rightWidth);
    for (const line of wrapped) {
      // Write into the buffer at the cursor position
      this.rightBuffer[this.rightCursor] = line;
      this.rightCursor++;

      // Re-render the visible viewport
      this.renderRightViewport();
    }
  }

  /**
   * Set the logical cursor to a specific buffer index.
   * Used by prompts to overwrite lines for re-rendering selections.
   */
  setRightRow(row: number): void {
    this.rightCursor = row;
  }

  /**
   * Clear right pane from a given buffer index downward.
   */
  clearRightFrom(row: number): void {
    if (!this.enabled) return;

    // Truncate buffer
    this.rightBuffer.length = row;
    this.rightCursor = row;
    this.renderRightViewport();
  }

  /**
   * Force a full re-render of the right pane viewport.
   * Call after external operations that may have overwritten screen content.
   */
  refreshRight(): void {
    if (!this.enabled) return;
    this.renderRightViewport();
  }

  /**
   * Move cursor below all content for clean exit.
   */
  finalize(): void {
    if (!this.enabled) return;

    const totalRows = Math.max(this.leftContent.length, this.viewportHeight);
    moveTo(totalRows + 1, 1);
    process.stdout.write('\x1b[?25h');
  }

  /**
   * Render the visible portion of the right pane buffer.
   * Shows the last `viewportHeight` lines of the buffer.
   */
  private renderRightViewport(): void {
    const bufLen = this.rightCursor;
    // Determine which lines to show: last viewportHeight lines
    const startIdx = Math.max(0, bufLen - this.viewportHeight);

    for (let vi = 0; vi < this.viewportHeight; vi++) {
      const bufIdx = startIdx + vi;
      const screenRow = this.viewportTop + vi;
      moveTo(screenRow, this.rightCol);
      clearLineFromCursor();
      if (bufIdx < bufLen && this.rightBuffer[bufIdx] !== undefined) {
        process.stdout.write(this.rightBuffer[bufIdx]);
      }
    }
  }

  /**
   * Wrap text to fit within a given width.
   * Preserves ANSI color codes during wrapping.
   */
  private wrapText(text: string, width: number): string[] {
    if (text === '') return [''];

    const visibleLength = stripAnsi(text).length;
    if (visibleLength <= width) {
      return [text];
    }

    const lines: string[] = [];
    let current = '';
    let visLen = 0;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\x1b') {
        const match = text.slice(i).match(/^\x1b\[[0-9;]*m/);
        if (match) {
          current += match[0];
          i += match[0].length - 1;
          continue;
        }
      }

      current += text[i];
      visLen++;

      if (visLen >= width) {
        lines.push(current);
        current = '';
        visLen = 0;
      }
    }

    if (current) {
      lines.push(current);
    }

    return lines;
  }
}

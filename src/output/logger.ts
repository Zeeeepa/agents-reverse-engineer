/**
 * Terminal logger for agents-reverse
 *
 * Provides colored output.
 * Output format follows CONTEXT.md human-readable specification.
 */

import pc from 'picocolors';

/**
 * Logger interface for CLI output.
 */
export interface Logger {
  /** Log an informational message */
  info(message: string): void;

  /** Log a discovered file */
  file(path: string): void;

  /** Log an excluded file with reason */
  excluded(path: string, reason: string, filter: string): void;

  /** Log discovery summary */
  summary(included: number, excluded: number): void;

  /** Log a warning message */
  warn(message: string): void;

  /** Log an error message */
  error(message: string): void;
}

/**
 * Options for creating a logger instance.
 */
export interface LoggerOptions {
  /**
   * Use colors in terminal output.
   * @default true
   */
  colors: boolean;
}

/**
 * Color functions type - either picocolors or identity functions
 */
interface ColorFunctions {
  green: (s: string) => string;
  dim: (s: string) => string;
  red: (s: string) => string;
  bold: (s: string) => string;
  yellow: (s: string) => string;
}

/**
 * Identity function for no-color mode
 */
const identity = (s: string): string => s;

/**
 * No-color formatter that returns strings unchanged
 */
const noColor: ColorFunctions = {
  green: identity,
  dim: identity,
  red: identity,
  bold: identity,
  yellow: identity,
};

/**
 * Create a logger instance with the given options.
 *
 * Output format per CONTEXT.md (human-readable):
 * - file: green "  +" prefix + relative path
 * - excluded: dim "  -" prefix + path + reason (when shown)
 * - summary: bold count + dim excluded count
 * - warn: yellow "Warning:" prefix
 * - error: red "Error:" prefix
 *
 * @param options - Logger configuration
 * @returns Logger instance
 *
 * @example
 * ```typescript
 * const log = createLogger({ colors: true });
 *
 * log.file('src/index.ts');
 * log.summary(42, 10);
 * ```
 */
export function createLogger(options: LoggerOptions): Logger {
  const c: ColorFunctions = options.colors ? pc : noColor;

  return {
    info(message: string): void {
      console.log(message);
    },

    file(path: string): void {
      console.log(c.green('  +') + ' ' + path);
    },

    excluded(path: string, reason: string, filter: string): void {
      console.log(c.dim('  -') + ' ' + path + c.dim(` (${reason}: ${filter})`));
    },

    summary(included: number, excluded: number): void {
      console.log(
        c.bold(`\nDiscovered ${included} files`) +
          c.dim(` (${excluded} excluded)`)
      );
    },

    warn(message: string): void {
      console.warn(c.yellow('Warning: ') + message);
    },

    error(message: string): void {
      console.error(c.red('Error: ') + message);
    },
  };
}

/**
 * Create a silent logger that produces no output.
 *
 * Useful for testing or programmatic usage.
 *
 * @returns Logger instance with all no-op methods
 */
export function createSilentLogger(): Logger {
  const noop = (): void => {};
  return {
    info: noop,
    file: noop,
    excluded: noop,
    summary: noop,
    warn: noop,
    error: noop,
  };
}

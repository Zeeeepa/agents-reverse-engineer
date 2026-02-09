/**
 * Public API for the quality analysis module.
 *
 * Re-exports all quality analysis types and functions from the
 * inconsistency detection and density validation submodules.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type {
  InconsistencySeverity,
  CodeDocInconsistency,
  CodeCodeInconsistency,
  PhantomPathInconsistency,
  Inconsistency,
  InconsistencyReport,
} from './types.js';

// ---------------------------------------------------------------------------
// Inconsistency detection: code-vs-doc
// ---------------------------------------------------------------------------

export { extractExports, checkCodeVsDoc } from './inconsistency/code-vs-doc.js';

// ---------------------------------------------------------------------------
// Inconsistency detection: code-vs-code
// ---------------------------------------------------------------------------

export { checkCodeVsCode } from './inconsistency/code-vs-code.js';

// ---------------------------------------------------------------------------
// Inconsistency reporting
// ---------------------------------------------------------------------------

export { buildInconsistencyReport, formatReportForCli } from './inconsistency/reporter.js';

// ---------------------------------------------------------------------------
// Phantom path detection
// ---------------------------------------------------------------------------

export { checkPhantomPaths } from './phantom-paths/index.js';

// ---------------------------------------------------------------------------
// Density validation
// ---------------------------------------------------------------------------

export { validateFindability } from './density/validator.js';
export type { FindabilityResult } from './density/validator.js';

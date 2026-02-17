/**
 * Implementation quality metrics extraction.
 *
 * Analyzes a worktree after AI implementation to extract quantitative
 * metrics: files created/modified, lines changed, commit count, and
 * optional test/build/lint results.
 *
 * @module
 */

import { simpleGit } from 'simple-git';
import { runSubprocess } from '../ai/subprocess.js';
import type { ImplementationMetrics } from './types.js';

/**
 * Options for metric extraction.
 */
interface MetricOptions {
  /** Git ref (SHA) captured before the AI run — used as base for diff and commit counting */
  baseRef?: string;
  runTests?: boolean;
  runBuild?: boolean;
  runLint?: boolean;
  debug?: boolean;
}

/**
 * Extract implementation metrics from a worktree after an AI run.
 *
 * Uses git to measure code changes and optionally runs test/build/lint
 * commands to assess quality.
 *
 * @param cwd - Path to the worktree
 * @param options - Which quality checks to run
 * @returns Extracted metrics
 */
export async function extractImplementationMetrics(
  cwd: string,
  options: MetricOptions = {},
): Promise<ImplementationMetrics> {
  const git = simpleGit(cwd);

  // Get git diff stats against the initial branch point
  let linesAdded = 0;
  let linesDeleted = 0;
  let filesCreated = 0;
  let filesModified = 0;
  let commitCount = 0;

  const { baseRef } = options;

  if (baseRef) {
    // Diff all changes since the pre-implementation snapshot
    try {
      const diffSummary = await git.diffSummary([baseRef, 'HEAD']);
      linesAdded = diffSummary.insertions;
      linesDeleted = diffSummary.deletions;
      filesCreated = diffSummary.files.filter(f => 'insertions' in f && f.insertions > 0 && f.deletions === 0).length;
      filesModified = diffSummary.files.filter(f => 'deletions' in f && f.deletions > 0).length;
    } catch {
      // Fall through to status-based detection
    }

    // Count commits made by the AI (everything after baseRef)
    try {
      const log = await git.log([`${baseRef}..HEAD`]);
      commitCount = log.all.length;
    } catch {
      // No log data
    }
  } else {
    // Legacy fallback: no baseRef provided
    try {
      const diffSummary = await git.diffSummary(['HEAD~1']);
      linesAdded = diffSummary.insertions;
      linesDeleted = diffSummary.deletions;
      filesCreated = diffSummary.files.filter(f => 'insertions' in f && f.insertions > 0 && f.deletions === 0).length;
      filesModified = diffSummary.files.filter(f => 'deletions' in f && f.deletions > 0).length;
    } catch {
      try {
        const status = await git.status();
        filesCreated = status.not_added.length + status.created.length;
        filesModified = status.modified.length;
      } catch {
        // No git data available
      }
    }

    try {
      const log = await git.log();
      commitCount = Math.max(0, log.all.length - 1);
    } catch {
      // No log data
    }
  }

  // Test metrics
  let testsCreated = 0;
  let testsPassing = 0;
  let testsFailing = 0;

  if (options.runTests) {
    const testResult = await runTestSuite(cwd, options.debug);
    testsCreated = testResult.totalTests;
    testsPassing = testResult.passing;
    testsFailing = testResult.failing;
  }

  // Lint metrics
  let lintErrors = 0;
  let lintWarnings = 0;

  if (options.runLint) {
    const lintResult = await runLinter(cwd, options.debug);
    lintErrors = lintResult.errors;
    lintWarnings = lintResult.warnings;
  }

  // Build check
  let buildSuccess = false;

  if (options.runBuild) {
    buildSuccess = await runBuild(cwd, options.debug);
  }

  return {
    filesCreated,
    filesModified,
    linesAdded,
    linesDeleted,
    testsCreated,
    testsPassing,
    testsFailing,
    lintErrors,
    lintWarnings,
    buildSuccess,
    commitCount,
  };
}

/**
 * Run the project's test suite and parse results.
 */
async function runTestSuite(cwd: string, debug?: boolean): Promise<{
  totalTests: number;
  passing: number;
  failing: number;
}> {
  try {
    const result = await runSubprocess('npm', ['test'], {
      cwd,
      timeoutMs: 300_000, // 5 minutes
    });

    const output = result.stdout + result.stderr;
    // Vitest/Jest pattern: "Tests  X passed" / "X failed"
    const passMatch = output.match(/(\d+)\s+pass(?:ed|ing)/i);
    const failMatch = output.match(/(\d+)\s+fail(?:ed|ing)/i);

    const passing = passMatch ? parseInt(passMatch[1], 10) : 0;
    const failing = failMatch ? parseInt(failMatch[1], 10) : 0;

    return {
      totalTests: passing + failing,
      passing,
      failing,
    };
  } catch (error) {
    if (debug) {
      console.error(`[metrics] Test execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { totalTests: 0, passing: 0, failing: 0 };
  }
}

/**
 * Run the project's linter and parse results.
 */
async function runLinter(cwd: string, debug?: boolean): Promise<{
  errors: number;
  warnings: number;
}> {
  try {
    const result = await runSubprocess('npm', ['run', 'lint'], {
      cwd,
      timeoutMs: 120_000, // 2 minutes
    });

    const output = result.stdout + result.stderr;
    const errorMatch = output.match(/(\d+)\s+error/i);
    const warningMatch = output.match(/(\d+)\s+warning/i);

    return {
      errors: errorMatch ? parseInt(errorMatch[1], 10) : 0,
      warnings: warningMatch ? parseInt(warningMatch[1], 10) : 0,
    };
  } catch (error) {
    if (debug) {
      console.error(`[metrics] Lint execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { errors: 0, warnings: 0 };
  }
}

/**
 * Run the project's build command and check success.
 */
async function runBuild(cwd: string, debug?: boolean): Promise<boolean> {
  try {
    const result = await runSubprocess('npm', ['run', 'build'], {
      cwd,
      timeoutMs: 300_000, // 5 minutes
    });
    return result.exitCode === 0;
  } catch (error) {
    if (debug) {
      console.error(`[metrics] Build execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return false;
  }
}

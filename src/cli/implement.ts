/**
 * `are implement` CLI command handler.
 *
 * Orchestrates the full implementation comparison workflow:
 * 1. Load existing plan from `are plan` results
 * 2. Re-create worktree pair from plan branches
 * 3. Run AI implementation in each worktree (without-docs first)
 * 4. Extract metrics (files, lines, commits, optional tests/build/lint)
 * 5. Save results and render comparison
 * 6. Optionally run AI evaluator (--eval)
 *
 * @module
 */

import path from 'node:path';
import pc from 'picocolors';
import { findProjectRoot, loadConfig } from '../config/loader.js';
import { createBackendRegistry, resolveBackend } from '../ai/registry.js';
import { createLogger } from '../output/logger.js';
import {
  loadComparison as loadPlanById,
  loadPlanText,
  listComparisons as listPlanComparisons,
} from '../plan/storage.js';
import { slugify, createWorktreePair } from '../plan/index.js';
import {
  executeImplementation,
  evaluateImplementations,
  saveComparison,
  loadComparison,
  listComparisons,
  renderComparison,
  renderHeader,
  renderPhaseStart,
  renderPhaseComplete,
  renderList,
} from '../implement/index.js';
import type { ImplementOptions, ComparisonDeltas, ImplementationComparison } from '../implement/types.js';

/**
 * Execute the `are implement` command.
 *
 * @param task - The task description (or empty if using --list/--show)
 * @param targetPath - Project root directory
 * @param options - Command options
 */
export async function implementCommand(
  task: string,
  targetPath: string,
  options: ImplementOptions,
): Promise<void> {
  const projectRoot = await findProjectRoot(path.resolve(targetPath || process.cwd()));
  const logger = createLogger({ colors: true });
  const config = await loadConfig(projectRoot, { debug: options.debug });

  // Handle --list
  if (options.list) {
    const comparisons = await listComparisons(projectRoot);
    renderList(comparisons);
    return;
  }

  // Handle --show
  if (options.show) {
    const comparison = await loadComparison(projectRoot, options.show);
    if (!comparison) {
      logger.error(`No implementation comparison found matching "${options.show}".`);
      logger.info('Run `are implement --list` to see available comparisons.');
      process.exit(1);
    }
    renderHeader(comparison.task, comparison.model, comparison.backend, comparison.branches);
    renderComparison(comparison);
    return;
  }

  // Resolve backend and model
  const registry = createBackendRegistry();
  const backendName = options.backend ?? config.ai.backend;
  const backend = await resolveBackend(registry, backendName);
  const model = options.model ?? config.ai.model;

  // Resolve plan: by --plan-id (exact ID), by --task-slug, or by slugified task
  let planMatch;
  if (options.planId) {
    planMatch = await loadPlanById(projectRoot, options.planId);
    if (!planMatch) {
      logger.error(`No plan found with ID "${options.planId}".`);
      logger.info('Run `are plan --list` to see available plans.');
      process.exit(1);
    }
    // Use plan's stored task when no explicit task provided
    if (!task) {
      task = planMatch.task;
    }
  } else if (!task) {
    logger.error('A task description is required (or use --plan-id <id>).');
    logger.info('Usage: are implement "<task description>" [options]');
    logger.info('       are implement --plan-id <id> [options]');
    logger.info('       are implement --list');
    logger.info('       are implement --show <id>');
    process.exit(1);
  } else {
    const taskSlug = options.taskSlug || slugify(task);
    const planComparisons = await listPlanComparisons(projectRoot);
    planMatch = planComparisons.find(c => c.taskSlug === taskSlug);
    if (!planMatch) {
      logger.error(`No plan found for task slug "${taskSlug}".`);
      logger.info('Run `are plan "<task>"` first, or use --plan-id <id>.');
      process.exit(1);
    }
  }

  const taskSlug = planMatch.taskSlug;
  const withDocsBranch = `are/plan/with-docs/${taskSlug}`;
  const withoutDocsBranch = `are/plan/without-docs/${taskSlug}`;

  const withDocsPlan = await loadPlanText(projectRoot, planMatch.id, 'with-docs');
  const withoutDocsPlan = await loadPlanText(projectRoot, planMatch.id, 'without-docs');

  if (!withDocsPlan || !withoutDocsPlan) {
    logger.error('Plan text files not found. The plan comparison may be corrupted.');
    logger.info('Run `are plan "<task>"` again to regenerate.');
    process.exit(1);
  }

  // Dry run: show what would happen
  if (options.dryRun) {
    console.log(pc.bold('=== Implementation Comparison (dry run) ==='));
    console.log(`Task: "${task}"`);
    console.log(`Slug: ${taskSlug}`);
    console.log(`Model: ${model}  Backend: ${backend.name}`);
    console.log('');
    console.log('Would execute implementation in branches:');
    console.log(`  ${withDocsBranch}`);
    console.log(`  ${withoutDocsBranch}`);
    if (options.eval) {
      console.log('Would run quality evaluator on both implementations');
    }
    if (options.runTests) console.log('Would run test suite');
    if (options.runBuild) console.log('Would run build');
    if (options.runLint) console.log('Would run linter');
    console.log('');
    console.log(pc.yellow('Dry run \u2014 no actions taken.'));
    return;
  }

  const startTime = new Date().toISOString();

  // Render header
  renderHeader(task, model, backend.name, {
    withDocs: withDocsBranch,
    withoutDocs: withoutDocsBranch,
  });

  // Re-create worktrees from existing plan branches
  let worktrees;
  try {
    worktrees = await createWorktreePair(projectRoot, taskSlug, false);
  } catch (error) {
    // Branches may already exist from the plan — try with force
    try {
      worktrees = await createWorktreePair(projectRoot, taskSlug, true);
    } catch (retryError) {
      logger.error((retryError as Error).message);
      process.exit(1);
    }
  }

  // Register cleanup on abort
  let cleanedUp = false;
  const doCleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    await worktrees.cleanup();
  };
  process.once('SIGINT', () => { doCleanup().finally(() => process.exit(1)); });
  process.once('SIGTERM', () => { doCleanup().finally(() => process.exit(1)); });

  try {
    // Phase 1: Implement WITHOUT docs
    renderPhaseStart(1, 2, 'Implementing WITHOUT documentation...');
    const withoutDocsResult = await executeImplementation({
      task,
      planText: withoutDocsPlan,
      cwd: worktrees.withoutDocsPath,
      model,
      debug: options.debug,
      runTests: options.runTests,
      runBuild: options.runBuild,
      runLint: options.runLint,
    });
    renderPhaseComplete(
      withoutDocsResult.latencyMs,
      withoutDocsResult.outputTokens,
      withoutDocsResult.cost.totalCost,
      withoutDocsResult.success,
    );

    // Phase 2: Implement WITH docs
    renderPhaseStart(2, 2, 'Implementing WITH documentation...');
    const withDocsResult = await executeImplementation({
      task,
      planText: withDocsPlan,
      cwd: worktrees.withDocsPath,
      model,
      debug: options.debug,
      runTests: options.runTests,
      runBuild: options.runBuild,
      runLint: options.runLint,
    });
    renderPhaseComplete(
      withDocsResult.latencyMs,
      withDocsResult.outputTokens,
      withDocsResult.cost.totalCost,
      withDocsResult.success,
    );

    // Extract logs for storage
    const withDocsLog = withDocsResult.implementationLog || `[Failed: ${withDocsResult.error}]`;
    const withoutDocsLog = withoutDocsResult.implementationLog || `[Failed: ${withoutDocsResult.error}]`;

    // Run evaluation if requested
    let evaluation = null;
    if (options.eval && withDocsResult.success && withoutDocsResult.success) {
      console.log(pc.bold('Running quality evaluation...'));
      const evalModel = options.evalModel ?? model;
      evaluation = await evaluateImplementations(
        task,
        withDocsLog,
        withoutDocsLog,
        evalModel,
        options.debug,
      );
      if (evaluation) {
        console.log(pc.green('  \u2713 Evaluation complete'));
      } else {
        console.log(pc.yellow('  \u2717 Evaluation failed (results saved without eval)'));
      }
      console.log('');
    }

    // Compute deltas
    const deltas: ComparisonDeltas = {
      costDelta: withDocsResult.cost.totalCost - withoutDocsResult.cost.totalCost,
      latencyDelta: withDocsResult.latencyMs - withoutDocsResult.latencyMs,
      filesCreatedRatio: withoutDocsResult.metrics.filesCreated > 0
        ? withDocsResult.metrics.filesCreated / withoutDocsResult.metrics.filesCreated
        : null,
      testPassingRatio: withoutDocsResult.metrics.testsPassing > 0
        ? withDocsResult.metrics.testsPassing / withoutDocsResult.metrics.testsPassing
        : null,
      qualityScoreDelta: evaluation
        ? (evaluation.planALabel === 'withDocs'
          ? evaluation.totalScoreA - evaluation.totalScoreB
          : evaluation.totalScoreB - evaluation.totalScoreA)
        : null,
    };

    // Build comparison record
    const comparisonId = startTime.replace(/[:.]/g, '-');
    const comparison: ImplementationComparison = {
      id: comparisonId,
      startTime,
      endTime: new Date().toISOString(),
      task,
      taskSlug,
      backend: backend.name,
      model,
      branches: {
        withDocs: withDocsBranch,
        withoutDocs: withoutDocsBranch,
      },
      withDocs: withDocsResult,
      withoutDocs: withoutDocsResult,
      evaluation,
      deltas,
    };

    // Save to disk
    await saveComparison(projectRoot, comparison, withDocsLog, withoutDocsLog);

    // Render results
    renderComparison(comparison);
  } finally {
    // Always clean up worktrees (branches are kept)
    await doCleanup();
  }
}

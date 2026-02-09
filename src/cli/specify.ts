/**
 * CLI specify command
 *
 * Generates a project specification from AGENTS.md documentation by:
 * 1. Loading configuration
 * 2. Collecting all AGENTS.md files (auto-generating if none exist)
 * 3. Building a synthesis prompt from the collected docs
 * 4. Resolving an AI CLI backend and calling the AI service
 * 5. Writing the specification to disk (single or multi-file)
 *
 * With --dry-run, shows input statistics without making any AI calls.
 */

import * as path from 'node:path';
import pc from 'picocolors';
import { loadConfig } from '../config/loader.js';
import { collectAgentsDocs } from '../generation/collector.js';
import { buildSpecPrompt, writeSpec, SpecExistsError } from '../specify/index.js';
import {
  AIService,
  AIServiceError,
  createBackendRegistry,
  resolveBackend,
  getInstallInstructions,
} from '../ai/index.js';
import { generateCommand } from './generate.js';

/**
 * Options for the specify command.
 */
export interface SpecifyOptions {
  /** Custom output path (default: specs/SPEC.md) */
  output?: string;
  /** Overwrite existing specs */
  force?: boolean;
  /** Show plan without calling AI */
  dryRun?: boolean;
  /** Split output into multiple files */
  multiFile?: boolean;
  /** Show verbose debug info */
  debug?: boolean;
  /** Enable tracing */
  trace?: boolean;
}

/**
 * Specify command - collects AGENTS.md documentation, synthesizes it via AI,
 * and writes a comprehensive project specification.
 *
 * @param targetPath - Directory to generate specification for
 * @param options - Command options (output, force, dryRun, multiFile, debug, trace)
 */
export async function specifyCommand(
  targetPath: string,
  options: SpecifyOptions,
): Promise<void> {
  const absolutePath = path.resolve(targetPath);
  const outputPath = options.output
    ? path.resolve(options.output)
    : path.join(absolutePath, 'specs', 'SPEC.md');

  // Load configuration
  const config = await loadConfig(absolutePath, { debug: options.debug });

  // Collect AGENTS.md files
  let docs = await collectAgentsDocs(absolutePath);

  // ---------------------------------------------------------------------------
  // Dry-run mode: show summary without calling AI or generating
  // ---------------------------------------------------------------------------

  if (options.dryRun) {
    const totalChars = docs.reduce((sum, d) => sum + d.content.length, 0);
    const estimatedTokensK = Math.ceil(totalChars / 4) / 1000;

    console.log(pc.bold('\n--- Dry Run Summary ---\n'));
    console.log(`  AGENTS.md files:   ${pc.cyan(String(docs.length))}`);
    console.log(`  Total input:       ${pc.cyan(`~${estimatedTokensK}K tokens`)}`);
    console.log(`  Output:            ${pc.cyan(outputPath)}`);
    console.log(`  Mode:              ${pc.cyan(options.multiFile ? 'multi-file' : 'single-file')}`);
    console.log('');
    console.log(pc.dim('No AI calls made (dry run).'));

    if (docs.length === 0) {
      console.log('');
      console.log(pc.yellow('Warning: No AGENTS.md files found. Run `are generate` first or omit --dry-run to auto-generate.'));
    } else if (estimatedTokensK > 150) {
      console.log('');
      console.log(pc.yellow('Warning: Input exceeds 150K tokens. Consider using a model with extended context.'));
    }

    return;
  }

  // Auto-generate if no AGENTS.md files exist
  if (docs.length === 0) {
    console.log(pc.yellow('No AGENTS.md files found. Running generate first...'));
    await generateCommand(targetPath, {
      debug: options.debug,
      trace: options.trace,
    });
    docs = await collectAgentsDocs(absolutePath);
    if (docs.length === 0) {
      console.error(pc.red('Error: No AGENTS.md files found after generation. Cannot proceed.'));
      process.exit(1);
    }
  }

  // ---------------------------------------------------------------------------
  // Resolve backend and run AI synthesis
  // ---------------------------------------------------------------------------

  const registry = createBackendRegistry();
  let backend;
  try {
    backend = await resolveBackend(registry, config.ai.backend);
  } catch (error) {
    if (error instanceof AIServiceError && error.code === 'CLI_NOT_FOUND') {
      console.error(pc.red('Error: No AI CLI found.\n'));
      console.error(getInstallInstructions(registry));
      process.exit(2);
    }
    throw error;
  }

  // Debug: log backend info
  if (options.debug) {
    console.error(pc.dim(`[debug] Backend: ${backend.name}`));
    console.error(pc.dim(`[debug] CLI command: ${backend.cliCommand}`));
    console.error(pc.dim(`[debug] Model: ${config.ai.model}`));
  }

  // Create AI service with extended timeout (spec generation takes longer)
  const aiService = new AIService(backend, {
    timeoutMs: Math.max(config.ai.timeoutMs, 600_000),
    maxRetries: config.ai.maxRetries,
    model: config.ai.model,
    telemetry: { keepRuns: config.ai.telemetry.keepRuns },
  });

  if (options.debug) {
    aiService.setDebug(true);
  }

  // Build prompt from collected docs
  const prompt = buildSpecPrompt(docs);

  if (options.debug) {
    console.error(pc.dim(`[debug] System prompt: ${prompt.system.length} chars`));
    console.error(pc.dim(`[debug] User prompt: ${prompt.user.length} chars`));
  }

  console.log(pc.bold('Generating specification...'));
  console.log(pc.dim('This may take several minutes depending on project size.'));

  const response = await aiService.call({
    prompt: prompt.user,
    systemPrompt: prompt.system,
    taskLabel: 'specify',
  });

  // ---------------------------------------------------------------------------
  // Write output
  // ---------------------------------------------------------------------------

  try {
    const writtenFiles = await writeSpec(response.text, {
      outputPath,
      force: options.force ?? false,
      multiFile: options.multiFile ?? false,
    });

    console.log('');
    console.log(pc.green(pc.bold('Specification written successfully:')));
    for (const file of writtenFiles) {
      console.log(pc.green(`  ${file}`));
    }
  } catch (error) {
    if (error instanceof SpecExistsError) {
      console.error(pc.red(error.message));
      process.exit(1);
    }
    throw error;
  }

  // ---------------------------------------------------------------------------
  // Finalize telemetry
  // ---------------------------------------------------------------------------

  const { summary } = await aiService.finalize(absolutePath);

  console.log('');
  console.log(pc.dim(
    `Tokens: ${summary.totalInputTokens} in / ${summary.totalOutputTokens} out` +
    ` | Duration: ${(summary.totalDurationMs / 1000).toFixed(1)}s` +
    ` | Output: ${outputPath}`,
  ));
}

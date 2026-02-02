/**
 * Plan executor for documentation generation
 *
 * Outputs tasks in a format suitable for AI agent execution:
 * - File tasks as individual analysis jobs
 * - Directory completion tracking
 * - Streaming JSON output for incremental processing
 */

import * as path from 'node:path';
import { readdir } from 'node:fs/promises';
import type { GenerationPlan, AnalysisTask, PreparedFile } from './orchestrator.js';
import type { PackageRoot } from './complexity.js';
import { getSumPath, sumFileExists } from './writers/sum.js';

/**
 * Execution task ready for AI processing.
 */
export interface ExecutionTask {
  /** Unique task ID */
  id: string;
  /** Task type */
  type: 'file' | 'chunk' | 'synthesis' | 'directory' | 'root-doc';
  /** File or directory path (relative) */
  path: string;
  /** Absolute path */
  absolutePath: string;
  /** System prompt for AI */
  systemPrompt: string;
  /** User prompt for AI */
  userPrompt: string;
  /** Dependencies (task IDs that must complete first) */
  dependencies: string[];
  /** Output path for generated content */
  outputPath: string;
  /** Metadata for tracking */
  metadata: {
    fileType?: string;
    chunkInfo?: {
      index: number;
      total: number;
    };
    directoryFiles?: string[];
    /** Directory depth (for post-order traversal) */
    depth?: number;
    /** Package root path (for supplementary docs) */
    packageRoot?: string;
  };
}

/**
 * Execution plan with dependency graph.
 */
export interface ExecutionPlan {
  /** Project root */
  projectRoot: string;
  /** All tasks in execution order */
  tasks: ExecutionTask[];
  /** File tasks (can run in parallel) */
  fileTasks: ExecutionTask[];
  /** Directory tasks (depend on file tasks) */
  directoryTasks: ExecutionTask[];
  /** Root document tasks (depend on directories) */
  rootTasks: ExecutionTask[];
  /** Directory to file mapping */
  directoryFileMap: Record<string, string[]>;
  /** Whether to generate ARCHITECTURE.md */
  generateArchitecture: boolean;
  /** Whether to generate STACK.md */
  generateStack: boolean;
  /** Whether to generate STRUCTURE.md */
  generateStructure: boolean;
  /** Whether to generate CONVENTIONS.md */
  generateConventions: boolean;
  /** Whether to generate TESTING.md */
  generateTesting: boolean;
  /** Whether to generate INTEGRATIONS.md */
  generateIntegrations: boolean;
  /** Whether to generate CONCERNS.md */
  generateConcerns: boolean;
  /** Package roots where supplementary docs will be generated */
  packageRoots: PackageRoot[];
}

/**
 * Calculate directory depth (number of path segments).
 * Root "." has depth 0, "src" has depth 1, "src/cli" has depth 2, etc.
 */
function getDirectoryDepth(dir: string): number {
  if (dir === '.') return 0;
  return dir.split(path.sep).length;
}

/**
 * Build execution plan from generation plan.
 *
 * Directory tasks are sorted using post-order traversal (deepest directories first)
 * so child AGENTS.md files are generated before their parents.
 */
export function buildExecutionPlan(
  plan: GenerationPlan,
  projectRoot: string
): ExecutionPlan {
  const fileTasks: ExecutionTask[] = [];
  const directoryTasks: ExecutionTask[] = [];
  const rootTasks: ExecutionTask[] = [];
  const directoryFileMap: Record<string, string[]> = {};

  // Track files by directory
  for (const file of plan.files) {
    const dir = path.dirname(file.relativePath);
    if (!directoryFileMap[dir]) {
      directoryFileMap[dir] = [];
    }
    directoryFileMap[dir].push(file.relativePath);
  }

  // Create file tasks
  for (const task of plan.tasks) {
    if (task.type === 'file' || task.type === 'chunk') {
      const absolutePath = path.join(projectRoot, task.filePath);
      const file = plan.files.find(f => f.relativePath === task.filePath);

      fileTasks.push({
        id: `file:${task.filePath}${task.chunkInfo ? `:chunk${task.chunkInfo.index}` : ''}`,
        type: task.type,
        path: task.filePath,
        absolutePath,
        systemPrompt: task.systemPrompt,
        userPrompt: task.userPrompt,
        dependencies: [],
        outputPath: `${absolutePath}.sum`,
        metadata: {
          fileType: file?.fileType,
          chunkInfo: task.chunkInfo,
        },
      });
    }
  }

  // Create directory tasks in post-order (deepest first)
  // Sort directories by depth descending so children are processed before parents
  const sortedDirs = Object.entries(directoryFileMap).sort(
    ([dirA], [dirB]) => getDirectoryDepth(dirB) - getDirectoryDepth(dirA)
  );

  for (const [dir, files] of sortedDirs) {
    const dirAbsPath = path.join(projectRoot, dir);
    const fileTaskIds = files.map(f => `file:${f}`);

    directoryTasks.push({
      id: `dir:${dir}`,
      type: 'directory',
      path: dir,
      absolutePath: dirAbsPath,
      systemPrompt: `You are generating AGENTS.md for a directory.
Read all .sum files in this directory and create a comprehensive directory overview.
Group files by purpose, describe the directory's role, and note patterns.`,
      userPrompt: `Generate AGENTS.md for directory "${dir}" containing ${files.length} analyzed files.
First verify all .sum files exist, then synthesize them into a directory overview.`,
      dependencies: fileTaskIds,
      outputPath: path.join(dirAbsPath, 'AGENTS.md'),
      metadata: {
        directoryFiles: files,
        depth: getDirectoryDepth(dir),
      },
    });
  }

  // Create root document tasks
  const allDirTaskIds = Object.keys(directoryFileMap).map(d => `dir:${d}`);

  rootTasks.push({
    id: 'root:CLAUDE.md',
    type: 'root-doc',
    path: 'CLAUDE.md',
    absolutePath: path.join(projectRoot, 'CLAUDE.md'),
    systemPrompt: `You are generating CLAUDE.md, the main project documentation entry point.
Synthesize all AGENTS.md files into a comprehensive project overview.
Include: project purpose, architecture overview, key directories, getting started.`,
    userPrompt: `Generate CLAUDE.md for the project root.
Read all AGENTS.md files and create a unified project documentation.`,
    dependencies: allDirTaskIds,
    outputPath: path.join(projectRoot, 'CLAUDE.md'),
    metadata: {},
  });

  if (plan.generateArchitecture) {
    rootTasks.push({
      id: 'root:ARCHITECTURE.md',
      type: 'root-doc',
      path: 'ARCHITECTURE.md',
      absolutePath: path.join(projectRoot, 'ARCHITECTURE.md'),
      systemPrompt: `You are generating ARCHITECTURE.md, documenting the project's technical architecture.
Analyze the codebase structure and create a detailed architecture document.
Include: system design, component relationships, data flow, patterns used.`,
      userPrompt: `Generate ARCHITECTURE.md documenting the project architecture.
Base this on the directory structure and file summaries.`,
      dependencies: allDirTaskIds,
      outputPath: path.join(projectRoot, 'ARCHITECTURE.md'),
      metadata: {},
    });
  }

  // Generate supplementary docs for each package root
  for (const pkgRoot of plan.packageRoots) {
    const pkgAbsPath = pkgRoot.absolutePath;
    const pkgPrefix = pkgRoot.path ? `pkg:${pkgRoot.path}` : 'root';
    const pkgLabel = pkgRoot.path || 'root';

    // Get directory task IDs relevant to this package root
    const pkgDirTaskIds = Object.keys(directoryFileMap)
      .filter(d => {
        if (!pkgRoot.path) return true; // Root package includes all dirs
        return d.startsWith(pkgRoot.path + path.sep) || d === pkgRoot.path;
      })
      .map(d => `dir:${d}`);

    if (plan.generateStack && pkgRoot.type === 'node') {
      rootTasks.push({
        id: `${pkgPrefix}:STACK.md`,
        type: 'root-doc',
        path: pkgRoot.path ? path.join(pkgRoot.path, 'STACK.md') : 'STACK.md',
        absolutePath: path.join(pkgAbsPath, 'STACK.md'),
        systemPrompt: `You are generating STACK.md for "${pkgLabel}", documenting the technology stack.
Analyze package.json and the codebase to document all technologies used.
Include: frameworks, libraries, dev tools, and their purposes.`,
        userPrompt: `Generate STACK.md documenting the technology stack for "${pkgLabel}".
Read package.json and analyze dependencies.`,
        dependencies: pkgRoot.path ? [] : ['root:CLAUDE.md'],
        outputPath: path.join(pkgAbsPath, 'STACK.md'),
        metadata: { packageRoot: pkgRoot.path },
      });
    }

    if (plan.generateStructure) {
      rootTasks.push({
        id: `${pkgPrefix}:STRUCTURE.md`,
        type: 'root-doc',
        path: pkgRoot.path ? path.join(pkgRoot.path, 'STRUCTURE.md') : 'STRUCTURE.md',
        absolutePath: path.join(pkgAbsPath, 'STRUCTURE.md'),
        systemPrompt: `You are generating STRUCTURE.md for "${pkgLabel}", documenting the codebase structure.
Analyze the directory layout and organization patterns.
Include: directory overview, entry points, key modules, and organization patterns.`,
        userPrompt: `Generate STRUCTURE.md documenting the codebase structure for "${pkgLabel}".
Describe how the package is organized and where key functionality lives.`,
        dependencies: pkgDirTaskIds,
        outputPath: path.join(pkgAbsPath, 'STRUCTURE.md'),
        metadata: { packageRoot: pkgRoot.path },
      });
    }

    if (plan.generateConventions) {
      rootTasks.push({
        id: `${pkgPrefix}:CONVENTIONS.md`,
        type: 'root-doc',
        path: pkgRoot.path ? path.join(pkgRoot.path, 'CONVENTIONS.md') : 'CONVENTIONS.md',
        absolutePath: path.join(pkgAbsPath, 'CONVENTIONS.md'),
        systemPrompt: `You are generating CONVENTIONS.md for "${pkgLabel}", documenting coding conventions and patterns.
Analyze the codebase for naming conventions, code style, and common patterns.
Include: naming conventions, file patterns, module system, and common code patterns.`,
        userPrompt: `Generate CONVENTIONS.md documenting coding conventions for "${pkgLabel}".
Describe the code style and patterns used in this package.`,
        dependencies: pkgDirTaskIds,
        outputPath: path.join(pkgAbsPath, 'CONVENTIONS.md'),
        metadata: { packageRoot: pkgRoot.path },
      });
    }

    if (plan.generateTesting) {
      rootTasks.push({
        id: `${pkgPrefix}:TESTING.md`,
        type: 'root-doc',
        path: pkgRoot.path ? path.join(pkgRoot.path, 'TESTING.md') : 'TESTING.md',
        absolutePath: path.join(pkgAbsPath, 'TESTING.md'),
        systemPrompt: `You are generating TESTING.md for "${pkgLabel}", documenting the testing approach and coverage.
Analyze the test framework(s), test directories, and testing patterns.
Include: testing frameworks, test directories, patterns, coverage tools, and test strategy.`,
        userPrompt: `Generate TESTING.md documenting the testing approach for "${pkgLabel}".
Describe how tests are organized and run in this package.`,
        dependencies: pkgDirTaskIds,
        outputPath: path.join(pkgAbsPath, 'TESTING.md'),
        metadata: { packageRoot: pkgRoot.path },
      });
    }

    if (plan.generateIntegrations) {
      rootTasks.push({
        id: `${pkgPrefix}:INTEGRATIONS.md`,
        type: 'root-doc',
        path: pkgRoot.path ? path.join(pkgRoot.path, 'INTEGRATIONS.md') : 'INTEGRATIONS.md',
        absolutePath: path.join(pkgAbsPath, 'INTEGRATIONS.md'),
        systemPrompt: `You are generating INTEGRATIONS.md for "${pkgLabel}", documenting external dependencies and APIs.
Analyze ${pkgRoot.type === 'node' ? 'package.json' : pkgRoot.manifestFile} and code for database connections, API clients, and third-party services.
Include: databases, external APIs, third-party services, and environment variables.`,
        userPrompt: `Generate INTEGRATIONS.md documenting external integrations for "${pkgLabel}".
Describe the external services and APIs this package connects to.`,
        dependencies: pkgDirTaskIds,
        outputPath: path.join(pkgAbsPath, 'INTEGRATIONS.md'),
        metadata: { packageRoot: pkgRoot.path },
      });
    }

    if (plan.generateConcerns) {
      rootTasks.push({
        id: `${pkgPrefix}:CONCERNS.md`,
        type: 'root-doc',
        path: pkgRoot.path ? path.join(pkgRoot.path, 'CONCERNS.md') : 'CONCERNS.md',
        absolutePath: path.join(pkgAbsPath, 'CONCERNS.md'),
        systemPrompt: `You are generating CONCERNS.md for "${pkgLabel}", documenting technical debt and known issues.
Identify areas needing attention: missing docs, complex code, improvement opportunities.
Include: missing documentation, technical debt, known issues, and improvement areas.`,
        userPrompt: `Generate CONCERNS.md documenting technical concerns for "${pkgLabel}".
Identify technical debt and areas that need attention in this package.`,
        dependencies: pkgDirTaskIds,
        outputPath: path.join(pkgAbsPath, 'CONCERNS.md'),
        metadata: { packageRoot: pkgRoot.path },
      });
    }
  }

  return {
    projectRoot,
    tasks: [...fileTasks, ...directoryTasks, ...rootTasks],
    fileTasks,
    directoryTasks,
    rootTasks,
    directoryFileMap,
    generateArchitecture: plan.generateArchitecture,
    generateStack: plan.generateStack,
    generateStructure: plan.generateStructure,
    generateConventions: plan.generateConventions,
    generateTesting: plan.generateTesting,
    generateIntegrations: plan.generateIntegrations,
    generateConcerns: plan.generateConcerns,
    packageRoots: plan.packageRoots,
  };
}

/**
 * Check if all files in a directory have been analyzed (.sum files exist).
 */
export async function isDirectoryComplete(
  dirPath: string,
  expectedFiles: string[],
  projectRoot: string
): Promise<{ complete: boolean; missing: string[] }> {
  const missing: string[] = [];

  for (const relativePath of expectedFiles) {
    const absolutePath = path.join(projectRoot, relativePath);
    const exists = await sumFileExists(absolutePath);
    if (!exists) {
      missing.push(relativePath);
    }
  }

  return {
    complete: missing.length === 0,
    missing,
  };
}

/**
 * Get all directories that are ready for AGENTS.md generation.
 * A directory is ready when all its files have .sum files.
 */
export async function getReadyDirectories(
  executionPlan: ExecutionPlan
): Promise<string[]> {
  const ready: string[] = [];

  for (const [dir, files] of Object.entries(executionPlan.directoryFileMap)) {
    const { complete } = await isDirectoryComplete(
      dir,
      files,
      executionPlan.projectRoot
    );
    if (complete) {
      ready.push(dir);
    }
  }

  return ready;
}

/**
 * Output execution plan as JSON for AI consumption.
 */
export function formatExecutionPlanAsJson(plan: ExecutionPlan): string {
  return JSON.stringify({
    projectRoot: plan.projectRoot,
    summary: {
      totalTasks: plan.tasks.length,
      fileTasks: plan.fileTasks.length,
      directoryTasks: plan.directoryTasks.length,
      rootTasks: plan.rootTasks.length,
      directories: Object.keys(plan.directoryFileMap).length,
      traversal: 'post-order (deepest first)',
    },
    directoryFileMap: plan.directoryFileMap,
    fileTasks: plan.fileTasks.map(t => ({
      id: t.id,
      path: t.path,
      absolutePath: t.absolutePath,
      outputPath: t.outputPath,
      systemPrompt: t.systemPrompt,
      userPrompt: t.userPrompt,
      fileType: t.metadata.fileType,
    })),
    directoryTasks: plan.directoryTasks.map(t => ({
      id: t.id,
      path: t.path,
      depth: t.metadata.depth,
      absolutePath: t.absolutePath,
      outputPath: t.outputPath,
      dependencies: t.dependencies,
      files: t.metadata.directoryFiles,
    })),
    rootTasks: plan.rootTasks.map(t => ({
      id: t.id,
      path: t.path,
      outputPath: t.outputPath,
      dependencies: t.dependencies,
    })),
  }, null, 2);
}

/**
 * Output tasks for streaming execution (one task per line as JSON).
 */
export function* streamTasks(plan: ExecutionPlan): Generator<string> {
  // First, yield all file tasks (can be parallelized)
  yield JSON.stringify({ phase: 'files', count: plan.fileTasks.length });

  for (const task of plan.fileTasks) {
    yield JSON.stringify({
      task: {
        id: task.id,
        type: task.type,
        path: task.path,
        absolutePath: task.absolutePath,
        outputPath: task.outputPath,
        systemPrompt: task.systemPrompt,
        userPrompt: task.userPrompt,
        fileType: task.metadata.fileType,
      }
    });
  }

  // Then yield directory tasks (post-order: deepest first)
  yield JSON.stringify({ phase: 'directories', count: plan.directoryTasks.length, traversal: 'post-order' });

  for (const task of plan.directoryTasks) {
    yield JSON.stringify({
      task: {
        id: task.id,
        type: task.type,
        path: task.path,
        depth: task.metadata.depth,
        absolutePath: task.absolutePath,
        outputPath: task.outputPath,
        files: task.metadata.directoryFiles,
      }
    });
  }

  // Finally yield root tasks
  yield JSON.stringify({ phase: 'root', count: plan.rootTasks.length });

  for (const task of plan.rootTasks) {
    yield JSON.stringify({
      task: {
        id: task.id,
        type: task.type,
        path: task.path,
        outputPath: task.outputPath,
      }
    });
  }

  yield JSON.stringify({ phase: 'complete' });
}

/**
 * Format execution plan as markdown for GENERATION-PLAN.md.
 * Uses post-order traversal (deepest directories first).
 */
export function formatExecutionPlanAsMarkdown(plan: ExecutionPlan): string {
  const lines: string[] = [];
  const today = new Date().toISOString().split('T')[0];

  // Header
  lines.push('# Documentation Generation Plan');
  lines.push('');
  lines.push(`Generated: ${today}`);
  lines.push(`Project: ${plan.projectRoot}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total Tasks**: ${plan.tasks.length}`);
  lines.push(`- **File Tasks**: ${plan.fileTasks.length}`);
  lines.push(`- **Directory Tasks**: ${plan.directoryTasks.length}`);
  lines.push(`- **Root Tasks**: ${plan.rootTasks.length}`);
  lines.push('- **Traversal**: Post-order (children before parents)');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Phase 1: File Analysis
  lines.push('## Phase 1: File Analysis (Post-Order Traversal)');
  lines.push('');

  // Group files by directory, use directory task order (already post-order)
  const filesByDir: Record<string, string[]> = {};
  for (const task of plan.fileTasks) {
    const dir = task.path.includes('/')
      ? task.path.substring(0, task.path.lastIndexOf('/'))
      : '.';
    if (!filesByDir[dir]) filesByDir[dir] = [];
    filesByDir[dir].push(task.path);
  }

  // Output files grouped by directory in post-order (using directoryTasks order)
  for (const dirTask of plan.directoryTasks) {
    const dir = dirTask.path;
    const files = filesByDir[dir] || [];
    if (files.length > 0) {
      const depth = dirTask.metadata.depth ?? 0;
      lines.push(`### Depth ${depth}: ${dir}/ (${files.length} files)`);
      for (const file of files) {
        lines.push(`- [ ] \`${file}\``);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  // Phase 2: Directory AGENTS.md
  lines.push(`## Phase 2: Directory AGENTS.md (Post-Order Traversal, ${plan.directoryTasks.length} directories)`);
  lines.push('');

  // Group by depth
  const dirsByDepth: Record<number, string[]> = {};
  for (const task of plan.directoryTasks) {
    const depth = task.metadata.depth ?? 0;
    if (!dirsByDepth[depth]) dirsByDepth[depth] = [];
    dirsByDepth[depth].push(task.path);
  }

  // Output in depth order (descending)
  const depths = Object.keys(dirsByDepth).map(Number).sort((a, b) => b - a);
  for (const depth of depths) {
    lines.push(`### Depth ${depth}`);
    for (const dir of dirsByDepth[depth]) {
      const suffix = dir === '.' ? ' (root)' : '';
      lines.push(`- [ ] \`${dir}/AGENTS.md\`${suffix}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // Phase 3: Root Documents
  lines.push('## Phase 3: Root Documents');
  lines.push('');
  lines.push('### Global');
  lines.push('- [ ] `CLAUDE.md`');
  if (plan.generateArchitecture) {
    lines.push('- [ ] `ARCHITECTURE.md`');
  }
  lines.push('');

  // Supplementary docs per package root
  if (plan.packageRoots.length > 0) {
    lines.push('### Supplementary Docs by Package');
    lines.push('');
    for (const pkgRoot of plan.packageRoots) {
      const pkgLabel = pkgRoot.path || '(root)';
      const pkgPath = pkgRoot.path ? `${pkgRoot.path}/` : '';
      lines.push(`#### ${pkgLabel} (${pkgRoot.type})`);
      if (plan.generateStack && pkgRoot.type === 'node') {
        lines.push(`- [ ] \`${pkgPath}STACK.md\``);
      }
      if (plan.generateStructure) {
        lines.push(`- [ ] \`${pkgPath}STRUCTURE.md\``);
      }
      if (plan.generateConventions) {
        lines.push(`- [ ] \`${pkgPath}CONVENTIONS.md\``);
      }
      if (plan.generateTesting) {
        lines.push(`- [ ] \`${pkgPath}TESTING.md\``);
      }
      if (plan.generateIntegrations) {
        lines.push(`- [ ] \`${pkgPath}INTEGRATIONS.md\``);
      }
      if (plan.generateConcerns) {
        lines.push(`- [ ] \`${pkgPath}CONCERNS.md\``);
      }
      lines.push('');
    }
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Plan executor for documentation generation
 *
 * Builds execution plans from generation plans:
 * - File tasks as individual analysis jobs
 * - Directory completion tracking
 * - Markdown plan output for dry-run display
 */

import * as path from 'node:path';
import type { GenerationPlan } from '../orchestration/orchestrator.js';
import { sumFileExists } from './writers/sum.js';

/**
 * Execution task ready for AI processing.
 */
export interface ExecutionTask {
  /** Unique task ID */
  id: string;
  /** Task type */
  type: 'file' | 'directory';
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
  /** Directory to file mapping */
  directoryFileMap: Record<string, string[]>;
  /** Compact project directory listing for directory prompt context */
  projectStructure?: string;
  /** Files skipped due to existing .sum artifacts */
  skippedFiles?: string[];
  /** Directories skipped due to existing AGENTS.md */
  skippedDirs?: string[];
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
  const directoryFileMap: Record<string, string[]> = {};

  // Track files by directory — use all discovered files (including skipped)
  // so directory tasks know about ALL child .sum files for prompt building
  const allFiles = plan.allDiscoveredFiles ?? plan.files;
  for (const file of allFiles) {
    const dir = path.dirname(file.relativePath);
    if (!directoryFileMap[dir]) {
      directoryFileMap[dir] = [];
    }
    directoryFileMap[dir].push(file.relativePath);
  }

  // Create file tasks
  for (const task of plan.tasks) {
    if (task.type === 'file') {
      const absolutePath = path.join(projectRoot, task.filePath);
      fileTasks.push({
        id: `file:${task.filePath}`,
        type: 'file',
        path: task.filePath,
        absolutePath,
        systemPrompt: task.systemPrompt!,
        userPrompt: task.userPrompt!,
        dependencies: [],
        outputPath: `${absolutePath}.sum`,
        metadata: {},
      });
    }
  }

  // Sort file tasks by directory depth (deepest first) for post-order traversal
  fileTasks.sort((a, b) => {
    const depthA = getDirectoryDepth(path.dirname(a.path));
    const depthB = getDirectoryDepth(path.dirname(b.path));
    return depthB - depthA;
  });

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
      systemPrompt: 'Built at execution time by buildDirectoryPrompt()',
      userPrompt: `Directory "${dir}" — ${files.length} files. Prompt populated from .sum files at runtime.`,
      dependencies: fileTaskIds,
      outputPath: path.join(dirAbsPath, 'AGENTS.md'),
      metadata: {
        directoryFiles: files,
        depth: getDirectoryDepth(dir),
      },
    });
  }

  return {
    projectRoot,
    tasks: [...fileTasks, ...directoryTasks],
    fileTasks,
    directoryTasks,
    directoryFileMap,
    projectStructure: plan.projectStructure,
    skippedFiles: plan.skippedFiles,
    skippedDirs: plan.skippedDirs,
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
  if (plan.skippedFiles && plan.skippedFiles.length > 0) {
    lines.push(`- **Files Skipped**: ${plan.skippedFiles.length} (existing .sum)`);
  }
  lines.push(`- **Directory Tasks**: ${plan.directoryTasks.length}`);
  if (plan.skippedDirs && plan.skippedDirs.length > 0) {
    lines.push(`- **Dirs Skipped**: ${plan.skippedDirs.length} (existing AGENTS.md)`);
  }
  lines.push('- **Traversal**: Post-order (children before parents)');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Phase 1: File Analysis
  lines.push('## Phase 1: File Analysis (Post-Order Traversal)');
  lines.push('');

  // Group files by directory, use directory task order (already post-order)
  // Deduplicate paths
  const filesByDir: Record<string, Set<string>> = {};
  for (const task of plan.fileTasks) {
    const dir = task.path.includes('/')
      ? task.path.substring(0, task.path.lastIndexOf('/'))
      : '.';
    if (!filesByDir[dir]) filesByDir[dir] = new Set();
    filesByDir[dir].add(task.path);
  }

  // Output files grouped by directory in post-order (using directoryTasks order)
  for (const dirTask of plan.directoryTasks) {
    const dir = dirTask.path;
    const filesSet = filesByDir[dir];
    if (filesSet && filesSet.size > 0) {
      const files = Array.from(filesSet);
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

  // Skipped section (if any files/dirs were skipped)
  if ((plan.skippedFiles && plan.skippedFiles.length > 0) ||
      (plan.skippedDirs && plan.skippedDirs.length > 0)) {
    lines.push('---');
    lines.push('');
    lines.push('## Skipped (Existing Artifacts)');
    lines.push('');

    if (plan.skippedFiles && plan.skippedFiles.length > 0) {
      lines.push(`### Files (${plan.skippedFiles.length} with existing .sum)`);
      for (const f of plan.skippedFiles) {
        lines.push(`- \`${f}\``);
      }
      lines.push('');
    }

    if (plan.skippedDirs && plan.skippedDirs.length > 0) {
      lines.push(`### Directories (${plan.skippedDirs.length} with existing AGENTS.md)`);
      for (const d of plan.skippedDirs) {
        lines.push(`- \`${d}/AGENTS.md\``);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

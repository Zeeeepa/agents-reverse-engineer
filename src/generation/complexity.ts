import * as path from 'node:path';

/**
 * Package manifest type indicator.
 */
export type PackageType = 'node' | 'python';

/**
 * Detected package root information.
 */
export interface PackageRoot {
  /** Relative path from project root (empty string for root) */
  path: string;
  /** Absolute path */
  absolutePath: string;
  /** Type of package (node for package.json, python for requirements.txt/pyproject.toml) */
  type: PackageType;
  /** Manifest file that triggered detection */
  manifestFile: string;
  /** Package name if available */
  name?: string;
}

/**
 * Metrics about codebase complexity.
 */
export interface ComplexityMetrics {
  /** Total number of source files */
  fileCount: number;
  /** Maximum directory depth */
  directoryDepth: number;
  /** Detected architectural patterns */
  architecturalPatterns: string[];
  /** List of source file paths */
  files: string[];
  /** Unique directory paths */
  directories: Set<string>;
  /** Detected package roots (directories with package.json, requirements.txt, pyproject.toml) */
  packageRoots: PackageRoot[];
}

/**
 * Architectural pattern definitions with detection heuristics.
 */
const PATTERN_DETECTORS: Array<{
  name: string;
  indicators: string[];
  minMatches: number;
}> = [
  {
    name: 'layered-architecture',
    indicators: ['controllers/', 'services/', 'repositories/', 'dao/'],
    minMatches: 2,
  },
  {
    name: 'clean-architecture',
    indicators: ['domain/', 'application/', 'infrastructure/', 'usecases/'],
    minMatches: 2,
  },
  {
    name: 'nextjs-convention',
    indicators: ['/api/', '/pages/', '/app/', 'middleware.'],
    minMatches: 2,
  },
  {
    name: 'presentational-container',
    indicators: ['components/', 'containers/', 'views/'],
    minMatches: 2,
  },
  {
    name: 'redux-pattern',
    indicators: ['redux/', 'store/', 'slices/', 'reducers/', 'actions/'],
    minMatches: 2,
  },
  {
    name: 'react-patterns',
    indicators: ['hooks/', 'context/', 'providers/'],
    minMatches: 2,
  },
  {
    name: 'microservices',
    indicators: ['services/', 'gateway/', 'shared/', 'common/', 'packages/'],
    minMatches: 3,
  },
  {
    name: 'feature-based',
    indicators: ['features/', 'modules/', 'domains/'],
    minMatches: 1,
  },
  {
    name: 'mvc-pattern',
    indicators: ['models/', 'views/', 'controllers/'],
    minMatches: 3,
  },
];

/**
 * Detect architectural patterns from file paths.
 */
function detectArchitecturalPatterns(files: string[]): string[] {
  const patterns: string[] = [];
  const normalizedFiles = files.map(f => f.toLowerCase().replace(/\\/g, '/'));

  for (const detector of PATTERN_DETECTORS) {
    const matches = detector.indicators.filter(indicator =>
      normalizedFiles.some(f => f.includes(indicator))
    );

    if (matches.length >= detector.minMatches) {
      patterns.push(detector.name);
    }
  }

  return patterns;
}

/**
 * Calculate maximum directory depth from file paths.
 */
function calculateDirectoryDepth(files: string[], projectRoot: string): number {
  let maxDepth = 0;

  for (const file of files) {
    const relativePath = path.relative(projectRoot, file);
    const depth = relativePath.split(path.sep).length - 1; // -1 for the file itself
    maxDepth = Math.max(maxDepth, depth);
  }

  return maxDepth;
}

/**
 * Extract unique directories from file paths.
 */
function extractDirectories(files: string[]): Set<string> {
  const directories = new Set<string>();

  for (const file of files) {
    let dir = path.dirname(file);
    while (dir && dir !== '.') {
      directories.add(dir);
      const parent = path.dirname(dir);
      if (parent === dir) break; // Reached root
      dir = parent;
    }
  }

  return directories;
}

/**
 * Package manifest files to detect.
 */
const PACKAGE_MANIFESTS: Array<{ file: string; type: PackageType }> = [
  { file: 'package.json', type: 'node' },
  { file: 'requirements.txt', type: 'python' },
  { file: 'pyproject.toml', type: 'python' },
];

/**
 * Detect package roots from discovered files.
 * A package root is a directory containing package.json, requirements.txt, or pyproject.toml.
 */
function detectPackageRoots(files: string[], projectRoot: string): PackageRoot[] {
  const packageRoots: PackageRoot[] = [];
  const seenDirs = new Set<string>();

  for (const file of files) {
    const relativePath = path.relative(projectRoot, file);
    const fileName = path.basename(file);
    const dirPath = path.dirname(relativePath);

    // Check if this file is a package manifest
    for (const manifest of PACKAGE_MANIFESTS) {
      if (fileName === manifest.file) {
        // Normalize directory path (use empty string for root)
        const normalizedDir = dirPath === '.' ? '' : dirPath;

        // Avoid duplicates (same directory with different manifest types)
        const key = `${normalizedDir}:${manifest.type}`;
        if (!seenDirs.has(key)) {
          seenDirs.add(key);
          packageRoots.push({
            path: normalizedDir,
            absolutePath: normalizedDir ? path.join(projectRoot, normalizedDir) : projectRoot,
            type: manifest.type,
            manifestFile: manifest.file,
          });
        }
      }
    }
  }

  // Sort by path depth (root first, then alphabetically)
  return packageRoots.sort((a, b) => {
    const depthA = a.path ? a.path.split(path.sep).length : 0;
    const depthB = b.path ? b.path.split(path.sep).length : 0;
    if (depthA !== depthB) return depthA - depthB;
    return a.path.localeCompare(b.path);
  });
}

/**
 * Analyze codebase complexity from discovered files.
 *
 * @param files - List of source file paths
 * @param projectRoot - Project root directory
 * @returns Complexity metrics
 */
export function analyzeComplexity(
  files: string[],
  projectRoot: string
): ComplexityMetrics {
  return {
    fileCount: files.length,
    directoryDepth: calculateDirectoryDepth(files, projectRoot),
    architecturalPatterns: detectArchitecturalPatterns(files),
    files,
    directories: extractDirectories(files),
    packageRoots: detectPackageRoots(files, projectRoot),
  };
}

/**
 * Determine if ARCHITECTURE.md should be generated.
 *
 * Triggers (any one fires):
 * - 20+ source files
 * - 3+ directory levels
 * - Multiple architectural patterns detected
 */
export function shouldGenerateArchitecture(metrics: ComplexityMetrics): boolean {
  // Threshold: 20+ source files
  if (metrics.fileCount >= 20) return true;

  // Threshold: 3+ directory levels
  if (metrics.directoryDepth >= 3) return true;

  // Threshold: 2+ architectural patterns
  if (metrics.architecturalPatterns.length >= 2) return true;

  return false;
}

/**
 * Determine if STACK.md should be generated.
 *
 * Always generate if package.json exists (has dependencies to document).
 */
export function shouldGenerateStack(hasPackageJson: boolean): boolean {
  return hasPackageJson;
}

/**
 * Generate a summary of why supplementary docs should/shouldn't be generated.
 */
export function getComplexitySummary(metrics: ComplexityMetrics): string {
  const lines = [
    `Files: ${metrics.fileCount}`,
    `Directory depth: ${metrics.directoryDepth}`,
    `Patterns detected: ${metrics.architecturalPatterns.length > 0 ? metrics.architecturalPatterns.join(', ') : 'none'}`,
  ];

  if (shouldGenerateArchitecture(metrics)) {
    lines.push('ARCHITECTURE.md: will be generated');
  } else {
    lines.push('ARCHITECTURE.md: not needed (below thresholds)');
  }

  return lines.join('\n');
}

import * as path from 'node:path';

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
  };
}


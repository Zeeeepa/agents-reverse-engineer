/**
 * Default configuration values for agents-reverse
 */

/**
 * Default vendor directories to exclude from analysis.
 * These are typically package managers, build outputs, or version control directories.
 */
export const DEFAULT_VENDOR_DIRS = [
  'node_modules',
  'vendor',
  '.git',
  'dist',
  'build',
  '__pycache__',
  '.next',
  'venv',
  '.venv',
  'target',
  '.cargo',
  '.gradle',
  // AI assistant tooling directories
  '.planning',
  '.claude',
  '.opencode',
] as const;

/**
 * Default binary file extensions to exclude from analysis.
 * These files cannot be meaningfully analyzed as text.
 */
export const DEFAULT_BINARY_EXTENSIONS = [
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  // Archives
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  // Executables
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  // Media
  '.mp3',
  '.mp4',
  '.wav',
  // Documents
  '.pdf',
  // Fonts
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  // Compiled
  '.class',
  '.pyc',
] as const;

/**
 * Default maximum file size in bytes (1MB).
 * Files larger than this will be skipped with a warning.
 */
export const DEFAULT_MAX_FILE_SIZE = 1024 * 1024;

/**
 * Default configuration object matching the schema structure.
 * This is used when no config file is present or for missing fields.
 */
export const DEFAULT_CONFIG = {
  exclude: {
    patterns: [] as string[],
    vendorDirs: [...DEFAULT_VENDOR_DIRS],
    binaryExtensions: [...DEFAULT_BINARY_EXTENSIONS],
  },
  options: {
    followSymlinks: false,
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
  },
  output: {
    colors: true,
    verbose: true,
  },
} as const;

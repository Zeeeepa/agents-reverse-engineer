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
  '.agents-reverse-engineer',
  '.agents',
  '.planning',
  '.claude',
  '.opencode',
  '.gemini',
] as const;

/**
 * Default file patterns to exclude from analysis.
 * These patterns use gitignore syntax and are matched by the custom filter.
 */
export const DEFAULT_EXCLUDE_PATTERNS = [
  // AI assistant documentation files
  'AGENTS.md',
  'CLAUDE.md',
  'OPENCODE.md',
  'GEMINI.md',
  '**/AGENTS.md',
  '**/CLAUDE.md',
  '**/OPENCODE.md',
  '**/GEMINI.md',
  // Lock files (not useful for documentation, can be very large)
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'Gemfile.lock',
  'Cargo.lock',
  'poetry.lock',
  'composer.lock',
  'go.sum',
  // Dotfiles and generated artifacts (path.extname returns '' for dotfiles,
  // so these must be matched as glob patterns, not binary extensions)
  '.gitignore',
  '.gitattributes',
  '.gitkeep',
  '.env',
  '**/.env',
  '**/.env.*',
  '*.log',
  '*.sum',
  '**/*.sum',
  '**/SKILL.md',
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
    patterns: [...DEFAULT_EXCLUDE_PATTERNS],
    vendorDirs: [...DEFAULT_VENDOR_DIRS],
    binaryExtensions: [...DEFAULT_BINARY_EXTENSIONS],
  },
  options: {
    followSymlinks: false,
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
  },
  output: {
    colors: true,
  },
} as const;

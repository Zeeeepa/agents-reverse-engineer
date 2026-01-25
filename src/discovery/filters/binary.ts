/**
 * Binary file filter for file discovery.
 *
 * Uses extension-based detection as a fast path, falling back to content
 * analysis via `isbinaryfile` for unknown extensions. Also handles large
 * files by size threshold.
 */

import { isBinaryFile } from 'isbinaryfile';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileFilter } from '../types.js';

/**
 * Set of file extensions known to be binary.
 * These are excluded without content analysis for performance.
 */
export const BINARY_EXTENSIONS = new Set([
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.svg',
  '.tiff',
  '.tif',
  '.psd',
  '.raw',
  '.heif',
  '.heic',
  // Archives
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.bz2',
  '.xz',
  '.tgz',
  // Executables
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.msi',
  '.app',
  '.dmg',
  // Media
  '.mp3',
  '.mp4',
  '.wav',
  '.avi',
  '.mov',
  '.mkv',
  '.flac',
  '.ogg',
  '.webm',
  '.m4a',
  '.aac',
  '.wma',
  '.wmv',
  '.flv',
  // Documents (binary formats)
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  // Fonts
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  // Compiled/bytecode
  '.class',
  '.pyc',
  '.pyo',
  '.o',
  '.obj',
  '.a',
  '.lib',
  '.wasm',
  // Database
  '.db',
  '.sqlite',
  '.sqlite3',
  '.mdb',
  // Other
  '.ico',
  '.icns',
  '.cur',
  '.deb',
  '.rpm',
  '.jar',
  '.war',
  '.ear',
]);

/**
 * Options for the binary filter.
 */
export interface BinaryFilterOptions {
  /**
   * Maximum file size in bytes. Files larger than this are excluded.
   * Default: 1MB (1048576 bytes)
   */
  maxFileSize?: number;

  /**
   * Additional binary extensions to recognize beyond the defaults.
   */
  additionalExtensions?: string[];
}

/** Default maximum file size: 1MB */
const DEFAULT_MAX_FILE_SIZE = 1024 * 1024;

/**
 * Creates a binary filter that excludes binary files and files exceeding size limit.
 *
 * The filter uses a two-phase detection approach:
 * 1. Fast path: Check extension against known binary extensions
 * 2. Slow path: For unknown extensions, analyze file content with isbinaryfile
 *
 * @param options - Filter configuration options
 * @returns A FileFilter that identifies binary files
 *
 * @example
 * ```typescript
 * const filter = createBinaryFilter({ maxFileSize: 500000 });
 * await filter.shouldExclude('/path/to/image.png'); // true (extension)
 * await filter.shouldExclude('/path/to/unknown.xyz'); // checks content
 * ```
 */
export function createBinaryFilter(options: BinaryFilterOptions = {}): FileFilter {
  const { maxFileSize = DEFAULT_MAX_FILE_SIZE, additionalExtensions = [] } = options;

  // Create a combined set of all binary extensions
  const binaryExtensions = new Set(BINARY_EXTENSIONS);
  for (const ext of additionalExtensions) {
    // Ensure extension has leading dot
    binaryExtensions.add(ext.startsWith('.') ? ext : `.${ext}`);
  }

  return {
    name: 'binary',

    async shouldExclude(absolutePath: string): Promise<boolean> {
      // Fast path: check extension
      const ext = path.extname(absolutePath).toLowerCase();
      if (binaryExtensions.has(ext)) {
        return true;
      }

      // Check file size and content
      try {
        const stats = await fs.stat(absolutePath);

        // Exclude files exceeding size limit
        if (stats.size > maxFileSize) {
          return true;
        }

        // Slow path: content analysis for unknown extensions
        return await isBinaryFile(absolutePath);
      } catch {
        // If we can't read it, skip it
        return true;
      }
    },
  };
}

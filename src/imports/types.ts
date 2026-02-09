/** A single import statement extracted from source. */
export interface ImportEntry {
  /** The raw import specifier as written in source (e.g., '../ai/index.js') */
  specifier: string;
  /** Imported symbols (e.g., ['AIService', 'AIResponse']) */
  symbols: string[];
  /** Whether this is a type-only import */
  typeOnly: boolean;
}

/** All imports from a single source file. */
export interface FileImports {
  /** Relative file path (e.g., 'runner.ts') */
  fileName: string;
  /** External imports (from other modules, not same directory) */
  externalImports: ImportEntry[];
  /** Internal imports (from same directory) */
  internalImports: ImportEntry[];
}

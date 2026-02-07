import { describe, it, expect } from 'vitest';
import { extractExports, checkCodeVsDoc } from './code-vs-doc.js';
import type { SumFileContent } from '../../generation/writers/sum.js';

// ---------------------------------------------------------------------------
// Helper: build a minimal SumFileContent for testing
// ---------------------------------------------------------------------------

function makeSumContent(overrides: {
  summary?: string;
  publicInterface?: string[];
}): SumFileContent {
  return {
    summary: overrides.summary ?? '',
    metadata: {
      purpose: 'test purpose',
      publicInterface: overrides.publicInterface ?? [],
      dependencies: [],
      patterns: [],
    },
    fileType: 'generic',
    generatedAt: '2026-01-01T00:00:00Z',
    contentHash: 'abc123',
  };
}

// ---------------------------------------------------------------------------
// extractExports
// ---------------------------------------------------------------------------

describe('extractExports', () => {
  it('finds all named export declaration types', () => {
    const source = [
      'export function doStuff() {}',
      'export class MyClass {}',
      'export const FOO = 1;',
      'export let bar = 2;',
      'export var baz = 3;',
      'export type MyType = string;',
      'export interface MyInterface {}',
      'export enum Status { A, B }',
    ].join('\n');

    const exports = extractExports(source);
    expect(exports).toEqual([
      'doStuff',
      'MyClass',
      'FOO',
      'bar',
      'baz',
      'MyType',
      'MyInterface',
      'Status',
    ]);
  });

  it('finds default exports with names', () => {
    const source = [
      'export default function main() {}',
      'export default class App {}',
    ].join('\n');

    const exports = extractExports(source);
    expect(exports).toContain('main');
    expect(exports).toContain('App');
  });

  it('ignores commented-out exports', () => {
    const source = [
      '// export const commented = true;',
      '/* export function blocked() {} */',
      'export const real = 1;',
    ].join('\n');

    const exports = extractExports(source);
    expect(exports).toEqual(['real']);
  });

  it('ignores internal declarations without export keyword', () => {
    const source = [
      'function internal() {}',
      'const local = 42;',
      'class Helper {}',
      'export function exported() {}',
    ].join('\n');

    const exports = extractExports(source);
    expect(exports).toEqual(['exported']);
  });

  it('ignores re-exports', () => {
    const source = [
      "export { foo } from './bar';",
      "export { default as baz } from './qux';",
      'export function real() {}',
    ].join('\n');

    const exports = extractExports(source);
    expect(exports).toEqual(['real']);
  });

  it('returns empty array for source with no exports', () => {
    const source = [
      'function helper() {}',
      'const secret = 42;',
    ].join('\n');

    const exports = extractExports(source);
    expect(exports).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkCodeVsDoc
// ---------------------------------------------------------------------------

describe('checkCodeVsDoc', () => {
  it('returns null when .sum content is consistent with source exports', () => {
    const source = 'export function fetchData() {}\nexport const TIMEOUT = 5000;';
    const sum = makeSumContent({
      summary: 'fetchData retrieves data. TIMEOUT controls wait.',
      publicInterface: ['fetchData(url: string): Promise<Data>', 'TIMEOUT'],
    });

    const result = checkCodeVsDoc(source, sum, 'src/api.ts');
    expect(result).toBeNull();
  });

  it('detects missingFromDoc when source has undocumented exports', () => {
    const source = 'export function fetchData() {}\nexport function newHelper() {}';
    const sum = makeSumContent({
      summary: 'fetchData retrieves data.',
      publicInterface: ['fetchData(url: string): Promise<Data>'],
    });

    const result = checkCodeVsDoc(source, sum, 'src/api.ts');
    expect(result).not.toBeNull();
    expect(result!.details.missingFromDoc).toContain('newHelper');
    expect(result!.details.missingFromCode).toEqual([]);
  });

  it('detects missingFromCode when .sum mentions symbols not in source', () => {
    const source = 'export function fetchData() {}';
    const sum = makeSumContent({
      summary: 'fetchData and deleteData manage API calls.',
      publicInterface: [
        'fetchData(url: string): Promise<Data>',
        'deleteData(id: string): void',
      ],
    });

    const result = checkCodeVsDoc(source, sum, 'src/api.ts');
    expect(result).not.toBeNull();
    expect(result!.details.missingFromCode).toContain(
      'deleteData(id: string): void',
    );
  });

  it('detects both missingFromDoc and missingFromCode simultaneously', () => {
    const source = 'export function alpha() {}\nexport function gamma() {}';
    const sum = makeSumContent({
      summary: 'alpha and beta do things.',
      publicInterface: ['alpha(): void', 'beta(): number'],
    });

    const result = checkCodeVsDoc(source, sum, 'src/util.ts');
    expect(result).not.toBeNull();
    expect(result!.details.missingFromDoc).toContain('gamma');
    expect(result!.details.missingFromCode).toContain('beta(): number');
  });

  it('uses error severity when missingFromCode is non-empty', () => {
    const source = 'export function only() {}';
    const sum = makeSumContent({
      summary: 'only and removed.',
      publicInterface: ['only(): void', 'removed(): void'],
    });

    const result = checkCodeVsDoc(source, sum, 'src/x.ts');
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('error');
  });

  it('uses warning severity when only missingFromDoc', () => {
    const source = 'export function existing() {}\nexport function added() {}';
    const sum = makeSumContent({
      summary: 'existing does stuff.',
      publicInterface: ['existing(): void'],
    });

    const result = checkCodeVsDoc(source, sum, 'src/x.ts');
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning');
  });

  it('uses case-sensitive matching for symbol names', () => {
    const source = 'export function Foo() {}';
    const sum = makeSumContent({
      summary: 'foo does stuff.',
      publicInterface: ['foo(): void'],
    });

    // 'Foo' is the export but sum only mentions 'foo' (lowercase)
    // Should detect Foo as missingFromDoc (case-sensitive)
    // Should detect 'foo(): void' as missingFromCode (no export named 'foo')
    const result = checkCodeVsDoc(source, sum, 'src/x.ts');
    expect(result).not.toBeNull();
    expect(result!.details.missingFromDoc).toContain('Foo');
    expect(result!.details.missingFromCode).toContain('foo(): void');
  });

  it('sets sumPath to filePath + .sum', () => {
    const source = 'export function only() {}';
    const sum = makeSumContent({
      summary: 'only and gone.',
      publicInterface: ['only(): void', 'gone(): void'],
    });

    const result = checkCodeVsDoc(source, sum, 'src/foo.ts');
    expect(result).not.toBeNull();
    expect(result!.sumPath).toBe('src/foo.ts.sum');
  });

  it('sets description in expected format', () => {
    const source = 'export function a() {}\nexport function b() {}';
    const sum = makeSumContent({
      summary: 'a does things.',
      publicInterface: ['a(): void', 'removed(): void'],
    });

    const result = checkCodeVsDoc(source, sum, 'src/z.ts');
    expect(result).not.toBeNull();
    expect(result!.description).toBe(
      'Documentation out of sync: 1 exports undocumented, 1 documented items not found in code',
    );
  });
});

import { isDefinitionFile, upperCaseFirst } from '../src/util/index.js';

describe(isDefinitionFile, () => {
  describe('returns false for non-definition files', () => {
    const INVALID_FILE_NAMES = [
      'test.js',
      'test.jsx',
      'README.md',
      'test.d.js',
      'test.ts.js',
      'test.ts.map',
      'test.ts-js',
      'test.ts',
      'ts',
      'test.tsx',
      'test.TS',
      'test.TSX',
      // yes, it's not a definition file if it's a `.d.tsx`!
      'test.d.tsx',
      'test.D.TSX',
    ] as const;

    it.for(INVALID_FILE_NAMES)('%s', (fileName, { expect }) => {
      expect(isDefinitionFile(fileName)).toBe(false);
    });
  });

  describe('returns true for definition files', () => {
    const VALID_FILE_NAMES = ['test.d.ts', 'test.D.TS'] as const;

    it.for(VALID_FILE_NAMES)('%s', (fileName, { expect }) => {
      expect(isDefinitionFile(fileName)).toBe(true);
    });
  });
});

describe(upperCaseFirst, () => {
  it('upper cases first', () => {
    expect(upperCaseFirst('hello')).toBe('Hello');
  });
});

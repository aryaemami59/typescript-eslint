import {
  findLastIndex,
  formatWordList,
  isDefinitionFile,
} from '../../src/util/misc.js';

describe(isDefinitionFile, () => {
  it.for([['index.d.ts'], ['module.d.cts'], ['package.d.mts']] as const)(
    'returns true for standard definition file: %s',
    ([filename], { expect }) => {
      expect(isDefinitionFile(filename)).toBe(true);
    },
  );

  it.for([
    ['styles.d.css.ts'],
    ['component.d.vue.ts'],
    ['env.d.node.ts'],
  ] as const)(
    'returns true for arbitrary extension definition file: %s',
    ([filename], { expect }) => {
      expect(isDefinitionFile(filename)).toBe(true);
    },
  );

  it.for([
    ['index.ts'],
    ['app.tsx'],
    ['styles.css.ts'],
    ['vite.config.ts'],
  ] as const)(
    'returns false for non definition file: %s',
    ([filename], { expect }) => {
      expect(isDefinitionFile(filename)).toBe(false);
    },
  );
});

describe(formatWordList, () => {
  it('can format with no words', () => {
    expect(formatWordList([])).toBe('');
  });

  it('can format with 1 word', () => {
    expect(formatWordList(['foo'])).toBe('foo');
  });

  it('can format with 2 words', () => {
    expect(formatWordList(['foo', 'bar'])).toBe('foo and bar');
  });

  it('can format with 3 words', () => {
    expect(formatWordList(['foo', 'bar', 'baz'])).toBe('foo, bar and baz');
  });

  it('can format with 4 words', () => {
    expect(formatWordList(['foo', 'bar', 'baz', 'boz'])).toBe(
      'foo, bar, baz and boz',
    );
  });
});

describe(findLastIndex, () => {
  it('returns -1 if there are no elements to iterate over', () => {
    expect(findLastIndex([], () => true)).toBe(-1);
  });

  it('returns the index of the last element if predicate just returns true for all values', () => {
    expect(findLastIndex([1, 2, 3], () => true)).toBe(2);
  });

  it('returns the index of the last occurance of a duplicate element', () => {
    expect(findLastIndex([1, 2, 3, 3, 5], n => n === 3)).toBe(3);
  });
});

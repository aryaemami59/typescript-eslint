import type { SourceTypeClassic } from '@typescript-eslint/types';

import { glob } from 'glob';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { AnalyzeOptions } from './test-utils/index.js';

import { FIXTURES_DIR, parseAndAnalyze } from './test-utils/index.js';

const FOUR_LEADING_SLASHES_REGEX = /^\/{4} +@(\w+) *= *(.+)$/;

const QUOTED_STRING = /^["'](.+?)['"]$/;

const FOUR_SLASHES_STRING = '/'.repeat(4);

type ALLOWED_VALUE = [
  'boolean' | 'number' | 'string',
  Set<boolean | number | string>?,
];

const ALLOWED_OPTIONS: Map<string, ALLOWED_VALUE> = new Map<
  keyof AnalyzeOptions,
  ALLOWED_VALUE
>([
  ['globalReturn', ['boolean']],
  ['impliedStrict', ['boolean']],
  ['jsxFragmentName', ['string']],
  ['jsxPragma', ['string']],
  ['sourceType', ['string', new Set<SourceTypeClassic>(['module', 'script'])]],
]);

describe('fixtures', async () => {
  const FIXTURE_FILE_PATHS = await glob('**/*.[jt]s?(x)', {
    absolute: true,
    cwd: FIXTURES_DIR,
    ignore: ['fixtures.test.ts'],
  });

  const FIXTURES = await Promise.all(
    FIXTURE_FILE_PATHS.map(async absolute => {
      const relative = path.relative(FIXTURES_DIR, absolute);
      const { base, dir, ext, name } = path.parse(relative);
      const segments = dir.split(path.sep);
      const snapshotPath = path.join(FIXTURES_DIR, dir);

      const contents = await fs.readFile(absolute, {
        encoding: 'utf-8',
      });

      const lines = contents
        .split('\n')
        .filter(line => line.startsWith(FOUR_SLASHES_STRING));

      const entries = lines.map(line => {
        const match = FOUR_LEADING_SLASHES_REGEX.exec(line);

        assert.isNotNull(match);

        const [, key, rawValue] = match;

        const type = ALLOWED_OPTIONS.get(key);

        assert.isDefined(type);

        const getValue = () => {
          switch (type[0]) {
            case 'string': {
              const quotedStringMatch = QUOTED_STRING.exec(rawValue);
              if (quotedStringMatch) {
                return quotedStringMatch[1];
              }

              return rawValue;
            }

            case 'number': {
              const parsed = parseFloat(rawValue);

              assert.isNotNaN(parsed);

              return parsed;
            }

            case 'boolean': {
              if (rawValue === 'true') {
                return true;
              }

              if (rawValue === 'false') {
                return false;
              }

              throw new Error(
                `Expected a boolean for ${key}, but got ${rawValue}`,
              );
            }

            default: {
              return rawValue;
            }
          }
        };

        const value = getValue();

        if (type[1] && !type[1].has(value)) {
          throw new Error(
            `Expected value for ${key} to be one of (${[...type[1]].join(
              ' | ',
            )}), but got ${value.toString()}`,
          );
        }

        if (value === 'true') {
          return [key, true] as const;
        }
        if (value === 'false') {
          return [key, false] as const;
        }
        return [key, value] as const;
      });

      const options = Object.fromEntries(entries) satisfies AnalyzeOptions;

      const isJSX = ext.endsWith('x');

      const snapshotFile = path.join(snapshotPath, `${base}.shot`);

      await fs.mkdir(snapshotPath, { recursive: true });

      return {
        absolute,
        contents,
        ext,
        isJSX,
        lines,
        name,
        options,
        segments,
        snapshotFile,
        snapshotPath,
      };
    }),
  );

  const FIXTURES_WITH_TEST_TITLES = FIXTURES.map(
    fixture => [fixture.segments.join(' > '), fixture] as const,
  );

  describe.for(FIXTURES_WITH_TEST_TITLES)('%s', ([, fixture]) => {
    test(fixture.name, async () => {
      const { contents, isJSX, options, snapshotFile } = fixture;

      const { scopeManager } = parseAndAnalyze(contents, options, {
        jsx: isJSX,
      });

      await expect(scopeManager).toMatchFileSnapshot(snapshotFile);
    });
  });
});

describe('ast snapshots should have an associated test', async () => {
  const snapshots = (
    await glob('**/*.shot', { absolute: true, cwd: FIXTURES_DIR })
  ).map(absolute => {
    const relative = path.relative(FIXTURES_DIR, absolute);
    return [relative, absolute] as const;
  });

  it.for(snapshots)('%s', async ([, absoluteSnapshotPath], { expect }) => {
    expect((await fs.lstat(absoluteSnapshotPath)).isFile()).toBe(true);
  });
});

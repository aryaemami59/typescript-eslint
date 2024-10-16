import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { clearWatchCaches } from '../../src/create-program/getWatchProgramsForProjects.js';
import { clearCaches, parseAndGenerateServices } from '../../src/index.js';
import { clearDefaultProjectMatchedFiles } from '../../src/parser.js';

const CONTENTS = {
  bar: 'console.log("bar")',
  'bat/baz/bar': 'console.log("bat/baz/bar")',
  'baz/bar': 'console.log("baz bar")',
  foo: 'console.log("foo")',
  number: 'const foo = 1;',
  object: '(() => { })();',
  string: 'let a: "a" | "b";',
} as const;

const bazSlashBar = 'baz/bar';
const batSlashBazSlashBar = 'bat/baz/bar';
const bar = 'bar';
const foo = 'foo';

const INTEGRATION_TEST_DIR = path.join(
  os.tmpdir() || os.homedir(),
  'typescript-estree',
);

const originalCWD = process.cwd();

const temporaryDirectories = new Set<string>();

interface LocalTestContext {
  PROJECT_DIR: string;
  PROJECT_SRC_DIR: string;
  tsConfigIncludeAll: Record<string, unknown>;
  tsConfigExcludeBar: Record<string, unknown>;
  tsConfigToWrite: 'excludes' | 'includes';
  finalTSConfigToWrite: Record<string, unknown>;
  writeBar: boolean;
}

const localTest = test.extend<LocalTestContext>({
  finalTSConfigToWrite: [
    async (
      { tsConfigExcludeBar, tsConfigIncludeAll, tsConfigToWrite },
      use,
    ) => {
      const finalTSConfigToWrite =
        tsConfigToWrite === 'excludes'
          ? tsConfigExcludeBar
          : tsConfigIncludeAll;

      await use(finalTSConfigToWrite);
    },
    { auto: false },
  ],

  PROJECT_DIR: [
    async ({ finalTSConfigToWrite }, use) => {
      const PROJECT_DIR = await fs.mkdtemp(
        path.join(INTEGRATION_TEST_DIR, 'temp'),
        { encoding: 'utf-8' },
      );

      await fs.writeFile(
        path.join(PROJECT_DIR, 'tsconfig.json'),
        JSON.stringify(finalTSConfigToWrite, null, 2),
        { encoding: 'utf-8' },
      );

      process.chdir(PROJECT_DIR);

      await use(PROJECT_DIR);

      process.chdir(originalCWD);

      await fs.rm(PROJECT_DIR, { recursive: true });
    },
    { auto: true },
  ],

  PROJECT_SRC_DIR: [
    async ({ PROJECT_DIR, writeBar }, use) => {
      const PROJECT_SRC_DIR = path.join(PROJECT_DIR, 'src');

      await fs.mkdir(PROJECT_SRC_DIR, { recursive: true });

      await fs.mkdir(path.join(PROJECT_SRC_DIR, 'baz'), { recursive: true });

      await fs.writeFile(
        path.join(PROJECT_SRC_DIR, `${foo}.ts`),
        CONTENTS[foo],
        { encoding: 'utf-8' },
      );

      if (writeBar) {
        await fs.writeFile(
          path.join(PROJECT_SRC_DIR, `${bar}.ts`),
          CONTENTS[bar],
          { encoding: 'utf-8' },
        );
      }

      await use(PROJECT_SRC_DIR);

      await fs.rm(PROJECT_SRC_DIR, { recursive: true });
    },
    { auto: false },
  ],

  tsConfigExcludeBar: [
    { exclude: ['./src/bar.ts'], include: ['src'] },
    { auto: false },
  ],
  tsConfigIncludeAll: [{ exclude: [], include: ['src'] }, { auto: false }],
  tsConfigToWrite: ['includes', { auto: false }],
  writeBar: [true, { auto: false }],
});

function parseFile(
  filename: keyof typeof CONTENTS,
  tmpDir: string,
  relative?: boolean,
  ignoreTsconfigRootDir?: boolean,
): void {
  parseAndGenerateServices(CONTENTS[filename], {
    disallowAutomaticSingleRunInference: true,
    filePath: relative
      ? path.join('src', `${filename}.ts`)
      : path.join(tmpDir, `${filename}.ts`),
    project: './tsconfig.json',
    tsconfigRootDir: ignoreTsconfigRootDir ? undefined : path.dirname(tmpDir),
  });
}

describe('persistent parse', () => {
  beforeAll(async () => {
    await fs.mkdir(INTEGRATION_TEST_DIR, {
      recursive: true,
    });
  });

  afterEach(() => {
    // reset project tracking
    clearDefaultProjectMatchedFiles();

    // stop watching the files and folders
    clearWatchCaches();

    temporaryDirectories.clear();

    // restore original cwd
    process.chdir(originalCWD);
  });

  afterAll(async () => {
    // clean up the temporary files and folders
    if (process.env.KEEP_INTEGRATION_TEST_DIR !== 'true') {
      await fs.rm(INTEGRATION_TEST_DIR, { recursive: true });
    }
  });

  const testCases = [
    [
      'includes not ending in a slash',
      {
        exclude: [],
        include: ['src'],
      },
      {
        exclude: ['./src/bar.ts'],
        include: ['src'],
      },
    ],
    [
      /*
      If the includes ends in a slash, typescript will ask for watchers ending in a slash.
      These tests ensure the normalization of code works as expected in this case.
      */
      'includes ending in a slash',
      {
        exclude: [],
        include: ['src/'],
      },
      {
        exclude: ['./src/bar.ts'],
        include: ['src/'],
      },
    ],
    [
      /*
      If there is no includes, then typescript will ask for a slightly different set of watchers.
      */
      'tsconfig with no includes / files',
      {},
      {
        exclude: ['./src/bar.ts'],
      },
    ],
    [
      /*
      If there is no includes, then typescript will ask for a slightly different set of watchers.
      */
      'tsconfig with overlapping globs',
      {
        include: ['./*', './**/*', './src/**/*'],
      },
      {
        exclude: ['./src/bar.ts'],
        include: ['./*', './**/*', './src/**/*'],
      },
    ],
  ] as const satisfies readonly [
    testTitle: string,
    tsConfigIncludeAll: Record<string, unknown>,
    tsConfigExcludeBar: Record<string, unknown>,
  ][];

  describe.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
    'tsconfig with includes and excludes',
    () => {
      describe.for(testCases)(
        '%s',
        ([, tsConfigIncludeAll, tsConfigExcludeBar]) => {
          localTest.scoped({
            tsConfigExcludeBar,
            tsConfigIncludeAll,
          });

          localTest(
            'parses both files successfully when included',
            ({ expect, PROJECT_SRC_DIR }) => {
              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR);
              }).not.toThrow();

              expect(() => {
                parseFile(bar, PROJECT_SRC_DIR);
              }).not.toThrow();
            },
          );

          localTest(
            'allows parsing of deeply nested new files in new folder',
            async ({ expect, PROJECT_SRC_DIR }) => {
              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR);
              }).not.toThrow();

              // Create deep folder structure after first parse (this is important step)
              // context: https://github.com/typescript-eslint/typescript-eslint/issues/1394
              await fs.mkdir(path.join(PROJECT_SRC_DIR, 'bat', 'baz'), {
                recursive: true,
              });

              // write a new file and attempt to parse it
              await fs.writeFile(
                path.join(PROJECT_SRC_DIR, `${batSlashBazSlashBar}.ts`),
                CONTENTS[batSlashBazSlashBar],
                { encoding: 'utf-8' },
              );

              expect(() => {
                parseFile(batSlashBazSlashBar, PROJECT_SRC_DIR);
              }).not.toThrow();
            },
          );

          localTest(
            'allows renaming of files',
            async ({ expect, PROJECT_SRC_DIR }) => {
              // parse once to: assert the config as correct, and to make sure the program is setup
              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR);
              }).not.toThrow();

              // bar should throw because it doesn't exist yet
              expect(() => {
                parseFile(bazSlashBar, PROJECT_SRC_DIR);
              }).toThrow();

              // write a new file and attempt to parse it
              await fs.rename(
                path.join(PROJECT_SRC_DIR, `${bar}.ts`),
                path.join(PROJECT_SRC_DIR, `${bazSlashBar}.ts`),
              );

              // both files should parse fine now
              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR);
              }).not.toThrow();

              expect(() => {
                parseFile(bazSlashBar, PROJECT_SRC_DIR);
              }).not.toThrow();
            },
          );

          localTest.scoped({ writeBar: false });

          localTest(
            'allows parsing of new files',
            async ({ expect, PROJECT_SRC_DIR }) => {
              // parse once to: assert the config as correct, and to make sure the program is setup
              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR);
              }).not.toThrow();

              // bar should throw because it doesn't exist yet
              expect(() => {
                parseFile(bar, PROJECT_SRC_DIR);
              }).toThrow();

              // write a new file and attempt to parse it
              await fs.writeFile(
                path.join(PROJECT_SRC_DIR, `${bar}.ts`),
                CONTENTS[bar],
                { encoding: 'utf-8' },
              );

              // both files should parse fine now
              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR);
              }).not.toThrow();

              expect(() => {
                parseFile(bar, PROJECT_SRC_DIR);
              }).not.toThrow();
            },
          );

          localTest(
            'allows parsing of deeply nested new files',
            async ({ expect, PROJECT_SRC_DIR }) => {
              // parse once to: assert the config as correct, and to make sure the program is setup
              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR);
              }).not.toThrow();

              // bar should throw because it doesn't exist yet
              expect(() => {
                parseFile(bazSlashBar, PROJECT_SRC_DIR);
              }).toThrow();

              // write a new file and attempt to parse it
              await fs.writeFile(
                path.join(PROJECT_SRC_DIR, `${bazSlashBar}.ts`),
                CONTENTS[bazSlashBar],
                { encoding: 'utf-8' },
              );

              // both files should parse fine now
              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR);
              }).not.toThrow();

              expect(() => {
                parseFile(bazSlashBar, PROJECT_SRC_DIR);
              }).not.toThrow();
            },
          );

          localTest(
            'should work with relative paths',
            async ({ expect, PROJECT_SRC_DIR }) => {
              // parse once to: assert the config as correct, and to make sure the program is setup
              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR, true);
              }).not.toThrow();

              // bar should throw because it doesn't exist yet
              expect(() => {
                parseFile(bar, PROJECT_SRC_DIR, true);
              }).toThrow();

              // write a new file and attempt to parse it
              await fs.writeFile(
                path.join(PROJECT_SRC_DIR, `${bar}.ts`),
                CONTENTS[bar],
                { encoding: 'utf-8' },
              );

              // make sure that file is correctly created
              await expect(
                path.join(PROJECT_SRC_DIR, `${bar}.ts`),
              ).toBeValidFile();

              // both files should parse fine now
              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR, true);
              }).not.toThrow();

              expect(() => {
                parseFile(bar, PROJECT_SRC_DIR, true);
              }).not.toThrow();
            },
          );

          localTest(
            'should work with relative paths without tsconfig root',
            async ({ expect, PROJECT_SRC_DIR }) => {
              // parse once to: assert the config as correct, and to make sure the program is setup
              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR, true, true);
              }).not.toThrow();

              // bar should throw because it doesn't exist yet
              expect(() => {
                parseFile(bar, PROJECT_SRC_DIR, true, true);
              }).toThrow();

              // write a new file and attempt to parse it
              await fs.writeFile(
                path.join(PROJECT_SRC_DIR, `${bar}.ts`),
                CONTENTS[bar],
                { encoding: 'utf-8' },
              );

              // make sure that file is correctly created
              await expect(
                path.join(PROJECT_SRC_DIR, `${bar}.ts`),
              ).toBeValidFile();

              // both files should parse fine now
              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR, true, true);
              }).not.toThrow();

              expect(() => {
                parseFile(bar, PROJECT_SRC_DIR, true, true);
              }).not.toThrow();
            },
          );

          localTest.scoped({ tsConfigToWrite: 'excludes', writeBar: true });

          localTest(
            'reacts to changes in the tsconfig',
            async ({ expect, PROJECT_DIR, PROJECT_SRC_DIR }) => {
              // parse once to: assert the config as correct, and to make sure the program is setup
              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR);
              }).not.toThrow();

              expect(() => {
                parseFile(bar, PROJECT_SRC_DIR);
              }).toThrow();

              // change the config file so it now includes all files
              await fs.writeFile(
                path.join(PROJECT_DIR, 'tsconfig.json'),
                JSON.stringify(tsConfigIncludeAll, null, 2),
                { encoding: 'utf-8' },
              );

              clearCaches();

              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR);
              }).not.toThrow();

              expect(() => {
                parseFile(bar, PROJECT_SRC_DIR);
              }).not.toThrow();
            },
          );

          localTest(
            'parses included files, and throws on excluded files',
            ({ expect, PROJECT_SRC_DIR }) => {
              expect(() => {
                parseFile(foo, PROJECT_SRC_DIR);
              }).not.toThrow();

              expect(() => {
                parseFile(bar, PROJECT_SRC_DIR);
              }).toThrow();
            },
          );
        },
      );
    },
  );

  describe('tsconfig with module set', () => {
    const moduleTypes = [
      'None',
      'CommonJS',
      'AMD',
      'System',
      'UMD',
      'ES6',
      'ES2015',
      'ESNext',
    ] as const;

    const testNames = [
      'object',
      'number',
      'string',
      foo,
    ] as const satisfies readonly (keyof typeof CONTENTS)[];

    describe.for(moduleTypes)('module %s', module => {
      localTest.scoped({
        tsConfigIncludeAll: {
          compilerOptions: { module },
          include: ['./**/*'],
        },

        tsConfigToWrite: 'includes',
      });

      localTest.for(testNames)(
        'first parse of %s should not throw',
        async (name, { expect, PROJECT_SRC_DIR }) => {
          await fs.writeFile(
            path.join(PROJECT_SRC_DIR, `${name}.ts`),
            CONTENTS[name],
            { encoding: 'utf-8' },
          );

          expect(() => {
            parseFile(name, PROJECT_SRC_DIR);
          }).not.toThrow();
        },
      );
    });
  });
});

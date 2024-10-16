import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { execFile, FIXTURES_DESTINATION_DIR } from './pack-packages.js';

// make sure that vitest doesn't timeout the test
vi.setConfig({ testTimeout: 60_000 });

interface LocalTestFixture {
  /**
   * The glob pattern used to match files for linting.
   *
   * For example: `*.vue` or `*.md`
   */
  filesGlob: string;

  /**
   * The absolute path to the test file.
   *
   * For example:
   * `/home/username/typescript-eslint/packages/integration-tests/tests/vue-jsx.test.ts`
   */
  testFilename: string;

  /**
   * The absolute path to the folder containing the test fixture.
   *
   * For example:
   * `/home/username/tmp/typescript-eslint-integration-tests/fixtures/vue-jsx`
   */
  testFolder: string;

  /**
   * The name of the test fixture, derived from the test file name by removing
   * the `.test` suffix (and optionally the file extension).
   *
   * For example, given a file named `vue-jsx.test.ts`,
   * the fixture name would be `vue-jsx`.
   */
  testFixtureName: string;

  /**
   * The absolute path to the output file where linting results will be saved.
   *
   * For example:
   * `/home/username/tmp/typescript-eslint-integration-tests/fixtures/vue-jsx/eslint.json`
   */
  outFile: string;

  /**
   * The result of the linting process, represented by the parsed contents
   * of the JSON file specified by {@linkcode outFile}.
   */
  lintOutput: unknown;
}

const localTest = test.extend<LocalTestFixture>({
  filesGlob: ['*.ts', { auto: false }],

  lintOutput: [
    async ({ filesGlob, outFile, testFolder }, use) => {
      try {
        await execFile(
          'yarn',
          [
            'eslint',
            '--format',
            'json',
            '--output-file',
            outFile,
            '--fix-dry-run',
            filesGlob,
          ],
          {
            cwd: testFolder,
            shell: true,
          },
        );
      } catch {
        // we expect eslint will "fail" because we have intentional lint errors
      }

      // assert the linting state is consistent
      const lintOutputRAW = (await fs.readFile(outFile, { encoding: 'utf-8' }))
        // clean the output to remove any changing facets so tests are stable
        .replaceAll(
          new RegExp(`"filePath": ?"(/private)?${testFolder}`, 'g'),
          '"filePath": "<root>',
        )
        .replaceAll(
          /"filePath":"([^"]*)"/g,
          (_, testFile: string) =>
            `"filePath": "<root>/${path.relative(testFolder, testFile)}"`,
        )
        .replaceAll(/C:\\\\(usr)\\\\(linked)\\\\(tsconfig.json)/g, '/$1/$2/$3');

      const lintOutput = JSON.parse(lintOutputRAW);

      await use(lintOutput);
    },
    { auto: false },
  ],

  outFile: [
    async ({ testFolder }, use) => {
      // lint, outputting to a JSON file
      const outFile = path.join(testFolder, 'eslint.json');

      await use(outFile);
    },
    { auto: false },
  ],

  testFilename: [__filename, { auto: false }],

  testFixtureName: [
    async ({ testFilename }, use) => {
      const testFixtureName = path
        .parse(testFilename)
        .name.replace(/\.test$/, '');

      await use(testFixtureName);
    },
    { auto: false },
  ],

  testFolder: [
    async ({ testFixtureName }, use) => {
      const testFolder = path.join(FIXTURES_DESTINATION_DIR, testFixtureName);

      await use(testFolder);
    },
    { auto: false },
  ],
});

export function eslintIntegrationTest(
  testFilename: string,
  filesGlob: string,
): void {
  const testFixtureName = path.parse(testFilename).name.replace(/\.test$/, '');

  describe(testFixtureName, () => {
    localTest.scoped({ filesGlob, testFilename });

    describe('eslint', () => {
      localTest('should work successfully', ({ expect, lintOutput }) => {
        expect(lintOutput).toMatchSnapshot();
      });
    });
  });
}

export function typescriptIntegrationTest(
  testName: string,
  testFilename: string,
  tscArgs: string[],
  assertOutput: (out: string) => void,
): void {
  const fixture = path.parse(testFilename).name.replace('.test', '');

  const testFolder = path.join(FIXTURES_DESTINATION_DIR, fixture);

  describe(fixture, () => {
    describe(testName, () => {
      it('should work successfully', async () => {
        const [result] = await Promise.allSettled([
          execFile('yarn', ['tsc', '--noEmit', '--skipLibCheck', ...tscArgs], {
            cwd: testFolder,
            shell: true,
          }),
        ]);

        if (result.status === 'rejected') {
          // this looks weird - but it means that we can show the stdout (the errors)
          // in the test output when typescript fails which helps with debugging
          assertOutput(
            (result.reason as { stdout: string }).stdout.replace(
              // on macos the tmp path might be shown by TS with `/private/`, but
              // the tmp util does not include that prefix folder
              new RegExp(`(/private)?${testFolder}`),
              '/<tmp_folder>',
            ),
          );
        } else {
          // TS logs nothing when it succeeds
          expect(result.value.stdout).toBe('');
          expect(result.value.stderr).toBe('');
        }
      });
    });
  });
}

/**
 * Pack all of our packages so we can "install" them later.
 * We do this here rather than per test so that we only have
 * to do it once per test run as it takes a decent chunk of
 * time to do.
 * This also ensures all of the tests are guaranteed to run
 * against the exact same version of the package.
 */

import type { TestProject } from 'vitest/node';

import * as child_process from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import rootPackageJson from '../../../package.json';

export const execFile = promisify(child_process.execFile);

export interface PackageJSON {
  devDependencies: Record<string, string>;
  name: string;
  private?: boolean;
}

const PACKAGES_DIR = path.resolve(__dirname, '..', '..');

export const INTEGRATION_TEST_DIR = path.join(
  os.tmpdir() || os.homedir(),
  'typescript-eslint-integration-tests',
);

export const YARN_RC_CONTENT =
  'nodeLinker: node-modules\n\nenableGlobalCache: true\n';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

const TAR_FOLDER = path.join(INTEGRATION_TEST_DIR, 'tarballs');

export const setup = async (project: TestProject): Promise<void> => {
  const PACKAGES = await fs.readdir(PACKAGES_DIR, {
    encoding: 'utf-8',
    withFileTypes: true,
  });

  await fs.mkdir(TAR_FOLDER, { recursive: true });

  const tseslintPackages = Object.fromEntries(
    (
      await Promise.all(
        PACKAGES.map(async ({ name: pkg }) => {
          const packageDir = path.join(PACKAGES_DIR, pkg);
          const packagePath = path.join(packageDir, 'package.json');

          try {
            if (!(await fs.lstat(packagePath)).isFile()) {
              return;
            }
          } catch {
            return;
          }

          const packageJson: PackageJSON = (
            await project.import<PackageJSON & { default: PackageJSON }>(
              pathToFileURL(packagePath).href,
            )
          ).default;

          if ('private' in packageJson && packageJson.private === true) {
            return;
          }

          const result = await execFile('npm', ['pack', packageDir], {
            cwd: TAR_FOLDER,
            encoding: 'utf-8',
            shell: true,
          });

          if (typeof result.stdout !== 'string') {
            return;
          }

          const stdoutLines = result.stdout.trim().split('\n');
          const tarball = stdoutLines[stdoutLines.length - 1];

          return [
            packageJson.name,
            `file:${path.join(TAR_FOLDER, tarball)}`,
          ] as const;
        }),
      )
    ).filter(e => e != null),
  );

  const testFiles = project.vitest.state
    .getPaths()
    .map(e => path.basename(e, '.test.ts'));

  await fs.cp(FIXTURES_DIR, INTEGRATION_TEST_DIR, {
    filter(source, destination) {
      const sourceBasename = path.basename(source);

      if (
        sourceBasename === path.basename(FIXTURES_DIR) ||
        path.basename(INTEGRATION_TEST_DIR) === path.basename(destination) ||
        testFiles.includes(sourceBasename) ||
        testFiles.includes(path.basename(path.dirname(destination)))
      ) {
        return true;
      }

      return false;
    },

    recursive: true,
  });

  const BASE_DEPENDENCIES: PackageJSON['devDependencies'] = {
    ...tseslintPackages,
    eslint: rootPackageJson.devDependencies.eslint,
    typescript: rootPackageJson.devDependencies.typescript,
    vitest: rootPackageJson.devDependencies.vitest,
  };

  const temp = await fs.mkdtemp(path.join(INTEGRATION_TEST_DIR, 'temp'), {
    encoding: 'utf-8',
  });

  await fs.writeFile(
    path.join(temp, 'package.json'),
    JSON.stringify(
      {
        devDependencies: BASE_DEPENDENCIES,
        packageManager: rootPackageJson.packageManager,
        private: true,
        resolutions: tseslintPackages,
      },
      null,
      2,
    ),
    { encoding: 'utf-8' },
  );

  await fs.writeFile(path.join(temp, '.yarnrc.yml'), YARN_RC_CONTENT, {
    encoding: 'utf-8',
  });

  await execFile('yarn', ['install', '--no-immutable'], {
    cwd: temp,
    shell: true,
  });

  await fs.rm(temp, { recursive: true });

  await Promise.all(
    testFiles.map(async fixture => {
      const testFolder = path.join(INTEGRATION_TEST_DIR, fixture);

      const fixtureDir = path.join(FIXTURES_DIR, fixture);

      // const fixturePackageJsonPath = pathToFileURL(
      //   path.join(fixtureDir, 'package.json'),
      // ).href;

      const fixturePackageJson: PackageJSON = (
        await project.import<PackageJSON & { default: PackageJSON }>(
          pathToFileURL(path.join(fixtureDir, 'package.json')).href,
        )
      ).default;

      await fs.writeFile(
        path.join(testFolder, 'package.json'),
        JSON.stringify(
          {
            private: true,
            ...fixturePackageJson,
            devDependencies: {
              ...BASE_DEPENDENCIES,
              ...fixturePackageJson.devDependencies,
            },

            packageManager: rootPackageJson.packageManager,

            // ensure everything uses the locally packed versions instead of the NPM versions
            resolutions: {
              ...tseslintPackages,
            },
          },
          null,
          2,
        ),
        { encoding: 'utf-8' },
      );

      await fs.writeFile(
        path.join(testFolder, '.yarnrc.yml'),
        YARN_RC_CONTENT,
        { encoding: 'utf-8' },
      );

      const { stderr, stdout } = await execFile(
        'yarn',
        ['install', '--no-immutable'],
        {
          cwd: testFolder,
          shell: true,
        },
      );

      if (stderr) {
        console.error(stderr);

        if (stdout) {
          console.log(stdout);
        }
      }
    }),
  );

  console.log('Finished packing local packages.');
};

export const teardown = async (): Promise<void> => {
  if (process.env.KEEP_INTEGRATION_TEST_DIR !== 'true') {
    await fs.rm(INTEGRATION_TEST_DIR, { recursive: true });
  }
};

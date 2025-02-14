import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// the promisify util will eat the stderr logs
async function execAsync(
  command: string,
  args: readonly string[],
  options: childProcess.SpawnOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, {
      ...options,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });

    child.on('error', e => reject(e));
    child.on('exit', () => resolve());
    child.on('close', () => resolve());
  });
}

const AST_SPEC_PATH = path.resolve(__dirname, '../../ast-spec');
const OUTPUT_PATH = path.join(path.resolve(__dirname, '../src/generated'));

const HEADER = `\
/**********************************************
 *      DO NOT MODIFY THIS FILE MANUALLY      *
 *                                            *
 *  THIS FILE HAS BEEN COPIED FROM ast-spec.  *
 * ANY CHANGES WILL BE LOST ON THE NEXT BUILD *
 *                                            *
 *   MAKE CHANGES TO ast-spec AND THEN RUN    *
 *                 yarn build                 *
 **********************************************/

`;

async function copyFile(
  folderName: string,
  fileName: string,
  transformer: (code: string) => string = (s): string => s,
): Promise<void> {
  const code = await fs.readFile(
    path.join(AST_SPEC_PATH, folderName, fileName),
    'utf-8',
  );

  const transformedCode = transformer(code);

  const outpath = path.join(OUTPUT_PATH, fileName);
  await fs.writeFile(outpath, HEADER + transformedCode, {
    encoding: 'utf-8',
  });

  await execAsync(
    'yarn',
    ['run', '--top-level', 'prettier', '--write', outpath],
    {},
  );

  console.log('Copied', fileName);
}

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_PATH, { recursive: true });

  if (process.env.SKIP_AST_SPEC_REBUILD) {
    // ensure the package is built
    await execAsync('yarn', ['build'], { cwd: AST_SPEC_PATH });
  }

  await copyFile('dist', 'ast-spec.ts', code =>
    code.replaceAll('export declare enum', 'export enum'),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

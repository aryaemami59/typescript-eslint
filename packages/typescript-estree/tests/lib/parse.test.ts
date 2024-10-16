import type {
  CacheDurationSeconds,
  SourceTypeClassic,
} from '@typescript-eslint/types';

import debug from 'debug';
import * as fastGlobModule from 'fast-glob';
import * as path from 'node:path';

import type { TSESTreeOptions } from '../../src/index.js';

import * as sharedParserUtilsModule from '../../src/create-program/shared.js';
import {
  AST_NODE_TYPES,
  clearCaches,
  parse,
  parseAndGenerateServices,
} from '../../src/index.js';
import { clearGlobResolutionCache } from '../../src/parseSettings/resolveProjectList.js';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'simpleProject');

vi.mock(import('../../src/create-program/shared.js'), async importOriginal => {
  const sharedActual = await importOriginal();

  return {
    ...sharedActual,
    __esModule: true,
    createDefaultCompilerOptionsFromExtra: vi.fn(
      sharedActual.createDefaultCompilerOptionsFromExtra,
    ),
  };
});

// Tests in CI by default run with lowercase program file names,
// resulting in path.relative results starting with many "../"s
vi.mock(import('typescript'), async importOriginal => {
  const ts = await importOriginal();

  return {
    ...ts,
    default: ts.default,
    sys: {
      ...ts.sys,
      useCaseSensitiveFileNames: true,
    },
  };
});

vi.mock('fast-glob', async importOriginal => {
  const fastGlob = await importOriginal<typeof fastGlobModule>();

  return {
    ...fastGlob,
    default: fastGlob.default,
    sync: vi.fn(fastGlob.sync),
  };
});

const createDefaultCompilerOptionsFromExtra = vi.mocked(
  sharedParserUtilsModule.createDefaultCompilerOptionsFromExtra,
);

const fastGlobSyncMock = vi.mocked(fastGlobModule.sync);

/**
 * Aligns paths between environments, node for windows uses `\`, for linux and mac uses `/`
 */
function alignErrorPath(error: Error): never {
  error.message = error.message.replaceAll(/\\(?!")/g, '/');
  throw error;
}

describe(parseAndGenerateServices, () => {
  const hrtimeSpy = vi.spyOn(process, 'hrtime');

  afterEach(() => {
    vi.clearAllMocks();
    clearGlobResolutionCache();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('preserveNodeMaps', () => {
    const code = 'var a = true';

    const baseConfig = {
      comment: true,
      filePath: 'file.ts',
      loc: true,
      range: true,
      tokens: true,
    } as const satisfies TSESTreeOptions;

    const projectConfig = {
      ...baseConfig,
      project: './tsconfig.json',
      tsconfigRootDir: FIXTURES_DIR,
    } as const satisfies TSESTreeOptions;

    it('should not impact the use of parse()', () => {
      const resultWithNoOptionSet = parse(code, baseConfig);

      const resultWithOptionSetToTrue = parse(code, {
        ...baseConfig,
        preserveNodeMaps: true,
      });

      const resultWithOptionSetToFalse = parse(code, {
        ...baseConfig,
        preserveNodeMaps: false,
      });

      const resultWithOptionSetExplicitlyToUndefined = parse(code, {
        ...baseConfig,
        preserveNodeMaps: undefined,
      });

      expect(resultWithNoOptionSet).toStrictEqual(resultWithOptionSetToTrue);

      expect(resultWithNoOptionSet).toStrictEqual(resultWithOptionSetToFalse);

      expect(resultWithNoOptionSet).toStrictEqual(
        resultWithOptionSetExplicitlyToUndefined,
      );
    });

    it('should preserve node maps by default for parseAndGenerateServices()', () => {
      const noOptionSet = parseAndGenerateServices(code, baseConfig);

      expect(noOptionSet.services.esTreeNodeToTSNodeMap).toBeInstanceOf(
        WeakMap,
      );

      expect(noOptionSet.services.tsNodeToESTreeNodeMap).toBeInstanceOf(
        WeakMap,
      );

      const withProjectNoOptionSet = parseAndGenerateServices(
        code,
        projectConfig,
      );

      expect(
        withProjectNoOptionSet.services.esTreeNodeToTSNodeMap,
      ).toBeInstanceOf(WeakMap);

      expect(
        withProjectNoOptionSet.services.tsNodeToESTreeNodeMap,
      ).toBeInstanceOf(WeakMap);
    });

    describe.for([
      ['', true],
      [' not', false],
    ] as const)(
      'should%s preserve node maps for parseAndGenerateServices() when option is `%s`, regardless of `project` config',
      ([, setting]) => {
        it('without project', () => {
          const parseResult = parseAndGenerateServices(code, {
            ...baseConfig,
            preserveNodeMaps: setting,
          });

          expect(
            parseResult.services.esTreeNodeToTSNodeMap.has(
              parseResult.ast.body[0],
            ),
          ).toBe(setting);
        });

        it('with project', () => {
          const parseResult = parseAndGenerateServices(code, {
            ...projectConfig,
            preserveNodeMaps: setting,
          });

          expect(
            parseResult.services.esTreeNodeToTSNodeMap.has(
              parseResult.ast.body[0],
            ),
          ).toBe(setting);
        });
      },
    );
  });

  describe('isolated parsing', () => {
    const config = {
      comment: true,
      disallowAutomaticSingleRunInference: true,
      loc: true,
      projectService: false,
      range: true,
      tokens: true,
    } as const satisfies TSESTreeOptions;

    const jsxContent = 'const x = <div />;';

    const plainJScontent = 'const x = 1';

    const ALL_TEST_CASES = [
      ['.js', 'without', false, false, plainJScontent],
      ['.js', 'without', true, false, plainJScontent],
      ['.js', 'with', false, false, jsxContent],
      ['.js', 'with', true, false, jsxContent],
      ['.jsx', 'without', false, false, plainJScontent],
      ['.jsx', 'without', true, false, plainJScontent],
      ['.jsx', 'with', false, false, jsxContent],
      ['.jsx', 'with', true, false, jsxContent],
      ['.ts', 'without', false, false, plainJScontent],
      ['.ts', 'without', true, false, plainJScontent],
      [
        '.ts',
        'with',
        false,
        true, // Typescript does not allow JSX in a .ts file
        jsxContent,
      ],
      ['.ts', 'with', true, true, jsxContent],
      ['.tsx', 'without', false, false, plainJScontent],
      ['.tsx', 'without', true, false, plainJScontent],
      ['.tsx', 'with', false, false, jsxContent],
      ['.tsx', 'with', true, false, jsxContent],
      ['.vue', 'without', false, false, plainJScontent],
      ['.vue', 'without', true, false, plainJScontent],
      [
        '.vue',
        'with',
        false,
        true, // "Unknown" filetype means we respect the JSX setting
        jsxContent,
      ],
      ['.vue', 'with', true, false, jsxContent],
      ['.json', 'without', false, false, '{ "x": 1 }'],
    ] as const satisfies readonly [
      ext: '.js' | '.json' | '.jsx' | '.ts' | '.tsx' | '.vue',
      jsxContent: 'with' | 'without',
      jsxSettings: boolean,
      shouldThrow: boolean,
      code: 'const x = 1' | 'const x = <div />;' | '{ "x": 1 }',
    ][] satisfies readonly (
      | readonly [
          ext: '.js' | '.jsx' | '.ts' | '.tsx' | '.vue',
          jsxContent: 'with',
          jsxSettings: boolean,
          shouldThrow: boolean,
          code: 'const x = <div />;',
        ]
      | readonly [
          ext: '.js' | '.jsx' | '.ts' | '.tsx' | '.vue',
          jsxContent: 'without',
          jsxSettings: boolean,
          shouldThrow: boolean,
          code: 'const x = 1',
        ]
      | readonly [
          ext: '.json',
          jsxContent: 'without',
          jsxSettings: boolean,
          shouldThrow: boolean,
          code: '{ "x": 1 }',
        ]
    )[];

    const ERROR_TEST_CASES = ALL_TEST_CASES.filter(testCases => testCases[3]);

    const VALID_TEST_CASES = ALL_TEST_CASES.filter(testCases => !testCases[3]);

    it.for(ERROR_TEST_CASES)(
      'should not parse %s file - %s JSX content - parserOptions.jsx = %s',
      ([ext, , jsxSetting, , code], { expect }) => {
        expect(() => {
          parseAndGenerateServices(code, {
            ...config,
            filePath: path.join(FIXTURES_DIR, `file${ext}`),
            jsx: jsxSetting,
          });
        }).toThrow();
      },
    );

    it.for(VALID_TEST_CASES)(
      'should parse %s file - %s JSX content - parserOptions.jsx = %s',
      ([ext, , jsxSetting, , code], { expect }) => {
        const result = parseAndGenerateServices(code, {
          ...config,
          filePath: path.join(FIXTURES_DIR, `file${ext}`),
          jsx: jsxSetting,
        });

        assert.isNull(result.services.program);

        expect({
          ...result,
          services: {
            ...result.services,
            // Reduce noise in snapshot by not printing the TS program
            program: 'No Program',
          },
        }).toMatchSnapshot();
      },
    );
  });

  describe('ESM parsing', () => {
    describe('TLA(Top Level Await)', () => {
      const config = {
        comment: true,
        loc: true,
        projectService: false,
        range: true,
        tokens: true,
      } as const satisfies TSESTreeOptions;

      const code = 'await(1)';

      const ALL_TEST_CASES = [
        ['.js', 'not allow', false, undefined, AST_NODE_TYPES.CallExpression],
        ['.ts', 'not allow', false, undefined, AST_NODE_TYPES.CallExpression],
        ['.mjs', 'allow', true, undefined, AST_NODE_TYPES.AwaitExpression],
        ['.mts', 'allow', true, undefined, AST_NODE_TYPES.AwaitExpression],
        ['.js', 'allow', true, 'module', AST_NODE_TYPES.AwaitExpression],
        ['.ts', 'allow', true, 'module', AST_NODE_TYPES.AwaitExpression],
        ['.mjs', 'allow', true, 'module', AST_NODE_TYPES.AwaitExpression],
        ['.mts', 'allow', true, 'module', AST_NODE_TYPES.AwaitExpression],
        ['.js', 'not allow', false, 'script', AST_NODE_TYPES.CallExpression],
        ['.ts', 'not allow', false, 'script', AST_NODE_TYPES.CallExpression],
        ['.mjs', 'not allow', false, 'script', AST_NODE_TYPES.CallExpression],
        ['.mts', 'not allow', false, 'script', AST_NODE_TYPES.CallExpression],
      ] as const satisfies readonly [
        ext: '.js' | '.mjs' | '.mts' | '.ts',
        allowOrNot: 'allow' | 'not allow',
        shouldAllowTLA: boolean,
        sourceType: SourceTypeClassic | undefined,
        expectedExpressionType:
          | AST_NODE_TYPES.AwaitExpression
          | AST_NODE_TYPES.CallExpression,
      ][] satisfies readonly (
        | [
            ext: '.js' | '.mjs' | '.mts' | '.ts',
            allowOrNot: 'allow',
            shouldAllowTLA: true,
            sourceType: SourceTypeClassic | undefined,
            expectedExpressionType: AST_NODE_TYPES.AwaitExpression,
          ]
        | [
            ext: '.js' | '.mjs' | '.mts' | '.ts',
            allowOrNot: 'not allow',
            shouldAllowTLA: false,
            sourceType: SourceTypeClassic | undefined,
            expectedExpressionType: AST_NODE_TYPES.CallExpression,
          ]
      )[];

      it.for(ALL_TEST_CASES)(
        'parse(): should $1 TLA for $0 file with sourceType = $3',
        ([ext, , , sourceType, expectedExpressionType], { expect }) => {
          const ast = parse(code, {
            ...config,
            filePath: `file${ext}`,
            sourceType,
          });

          assert.isNodeOfType(ast.body[0], AST_NODE_TYPES.ExpressionStatement);

          const expressionType = ast.body[0].expression.type;

          expect(expressionType).toBe(expectedExpressionType);
        },
      );

      it.for(ALL_TEST_CASES)(
        'parseAndGenerateServices(): should $1 TLA for $0 file with sourceType = $3',
        ([ext, , , sourceType, expectedExpressionType], { expect }) => {
          const result = parseAndGenerateServices(code, {
            ...config,
            filePath: `file${ext}`,
            sourceType,
          });

          assert.isNodeOfType(
            result.ast.body[0],
            AST_NODE_TYPES.ExpressionStatement,
          );

          const expressionType = result.ast.body[0].expression.type;

          expect(expressionType).toBe(expectedExpressionType);
        },
      );
    });
  });

  describe.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
    'invalid file error messages',
    () => {
      const PROJECT_DIR = path.join(FIXTURES_DIR, '..', 'invalidFileErrors');

      const code = 'var a = true';

      const config = {
        comment: true,
        disallowAutomaticSingleRunInference: true,
        extraFileExtensions: ['.vue'],
        loc: true,
        project: './tsconfig.json',
        range: true,
        tokens: true,
        tsconfigRootDir: PROJECT_DIR,
      } as const satisfies TSESTreeOptions;

      const testParse =
        (filePath: string, extraFileExtensions: string[] = ['.vue']) =>
        (): void => {
          try {
            parseAndGenerateServices(code, {
              ...config,
              extraFileExtensions,
              filePath: path.join(PROJECT_DIR, filePath),
              // project: './tsconfig.json',
            });
          } catch (error) {
            alignErrorPath(error as Error);
          }
        };

      describe('project includes', () => {
        it.for([
          ['ts', 'included01.ts'],
          ['ts', 'included02.tsx'],
          ['js', 'included01.js'],
          ['js', 'included02.jsx'],
        ] as const)(
          "doesn't error for matched files: %s/%s",
          ([directoryName, fileName], { expect }) => {
            expect(() => {
              parseAndGenerateServices(code, {
                ...config,
                filePath: path.join(PROJECT_DIR, directoryName, fileName),
              });
            }).not.toThrow();
          },
        );

        it('errors for not included files', () => {
          expect(() => {
            try {
              parseAndGenerateServices(code, {
                ...config,
                filePath: path.join(PROJECT_DIR, 'ts', 'notIncluded0j1.ts'),
              });
            } catch (error) {
              alignErrorPath(error as Error);
            }
          }).toThrowErrorMatchingInlineSnapshot(`
            [Error: ESLint was configured to run on \`<tsconfigRootDir>/ts/notIncluded0j1.ts\` using \`parserOptions.project\`: <tsconfigRootDir>/tsconfig.json
            However, that TSConfig does not include this file. Either:
            - Change ESLint's list of included files to not include this file
            - Change that TSConfig to include this file
            - Create a new TSConfig that includes this file and include it in your parserOptions.project
            See the typescript-eslint docs for more info: https://typescript-eslint.io/troubleshooting/typed-linting#i-get-errors-telling-me-eslint-was-configured-to-run--however-that-tsconfig-does-not--none-of-those-tsconfigs-include-this-file]
          `);

          expect(() => {
            try {
              parseAndGenerateServices(code, {
                ...config,
                filePath: path.join(PROJECT_DIR, 'ts', 'notIncluded02.tsx'),
              });
            } catch (error) {
              alignErrorPath(error as Error);
            }
          }).toThrowErrorMatchingInlineSnapshot(`
              [Error: ESLint was configured to run on \`<tsconfigRootDir>/ts/notIncluded02.tsx\` using \`parserOptions.project\`: <tsconfigRootDir>/tsconfig.json
              However, that TSConfig does not include this file. Either:
              - Change ESLint's list of included files to not include this file
              - Change that TSConfig to include this file
              - Create a new TSConfig that includes this file and include it in your parserOptions.project
              See the typescript-eslint docs for more info: https://typescript-eslint.io/troubleshooting/typed-linting#i-get-errors-telling-me-eslint-was-configured-to-run--however-that-tsconfig-does-not--none-of-those-tsconfigs-include-this-file]
            `);
          expect(testParse('js/notIncluded01.js'))
            .toThrowErrorMatchingInlineSnapshot(`
              [Error: ESLint was configured to run on \`<tsconfigRootDir>/js/notIncluded01.js\` using \`parserOptions.project\`: <tsconfigRootDir>/tsconfig.json
              However, that TSConfig does not include this file. Either:
              - Change ESLint's list of included files to not include this file
              - Change that TSConfig to include this file
              - Create a new TSConfig that includes this file and include it in your parserOptions.project
              See the typescript-eslint docs for more info: https://typescript-eslint.io/troubleshooting/typed-linting#i-get-errors-telling-me-eslint-was-configured-to-run--however-that-tsconfig-does-not--none-of-those-tsconfigs-include-this-file]
            `);
          expect(testParse('js/notIncluded02.jsx'))
            .toThrowErrorMatchingInlineSnapshot(`
              [Error: ESLint was configured to run on \`<tsconfigRootDir>/js/notIncluded02.jsx\` using \`parserOptions.project\`: <tsconfigRootDir>/tsconfig.json
              However, that TSConfig does not include this file. Either:
              - Change ESLint's list of included files to not include this file
              - Change that TSConfig to include this file
              - Create a new TSConfig that includes this file and include it in your parserOptions.project
              See the typescript-eslint docs for more info: https://typescript-eslint.io/troubleshooting/typed-linting#i-get-errors-telling-me-eslint-was-configured-to-run--however-that-tsconfig-does-not--none-of-those-tsconfigs-include-this-file]
            `);
        });
      });

      describe('"parserOptions.extraFileExtensions" is empty', () => {
        it('should not error', () => {
          expect(() => {
            parseAndGenerateServices(code, {
              ...config,
              extraFileExtensions: [],
              filePath: path.join(PROJECT_DIR, 'ts', 'included01.ts'),
            });
          }).not.toThrow();
        });

        it('the extension does not match', () => {
          expect(testParse('other/unknownFileType.unknown', []))
            .toThrowErrorMatchingInlineSnapshot(`
              [Error: ESLint was configured to run on \`<tsconfigRootDir>/other/unknownFileType.unknown\` using \`parserOptions.project\`: <tsconfigRootDir>/tsconfig.json
              The extension for the file (\`.unknown\`) is non-standard. You should add \`parserOptions.extraFileExtensions\` to your config.]
            `);
        });
      });

      describe('"parserOptions.extraFileExtensions" is non-empty', () => {
        describe('the extension matches', () => {
          it('the file is included', () => {
            expect(() => {
              parseAndGenerateServices(code, {
                ...config,
                filePath: path.join(PROJECT_DIR, 'other', 'included.vue'),
              });
            }).not.toThrow();
          });

          it("the file isn't included", () => {
            expect(testParse('other/notIncluded.vue'))
              .toThrowErrorMatchingInlineSnapshot(`
                [Error: ESLint was configured to run on \`<tsconfigRootDir>/other/notIncluded.vue\` using \`parserOptions.project\`: <tsconfigRootDir>/tsconfig.json
                However, that TSConfig does not include this file. Either:
                - Change ESLint's list of included files to not include this file
                - Change that TSConfig to include this file
                - Create a new TSConfig that includes this file and include it in your parserOptions.project
                See the typescript-eslint docs for more info: https://typescript-eslint.io/troubleshooting/typed-linting#i-get-errors-telling-me-eslint-was-configured-to-run--however-that-tsconfig-does-not--none-of-those-tsconfigs-include-this-file]
              `);
          });

          it('duplicate extension', () => {
            expect(testParse('ts/notIncluded.ts', ['.ts']))
              .toThrowErrorMatchingInlineSnapshot(`
                [Error: ESLint was configured to run on \`<tsconfigRootDir>/ts/notIncluded.ts\` using \`parserOptions.project\`: <tsconfigRootDir>/tsconfig.json
                You unnecessarily included the extension \`.ts\` with the \`parserOptions.extraFileExtensions\` option. This extension is already handled by the parser by default.
                However, that TSConfig does not include this file. Either:
                - Change ESLint's list of included files to not include this file
                - Change that TSConfig to include this file
                - Create a new TSConfig that includes this file and include it in your parserOptions.project
                See the typescript-eslint docs for more info: https://typescript-eslint.io/troubleshooting/typed-linting#i-get-errors-telling-me-eslint-was-configured-to-run--however-that-tsconfig-does-not--none-of-those-tsconfigs-include-this-file]
              `);
          });
        });

        it('invalid extension', () => {
          expect(testParse('other/unknownFileType.unknown', ['unknown']))
            .toThrowErrorMatchingInlineSnapshot(`
              [Error: ESLint was configured to run on \`<tsconfigRootDir>/other/unknownFileType.unknown\` using \`parserOptions.project\`: <tsconfigRootDir>/tsconfig.json
              Found unexpected extension \`unknown\` specified with the \`parserOptions.extraFileExtensions\` option. Did you mean \`.unknown\`?
              The extension for the file (\`.unknown\`) is non-standard. It should be added to your existing \`parserOptions.extraFileExtensions\`.]
            `);
        });

        it('the extension does not match', () => {
          expect(testParse('other/unknownFileType.unknown'))
            .toThrowErrorMatchingInlineSnapshot(`
              [Error: ESLint was configured to run on \`<tsconfigRootDir>/other/unknownFileType.unknown\` using \`parserOptions.project\`: <tsconfigRootDir>/tsconfig.json
              The extension for the file (\`.unknown\`) is non-standard. It should be added to your existing \`parserOptions.extraFileExtensions\`.]
            `);
        });
      });

      describe('"parserOptions.extraFileExtensions" is non-empty and projectService is true', () => {
        describe('the extension matches', () => {
          it('the file is included', () => {
            expect(() => {
              parseAndGenerateServices(code, {
                ...config,
                filePath: path.join(PROJECT_DIR, 'other', 'included.vue'),
                projectService: true,
              });
            }).not.toThrow();
          });

          it("the file isn't included", () => {
            expect(() => {
              parseAndGenerateServices(code, {
                ...config,
                filePath: path.join(PROJECT_DIR, 'other', 'notIncluded.vue'),
                projectService: true,
              });
            }).toThrow(/notIncluded\.vue was not found by the project service/);
          });

          it('duplicate extension', () => {
            expect(() => {
              parseAndGenerateServices(code, {
                ...config,
                extraFileExtensions: ['.ts'],
                filePath: path.join(PROJECT_DIR, 'ts', 'notIncluded.ts'),
                projectService: true,
              });
            }).toThrow(/notIncluded\.ts was not found by the project service/);
          });
        });

        it('extension matching the file name but not a file on disk', () => {
          expect(() => {
            parseAndGenerateServices(code, {
              ...config,
              extraFileExtensions: ['.unknown'],
              filePath: path.join(
                PROJECT_DIR,
                'other',
                'unknownFileType.unknown',
              ),
              projectService: true,
            });
          }).toThrow(
            /unknownFileType\.unknown was not found by the project service/,
          );
        });

        it('the extension does not match the file name', () => {
          expect(() => {
            parseAndGenerateServices(code, {
              ...config,
              extraFileExtensions: ['.vue'],
              filePath: path.join(
                PROJECT_DIR,
                'other',
                'unknownFileType.unknown',
              ),
              projectService: true,
            });
          }).toThrow(
            /unknownFileType\.unknown was not found by the project service/,
          );
        });
      });
    },
  );

  describe.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
    'invalid project error messages',
    () => {
      const PROJECT_DIR = path.join(FIXTURES_DIR, '..', 'invalidFileErrors');

      const code = 'var a = true';

      const config = {
        comment: true,
        disallowAutomaticSingleRunInference: true,
        loc: true,
        project: ['./**/tsconfig.json', './**/tsconfig.extra.json'],
        range: true,
        tokens: true,
        tsconfigRootDir: PROJECT_DIR,
      } as const satisfies TSESTreeOptions;

      it('throws when none of multiple projects include the file', () => {
        expect(() => {
          try {
            parseAndGenerateServices(code, {
              ...config,
              filePath: path.join(PROJECT_DIR, 'ts', 'notIncluded0j1.ts'),
            });
          } catch (error) {
            alignErrorPath(error as Error);
          }
        }).toThrowErrorMatchingInlineSnapshot(`
              [Error: ESLint was configured to run on \`<tsconfigRootDir>/ts/notIncluded0j1.ts\` using \`parserOptions.project\`:
              - <tsconfigRootDir>/tsconfig.json
              - <tsconfigRootDir>/tsconfig.extra.json
              However, none of those TSConfigs include this file. Either:
              - Change ESLint's list of included files to not include this file
              - Change one of those TSConfigs to include this file
              - Create a new TSConfig that includes this file and include it in your parserOptions.project
              See the typescript-eslint docs for more info: https://typescript-eslint.io/troubleshooting/typed-linting#i-get-errors-telling-me-eslint-was-configured-to-run--however-that-tsconfig-does-not--none-of-those-tsconfigs-include-this-file]
            `);
      });
    },
  );

  describe('debug options', () => {
    const debugEnable = vi.spyOn(debug, 'enable');
    vi.spyOn(debug, 'enabled').mockImplementation(() => false);

    const code = 'const x = 1;';

    it("shouldn't turn on debugger if no options were provided", () => {
      parseAndGenerateServices(code, {
        debugLevel: [],
        disallowAutomaticSingleRunInference: true,
      });

      expect(debugEnable).not.toHaveBeenCalled();
    });

    it('should turn on eslint debugger', () => {
      parseAndGenerateServices(code, {
        debugLevel: ['eslint'],
        disallowAutomaticSingleRunInference: true,
      });

      expect(debugEnable).toHaveBeenCalledExactlyOnceWith(
        'eslint:*,-eslint:code-path',
      );
    });

    it('should turn on typescript-eslint debugger', () => {
      parseAndGenerateServices(code, {
        debugLevel: ['typescript-eslint'],
        disallowAutomaticSingleRunInference: true,
      });

      expect(debugEnable).toHaveBeenCalledExactlyOnceWith(
        'typescript-eslint:*',
      );
    });

    it('should turn on both eslint and typescript-eslint debugger', () => {
      parseAndGenerateServices(code, {
        debugLevel: ['typescript-eslint', 'eslint'],
        disallowAutomaticSingleRunInference: true,
      });

      expect(debugEnable).toHaveBeenCalledExactlyOnceWith(
        'typescript-eslint:*,eslint:*,-eslint:code-path',
      );
    });

    it.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
      'should turn on typescript debugger',
      () => {
        expect(() => {
          parseAndGenerateServices(code, {
            debugLevel: ['typescript'],
            disallowAutomaticSingleRunInference: true,
            filePath: './path-that-doesnt-exist.ts',
            project: ['./tsconfig-that-doesnt-exist.json'],
          });
        }) // should throw because the file and tsconfig don't exist
          .toThrow();

        expect(createDefaultCompilerOptionsFromExtra).toHaveBeenCalledOnce();
        expect(createDefaultCompilerOptionsFromExtra).toHaveLastReturnedWith(
          expect.objectContaining({
            extendedDiagnostics: true,
          }),
        );
      },
    );
  });

  describe.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
    'projectFolderIgnoreList',
    () => {
      beforeEach(() => {
        clearCaches();
      });

      const PROJECT_DIR = path.join(
        FIXTURES_DIR,
        '..',
        'projectFolderIgnoreList',
      );

      const code = 'var a = true';

      const config = {
        comment: true,
        disallowAutomaticSingleRunInference: true,
        loc: true,
        project: './**/tsconfig.json',
        range: true,
        tokens: true,
        tsconfigRootDir: PROJECT_DIR,
      } as const satisfies TSESTreeOptions;

      it.for([['ignoreme'], ['includeme']] as const)(
        'ignores nothing when given nothing: %s',
        ([directoryName], { expect }) => {
          expect(() => {
            parseAndGenerateServices(code, {
              ...config,
              filePath: path.join(PROJECT_DIR, directoryName, 'file.ts'),
            });
          }).not.toThrow();
        },
      );

      it('ignores a folder when given a string glob', () => {
        const ignore = ['**/ignoreme/**'];

        expect(() => {
          parseAndGenerateServices(code, {
            ...config,
            // cspell:disable-next-line
            filePath: path.join(PROJECT_DIR, 'ignoreme', 'file.ts'),
            projectFolderIgnoreList: ignore,
          });
        }).toThrow();

        expect(() => {
          parseAndGenerateServices(code, {
            ...config,
            // cspell:disable-next-line
            filePath: path.join(PROJECT_DIR, 'includeme', 'file.ts'),
            projectFolderIgnoreList: ignore,
          });
        }).not.toThrow();
      });
    },
  );

  describe.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
    'cacheLifetime',
    () => {
      describe('glob', () => {
        const project = ['./**/tsconfig.json', './**/tsconfig.extra.json'];
        // fast-glob returns arbitrary order of results to improve performance.
        // `resolveProjectList()` calls fast-glob for each pattern to ensure the
        // order is correct.
        // Thus the expected call time of spy is the number of patterns.
        const expectFastGlobCalls = project.length;
        function doParse(lifetime: CacheDurationSeconds): void {
          parseAndGenerateServices('const x = 1', {
            cacheLifetime: {
              glob: lifetime,
            },
            disallowAutomaticSingleRunInference: true,
            filePath: path.join(FIXTURES_DIR, 'file.ts'),
            project,
            tsconfigRootDir: FIXTURES_DIR,
          });
        }

        it('should cache globs if the lifetime is non-zero', () => {
          doParse(30);
          expect(fastGlobSyncMock).toHaveBeenCalledTimes(expectFastGlobCalls);
          doParse(30);
          // shouldn't call fast-glob again due to the caching
          expect(fastGlobSyncMock).toHaveBeenCalledTimes(expectFastGlobCalls);
        });

        it('should not cache globs if the lifetime is zero', () => {
          doParse(0);
          expect(fastGlobSyncMock).toHaveBeenCalledTimes(expectFastGlobCalls);
          doParse(0);
          // should call fast-glob again because we specified immediate cache expiry
          expect(fastGlobSyncMock).toHaveBeenCalledTimes(
            expectFastGlobCalls * 2,
          );
        });

        it('should evict the cache if the entry expires', () => {
          hrtimeSpy.mockReturnValueOnce([1, 0]);

          doParse(30);
          expect(fastGlobSyncMock).toHaveBeenCalledTimes(expectFastGlobCalls);

          // wow so much time has passed
          hrtimeSpy.mockReturnValueOnce([Number.MAX_VALUE, 0]);

          doParse(30);
          // shouldn't call fast-glob again due to the caching
          expect(fastGlobSyncMock).toHaveBeenCalledTimes(
            expectFastGlobCalls * 2,
          );
        });

        it('should infinitely cache if passed Infinity', () => {
          hrtimeSpy.mockReturnValueOnce([1, 0]);

          doParse('Infinity');
          expect(fastGlobSyncMock).toHaveBeenCalledTimes(expectFastGlobCalls);

          // wow so much time has passed
          hrtimeSpy.mockReturnValueOnce([Number.MAX_VALUE, 0]);

          doParse('Infinity');
          // shouldn't call fast-glob again due to the caching
          expect(fastGlobSyncMock).toHaveBeenCalledTimes(expectFastGlobCalls);
        });
      });
    },
  );

  describe.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
    'project references',
    () => {
      beforeEach(() => {
        clearCaches();
      });

      const PROJECT_DIR = path.join(FIXTURES_DIR, '..', 'projectReferences');

      const code = 'var a = true';

      it('throws a special-case error when project references are enabled in the only TSConfig and the file is not found', () => {
        expect(() => {
          parseAndGenerateServices(code, {
            disallowAutomaticSingleRunInference: true,
            filePath: path.join(PROJECT_DIR, 'file.ts'),
            project: './**/tsconfig.json',
            tsconfigRootDir: PROJECT_DIR,
          });
        }).toThrowErrorMatchingInlineSnapshot(`
          [Error: ESLint was configured to run on \`<tsconfigRootDir>/file.ts\` using \`parserOptions.project\`: <tsconfigRootDir>/tsconfig.json
          That TSConfig uses project "references" and doesn't include \`<tsconfigRootDir>/file.ts\` directly, which is not supported by \`parserOptions.project\`.
          Either:
          - Switch to \`parserOptions.projectService\`
          - Use an ESLint-specific TSConfig
          See the typescript-eslint docs for more info: https://typescript-eslint.io/troubleshooting/typed-linting#are-typescript-project-references-supported]
        `);
      });
    },
  );
});

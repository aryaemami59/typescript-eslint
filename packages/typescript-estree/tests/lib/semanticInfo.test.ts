import { glob } from 'glob';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as ts from 'typescript';

import type { TSESTreeOptions } from '../../src/index.js';

import { createProgramFromConfigFile as createProgram } from '../../src/create-program/useProvidedPrograms.js';
import {
  AST_NODE_TYPES,
  clearCaches,
  parseAndGenerateServices,
} from '../../src/index.js';
import {
  deeplyCopy,
  parseCodeAndGenerateServices,
} from '../test-utils/test-utils.js';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'semanticInfo');

function createOptions(fileName: string): TSESTreeOptions {
  return {
    comment: true,
    disallowAutomaticSingleRunInference: true,
    errorOnUnknownASTType: true,
    filePath: fileName,
    jsx: false,
    loc: true,
    loggerFn: false,
    project: `./tsconfig.json`,
    range: true,
    tokens: true,
    tsconfigRootDir: FIXTURES_DIR,
  };
}

describe('semanticInfo', async () => {
  const FIXTURE_FILE_PATHS = await glob('**/*.src.ts', {
    absolute: true,
    cwd: FIXTURES_DIR,
  });

  beforeEach(() => {
    // ensure tsconfig-parser watch caches are clean for each test
    clearCaches();

    vi.stubEnv('TSESTREE_SINGLE_RUN', '');
  });

  // test all AST snapshots
  const SNAPSHOT_TEST_CASES = await Promise.all(
    FIXTURE_FILE_PATHS.map(async absolute => {
      const code = await fs.readFile(absolute, {
        encoding: 'utf-8',
      });

      const { name } = path.parse(absolute);

      const snapshotName = path.posix.join('fixtures', name);

      const { ast } = parseAndGenerateServices(code, createOptions(absolute));

      const result = deeplyCopy(ast);

      return [snapshotName, result, absolute, code] as const;
    }),
  );

  it.for(SNAPSHOT_TEST_CASES)('%s', ([, result], { expect }) => {
    expect(result).toMatchSnapshot();
  });

  it('should cache the created ts.program', () => {
    const filename = SNAPSHOT_TEST_CASES[0][2];

    const code = SNAPSHOT_TEST_CASES[0][3];

    const options = createOptions(filename);

    const optionsProjectString = {
      ...options,
      project: './tsconfig.json',
    } as const satisfies TSESTreeOptions;

    expect(
      parseAndGenerateServices(code, optionsProjectString).services.program,
    ).toBe(
      parseAndGenerateServices(code, optionsProjectString).services.program,
    );
  });

  it(`should handle "project": "./tsconfig.json" and "project": ["./tsconfig.json"] the same`, () => {
    const filename = SNAPSHOT_TEST_CASES[0][2];

    const code = SNAPSHOT_TEST_CASES[0][3];

    const options = createOptions(filename);

    const optionsProjectString = {
      ...options,
      project: './tsconfig.json',
    } as const satisfies TSESTreeOptions;

    const optionsProjectArray = {
      ...options,
      project: ['./tsconfig.json'],
    } as const satisfies TSESTreeOptions;

    const fromString = parseAndGenerateServices(code, optionsProjectString);
    const fromArray = parseAndGenerateServices(code, optionsProjectArray);

    expect(fromString.services.program).toBe(fromArray.services.program);

    expect(fromString.ast).toStrictEqual(fromArray.ast);

    expect(fromString.services.esTreeNodeToTSNodeMap).toStrictEqual(
      fromArray.services.esTreeNodeToTSNodeMap,
    );

    expect(fromString.services.tsNodeToESTreeNodeMap).toStrictEqual(
      fromArray.services.tsNodeToESTreeNodeMap,
    );
  });

  it(`should resolve absolute and relative tsconfig paths the same`, () => {
    const filename = SNAPSHOT_TEST_CASES[0][2];

    const code = SNAPSHOT_TEST_CASES[0][3];

    const options = createOptions(filename);

    const optionsAbsolutePath = {
      ...options,
      project: `${__dirname}/../fixtures/semanticInfo/tsconfig.json`,
    } as const satisfies TSESTreeOptions;

    const optionsRelativePath = {
      ...options,
      project: `./tsconfig.json`,
    } as const satisfies TSESTreeOptions;

    const absolutePathResult = parseAndGenerateServices(
      code,
      optionsAbsolutePath,
    );

    const relativePathResult = parseAndGenerateServices(
      code,
      optionsRelativePath,
    );

    assert.isParserServices(absolutePathResult.services);

    assert.isParserServices(relativePathResult.services);

    expect(
      absolutePathResult.services.program.getResolvedProjectReferences(),
    ).toBe(relativePathResult.services.program.getResolvedProjectReferences());
  });

  // case-specific tests
  it.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
    'isolated-file tests',
    async () => {
      const fileName = path.join(FIXTURES_DIR, 'isolated-file.src.ts');

      const parseResult = parseCodeAndGenerateServices(
        await fs.readFile(fileName, { encoding: 'utf-8' }),
        createOptions(fileName),
      );

      assert.isParserServices(parseResult.services);

      // get type checker
      const checker = parseResult.services.program.getTypeChecker();

      assert.isNodeOfType(
        parseResult.ast.body[0],
        AST_NODE_TYPES.VariableDeclaration,
      );

      // get number node (ast shape validated by snapshot)
      const declaration = parseResult.ast.body[0].declarations[0];

      assert.isNotNull(declaration.init);

      assert.isNodeOfType(declaration.init, AST_NODE_TYPES.ArrayExpression);

      const arrayMember = declaration.init.elements[0];

      assert.isNotNull(arrayMember);

      // get corresponding TS node
      const tsArrayMember =
        parseResult.services.esTreeNodeToTSNodeMap.get(arrayMember);

      expect(tsArrayMember.kind).toBe(ts.SyntaxKind.NumericLiteral);

      expect(tsArrayMember).toHaveProperty('text', '3');

      // get type of TS node
      const arrayMemberType = checker.getTypeAtLocation(tsArrayMember);

      expect(arrayMemberType.flags).toBe(ts.TypeFlags.NumberLiteral);

      // using an internal api
      expect(arrayMemberType).toHaveProperty('value', 3);

      // make sure it maps back to original ESTree node
      expect(
        parseResult.services.tsNodeToESTreeNodeMap.get(tsArrayMember),
      ).toBe(arrayMember);

      assert.isNodeOfType(declaration.id, AST_NODE_TYPES.Identifier);

      // get bound name
      const boundName = declaration.id;

      expect(boundName.name).toBe('x');

      const tsBoundName =
        parseResult.services.esTreeNodeToTSNodeMap.get(boundName);

      assert.isTSNodeOfNumberArrayType({ checker, tsNode: tsBoundName });

      expect(parseResult.services.tsNodeToESTreeNodeMap.get(tsBoundName)).toBe(
        boundName,
      );
    },
  );

  it.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
    'isolated-vue-file tests',
    async () => {
      const fileName = path.join(FIXTURES_DIR, 'extra-file-extension.vue');

      const parseResult = parseCodeAndGenerateServices(
        await fs.readFile(fileName, { encoding: 'utf-8' }),
        {
          ...createOptions(fileName),
          extraFileExtensions: ['.vue'],
        },
      );

      assert.isParserServices(parseResult.services);

      // get type checker
      const checker = parseResult.services.program.getTypeChecker();

      assert.isNodeOfType(
        parseResult.ast.body[0],
        AST_NODE_TYPES.VariableDeclaration,
      );

      // get number node (ast shape validated by snapshot)
      const declaration = parseResult.ast.body[0].declarations[0];

      assert.isNotNull(declaration.init);

      assert.isNodeOfType(declaration.init, AST_NODE_TYPES.ArrayExpression);

      const arrayMember = declaration.init.elements[0];

      assert.isNotNull(arrayMember);

      // get corresponding TS node
      const tsArrayMember =
        parseResult.services.esTreeNodeToTSNodeMap.get(arrayMember);

      expect(tsArrayMember.kind).toBe(ts.SyntaxKind.NumericLiteral);

      expect(tsArrayMember).toHaveProperty('text', '3');

      // get type of TS node
      const arrayMemberType = checker.getTypeAtLocation(tsArrayMember);

      expect(arrayMemberType.flags).toBe(ts.TypeFlags.NumberLiteral);

      // using an internal api
      expect(arrayMemberType).toHaveProperty('value', 3);

      // make sure it maps back to original ESTree node
      expect(
        parseResult.services.tsNodeToESTreeNodeMap.get(tsArrayMember),
      ).toBe(arrayMember);

      assert.isNodeOfType(declaration.id, AST_NODE_TYPES.Identifier);

      // get bound name
      const boundName = declaration.id;

      expect(boundName.name).toBe('x');

      const tsBoundName =
        parseResult.services.esTreeNodeToTSNodeMap.get(boundName);

      assert.isTSNodeOfNumberArrayType({ checker, tsNode: tsBoundName });

      expect(parseResult.services.tsNodeToESTreeNodeMap.get(tsBoundName)).toBe(
        boundName,
      );
    },
  );

  it('non-existent-estree-nodes tests', async () => {
    const fileName = path.join(
      FIXTURES_DIR,
      'non-existent-estree-nodes.src.ts',
    );

    const parseResult = parseCodeAndGenerateServices(
      await fs.readFile(fileName, { encoding: 'utf-8' }),
      createOptions(fileName),
    );

    assert.isParserServices(parseResult.services);

    assert.isNodeOfType(
      parseResult.ast.body[0],
      AST_NODE_TYPES.VariableDeclaration,
    );

    const binaryExpression = parseResult.ast.body[0].declarations[0].init;

    assert.isNotNull(binaryExpression);

    const tsBinaryExpression =
      parseResult.services.esTreeNodeToTSNodeMap.get(binaryExpression);

    expect(tsBinaryExpression.kind).toBe(ts.SyntaxKind.BinaryExpression);

    assert.isNodeOfType(
      parseResult.ast.body[1],
      AST_NODE_TYPES.ClassDeclaration,
    );

    assert.isNodeOfType(
      parseResult.ast.body[1].body.body[0],
      AST_NODE_TYPES.PropertyDefinition,
    );

    const computedPropertyString = parseResult.ast.body[1].body.body[0].key;

    const tsComputedPropertyString =
      parseResult.services.esTreeNodeToTSNodeMap.get(computedPropertyString);

    expect(tsComputedPropertyString.kind).toBe(ts.SyntaxKind.StringLiteral);
  });

  it('imported-file tests', async () => {
    const fileName = path.join(FIXTURES_DIR, 'import-file.src.ts');

    const parseResult = parseCodeAndGenerateServices(
      await fs.readFile(fileName, { encoding: 'utf-8' }),
      createOptions(fileName),
    );

    assert.isParserServices(parseResult.services);

    // get type checker
    expect(parseResult).toHaveProperty('services.program.getTypeChecker');

    const checker = parseResult.services.program.getTypeChecker();

    assert.isNodeOfType(
      parseResult.ast.body[1],
      AST_NODE_TYPES.ExpressionStatement,
    );

    assert.isNodeOfType(
      parseResult.ast.body[1].expression,
      AST_NODE_TYPES.CallExpression,
    );

    assert.isNodeOfType(
      parseResult.ast.body[1].expression.callee,
      AST_NODE_TYPES.MemberExpression,
    );

    assert.isNodeOfType(
      parseResult.ast.body[1].expression.callee.object,
      AST_NODE_TYPES.Identifier,
    );

    // get array node (ast shape validated by snapshot)
    // node is defined in other file than the parsed one
    const arrayBoundName = parseResult.ast.body[1].expression.callee.object;

    expect(arrayBoundName.name).toBe('arr');

    const tsArrayBoundName =
      parseResult.services.esTreeNodeToTSNodeMap.get(arrayBoundName);

    assert.isTSNodeOfNumberArrayType({ checker, tsNode: tsArrayBoundName });

    expect(
      parseResult.services.tsNodeToESTreeNodeMap.get(tsArrayBoundName),
    ).toBe(arrayBoundName);
  });

  it('non-existent file tests', () => {
    const parseResult = parseCodeAndGenerateServices(
      `const x = [parseInt("5")];`,
      {
        ...createOptions('<input>'),
        preserveNodeMaps: true,
        project: undefined,
      },
    );

    assert.isNodeOfType(
      parseResult.ast.body[0],
      AST_NODE_TYPES.VariableDeclaration,
    );

    assert.isNodeOfType(
      parseResult.ast.body[0].declarations[0].id,
      AST_NODE_TYPES.Identifier,
    );

    // get bound name
    const boundName = parseResult.ast.body[0].declarations[0].id;

    expect(boundName.name).toBe('x');

    const tsBoundName =
      parseResult.services.esTreeNodeToTSNodeMap.get(boundName);

    expect(parseResult.services.tsNodeToESTreeNodeMap.get(tsBoundName)).toBe(
      boundName,
    );
  });

  it('non-existent file should provide parents nodes', () => {
    const parseResult = parseCodeAndGenerateServices(
      `function M() { return Base }`,
      { ...createOptions('<input>'), project: undefined },
    );

    assert.isNotParserServices(parseResult.services);
  });

  it.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
    'non-existent file should throw error when project provided',
    () => {
      expect(() => {
        parseCodeAndGenerateServices(
          `function M() { return Base }`,
          createOptions('<input>'),
        );
      }).toThrow(
        /ESLint was configured to run on `<tsconfigRootDir>\/estree\.ts` using/,
      );
    },
  );

  it.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
    'non-existent project file',
    async () => {
      const fileName = path.join(FIXTURES_DIR, 'isolated-file.src.ts');

      const badConfig = createOptions(fileName);

      badConfig.project = './tsconfigs.json';

      const code = await fs.readFile(fileName, { encoding: 'utf-8' });

      expect(() => {
        parseCodeAndGenerateServices(code, badConfig);
      }).toThrow(/Cannot read file .+tsconfigs\.json'/);
    },
  );

  it.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
    'fail to read project file',
    async () => {
      const fileName = path.join(FIXTURES_DIR, 'isolated-file.src.ts');

      const badConfig = createOptions(fileName);

      badConfig.project = '.';

      const code = await fs.readFile(fileName, { encoding: 'utf-8' });

      expect(() => {
        parseCodeAndGenerateServices(code, badConfig);
      }).toThrow(
        // case insensitive because unix based systems are case insensitive
        /Cannot read file .+semanticInfo'/i,
      );
    },
  );

  it.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
    'malformed project file',
    async ({ expect }) => {
      const fileName = path.join(FIXTURES_DIR, 'isolated-file.src.ts');

      const badConfig = createOptions(fileName);

      badConfig.project = './badTSConfig/tsconfig.json';

      const code = await fs.readFile(fileName, { encoding: 'utf-8' });

      expect(() => {
        parseCodeAndGenerateServices(code, badConfig);
      }).toThrowErrorMatchingInlineSnapshot(
        `[Error: Compiler option 'compileOnSave' requires a value of type boolean.]`,
      );
    },
  );

  it('empty programs array should throw', () => {
    const fileName = path.join(FIXTURES_DIR, 'isolated-file.src.ts');

    const badConfig = createOptions(fileName);

    badConfig.programs = [];

    expect(() => {
      parseAndGenerateServices('const foo = 5;', badConfig);
    }).toThrow(
      'You have set parserOptions.programs to an empty array. This will cause all files to not be found in existing programs. Either provide one or more existing TypeScript Program instances in the array, or remove the parserOptions.programs setting.',
    );
  });

  it.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
    'first matching provided program instance is returned in result',
    () => {
      const filename = SNAPSHOT_TEST_CASES[0][2];

      const code = SNAPSHOT_TEST_CASES[0][3];

      const program1 = createProgram(path.join(FIXTURES_DIR, 'tsconfig.json'));
      const program2 = createProgram(path.join(FIXTURES_DIR, 'tsconfig.json'));

      const options = createOptions(filename);

      const optionsProjectString = {
        ...options,
        programs: [program1, program2],
        project: './tsconfig.json',
      } as const satisfies TSESTreeOptions;

      const parseResult = parseAndGenerateServices(code, optionsProjectString);

      expect(parseResult.services.program).toBe(program1);
    },
  );

  it.skipIf(process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true')(
    'file not in single provided project instance in single-run mode should throw',
    () => {
      vi.stubEnv('TSESTREE_SINGLE_RUN', 'true');

      const filename = 'non-existent-file.ts';

      const options = createOptions(filename);

      const optionsWithProjectTrue = {
        ...options,
        programs: undefined,
        project: true,
      } as const satisfies TSESTreeOptions;

      expect(() => {
        parseAndGenerateServices('const foo = 5;', optionsWithProjectTrue);
      }).toThrow(
        `The file was not found in any of the provided project(s): ${filename}`,
      );
    },
  );

  it('file not in single provided program instance should throw', () => {
    const filename = 'non-existent-file.ts';

    const program = createProgram(path.join(FIXTURES_DIR, 'tsconfig.json'));

    const options = createOptions(filename);

    const optionsWithSingleProgram = {
      ...options,
      programs: [program],
    } as const satisfies TSESTreeOptions;

    expect(() => {
      parseAndGenerateServices('const foo = 5;', optionsWithSingleProgram);
    }).toThrow(
      process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true'
        ? `${filename} was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject.`
        : `The file was not found in any of the provided program instance(s): ${filename}`,
    );
  });

  it('file not in multiple provided program instances should throw a program instance error', () => {
    const filename = 'non-existent-file.ts';

    const program1 = createProgram(path.join(FIXTURES_DIR, 'tsconfig.json'));

    const options = createOptions(filename);

    const optionsWithSingleProgram = {
      ...options,
      programs: [program1],
    } as const satisfies TSESTreeOptions;

    expect(() => {
      parseAndGenerateServices('const foo = 5;', optionsWithSingleProgram);
    }).toThrow(
      process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true'
        ? `${filename} was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject.`
        : `The file was not found in any of the provided program instance(s): ${filename}`,
    );

    const program2 = createProgram(path.join(FIXTURES_DIR, 'tsconfig.json'));

    const optionsWithMultiplePrograms = {
      ...options,
      programs: [program1, program2],
    } as const satisfies TSESTreeOptions;

    expect(() => {
      parseAndGenerateServices('const foo = 5;', optionsWithMultiplePrograms);
    }).toThrow(
      process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE === 'true'
        ? `${filename} was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject.`
        : `The file was not found in any of the provided program instance(s): ${filename}`,
    );
  });

  it('createProgram fails on non-existent file', () => {
    expect(() => {
      createProgram('tsconfig.non-existent.json');
    }).toThrow();
  });

  it('createProgram fails on tsconfig with errors', () => {
    expect(() => {
      createProgram(path.join(FIXTURES_DIR, 'badTSConfig', 'tsconfig.json'));
    }).toThrow();
  });
});

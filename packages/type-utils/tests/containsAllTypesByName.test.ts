import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type * as ts from 'typescript';

import { parseForESLint } from '@typescript-eslint/parser';
import path from 'node:path';
import { describe, it } from 'vitest';

import { containsAllTypesByName } from '../src';
import { expectToHaveParserServices } from './test-utils/expectToHaveParserServices';

describe(containsAllTypesByName, () => {
  const rootDir = path.join(__dirname, 'fixtures');

  function getType(code: string): ts.Type {
    const { ast, services } = parseForESLint(code, {
      disallowAutomaticSingleRunInference: true,
      filePath: path.join(rootDir, 'file.ts'),
      project: './tsconfig.json',
      tsconfigRootDir: rootDir,
    });
    expectToHaveParserServices(services);
    const declaration = ast.body[0] as TSESTree.TSTypeAliasDeclaration;
    return services.getTypeAtLocation(declaration.id);
  }

  describe('allowAny', () => {
    describe('is true', () => {
      it.for([
        ['type Test = unknown;', false],
        ['type Test = any;', false],
        ['type Test = string;', false],
      ] as const)(
        'when code is "%s" expected is %s',
        ([code, expected], { expect }) => {
          const type = getType(code);

          const result = containsAllTypesByName(type, true, new Set());

          expect(result).toBe(expected);
        },
      );
    });

    describe('is false', () => {
      it.for([
        ['type Test = unknown;', true],
        ['type Test = any;', true],
        ['type Test = string;', false],
      ] as const)(
        'when code is "%s" expected is %s',
        ([code, expected], { expect }) => {
          const type = getType(code);

          const result = containsAllTypesByName(type, false, new Set());

          expect(result).toBe(expected);
        },
      );
    });
  });

  describe('matchAnyInstead', () => {
    describe('is true', () => {
      it.for([
        [`type Test = Promise<void> & string`, true],
        ['type Test = Promise<void> | string', true],
        ['type Test = Promise<void> | Object', true],
      ] as const)(
        'when code is "%s" expected is %s',
        ([code, expected], { expect }) => {
          const type = getType(code);

          const result = containsAllTypesByName(
            type,
            false,
            new Set(['Object', 'Promise']),
            true,
          );

          expect(result).toBe(expected);
        },
      );
    });

    describe('is false', () => {
      it.for([
        ['type Test = Promise<void> & string', false],
        ['type Test = Promise<void> | string', false],
        ['type Test = Promise<void> | Object', true],
      ] as const)(
        'when code is "%s" expected is %s',
        ([code, expected], { expect }) => {
          const type = getType(code);

          const result = containsAllTypesByName(
            type,
            false,
            new Set(['Object', 'Promise']),
            false,
          );

          expect(result).toBe(expected);
        },
      );
    });
  });
});

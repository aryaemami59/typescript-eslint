import type { TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';

import { parseForESLint } from '@typescript-eslint/parser';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { ReadonlynessOptions } from '../src/isTypeReadonly';

import { isTypeReadonly } from '../src/isTypeReadonly';
import { expectToHaveParserServices } from './test-utils/expectToHaveParserServices';

describe(isTypeReadonly, () => {
  const rootDir = path.join(__dirname, 'fixtures');

  describe('TSTypeAliasDeclaration ', () => {
    function getType(code: string): {
      program: ts.Program;
      type: ts.Type;
    } {
      const { ast, services } = parseForESLint(code, {
        disallowAutomaticSingleRunInference: true,
        filePath: path.join(rootDir, 'file.ts'),
        project: './tsconfig.json',
        tsconfigRootDir: rootDir,
      });
      expectToHaveParserServices(services);
      const { esTreeNodeToTSNodeMap, program } = services;

      const declaration = ast.body[0] as TSESTree.TSTypeAliasDeclaration;
      return {
        program,
        type: program
          .getTypeChecker()
          .getTypeAtLocation(esTreeNodeToTSNodeMap.get(declaration.id)),
      };
    }

    describe('default options', () => {
      const options = undefined;

      describe('basics', () => {
        describe('is readonly', () => {
          // Record.
          it.for([
            ['type Test = { readonly bar: string; };'],
            ['type Test = Readonly<{ bar: string; }>;'],
          ] as const)(
            'handles fully readonly records',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(true);
            },
          );

          // Array.
          it.for([
            ['type Test = Readonly<readonly string[]>;'],
            ['type Test = Readonly<ReadonlyArray<string>>;'],
          ] as const)('handles fully readonly arrays', ([code], { expect }) => {
            const { program, type } = getType(code);

            const result = isTypeReadonly(program, type, options);

            expect(result).toBe(true);
          });

          // Array - special case.
          // Note: Methods are mutable but arrays are treated special; hence no failure.
          it.for([
            ['type Test = readonly string[];'],
            ['type Test = ReadonlyArray<string>;'],
          ] as const)(
            'treats readonly arrays as fully readonly',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(true);
            },
          );

          // Set and Map.
          it.for([
            ['type Test = Readonly<ReadonlySet<string>>;'],
            ['type Test = Readonly<ReadonlyMap<string, string>>;'],
          ] as const)(
            'handles fully readonly sets and maps',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(true);
            },
          );

          // Private Identifier.
          // Note: It can't be accessed from outside of class thus exempt from the checks.
          it.for([
            ['class Foo { readonly #readonlyPrivateField = "foo"; }'],
            ['class Foo { #privateField = "foo"; }'],
            ['class Foo { #privateMember() {}; }'],
          ] as const)(
            'treat private identifier as readonly',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(true);
            },
          );
        });

        describe('is not readonly', () => {
          // Record.
          it.for([
            ['type Test = { foo: string; };'],
            ['type Test = { foo: string; readonly bar: number; };'],
          ] as const)(
            'handles non fully readonly records',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(false);
            },
          );

          // Array.
          it.for([
            ['type Test = string[]'],
            ['type Test = Array<string>'],
          ] as const)(
            'handles non fully readonly arrays',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(false);
            },
          );

          // Set and Map.
          // Note: Methods are mutable for ReadonlySet and ReadonlyMet; hence failure.
          it.for([
            ['type Test = Set<string>;'],
            ['type Test = Map<string, string>;'],
            ['type Test = ReadonlySet<string>;'],
            ['type Test = ReadonlyMap<string, string>;'],
          ] as const)(
            'handles non fully readonly sets and maps',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(false);
            },
          );
        });
      });

      describe('IndexSignature', () => {
        describe('is readonly', () => {
          it.for([
            ['type Test = { readonly [key: string]: string };'],
            [
              'type Test = { readonly [key: string]: { readonly foo: readonly string[]; }; };',
            ],
          ] as const)(
            'handles readonly PropertySignature inside a readonly IndexSignature',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(true);
            },
          );
        });

        describe('is readonly circular', () => {
          it('handles circular readonly PropertySignature inside a readonly IndexSignature', () => {
            const code = 'interface Test { readonly [key: string]: Test };';

            const { program, type } = getType(code);

            const result = isTypeReadonly(program, type, options);

            expect(result).toBe(true);
          });

          it('handles circular readonly PropertySignature inside interdependent objects', () => {
            const code =
              'interface Test1 { readonly [key: string]: Test } interface Test { readonly [key: string]: Test1 }';

            const { program, type } = getType(code);

            const result = isTypeReadonly(program, type, options);

            expect(result).toBe(true);
          });
        });

        describe('is not readonly', () => {
          it.for([
            ['type Test = { [key: string]: string };'],
            ['type Test = { readonly [key: string]: { foo: string[]; }; };'],
          ] as const)(
            'handles mutable PropertySignature inside a readonly IndexSignature',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(false);
            },
          );
        });

        describe('is not readonly circular', () => {
          it('handles circular mutable PropertySignature', () => {
            const code = 'interface Test { [key: string]: Test };';

            const { program, type } = getType(code);

            const result = isTypeReadonly(program, type, options);

            expect(result).toBe(false);
          });

          it.for([
            [
              'interface Test1 { [key: string]: Test } interface Test { readonly [key: string]: Test1 }',
            ],
            [
              'interface Test1 { readonly [key: string]: Test } interface Test { [key: string]: Test1 }',
            ],
            [
              'interface Test1 { [key: string]: Test } interface Test { [key: string]: Test1 }',
            ],
          ] as const)(
            'handles circular mutable PropertySignature inside interdependent objects',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(false);
            },
          );
        });
      });

      describe('Union', () => {
        describe('is readonly', () => {
          it.for([
            [
              'type Test = Readonly<{ foo: string; bar: number; }> & Readonly<{ bar: number; }>;',
            ],
            ['type Test = readonly string[] | readonly number[];'],
          ] as const)(
            'handles a union of 2 fully readonly types',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(true);
            },
          );
        });

        describe('is not readonly', () => {
          it.for([
            ['type Test = { foo: string; bar: number; } | { bar: number; };'],
            [
              'type Test = { foo: string; bar: number; } | Readonly<{ bar: number; }>;',
            ],
            [
              'type Test = Readonly<{ foo: string; bar: number; }> | { bar: number; };',
            ],
          ] as const)(
            'handles a union of non fully readonly types',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(false);
            },
          );
        });
      });

      describe('Intersection', () => {
        describe('is readonly', () => {
          it.for([
            [
              'type Test = Readonly<{ foo: string; bar: number; }> & Readonly<{ bar: number; }>;',
            ],
          ] as const)(
            'handles an intersection of 2 fully readonly types',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(true);
            },
          );

          it.for([
            [
              'type Test = Readonly<{ foo: string; bar: number; }> & { foo: string; };',
            ],
          ] as const)(
            'handles an intersection of a fully readonly type with a mutable subtype',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(true);
            },
          );

          // Array - special case.
          // Note: Methods are mutable but arrays are treated special; hence no failure.
          it.for([
            ['type Test = ReadonlyArray<string> & Readonly<{ foo: string; }>;'],
            [
              'type Test = readonly [string, number] & Readonly<{ foo: string; }>;',
            ],
          ] as const)(
            'handles an intersections involving a readonly array',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(true);
            },
          );
        });

        describe('is not readonly', () => {
          it.for([
            ['type Test = { foo: string; bar: number; } & { bar: number; };'],
            [
              'type Test = { foo: string; bar: number; } & Readonly<{ bar: number; }>;',
            ],
            [
              'type Test = Readonly<{ bar: number; }> & { foo: string; bar: number; };',
            ],
          ] as const)(
            'handles an intersection of non fully readonly types',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(false);
            },
          );
        });
      });

      describe('Conditional Types', () => {
        describe('is readonly', () => {
          it.for([
            [
              'type Test<T> = T extends readonly number[] ? readonly string[] : readonly number[];',
            ],
          ] as const)(
            'handles conditional type that are fully readonly',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(true);
            },
          );

          it.for([
            [
              'type Test<T> = T extends number[] ? readonly string[] : readonly number[];',
            ],
          ] as const)(
            'should ignore mutable conditions',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(true);
            },
          );
        });

        describe('is not readonly', () => {
          it.for([
            ['type Test<T> = T extends number[] ? string[] : number[];'],
            [
              'type Test<T> = T extends number[] ? string[] : readonly number[];',
            ],
            [
              'type Test<T> = T extends number[] ? readonly string[] : number[];',
            ],
          ] as const)(
            'handles non fully readonly conditional types',
            ([code], { expect }) => {
              const { program, type } = getType(code);

              const result = isTypeReadonly(program, type, options);

              expect(result).toBe(false);
            },
          );
        });
      });
    });

    describe('treatMethodsAsReadonly', () => {
      const options: ReadonlynessOptions = {
        treatMethodsAsReadonly: true,
      };

      describe('is readonly', () => {
        // Set and Map.
        it.for([
          ['type Test = ReadonlySet<string>;'],
          ['type Test = ReadonlyMap<string, string>;'],
        ] as const)(
          'handles non fully readonly sets and maps',
          ([code], { expect }) => {
            const { program, type } = getType(code);

            const result = isTypeReadonly(program, type, options);

            expect(result).toBe(true);
          },
        );
      });
    });

    describe('allowlist', () => {
      const options: ReadonlynessOptions = {
        allow: [
          {
            from: 'lib',
            name: 'RegExp',
          },
          {
            from: 'file',
            name: 'Foo',
          },
        ],
      };

      describe('is readonly', () => {
        it.for([
          [
            'interface Foo {readonly prop: RegExp}; type Test = (arg: Foo) => void;',
          ],
          [
            'interface Foo {prop: RegExp}; type Test = (arg: Readonly<Foo>) => void;',
          ],
          ['interface Foo {prop: string}; type Test = (arg: Foo) => void;'],
        ] as const)(
          'correctly marks allowlisted types as readonly',
          ([code], { expect }) => {
            const { program, type } = getType(code);

            const result = isTypeReadonly(program, type, options);

            expect(result).toBe(true);
          },
        );
      });

      describe('is not readonly', () => {
        it.for([
          [
            'interface Bar {prop: RegExp}; type Test = (arg: Readonly<Bar>) => void;',
          ],
          ['interface Bar {prop: string}; type Test = (arg: Bar) => void;'],
        ] as const)(
          'correctly marks allowlisted types as readonly',
          ([code], { expect }) => {
            const { program, type } = getType(code);

            const result = isTypeReadonly(program, type, options);

            expect(result).toBe(false);
          },
        );
      });
    });
  });
});

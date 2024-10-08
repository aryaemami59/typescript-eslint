import type { InvalidTestCase } from '@typescript-eslint/rule-tester';
import { noFormat, RuleTester } from '@typescript-eslint/rule-tester';

import rule from '../../src/rules/no-unsafe-assignment';
import type {
  InferMessageIdsTypeFromRule,
  InferOptionsTypeFromRule,
} from '../../src/util';
import { getFixturesRootDir } from '../RuleTester';

type Options = InferOptionsTypeFromRule<typeof rule>;
type MessageIds = InferMessageIdsTypeFromRule<typeof rule>;
type InvalidTest = InvalidTestCase<MessageIds, Options>;

const assignmentTest = (
  tests: [string, number, number, boolean?][],
): InvalidTest[] =>
  tests.flatMap(([assignment, column, endColumn, skipAssignmentExpression]) => [
    // VariableDeclaration
    {
      code: `const ${assignment}`,
      errors: [
        {
          messageId: 'unsafeArrayPatternFromTuple',
          line: 1,
          column: column + 6,
          endColumn: endColumn + 6,
        },
      ],
    },
    // AssignmentPattern
    {
      code: `function foo(${assignment}) {}`,
      errors: [
        {
          messageId: 'unsafeArrayPatternFromTuple',
          line: 1,
          column: column + 13,
          endColumn: endColumn + 13,
        },
      ],
    },
    // AssignmentExpression
    ...(skipAssignmentExpression
      ? []
      : [
          {
            code: `(${assignment})`,
            errors: [
              {
                messageId: 'unsafeArrayPatternFromTuple' as const,
                line: 1,
                column: column + 1,
                endColumn: endColumn + 1,
              },
            ],
          },
        ]),
  ]);

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      project: './tsconfig.noImplicitThis.json',
      projectService: false,
      tsconfigRootDir: getFixturesRootDir(),
    },
  },
});

ruleTester.run('no-unsafe-assignment', rule, {
  valid: [
    'const x = 1;',
    'const x: number = 1;',
    `
const x = 1,
  y = 1;
    `,
    'let x;',
    `
let x = 1,
  y;
    `,
    'function foo(a = 1) {}',
    `
class Foo {
  constructor(private a = 1) {}
}
    `,
    `
class Foo {
  private a = 1;
}
    `,
    'const x: Set<string> = new Set();',
    'const x: Set<string> = new Set<string>();',
    'const [x] = [1];',
    'const [x, y] = [1, 2] as number[];',
    'const [x, ...y] = [1, 2, 3, 4, 5];',
    'const [x, ...y] = [1];',
    'const [{ ...x }] = [{ x: 1 }] as [{ x: any }];',
    'function foo(x = 1) {}',
    'function foo([x] = [1]) {}',
    'function foo([x, ...y] = [1, 2, 3, 4, 5]) {}',
    'function foo([x, ...y] = [1]) {}',
    // this is not checked, because there's no annotation to compare it with
    'const x = new Set<any>();',
    'const x = { y: 1 };',
    'const x = { y = 1 };',
    noFormat`const x = { y(){} };`,
    'const x: { y: number } = { y: 1 };',
    'const x = [...[1, 2, 3]];',
    'const [{ [`x${1}`]: x }] = [{ [`x`]: 1 }] as [{ [`x`]: any }];',
    `
type T = [string, T[]];
const test: T = ['string', []] as T;
    `,
    {
      code: `
type Props = { a: string };
declare function Foo(props: Props): never;
<Foo a={'foo'} />;
      `,
      languageOptions: {
        parserOptions: {
          ecmaFeatures: {
            jsx: true,
          },
        },
      },
    },

    {
      code: `
declare function Foo(props: { a: string }): never;
<Foo a="foo" />;
      `,
      languageOptions: {
        parserOptions: {
          ecmaFeatures: {
            jsx: true,
          },
        },
      },
    },
    {
      code: `
declare function Foo(props: { a: string }): never;
<Foo a={} />;
      `,
      languageOptions: {
        parserOptions: {
          ecmaFeatures: {
            jsx: true,
          },
        },
      },
    },
    'const x: unknown = y as any;',
    'const x: unknown[] = y as any[];',
    'const x: Set<unknown> = y as Set<any>;',
    // https://github.com/typescript-eslint/typescript-eslint/issues/2109
    'const x: Map<string, string> = new Map();',
    `
type Foo = { bar: unknown };
const bar: any = 1;
const foo: Foo = { bar };
    `,
  ],
  invalid: [
    {
      code: 'const x = 1 as any;',
      errors: [{ messageId: 'anyAssignment' }],
    },
    {
      code: `
const x = 1 as any,
  y = 1;
      `,
      errors: [{ messageId: 'anyAssignment' }],
    },
    {
      code: 'function foo(a = 1 as any) {}',
      errors: [{ messageId: 'anyAssignment' }],
    },
    {
      code: `
class Foo {
  constructor(private a = 1 as any) {}
}
      `,
      errors: [{ messageId: 'anyAssignment' }],
    },
    {
      code: `
class Foo {
  private a = 1 as any;
}
      `,
      errors: [{ messageId: 'anyAssignment' }],
    },
    {
      code: `
const [x] = spooky;
      `,
      errors: [
        {
          messageId: 'anyAssignment',
          data: { sender: 'error typed', receiver: 'error typed' },
        },
      ],
    },
    {
      code: `
const [[[x]]] = [spooky];
      `,
      errors: [
        {
          messageId: 'unsafeArrayPatternFromTuple',
          data: { sender: 'error typed', receiver: 'error typed' },
        },
      ],
    },
    {
      code: `
const {
  x: { y: z },
} = { x: spooky };
      `,
      errors: [
        {
          messageId: 'unsafeArrayPatternFromTuple',
          data: { sender: 'error typed', receiver: 'error typed' },
        },
        {
          messageId: 'anyAssignment',
          data: { sender: 'error typed', receiver: 'error typed' },
        },
      ],
    },
    {
      code: `
let value: number;

value = spooky;
      `,
      errors: [
        {
          messageId: 'anyAssignment',
          data: {
            sender: 'error typed',
          },
        },
      ],
    },
    {
      code: `
const [x] = 1 as any;
      `,
      errors: [{ messageId: 'anyAssignment' }],
    },
    {
      code: `
const [x] = [] as any[];
      `,
      errors: [{ messageId: 'unsafeArrayPattern' }],
    },

    {
      code: 'const x: Set<string> = new Set<any>();',
      errors: [
        {
          messageId: 'unsafeAssignment',
          data: {
            sender: '`Set<any>`',
            receiver: '`Set<string>`',
          },
        },
      ],
    },
    {
      code: 'const x: Map<string, string> = new Map<string, any>();',
      errors: [
        {
          messageId: 'unsafeAssignment',
          data: {
            sender: '`Map<string, any>`',
            receiver: '`Map<string, string>`',
          },
        },
      ],
    },
    {
      code: 'const x: Set<string[]> = new Set<any[]>();',
      errors: [
        {
          messageId: 'unsafeAssignment',
          data: {
            sender: '`Set<any[]>`',
            receiver: '`Set<string[]>`',
          },
        },
      ],
    },
    {
      code: 'const x: Set<Set<Set<string>>> = new Set<Set<Set<any>>>();',
      errors: [
        {
          messageId: 'unsafeAssignment',
          data: {
            sender: '`Set<Set<Set<any>>>`',
            receiver: '`Set<Set<Set<string>>>`',
          },
        },
      ],
    },

    ...assignmentTest([
      ['[x] = [1] as [any]', 2, 3],
      ['[[[[x]]]] = [[[[1 as any]]]]', 5, 6],
      ['[[[[x]]]] = [1 as any]', 2, 9, true],
      ['[{x}] = [{x: 1}] as [{x: any}]', 3, 4],
      ['[{["x"]: x}] = [{["x"]: 1}] as [{["x"]: any}]', 10, 11],
      ['[{[`x`]: x}] = [{[`x`]: 1}] as [{[`x`]: any}]', 10, 11],
    ]),
    {
      // TS treats the assignment pattern weirdly in this case
      code: '[[[[x]]]] = [1 as any];',
      errors: [
        {
          messageId: 'unsafeAssignment',
          line: 1,
          column: 1,
          endColumn: 23,
        },
      ],
    },

    {
      code: `
const x = [...(1 as any)];
      `,
      errors: [{ messageId: 'unsafeArraySpread' }],
    },
    {
      code: `
const x = [...([] as any[])];
      `,
      errors: [{ messageId: 'unsafeArraySpread' }],
    },

    ...assignmentTest([
      ['{x} = {x: 1} as {x: any}', 2, 3],
      ['{x: y} = {x: 1} as {x: any}', 5, 6],
      ['{x: {y}} = {x: {y: 1}} as {x: {y: any}}', 6, 7],
      ['{x: [y]} = {x: {y: 1}} as {x: [any]}', 6, 7],
    ]),

    {
      code: 'const x = { y: 1 as any };',
      errors: [
        {
          messageId: 'anyAssignment',
          column: 13,
          endColumn: 24,
        },
      ],
    },
    {
      code: 'const x = { y: { z: 1 as any } };',
      errors: [
        {
          messageId: 'anyAssignment',
          column: 18,
          endColumn: 29,
        },
      ],
    },
    {
      code: 'const x: { y: Set<Set<Set<string>>> } = { y: new Set<Set<Set<any>>>() };',
      errors: [
        {
          messageId: 'unsafeAssignment',
          column: 43,
          endColumn: 70,
          data: {
            sender: '`Set<Set<Set<any>>>`',
            receiver: '`Set<Set<Set<string>>>`',
          },
        },
      ],
    },
    {
      code: 'const x = { ...(1 as any) };',
      errors: [
        {
          // spreading an any widens the object type to any
          messageId: 'anyAssignment',
          column: 7,
          endColumn: 28,
        },
      ],
    },

    {
      code: `
type Props = { a: string };
declare function Foo(props: Props): never;
<Foo a={1 as any} />;
      `,
      languageOptions: {
        parserOptions: {
          ecmaFeatures: {
            jsx: true,
          },
        },
      },
      errors: [
        {
          messageId: 'anyAssignment',
          line: 4,
          column: 9,
          endColumn: 17,
        },
      ],
    },
    {
      code: `
function foo() {
  const bar = this;
}
      `,
      errors: [
        {
          messageId: 'anyAssignmentThis',
          line: 3,
          column: 9,
          endColumn: 19,
        },
      ],
    },
    {
      code: `
type T = [string, T[]];
const test: T = ['string', []] as any;
      `,
      errors: [
        {
          messageId: 'anyAssignment',
          line: 3,
          column: 7,
          endColumn: 38,
        },
      ],
    },
    {
      code: `
type Foo = { bar: number };
const bar: any = 1;
const foo: Foo = { bar };
      `,
      errors: [
        {
          messageId: 'anyAssignment',
          line: 4,
          column: 20,
          endColumn: 23,
        },
      ],
    },
  ],
});

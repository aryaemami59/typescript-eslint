import { AST_NODE_TYPES } from '@typescript-eslint/types';

import { ScopeType } from '../../src/index.js';
import { getRealVariables, parseAndAnalyze } from '../test-utils/index.js';

describe('typescript', () => {
  describe('multiple call signatures', () => {
    it('should create a function scope', () => {
      const { scopeManager } = parseAndAnalyze(
        `
          function foo(bar: number): number;
          function foo(bar: string): string;
          function foo(bar: string | number): string | number {
            return bar;
          }
        `,
        'script',
      );

      expect(scopeManager.scopes).toHaveLength(4);

      const scope = scopeManager.scopes[0];
      const variables = getRealVariables(scope.variables);

      assert.isScopeOfType(scope, ScopeType.global);

      expect(scope.references).toHaveLength(0);
      expect(variables).toHaveLength(1);
      expect(variables[0].defs).toHaveLength(3);

      const actual = scopeManager.scopes.slice(1, 4).map(scope => {
        const variables = getRealVariables(scope.variables);

        return [
          scope.type,
          variables.length,
          variables[0].name,
          scope.block.type,
          scope.references.length,
        ] as const;
      });

      const expected = [
        ...actual
          .slice(0, -1)
          .map(
            () =>
              [
                ScopeType.function,
                2,
                'arguments',
                AST_NODE_TYPES.TSDeclareFunction,
                0,
              ] as const,
          ),
        [
          ScopeType.function,
          2,
          'arguments',
          AST_NODE_TYPES.FunctionDeclaration,
          1,
        ] as const,
      ];

      expect(actual).toStrictEqual(expected);
    });
  });
});

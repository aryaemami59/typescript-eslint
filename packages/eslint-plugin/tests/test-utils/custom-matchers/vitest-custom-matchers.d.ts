import 'vitest';

import type { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

declare global {
  namespace Chai {
    interface Assertion {
      nodeOfType(expectedNodeType: AST_NODE_TYPES, errorMessage?: string): void;
    }

    interface Assert {
      isNodeOfType<
        ActualType extends TSESTree.Node | null | undefined,
        ExpectedType extends AST_NODE_TYPES,
      >(
        node: ActualType,
        expectedNodeType: ExpectedType,
        errorMessage?: string,
      ): asserts node is Extract<ActualType, { type: ExpectedType }>;

      isNotNodeOfType<ActualType, ExpectedType extends AST_NODE_TYPES>(
        node: ActualType,
        expectedNodeType: ExpectedType,
        errorMessage?: string,
      ): asserts node is Exclude<ActualType, { type: ExpectedType }>;
    }
  }
}

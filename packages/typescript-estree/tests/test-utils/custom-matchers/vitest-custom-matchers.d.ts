import 'vitest';

import type * as ts from 'typescript';

import type {
  AST_NODE_TYPES,
  ParserServices,
  ParserServicesWithTypeInformation,
  TSESTree,
} from '../../../src/index.js';

declare global {
  namespace Chai {
    interface Assertion {
      parserServices(errorMessage?: string): void;

      TSNodeOfNumberArrayType(errorMessage?: string): void;

      nodeOfType(expectedNodeType: AST_NODE_TYPES, errorMessage?: string): void;
    }

    interface Assert {
      isParserServices<ActualType extends ParserServices | null | undefined>(
        services: ActualType,
        errorMessage?: string,
      ): asserts services is Extract<
        ActualType,
        ParserServicesWithTypeInformation
      >;

      isNotParserServices<ActualType>(
        services: ActualType,
        errorMessage?: string,
      ): asserts services is Exclude<
        ActualType,
        ParserServicesWithTypeInformation
      >;

      /**
       * Verifies that the type of a TS node is `number[]` as expected
       */
      isTSNodeOfNumberArrayType(
        expected: { checker: ts.TypeChecker; tsNode: ts.Node },
        errorMessage?: string,
      ): void;

      isNotTSNodeOfNumberArrayType(
        expected: { checker: ts.TypeChecker; tsNode: ts.Node },
        errorMessage?: string,
      ): void;

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

interface CustomMatchers<ActualType = unknown> {
  toBeValidFile(): Promise<ActualType>;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

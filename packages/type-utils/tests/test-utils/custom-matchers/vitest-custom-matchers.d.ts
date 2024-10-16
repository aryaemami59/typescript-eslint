import 'vitest';

import type {
  AST_NODE_TYPES,
  ParserServices,
  ParserServicesWithTypeInformation,
  TSESTree,
} from '@typescript-eslint/typescript-estree';

import type { ReadonlynessOptions } from '../../../src/isTypeReadonly.js';

declare global {
  namespace Chai {
    interface Assertion {
      nodeOfType(expectedNodeType: AST_NODE_TYPES, errorMessage?: string): void;

      parserServices(errorMessage?: string): void;
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
  toHaveTypes(additionalOptions: {
    senderStr: string;
    receiverStr: string;
    declarationIndex?: number;
    passSenderNode?: boolean;
  }): ActualType;

  toBeValidSpecifier(): ActualType;

  toMatchSpecifier(
    expectedTypeOrValueSpecifier: TypeOrValueSpecifier,
  ): ActualType;

  toBeReadOnly(
    readOnlyNessOptions: ReadonlynessOptions | undefined,
  ): ActualType;

  toContainsAllTypesByName(additionalOptions?: {
    allowAny?: boolean;
    allowedNames?: Set<string>;
    matchAnyInstead?: boolean;
  }): ActualType;

  toBeSafeAssignment(additionalOptions?: {
    declarationIndex?: number;
    passSenderNode?: boolean;
  }): ActualType;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

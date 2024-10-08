import { ESLintUtils } from '@typescript-eslint/utils';

export * from './astUtils';
export * from './collectUnusedVariables';
export * from './createRule';
export * from './getFunctionHeadLoc';
export * from './getOperatorPrecedence';
export * from './getStaticStringValue';
export * from './getStringLength';
export * from './getTextWithParentheses';
export * from './getThisExpression';
export * from './getWrappingFixer';
export * from './isNodeEqual';
export * from './isNullLiteral';
export * from './isStartOfExpressionStatement';
export * from './isUndefinedIdentifier';
export * from './misc';
export * from './needsPrecedingSemiColon';
export * from './objectIterators';
export * from './scopeUtils';
export * from './types';
export * from './isAssignee';
export * from './getFixOrSuggest';
export * from './isArrayMethodCallWithPredicate';

// this is done for convenience - saves migrating all of the old rules
export * from '@typescript-eslint/type-utils';
const {
  applyDefault,
  deepMerge,
  isObjectNotArray,
  getParserServices,
  nullThrows,
  NullThrowsReasons,
} = ESLintUtils;
type InferMessageIdsTypeFromRule<T> =
  ESLintUtils.InferMessageIdsTypeFromRule<T>;
type InferOptionsTypeFromRule<T> = ESLintUtils.InferOptionsTypeFromRule<T>;

export {
  applyDefault,
  deepMerge,
  isObjectNotArray,
  getParserServices,
  nullThrows,
  type InferMessageIdsTypeFromRule,
  type InferOptionsTypeFromRule,
  NullThrowsReasons,
};

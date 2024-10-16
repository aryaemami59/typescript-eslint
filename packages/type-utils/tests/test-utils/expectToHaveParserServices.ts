import type {
  ParserServices,
  ParserServicesWithTypeInformation,
} from '@typescript-eslint/typescript-estree';

import { expect } from 'vitest';

export function expectToHaveParserServices(
  services: ParserServices | null | undefined,
): asserts services is ParserServicesWithTypeInformation {
  expect(services?.program).toBeDefined();
  expect(services?.esTreeNodeToTSNodeMap).toBeDefined();
  expect(services?.tsNodeToESTreeNodeMap).toBeDefined();
}

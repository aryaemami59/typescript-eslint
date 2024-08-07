/* eslint-disable @typescript-eslint/no-unnecessary-condition */
// Forked from https://github.com/eslint/eslint/blob/ad9dd6a933fd098a0d99c6a9aa059850535c23ee/lib/rule-tester/rule-tester.js

import assert from 'node:assert';
import path from 'node:path';
import util from 'node:util';

import type * as ParserType from '@typescript-eslint/parser';
import type { TSESTree } from '@typescript-eslint/utils';
import { deepMerge } from '@typescript-eslint/utils/eslint-utils';
import type {
  AnyRuleCreateFunction,
  AnyRuleModule,
  Parser,
  ParserOptions,
  RuleContext,
  RuleModule,
} from '@typescript-eslint/utils/ts-eslint';
import { Linter } from '@typescript-eslint/utils/ts-eslint';
// we intentionally import from eslint here because we need to use the same class
// that ESLint uses, not our custom override typed version
import { SourceCode } from 'eslint';
import stringify from 'json-stable-stringify-without-jsonify';
import merge from 'lodash.merge';

import { TestFramework } from './TestFramework';
import type {
  InvalidTestCase,
  NormalizedRunTests,
  RuleTesterConfig,
  RunTests,
  SuggestionOutput,
  TesterConfigWithDefaults,
  ValidTestCase,
} from './types';
import { ajvBuilder } from './utils/ajv';
import { cloneDeeplyExcludesParent } from './utils/cloneDeeplyExcludesParent';
import { validate } from './utils/config-validator';
import { satisfiesAllDependencyConstraints } from './utils/dependencyConstraints';
import { freezeDeeply } from './utils/freezeDeeply';
import { getRuleOptionsSchema } from './utils/getRuleOptionsSchema';
import { hasOwnProperty } from './utils/hasOwnProperty';
import { getPlaceholderMatcher, interpolate } from './utils/interpolate';
import { isSerializable } from './utils/serialization';
import * as SourceCodeFixer from './utils/SourceCodeFixer';
import {
  emitLegacyRuleAPIWarning,
  emitMissingSchemaWarning,
  ERROR_OBJECT_PARAMETERS,
  FRIENDLY_ERROR_OBJECT_PARAMETER_LIST,
  FRIENDLY_SUGGESTION_OBJECT_PARAMETER_LIST,
  getCommentsDeprecation,
  REQUIRED_SCENARIOS,
  RULE_TESTER_PARAMETERS,
  sanitize,
  SUGGESTION_OBJECT_PARAMETERS,
  wrapParser,
} from './utils/validationHelpers';

const ajv = ajvBuilder({ strictDefaults: true });
const TYPESCRIPT_ESLINT_PARSER = '@typescript-eslint/parser';
const DUPLICATE_PARSER_ERROR_MESSAGE = `Do not set the parser at the test level unless you want to use a parser other than "${TYPESCRIPT_ESLINT_PARSER}"`;

/*
 * testerDefaultConfig must not be modified as it allows to reset the tester to
 * the initial default configuration
 */
const testerDefaultConfig: Readonly<TesterConfigWithDefaults> = {
  parser: TYPESCRIPT_ESLINT_PARSER,
  rules: {},
  defaultFilenames: { ts: 'file.ts', tsx: 'react.tsx' },
};
let defaultConfig = deepMerge(
  {},
  testerDefaultConfig,
) as TesterConfigWithDefaults;

/**
 * Extracts names of {{ placeholders }} from the reported message.
 * @param message Reported message
 * @returns Array of placeholder names
 */
function getMessagePlaceholders(message: string): string[] {
  const matcher = getPlaceholderMatcher();

  return Array.from(message.matchAll(matcher), ([, name]) => name.trim());
}

/**
 * Returns the placeholders in the reported messages but
 * only includes the placeholders available in the raw message and not in the provided data.
 * @param message The reported message
 * @param raw The raw message specified in the rule meta.messages
 * @param data The passed
 * @returns Missing placeholder names
 */
function getUnsubstitutedMessagePlaceholders(
  message: string,
  raw: string,
  data: Record<string, unknown> = {},
): string[] {
  const unsubstituted = getMessagePlaceholders(message);

  if (unsubstituted.length === 0) {
    return [];
  }

  // Remove false positives by only counting placeholders in the raw message, which were not provided in the data matcher or added with a data property
  const known = getMessagePlaceholders(raw);
  const provided = Object.keys(data);

  return unsubstituted.filter(
    name => known.includes(name) && !provided.includes(name),
  );
}

export class RuleTester extends TestFramework {
  readonly #testerConfig: TesterConfigWithDefaults;
  readonly #rules: Record<string, AnyRuleCreateFunction | AnyRuleModule> = {};
  readonly #linter: Linter = new Linter();

  /**
   * Creates a new instance of RuleTester.
   */
  constructor(testerConfig?: RuleTesterConfig) {
    super();

    /**
     * The configuration to use for this tester. Combination of the tester
     * configuration and the default configuration.
     */
    this.#testerConfig = merge({}, defaultConfig, testerConfig, {
      rules: { 'rule-tester/validate-ast': 'error' },
      // as of eslint 6 you have to provide an absolute path to the parser
      // but that's not as clean to type, this saves us trying to manually enforce
      // that contributors require.resolve everything
      parser: require.resolve(testerConfig?.parser ?? defaultConfig.parser),
    });

    // make sure that the parser doesn't hold onto file handles between tests
    // on linux (i.e. our CI env), there can be very a limited number of watch handles available
    const constructor = this.constructor as typeof RuleTester;
    constructor.afterAll(() => {
      try {
        // instead of creating a hard dependency, just use a soft require
        // a bit weird, but if they're using this tooling, it'll be installed
        const parser = require(TYPESCRIPT_ESLINT_PARSER) as typeof ParserType;
        parser.clearCaches();
      } catch {
        // ignored on purpose
      }
    });
  }

  /**
   * Set the configuration to use for all future tests
   */
  static setDefaultConfig(config: RuleTesterConfig): void {
    if (typeof config !== 'object' || config == null) {
      throw new TypeError(
        'RuleTester.setDefaultConfig: config must be an object',
      );
    }
    // Make sure the rules object exists since it is assumed to exist later
    defaultConfig = deepMerge(
      defaultConfig,
      // @ts-expect-error -- no index signature
      config,
    ) as TesterConfigWithDefaults;
  }

  /**
   * Get the current configuration used for all tests
   */
  static getDefaultConfig(): Readonly<RuleTesterConfig> {
    return defaultConfig;
  }

  /**
   * Reset the configuration to the initial configuration of the tester removing
   * any changes made until now.
   */
  static resetDefaultConfig(): void {
    defaultConfig = merge({}, testerDefaultConfig);
  }

  /**
   * Adds the `only` property to a test to run it in isolation.
   */
  static only<Options extends readonly unknown[]>(
    item: ValidTestCase<Options> | string,
  ): ValidTestCase<Options>;
  /**
   * Adds the `only` property to a test to run it in isolation.
   */
  static only<MessageIds extends string, Options extends readonly unknown[]>(
    item: InvalidTestCase<MessageIds, Options>,
  ): InvalidTestCase<MessageIds, Options>;
  static only<MessageIds extends string, Options extends readonly unknown[]>(
    item:
      | InvalidTestCase<MessageIds, Options>
      | ValidTestCase<Options>
      | string,
  ): InvalidTestCase<MessageIds, Options> | ValidTestCase<Options> {
    if (typeof item === 'string') {
      return { code: item, only: true };
    }

    return { ...item, only: true };
  }

  /**
   * Define a rule for one particular run of tests.
   */
  defineRule(name: string, rule: AnyRuleCreateFunction | AnyRuleModule): void {
    this.#rules[name] = rule;
  }

  #normalizeTests<
    MessageIds extends string,
    Options extends readonly unknown[],
  >(
    rawTests: RunTests<MessageIds, Options>,
  ): NormalizedRunTests<MessageIds, Options> {
    /*
    Automatically add a filename to the tests to enable type-aware tests to "just work".
    This saves users having to verbosely and manually add the filename to every
    single test case.
    Hugely helps with the string-based valid test cases as it means they don't
    need to be made objects!
    */
    const getFilename = (testOptions?: ParserOptions): string => {
      const resolvedOptions = deepMerge(
        this.#testerConfig.parserOptions,
        testOptions,
      ) as ParserOptions;
      const filename = resolvedOptions.ecmaFeatures?.jsx
        ? this.#testerConfig.defaultFilenames.tsx
        : this.#testerConfig.defaultFilenames.ts;
      if (resolvedOptions.project) {
        return path.join(
          resolvedOptions.tsconfigRootDir ?? process.cwd(),
          filename,
        );
      }
      return filename;
    };
    const normalizeTest = <
      MessageIds extends string,
      Options extends readonly unknown[],
      T extends InvalidTestCase<MessageIds, Options> | ValidTestCase<Options>,
    >(
      test: T,
    ): T => {
      if (test.parser === TYPESCRIPT_ESLINT_PARSER) {
        throw new Error(DUPLICATE_PARSER_ERROR_MESSAGE);
      }
      if (!test.filename) {
        return { ...test, filename: getFilename(test.parserOptions) };
      }
      return test;
    };

    const normalizedTests = {
      valid: rawTests.valid
        .map(test => {
          if (typeof test === 'string') {
            return { code: test };
          }
          return test;
        })
        .map(normalizeTest),
      invalid: rawTests.invalid.map(normalizeTest),
    };

    // convenience iterator to make it easy to loop all tests without a concat
    const allTestsIterator = {
      *[Symbol.iterator](): Generator<ValidTestCase<Options>, void> {
        for (const testCase of normalizedTests.valid) {
          yield testCase;
        }
        for (const testCase of normalizedTests.invalid) {
          yield testCase;
        }
      },
    };

    const hasOnly = ((): boolean => {
      for (const test of allTestsIterator) {
        if (test.only) {
          return true;
        }
      }
      return false;
    })();
    if (hasOnly) {
      // if there is an `only: true` - don't try apply constraints - assume that
      // we are in "local development" mode rather than "CI validation" mode
      return normalizedTests;
    }

    const hasConstraints = ((): boolean => {
      for (const test of allTestsIterator) {
        if (
          test.dependencyConstraints &&
          Object.keys(test.dependencyConstraints).length > 0
        ) {
          return true;
        }
      }
      return false;
    })();
    if (!hasConstraints) {
      return normalizedTests;
    }

    /*
    Mark all unsatisfactory tests as `skip: true`.
    We do this instead of just omitting the tests entirely because it gives the
    test framework the opportunity to log the test as skipped rather than the test
    just disappearing without a trace.
    */
    const maybeMarkAsOnly = <
      T extends InvalidTestCase<MessageIds, Options> | ValidTestCase<Options>,
    >(
      test: T,
    ): T => {
      return {
        ...test,
        skip: !satisfiesAllDependencyConstraints(test.dependencyConstraints),
      };
    };
    normalizedTests.valid = normalizedTests.valid.map(maybeMarkAsOnly);
    normalizedTests.invalid = normalizedTests.invalid.map(maybeMarkAsOnly);

    return normalizedTests;
  }

  /**
   * Adds a new rule test to execute.
   */
  run<MessageIds extends string, Options extends readonly unknown[]>(
    ruleName: string,
    rule: RuleModule<MessageIds, Options>,
    test: RunTests<MessageIds, Options>,
  ): void {
    const constructor = this.constructor as typeof RuleTester;

    if (
      this.#testerConfig.dependencyConstraints &&
      !satisfiesAllDependencyConstraints(
        this.#testerConfig.dependencyConstraints,
      )
    ) {
      // for frameworks like mocha or jest that have a "skip" version of their function
      // we can provide a nice skipped test!
      constructor.describeSkip(ruleName, () => {
        constructor.it(
          'All tests skipped due to unsatisfied constructor dependency constraints',
          () => {
            // some frameworks error if there are no assertions
            assert.equal(true, true);
          },
        );
      });

      // don't run any tests because we don't match the base constraint
      return;
    }

    if (!test || typeof test !== 'object') {
      throw new TypeError(
        `Test Scenarios for rule ${ruleName} : Could not find test scenario object`,
      );
    }

    const scenarioErrors: string[] = [];
    REQUIRED_SCENARIOS.forEach(scenarioType => {
      if (!test[scenarioType]) {
        scenarioErrors.push(
          `Could not find any ${scenarioType} test scenarios`,
        );
      }
    });

    if (scenarioErrors.length > 0) {
      throw new Error(
        [
          `Test Scenarios for rule ${ruleName} is invalid:`,
          ...scenarioErrors,
        ].join('\n'),
      );
    }

    const seenValidTestCases = new Set<string>();
    const seenInvalidTestCases = new Set<string>();

    if (typeof rule === 'function') {
      emitLegacyRuleAPIWarning(ruleName);
    }

    this.#linter.defineRule(ruleName, {
      ...rule,
      // Create a wrapper rule that freezes the `context` properties.
      create(context: RuleContext<MessageIds, Options>) {
        freezeDeeply(context.options);
        freezeDeeply(context.settings);
        freezeDeeply(context.parserOptions);

        return (typeof rule === 'function' ? rule : rule.create)(context);
      },
    });

    this.#linter.defineRules(this.#rules);

    const normalizedTests = this.#normalizeTests(test);

    function getTestMethod(
      test: ValidTestCase<Options>,
    ): 'it' | 'itOnly' | 'itSkip' {
      if (test.skip) {
        return 'itSkip';
      }
      if (test.only) {
        return 'itOnly';
      }
      return 'it';
    }

    /*
     * This creates a test suite and pipes all supplied info through
     * one of the templates above.
     */
    constructor.describe(ruleName, () => {
      if (normalizedTests.valid.length) {
        constructor.describe('valid', () => {
          normalizedTests.valid.forEach(valid => {
            const testName = ((): string => {
              if (valid.name == null || valid.name.length === 0) {
                return valid.code;
              }
              return valid.name;
            })();
            constructor[getTestMethod(valid)](sanitize(testName), () => {
              this.#testValidTemplate(
                ruleName,
                rule,
                valid,
                seenValidTestCases,
              );
            });
          });
        });
      }

      if (normalizedTests.invalid.length) {
        constructor.describe('invalid', () => {
          normalizedTests.invalid.forEach(invalid => {
            const name = ((): string => {
              if (invalid.name == null || invalid.name.length === 0) {
                return invalid.code;
              }
              return invalid.name;
            })();
            constructor[getTestMethod(invalid)](sanitize(name), () => {
              this.#testInvalidTemplate(
                ruleName,
                rule,
                invalid,
                seenInvalidTestCases,
              );
            });
          });
        });
      }
    });
  }

  /**
   * Run the rule for the given item
   * @throws {Error} If an invalid schema.
   * Use @private instead of #private to expose it for testing purposes
   */
  private runRuleForItem<
    MessageIds extends string,
    Options extends readonly unknown[],
  >(
    ruleName: string,
    rule: RuleModule<MessageIds, Options>,
    item: InvalidTestCase<MessageIds, Options> | ValidTestCase<Options>,
  ): {
    messages: Linter.LintMessage[];
    output: string;
    beforeAST: TSESTree.Program;
    afterAST: TSESTree.Program;
    config: RuleTesterConfig;
    filename?: string;
  } {
    let config: TesterConfigWithDefaults = merge({}, this.#testerConfig);
    let code;
    let filename;
    let output;
    let beforeAST: TSESTree.Program;
    let afterAST: TSESTree.Program;

    if (typeof item === 'string') {
      code = item;
    } else {
      code = item.code;

      /*
       * Assumes everything on the item is a config except for the
       * parameters used by this tester
       */
      const itemConfig: Record<string, unknown> = { ...item };

      for (const parameter of RULE_TESTER_PARAMETERS) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete itemConfig[parameter];
      }

      /*
       * Create the config object from the tester config and this item
       * specific configurations.
       */
      config = merge(config, itemConfig);
    }

    if (hasOwnProperty(item, 'only')) {
      assert.ok(
        typeof item.only === 'boolean',
        "Optional test case property 'only' must be a boolean",
      );
    }
    if (hasOwnProperty(item, 'filename')) {
      assert.ok(
        typeof item.filename === 'string',
        "Optional test case property 'filename' must be a string",
      );
      filename = item.filename;
    }

    if (hasOwnProperty(item, 'options')) {
      assert(Array.isArray(item.options), 'options must be an array');
      if (
        item.options.length > 0 &&
        typeof rule === 'object' &&
        (!rule.meta || (rule.meta && rule.meta.schema == null))
      ) {
        emitMissingSchemaWarning(ruleName);
      }
      config.rules[ruleName] = ['error', ...item.options];
    } else {
      config.rules[ruleName] = 'error';
    }

    const schema = getRuleOptionsSchema(rule);

    /*
     * Setup AST getters.
     * The goal is to check whether or not AST was modified when
     * running the rule under test.
     */
    this.#linter.defineRule('rule-tester/validate-ast', {
      create() {
        return {
          Program(node): void {
            beforeAST = cloneDeeplyExcludesParent(node);
          },
          'Program:exit'(node): void {
            afterAST = node;
          },
        };
      },
    });

    if (typeof config.parser === 'string') {
      assert(
        path.isAbsolute(config.parser),
        'Parsers provided as strings to RuleTester must be absolute paths',
      );
    } else {
      config.parser = require.resolve(TYPESCRIPT_ESLINT_PARSER);
    }

    this.#linter.defineParser(
      config.parser,
      wrapParser(require(config.parser) as Parser.ParserModule),
    );

    if (schema) {
      ajv.validateSchema(schema);

      if (ajv.errors) {
        const errors = ajv.errors
          .map(error => {
            const field =
              error.dataPath[0] === '.'
                ? error.dataPath.slice(1)
                : error.dataPath;

            return `\t${field}: ${error.message}`;
          })
          .join('\n');

        throw new Error(
          [`Schema for rule ${ruleName} is invalid:`, errors].join(
            // no space after comma to match eslint core
            ',',
          ),
        );
      }

      /*
       * `ajv.validateSchema` checks for errors in the structure of the schema (by comparing the schema against a "meta-schema"),
       * and it reports those errors individually. However, there are other types of schema errors that only occur when compiling
       * the schema (e.g. using invalid defaults in a schema), and only one of these errors can be reported at a time. As a result,
       * the schema is compiled here separately from checking for `validateSchema` errors.
       */
      try {
        ajv.compile(schema);
      } catch (err) {
        throw new Error(
          `Schema for rule ${ruleName} is invalid: ${(err as Error).message}`,
        );
      }
    }

    validate(config, 'rule-tester', id => (id === ruleName ? rule : null));

    // Verify the code.
    // @ts-expect-error -- we don't define deprecated members on our types
    const { getComments } = SourceCode.prototype as { getComments: unknown };
    let messages;

    try {
      // @ts-expect-error -- we don't define deprecated members on our types
      SourceCode.prototype.getComments = getCommentsDeprecation;
      messages = this.#linter.verify(code, config, filename);
    } finally {
      // @ts-expect-error -- we don't define deprecated members on our types
      SourceCode.prototype.getComments = getComments;
    }

    const fatalErrorMessage = messages.find(m => m.fatal);

    assert(
      !fatalErrorMessage,
      `A fatal parsing error occurred: ${fatalErrorMessage?.message}`,
    );

    // Verify if autofix makes a syntax error or not.
    if (messages.some(m => m.fix)) {
      output = SourceCodeFixer.applyFixes(code, messages).output;
      const errorMessageInFix = this.#linter
        .verify(output, config, filename)
        .find(m => m.fatal);

      assert(
        !errorMessageInFix,
        [
          'A fatal parsing error occurred in autofix.',
          `Error: ${errorMessageInFix?.message}`,
          'Autofix output:',
          output,
        ].join('\n'),
      );
    } else {
      output = code;
    }

    return {
      messages,
      output,
      // is definitely assigned within the `rule-tester/validate-ast` rule
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      beforeAST: beforeAST!,
      // is definitely assigned within the `rule-tester/validate-ast` rule
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      afterAST: cloneDeeplyExcludesParent(afterAST!),
      config,
      filename,
    };
  }

  /**
   * Check if the template is valid or not
   * all valid cases go through this
   */
  #testValidTemplate<
    MessageIds extends string,
    Options extends readonly unknown[],
  >(
    ruleName: string,
    rule: RuleModule<MessageIds, Options>,
    itemIn: ValidTestCase<Options> | string,
    seenValidTestCases: Set<string>,
  ): void {
    const item: ValidTestCase<Options> =
      typeof itemIn === 'object' ? itemIn : { code: itemIn };

    assert.ok(
      typeof item.code === 'string',
      "Test case must specify a string value for 'code'",
    );
    if (item.name) {
      assert.ok(
        typeof item.name === 'string',
        "Optional test case property 'name' must be a string",
      );
    }

    checkDuplicateTestCase(item, seenValidTestCases);

    const result = this.runRuleForItem(ruleName, rule, item);
    const messages = result.messages;

    assert.strictEqual(
      messages.length,
      0,
      util.format(
        'Should have no errors but had %d: %s',
        messages.length,
        util.inspect(messages),
      ),
    );

    assertASTDidntChange(result.beforeAST, result.afterAST);
  }

  /**
   * Check if the template is invalid or not
   * all invalid cases go through this.
   */
  #testInvalidTemplate<
    MessageIds extends string,
    Options extends readonly unknown[],
  >(
    ruleName: string,
    rule: RuleModule<MessageIds, Options>,
    item: InvalidTestCase<MessageIds, Options>,
    seenInvalidTestCases: Set<string>,
  ): void {
    assert.ok(
      typeof item.code === 'string',
      "Test case must specify a string value for 'code'",
    );
    if (item.name) {
      assert.ok(
        typeof item.name === 'string',
        "Optional test case property 'name' must be a string",
      );
    }
    assert.ok(
      item.errors || item.errors === 0,
      `Did not specify errors for an invalid test of ${ruleName}`,
    );

    if (Array.isArray(item.errors) && item.errors.length === 0) {
      assert.fail('Invalid cases must have at least one error');
    }

    checkDuplicateTestCase(item, seenInvalidTestCases);

    const ruleHasMetaMessages =
      hasOwnProperty(rule, 'meta') && hasOwnProperty(rule.meta, 'messages');
    const friendlyIDList = ruleHasMetaMessages
      ? `[${Object.keys(rule.meta.messages)
          .map(key => `'${key}'`)
          .join(', ')}]`
      : null;

    const result = this.runRuleForItem(ruleName, rule, item);
    const messages = result.messages;

    for (const message of messages) {
      if (hasOwnProperty(message, 'suggestions')) {
        const seenMessageIndices = new Map<string, number>();

        for (let i = 0; i < message.suggestions.length; i += 1) {
          const suggestionMessage = message.suggestions[i].desc;
          const previous = seenMessageIndices.get(suggestionMessage);

          assert.ok(
            !seenMessageIndices.has(suggestionMessage),
            `Suggestion message '${suggestionMessage}' reported from suggestion ${i} was previously reported by suggestion ${previous}. Suggestion messages should be unique within an error.`,
          );
          seenMessageIndices.set(suggestionMessage, i);
        }
      }
    }

    if (typeof item.errors === 'number') {
      if (item.errors === 0) {
        assert.fail("Invalid cases must have 'error' value greater than 0");
      }

      assert.strictEqual(
        messages.length,
        item.errors,
        util.format(
          'Should have %d error%s but had %d: %s',
          item.errors,
          item.errors === 1 ? '' : 's',
          messages.length,
          util.inspect(messages),
        ),
      );
    } else {
      assert.strictEqual(
        messages.length,
        item.errors.length,
        util.format(
          'Should have %d error%s but had %d: %s',
          item.errors.length,
          item.errors.length === 1 ? '' : 's',
          messages.length,
          util.inspect(messages),
        ),
      );

      const hasMessageOfThisRule = messages.some(m => m.ruleId === ruleName);

      for (let i = 0, l = item.errors.length; i < l; i++) {
        const error = item.errors[i];
        const message = messages[i];

        assert(
          hasMessageOfThisRule,
          'Error rule name should be the same as the name of the rule being tested',
        );

        if (typeof error === 'string' || error instanceof RegExp) {
          // Just an error message.
          assertMessageMatches(message.message, error);
          assert.ok(
            message.suggestions === undefined,
            `Error at index ${i} has suggestions. Please convert the test error into an object and specify 'suggestions' property on it to test suggestions.`,
          );
        } else if (typeof error === 'object' && error != null) {
          /*
           * Error object.
           * This may have a message, messageId, data, node type, line, and/or
           * column.
           */

          Object.keys(error).forEach(propertyName => {
            assert.ok(
              ERROR_OBJECT_PARAMETERS.has(propertyName),
              `Invalid error property name '${propertyName}'. Expected one of ${FRIENDLY_ERROR_OBJECT_PARAMETER_LIST}.`,
            );
          });

          // @ts-expect-error -- we purposely don't define `message` on our types as the current standard is `messageId`
          if (hasOwnProperty(error, 'message')) {
            assert.ok(
              !hasOwnProperty(error, 'messageId'),
              "Error should not specify both 'message' and a 'messageId'.",
            );
            assert.ok(
              !hasOwnProperty(error, 'data'),
              "Error should not specify both 'data' and 'message'.",
            );
            assertMessageMatches(
              message.message,
              // @ts-expect-error -- we purposely don't define `message` on our types as the current standard is `messageId`
              error.message as unknown,
            );
          } else if (hasOwnProperty(error, 'messageId')) {
            assert.ok(
              ruleHasMetaMessages,
              "Error can not use 'messageId' if rule under test doesn't define 'meta.messages'.",
            );
            if (!hasOwnProperty(rule.meta.messages, error.messageId)) {
              assert(
                false,
                `Invalid messageId '${error.messageId}'. Expected one of ${friendlyIDList}.`,
              );
            }
            assert.strictEqual(
              message.messageId,
              error.messageId,
              `messageId '${message.messageId}' does not match expected messageId '${error.messageId}'.`,
            );

            const unsubstitutedPlaceholders =
              getUnsubstitutedMessagePlaceholders(
                message.message,
                rule.meta.messages[message.messageId],
                error.data,
              );

            assert.ok(
              unsubstitutedPlaceholders.length === 0,
              `The reported message has ${unsubstitutedPlaceholders.length > 1 ? `unsubstituted placeholders: ${unsubstitutedPlaceholders.map(name => `'${name}'`).join(', ')}` : `an unsubstituted placeholder '${unsubstitutedPlaceholders[0]}'`}. Please provide the missing ${unsubstitutedPlaceholders.length > 1 ? 'values' : 'value'} via the 'data' property in the context.report() call.`,
            );

            if (hasOwnProperty(error, 'data')) {
              /*
               *  if data was provided, then directly compare the returned message to a synthetic
               *  interpolated message using the same message ID and data provided in the test.
               *  See https://github.com/eslint/eslint/issues/9890 for context.
               */
              const unformattedOriginalMessage =
                rule.meta.messages[error.messageId];
              const rehydratedMessage = interpolate(
                unformattedOriginalMessage,
                error.data,
              );

              assert.strictEqual(
                message.message,
                rehydratedMessage,
                `Hydrated message "${rehydratedMessage}" does not match "${message.message}"`,
              );
            }
          } else {
            assert.fail(
              "Test error must specify either a 'messageId' or 'message'.",
            );
          }

          if (error.type) {
            assert.strictEqual(
              message.nodeType,
              error.type,
              `Error type should be ${error.type}, found ${message.nodeType}`,
            );
          }

          if (hasOwnProperty(error, 'line')) {
            assert.strictEqual(
              message.line,
              error.line,
              `Error line should be ${error.line}`,
            );
          }

          if (hasOwnProperty(error, 'column')) {
            assert.strictEqual(
              message.column,
              error.column,
              `Error column should be ${error.column}`,
            );
          }

          if (hasOwnProperty(error, 'endLine')) {
            assert.strictEqual(
              message.endLine,
              error.endLine,
              `Error endLine should be ${error.endLine}`,
            );
          }

          if (hasOwnProperty(error, 'endColumn')) {
            assert.strictEqual(
              message.endColumn,
              error.endColumn,
              `Error endColumn should be ${error.endColumn}`,
            );
          }

          assert.ok(
            !message.suggestions || hasOwnProperty(error, 'suggestions'),
            `Error at index ${i} has suggestions. Please specify 'suggestions' property on the test error object.`,
          );
          if (hasOwnProperty(error, 'suggestions')) {
            // Support asserting there are no suggestions
            const expectsSuggestions = Array.isArray(error.suggestions)
              ? error.suggestions.length > 0
              : Boolean(error.suggestions);
            const hasSuggestions = message.suggestions !== undefined;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const messageSuggestions = message.suggestions!;

            if (!hasSuggestions && expectsSuggestions) {
              assert.ok(
                !error.suggestions,
                `Error should have suggestions on error with message: "${message.message}"`,
              );
            } else if (hasSuggestions) {
              assert.ok(
                expectsSuggestions,
                `Error should have no suggestions on error with message: "${message.message}"`,
              );
              if (typeof error.suggestions === 'number') {
                assert.strictEqual(
                  messageSuggestions.length,
                  error.suggestions,
                  // It is possible that error.suggestions is a number
                  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                  `Error should have ${error.suggestions} suggestions. Instead found ${messageSuggestions.length} suggestions`,
                );
              } else if (Array.isArray(error.suggestions)) {
                assert.strictEqual(
                  messageSuggestions.length,
                  error.suggestions.length,
                  `Error should have ${error.suggestions.length} suggestions. Instead found ${messageSuggestions.length} suggestions`,
                );

                error.suggestions.forEach(
                  (expectedSuggestion: SuggestionOutput<MessageIds>, index) => {
                    assert.ok(
                      typeof expectedSuggestion === 'object' &&
                        expectedSuggestion != null,
                      "Test suggestion in 'suggestions' array must be an object.",
                    );
                    Object.keys(expectedSuggestion).forEach(propertyName => {
                      assert.ok(
                        SUGGESTION_OBJECT_PARAMETERS.has(propertyName),
                        `Invalid suggestion property name '${propertyName}'. Expected one of ${FRIENDLY_SUGGESTION_OBJECT_PARAMETER_LIST}.`,
                      );
                    });

                    const actualSuggestion = messageSuggestions[index];
                    const suggestionPrefix = `Error Suggestion at index ${index}:`;

                    // @ts-expect-error -- we purposely don't define `desc` on our types as the current standard is `messageId`
                    if (hasOwnProperty(expectedSuggestion, 'desc')) {
                      // @ts-expect-error -- we purposely don't define `desc` on our types as the current standard is `messageId`
                      const expectedDesc = expectedSuggestion.desc as string;

                      assert.ok(
                        !hasOwnProperty(expectedSuggestion, 'data'),
                        `${suggestionPrefix} Test should not specify both 'desc' and 'data'.`,
                      );
                      assert.ok(
                        !hasOwnProperty(expectedSuggestion, 'messageId'),
                        `${suggestionPrefix} Test should not specify both 'desc' and 'messageId'.`,
                      );
                      assert.strictEqual(
                        actualSuggestion.desc,
                        expectedDesc,
                        `${suggestionPrefix} desc should be "${expectedDesc}" but got "${actualSuggestion.desc}" instead.`,
                      );
                    } else if (
                      hasOwnProperty(expectedSuggestion, 'messageId')
                    ) {
                      assert.ok(
                        ruleHasMetaMessages,
                        `${suggestionPrefix} Test can not use 'messageId' if rule under test doesn't define 'meta.messages'.`,
                      );
                      assert.ok(
                        hasOwnProperty(
                          rule.meta.messages,
                          expectedSuggestion.messageId,
                        ),
                        `${suggestionPrefix} Test has invalid messageId '${expectedSuggestion.messageId}', the rule under test allows only one of ${friendlyIDList}.`,
                      );
                      assert.strictEqual(
                        actualSuggestion.messageId,
                        expectedSuggestion.messageId,
                        `${suggestionPrefix} messageId should be '${expectedSuggestion.messageId}' but got '${actualSuggestion.messageId}' instead.`,
                      );

                      const unsubstitutedPlaceholders =
                        getUnsubstitutedMessagePlaceholders(
                          actualSuggestion.desc,
                          rule.meta.messages[expectedSuggestion.messageId],
                          expectedSuggestion.data,
                        );

                      assert.ok(
                        unsubstitutedPlaceholders.length === 0,
                        `The message of the suggestion has ${unsubstitutedPlaceholders.length > 1 ? `unsubstituted placeholders: ${unsubstitutedPlaceholders.map(name => `'${name}'`).join(', ')}` : `an unsubstituted placeholder '${unsubstitutedPlaceholders[0]}'`}. Please provide the missing ${unsubstitutedPlaceholders.length > 1 ? 'values' : 'value'} via the 'data' property for the suggestion in the context.report() call.`,
                      );

                      if (hasOwnProperty(expectedSuggestion, 'data')) {
                        const unformattedMetaMessage =
                          rule.meta.messages[expectedSuggestion.messageId];
                        const rehydratedDesc = interpolate(
                          unformattedMetaMessage,
                          expectedSuggestion.data,
                        );

                        assert.strictEqual(
                          actualSuggestion.desc,
                          rehydratedDesc,
                          `${suggestionPrefix} Hydrated test desc "${rehydratedDesc}" does not match received desc "${actualSuggestion.desc}".`,
                        );
                      }
                    } else if (hasOwnProperty(expectedSuggestion, 'data')) {
                      assert.fail(
                        `${suggestionPrefix} Test must specify 'messageId' if 'data' is used.`,
                      );
                    } else {
                      assert.fail(
                        `${suggestionPrefix} Test must specify either 'messageId' or 'desc'.`,
                      );
                    }

                    assert.ok(
                      hasOwnProperty(expectedSuggestion, 'output'),
                      `${suggestionPrefix} The "output" property is required.`,
                    );
                    const codeWithAppliedSuggestion =
                      SourceCodeFixer.applyFixes(item.code, [
                        actualSuggestion,
                      ]).output;

                    // Verify if suggestion fix makes a syntax error or not.
                    const errorMessageInSuggestion = this.#linter
                      .verify(
                        codeWithAppliedSuggestion,
                        result.config,
                        result.filename,
                      )
                      .find(m => m.fatal);

                    assert(
                      !errorMessageInSuggestion,
                      [
                        'A fatal parsing error occurred in suggestion fix.',
                        `Error: ${errorMessageInSuggestion?.message}`,
                        'Suggestion output:',
                        codeWithAppliedSuggestion,
                      ].join('\n'),
                    );

                    assert.strictEqual(
                      codeWithAppliedSuggestion,
                      expectedSuggestion.output,
                      `Expected the applied suggestion fix to match the test suggestion output for suggestion at index: ${index} on error with message: "${message.message}"`,
                    );
                    assert.notStrictEqual(
                      expectedSuggestion.output,
                      item.code,
                      `The output of a suggestion should differ from the original source code for suggestion at index: ${index} on error with message: "${message.message}"`,
                    );
                  },
                );
              } else {
                assert.fail(
                  "Test error object property 'suggestions' should be an array or a number",
                );
              }
            }
          }
        } else {
          // Message was an unexpected type
          assert.fail(
            `Error should be a string, object, or RegExp, but found (${util.inspect(
              message,
            )})`,
          );
        }
      }
    }

    if (hasOwnProperty(item, 'output')) {
      if (item.output == null) {
        assert.strictEqual(
          result.output,
          item.code,
          'Expected no autofixes to be suggested',
        );
      } else {
        assert.strictEqual(result.output, item.output, 'Output is incorrect.');
      }
    } else {
      assert.strictEqual(
        result.output,
        item.code,
        "The rule fixed the code. Please add 'output' property.",
      );
      assert.notStrictEqual(
        item.code,
        item.output,
        "Test property 'output' matches 'code'. If no autofix is expected, then omit the 'output' property or set it to null.",
      );
    }

    assertASTDidntChange(result.beforeAST, result.afterAST);
  }
}

/**
 * Check if the AST was changed
 */
function assertASTDidntChange(beforeAST: unknown, afterAST: unknown): void {
  assert.deepStrictEqual(beforeAST, afterAST, 'Rule should not modify AST.');
}

/**
 * Check if this test case is a duplicate of one we have seen before.
 */
function checkDuplicateTestCase(
  item: unknown,
  seenTestCases: Set<unknown>,
): void {
  if (!isSerializable(item)) {
    /*
     * If we can't serialize a test case (because it contains a function, RegExp, etc), skip the check.
     * This might happen with properties like: options, plugins, settings, languageOptions.parser, languageOptions.parserOptions.
     */
    return;
  }

  const serializedTestCase = stringify(item);

  assert(
    !seenTestCases.has(serializedTestCase),
    'detected duplicate test case',
  );
  seenTestCases.add(serializedTestCase);
}

/**
 * Asserts that the message matches its expected value. If the expected
 * value is a regular expression, it is checked against the actual
 * value.
 */
function assertMessageMatches(actual: string, expected: RegExp | string): void {
  if (expected instanceof RegExp) {
    // assert.js doesn't have a built-in RegExp match function
    assert.ok(
      expected.test(actual),
      `Expected '${actual}' to match ${expected}`,
    );
  } else {
    assert.strictEqual(actual, expected);
  }
}

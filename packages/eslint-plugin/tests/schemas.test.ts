import { compile } from '@typescript-eslint/rule-schema-to-typescript-types';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import prettier from 'prettier';

import { areOptionsValid } from './areOptionsValid.js';
import { ROOT_DIR, rulesEntriesList } from './test-utils/test-utils.js';

const SCHEMA_SNAPSHOTS_FOLDER = path.join(__dirname, 'schema-snapshots');

const PRETTIER_CONFIG_PATH = path.join(
  ROOT_DIR,
  '..',
  '..',
  '.prettierrc.json',
);

const SCHEMA_FILEPATH = path.join(__dirname, 'schema.json');
const TS_TYPE_FILEPATH = path.join(__dirname, 'schema.ts');

const getPrettierConfig = async (
  filepath: string,
): Promise<prettier.Options> => {
  const config = await prettier.resolveConfig(filepath, {
    config: PRETTIER_CONFIG_PATH,
  });
  if (config == null) {
    throw new Error('Unable to resolve prettier config');
  }
  return {
    ...config,
    filepath,
  };
};

const SKIPPED_RULES_FOR_TYPE_GENERATION = new Set(['indent']);
// Set this to a rule name to only run that rule
const ONLY = '';

describe('Rule schemas should be convertible to TS types for documentation purposes', async () => {
  const PRETTIER_CONFIG = {
    schema: await getPrettierConfig(SCHEMA_FILEPATH),
    tsType: getPrettierConfig(TS_TYPE_FILEPATH),
  };

  beforeAll(async () => {
    await fs.mkdir(SCHEMA_SNAPSHOTS_FOLDER, { recursive: true });
  });

  describe.for(rulesEntriesList)('%s', ([ruleName, rule]) => {
    // skip for documentation purposes
    it.skipIf(SKIPPED_RULES_FOR_TYPE_GENERATION.has(ruleName))(ruleName, () => {
      expect(SKIPPED_RULES_FOR_TYPE_GENERATION).not.toContain(ruleName);
    });

    it(ruleName, { only: ruleName === ONLY }, async ({ expect }) => {
      const schemaString = await prettier.format(
        JSON.stringify(
          rule.meta.schema,
          (k, v: unknown) => {
            if (k === 'enum' && Array.isArray(v)) {
              // sort enum arrays for consistency regardless of source order
              v.sort();
            } else if (
              typeof v === 'object' &&
              v != null &&
              !Array.isArray(v)
            ) {
              // sort properties for consistency regardless of source order
              return Object.fromEntries(
                Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
              );
            }
            return v;
          },
          // use the indent feature as it forces all objects to be multiline
          // if we don't do this then prettier decides what objects are multiline
          // based on what fits on a line - which looks less consistent
          // and makes changes harder to understand as you can have multiple
          // changes per line, or adding a prop can restructure an object
          2,
        ),
        PRETTIER_CONFIG.schema,
      );

      const compilationResult = await compile(
        rule.meta.schema,
        PRETTIER_CONFIG.tsType,
      );

      const snapshotPath = path.join(
        SCHEMA_SNAPSHOTS_FOLDER,
        `${ruleName}.shot`,
      );

      const snapshotContent = [
        '',
        '# SCHEMA:',
        '',
        schemaString,
        '',
        '# TYPES:',
        '',
        compilationResult,
      ].join('\n');

      await expect(snapshotContent).toMatchFileSnapshot(snapshotPath);
    });
  });
});

describe('There should be no old snapshots for rules that have been deleted', async () => {
  const schemaSnapshotFileNames = await fs.readdir(SCHEMA_SNAPSHOTS_FOLDER, {
    encoding: 'utf-8',
  });

  const names = new Set(
    rulesEntriesList
      .filter(([ruleName]) => !SKIPPED_RULES_FOR_TYPE_GENERATION.has(ruleName))
      .map(([ruleName]) => `${ruleName}.shot`),
  );

  test.for(schemaSnapshotFileNames)(
    '%s',
    (schemaSnapshotFileName, { expect }) => {
      expect(names).toContain(schemaSnapshotFileName);
    },
  );
});

const VALID_SCHEMA_PROPS = new Set([
  '$defs',
  '$ref',
  '$schema',
  'additionalItems',
  'additionalProperties',
  'allOf',
  'anyOf',
  'default',
  'definitions',
  'dependencies',
  'description',
  'enum',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'extends',
  'format',
  'id',
  'items',
  'maximum',
  'maxItems',
  'maxLength',
  'maxProperties',
  'minimum',
  'minItems',
  'minLength',
  'minProperties',
  'multipleOf',
  'not',
  'oneOf',
  'pattern',
  'patternProperties',
  'properties',
  'required',
  'title',
  'type',
  'uniqueItems',
] as const);

describe('Rules should only define valid keys on schemas', () => {
  describe.for(rulesEntriesList)('%s', ([ruleName, rule]) => {
    it(ruleName, { only: ruleName === ONLY }, () => {
      JSON.stringify(rule.meta.schema, (key, value: unknown) => {
        if (key === '') {
          // the root object will have key ""
          return value;
        }
        if (key === '$defs' || key === 'definitions' || key === 'properties') {
          // definition keys and property keys should not be validated, only the values
          return Object.values(value as object);
        }
        if (`${Number(key)}` === key) {
          // hack to detect arrays as JSON.stringify will traverse them and stringify the number
          return value;
        }

        expect(VALID_SCHEMA_PROPS).toContain(key);
        return value;
      });
    });
  });
});

describe('Rule schemas should validate options correctly', () => {
  // Normally, we use the rule's default options as an example of valid options.
  // However, the defaults might not actually be valid (especially in the case
  // where the defaults have to cover multiple incompatible options).
  // This override allows providing example valid options for rules which don't
  // accept their defaults.
  const overrideValidOptions: Record<string, unknown> = {
    'func-call-spacing': ['never'],
    semi: ['never'],
  };

  test.for(rulesEntriesList)(
    '%s must accept valid options',
    ([ruleName, rule], { expect }) => {
      expect(
        areOptionsValid(
          rule,
          overrideValidOptions[ruleName] ?? rule.defaultOptions,
        ),
      ).toBe(true);
    },
  );

  test.for(rulesEntriesList)(
    '%s rejects arbitrary options',
    ([, rule], { expect }) => {
      expect(
        areOptionsValid(rule, [{ 'arbitrary-schemas.test.ts': true }]),
      ).toBe(false);
    },
  );
});

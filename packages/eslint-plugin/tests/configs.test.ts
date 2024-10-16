import type {
  FlatConfig,
  RuleModuleWithMetaDocs,
  RuleRecommendation,
} from '@typescript-eslint/utils/ts-eslint';

import type { ESLintPluginDocs } from '../rules.js';

import plugin from '../src/index.js';
import { RULE_NAME_PREFIX, rulesEntriesList } from './test-utils/test-utils.js';

type Configs = Omit<
  typeof plugin.configs,
  'base' | 'eslint-recommended' | 'recommended-requiring-type-checking'
>;

type ConfigName = keyof Configs;

type ConfigRules = {
  [ConfigNameType in ConfigName as keyof Required<
    Configs[ConfigNameType]['rules']
  >]: Configs[ConfigNameType] extends Configs[ConfigNameType]
    ?
        | [ruleLevel: FlatConfig.SeverityString, ...ruleOptions: unknown[]]
        | FlatConfig.SeverityString
        | undefined
    : never;
};

type ConfigRulesKeys = keyof ConfigRules;

type ConfigRulesEntries = [
  ruleName: string,
  ruleEntry: FlatConfig.RuleEntry | undefined,
][];

type RuleEntryWithSeverityString =
  | [ruleLevel: FlatConfig.SeverityString, ...ruleOptions: unknown[]]
  | FlatConfig.SeverityString;

type PrefixedRuleName = Extract<
  ConfigRulesKeys,
  `${typeof RULE_NAME_PREFIX}${string}`
>;

function filterRules(
  ruleEntries: ConfigRulesEntries,
): [prefixedRuleName: string, ruleEntry: RuleEntryWithSeverityString][] {
  return ruleEntries.filter(
    (
      rules,
    ): rules is [
      prefixedRuleName: string,
      ruleEntry: RuleEntryWithSeverityString,
    ] => rules[0].startsWith(RULE_NAME_PREFIX),
  );
}

interface FilterAndMapRuleConfigsSettings {
  /**
   * @default false
   */
  excludeDeprecated?: boolean;

  /**
   * @default false
   */
  recommendations?: false | RuleRecommendation[];

  /**
   * @default false
   */
  typeCheckMode?: boolean | 'exclude' | 'include-only';
}

function filterAndMapRuleConfigs(
  filterAndMapRuleConfigsSettings: FilterAndMapRuleConfigsSettings = {},
): [prefixedRuleName: string, ruleEntry: RuleEntryWithSeverityString][] {
  const {
    excludeDeprecated = false,
    recommendations = false,
    typeCheckMode = false,
  } = filterAndMapRuleConfigsSettings;

  let result = rulesEntriesList;

  if (excludeDeprecated) {
    result = result.filter(
      ([, ruleModuleWithMetaDocs]) => !ruleModuleWithMetaDocs.meta.deprecated,
    );
  }

  if (typeCheckMode) {
    result = result.filter(([, rule]) =>
      typeCheckMode === 'exclude'
        ? !rule.meta.docs?.requiresTypeChecking
        : rule.meta.docs?.requiresTypeChecking,
    );

    if (typeCheckMode === true) {
      return result.map(
        ([ruleName]) => [`${RULE_NAME_PREFIX}${ruleName}`, 'off'] as const,
      );
    }
  }

  if (recommendations) {
    result = result.filter(([, rule]) => {
      assert.isDefined(rule.meta.docs);

      const { recommended } = rule.meta.docs;

      switch (typeof recommended) {
        case 'object':
          return Object.keys(recommended).some(ruleRecommendation =>
            recommendations.includes(ruleRecommendation as RuleRecommendation),
          );

        case 'string':
          return recommendations.includes(recommended);

        default:
          return false;
      }
    });
  }

  const highestRecommendation = recommendations && recommendations.at(-1);

  assert.isDefined(highestRecommendation);

  return result.map(([ruleName, rule]) => {
    assert.isDefined(rule.meta.docs);

    const { recommended } = rule.meta.docs;

    const customRecommendation =
      highestRecommendation &&
      typeof recommended === 'object' &&
      recommended[
        highestRecommendation as Exclude<RuleRecommendation, 'stylistic'>
      ];

    assert.isDefined(customRecommendation);

    return [
      `${RULE_NAME_PREFIX}${ruleName}`,
      typeof customRecommendation === 'boolean'
        ? 'error'
        : ['error', customRecommendation[0]],
    ] as const;
  });
}

const localTest = test.extend<{
  EXTENSION_RULES: (readonly [
    prefixedRuleName: PrefixedRuleName,
    baseRuleName: string,
  ])[];

  /**
   * @default 'all'
   */
  configName: ConfigName;
  unfilteredConfigRules: NonNullable<FlatConfig.Config['rules']>;
  expectedOverrides: Record<string, 'off'>;
  actualConfigRulesObject: Record<string, RuleEntryWithSeverityString>;
  expectedConfigRulesObject: Record<string, RuleEntryWithSeverityString>;
}>({
  actualConfigRulesObject: [
    async ({ configName }, use) => {
      const isAll = configName === 'all';

      const isRecommended = configName.startsWith('recommended');

      const isStrict = configName.startsWith('strict');

      const isStylistic = configName.startsWith('stylistic');

      const isDisableTypeChecked = configName === 'disable-type-checked';

      const isTypeChecked =
        isAll || (!isDisableTypeChecked && configName.endsWith('type-checked'));

      const isTypeCheckedOnly = configName.endsWith('type-checked-only');

      const recommendations = isRecommended
        ? (['recommended'] as const satisfies RuleRecommendation[])
        : isStylistic
          ? (['stylistic'] as const satisfies RuleRecommendation[])
          : isStrict
            ? ([
                'recommended',
                'strict',
              ] as const satisfies RuleRecommendation[])
            : false;

      const typeCheckMode = isTypeCheckedOnly
        ? 'include-only'
        : isDisableTypeChecked
          ? true
          : isTypeChecked
            ? false
            : 'exclude';

      const excludeDeprecated = isAll || isStrict;

      const actualConfigRulesEntries = filterAndMapRuleConfigs({
        excludeDeprecated,
        recommendations,
        typeCheckMode,
      });

      const actualConfigRulesObject = Object.fromEntries(
        actualConfigRulesEntries,
      );

      await use(actualConfigRulesObject);
    },
    { auto: false },
  ],

  configName: ['all', { auto: false }],

  expectedConfigRulesObject: [
    async ({ unfilteredConfigRules }, use) => {
      const expectedConfigRulesEntries = filterRules(
        Object.entries(unfilteredConfigRules),
      );

      const expectedConfigRulesObject = Object.fromEntries(
        expectedConfigRulesEntries,
      );

      await use(expectedConfigRulesObject);
    },
    { auto: false },
  ],

  expectedOverrides: [
    async ({ EXTENSION_RULES, unfilteredConfigRules }, use) => {
      const ruleNames = new Set(Object.keys(unfilteredConfigRules));

      const expectedOverrides = Object.fromEntries(
        EXTENSION_RULES.filter(([ruleName]) => ruleNames.has(ruleName)).map(
          ([, baseRuleName]) => [baseRuleName, 'off'] as const,
        ),
      );

      await use(expectedOverrides);
    },
    { auto: false },
  ],

  EXTENSION_RULES: [
    rulesEntriesList
      .filter(
        (
          rules,
        ): rules is [
          ruleName: string,
          ruleModuleWithMetaDocs: RuleModuleWithMetaDocs<
            string,
            [],
            Omit<ESLintPluginDocs, 'extendsBaseRule'> &
              Required<Pick<ESLintPluginDocs, 'extendsBaseRule'>>
          >,
        ] => rules[1].meta.docs?.extendsBaseRule != null,
      )
      .map(
        ([ruleName, ruleModuleWithMetaDocs]) =>
          [
            `${RULE_NAME_PREFIX}${ruleName}` as PrefixedRuleName,
            typeof ruleModuleWithMetaDocs.meta.docs.extendsBaseRule === 'string'
              ? ruleModuleWithMetaDocs.meta.docs.extendsBaseRule
              : ruleName,
          ] as const,
      ),
    { auto: false },
  ],

  unfilteredConfigRules: [
    async ({ configName }, use) => {
      const config = plugin.configs[configName];

      const { rules } = config;

      await use(rules);
    },
    { auto: false },
  ],
});

describe('all.ts', () => {
  localTest(
    'contains all of the rules',
    ({ actualConfigRulesObject, expectedConfigRulesObject }) => {
      // note: exclude deprecated rules, this config is allowed to change between minor versions

      expect(actualConfigRulesObject).toStrictEqual(expectedConfigRulesObject);
    },
  );

  localTest(
    'has the base rules overridden by the appropriate extension rules',
    ({ expectedOverrides, unfilteredConfigRules }) => {
      expect(unfilteredConfigRules).toMatchObject(expectedOverrides);
    },
  );
});

describe('disable-type-checked.ts', () => {
  localTest.scoped({ configName: 'disable-type-checked' });

  localTest(
    'disables all type checked rules',
    ({ actualConfigRulesObject, expectedConfigRulesObject }) => {
      expect(actualConfigRulesObject).toStrictEqual(expectedConfigRulesObject);
    },
  );
});

describe('recommended.ts', () => {
  localTest.scoped({ configName: 'recommended' });

  localTest(
    'contains all recommended rules, excluding type checked ones',
    ({ actualConfigRulesObject, expectedConfigRulesObject }) => {
      // note: include deprecated rules so that the config doesn't change between major bumps

      expect(actualConfigRulesObject).toStrictEqual(expectedConfigRulesObject);
    },
  );

  localTest(
    'has the base rules overridden by the appropriate extension rules',
    ({ expectedOverrides, unfilteredConfigRules }) => {
      expect(unfilteredConfigRules).toMatchObject(expectedOverrides);
    },
  );
});

describe('recommended-type-checked.ts', () => {
  localTest.scoped({ configName: 'recommended-type-checked' });

  localTest(
    'contains all recommended rules',
    ({ actualConfigRulesObject, expectedConfigRulesObject }) => {
      // note: include deprecated rules so that the config doesn't change between major bumps

      expect(actualConfigRulesObject).toStrictEqual(expectedConfigRulesObject);
    },
  );

  localTest(
    'has the base rules overridden by the appropriate extension rules',
    ({ expectedOverrides, unfilteredConfigRules }) => {
      expect(unfilteredConfigRules).toMatchObject(expectedOverrides);
    },
  );
});

describe('recommended-type-checked-only.ts', () => {
  localTest.scoped({ configName: 'recommended-type-checked-only' });

  localTest(
    'contains only type-checked recommended rules',
    ({ actualConfigRulesObject, expectedConfigRulesObject }) => {
      // note: include deprecated rules so that the config doesn't change between major bumps

      expect(actualConfigRulesObject).toStrictEqual(expectedConfigRulesObject);
    },
  );

  localTest(
    'has the base rules overridden by the appropriate extension rules',
    ({ expectedOverrides, unfilteredConfigRules }) => {
      expect(unfilteredConfigRules).toMatchObject(expectedOverrides);
    },
  );
});

describe('strict.ts', () => {
  localTest.scoped({ configName: 'strict' });

  localTest(
    'contains all strict rules, excluding type checked ones',
    ({ actualConfigRulesObject, expectedConfigRulesObject }) => {
      // note: exclude deprecated rules, this config is allowed to change between minor versions

      expect(actualConfigRulesObject).toStrictEqual(expectedConfigRulesObject);
    },
  );

  localTest(
    'has the base rules overridden by the appropriate extension rules',
    ({ expectedOverrides, unfilteredConfigRules }) => {
      expect(unfilteredConfigRules).toMatchObject(expectedOverrides);
    },
  );
});

describe('strict-type-checked.ts', () => {
  localTest.scoped({ configName: 'strict-type-checked' });

  localTest(
    'contains all strict rules',
    ({ actualConfigRulesObject, expectedConfigRulesObject }) => {
      // note: exclude deprecated rules, this config is allowed to change between minor versions

      expect(actualConfigRulesObject).toStrictEqual(expectedConfigRulesObject);
    },
  );

  localTest(
    'has the base rules overridden by the appropriate extension rules',
    ({ expectedOverrides, unfilteredConfigRules }) => {
      expect(unfilteredConfigRules).toMatchObject(expectedOverrides);
    },
  );
});

describe('strict-type-checked-only.ts', () => {
  localTest.scoped({ configName: 'strict-type-checked-only' });

  localTest(
    'contains only type-checked strict rules',
    ({ actualConfigRulesObject, expectedConfigRulesObject }) => {
      // note: exclude deprecated rules, this config is allowed to change between minor versions

      expect(actualConfigRulesObject).toStrictEqual(expectedConfigRulesObject);
    },
  );

  localTest(
    'has the base rules overridden by the appropriate extension rules',
    ({ expectedOverrides, unfilteredConfigRules }) => {
      expect(unfilteredConfigRules).toMatchObject(expectedOverrides);
    },
  );
});

describe('stylistic.ts', () => {
  localTest.scoped({ configName: 'stylistic' });

  localTest(
    'contains all stylistic rules, excluding deprecated or type checked ones',
    ({ actualConfigRulesObject, expectedConfigRulesObject }) => {
      // note: exclude deprecated rules, this config is allowed to change between minor versions

      expect(actualConfigRulesObject).toStrictEqual(expectedConfigRulesObject);
    },
  );

  localTest(
    'has the base rules overridden by the appropriate extension rules',
    ({ expectedOverrides, unfilteredConfigRules }) => {
      expect(unfilteredConfigRules).toMatchObject(expectedOverrides);
    },
  );
});

describe('stylistic-type-checked.ts', () => {
  localTest.scoped({ configName: 'stylistic-type-checked' });

  localTest(
    'contains all stylistic rules, excluding deprecated ones',
    ({ actualConfigRulesObject, expectedConfigRulesObject }) => {
      // note: include deprecated rules so that the config doesn't change between major bumps

      expect(actualConfigRulesObject).toStrictEqual(expectedConfigRulesObject);
    },
  );

  localTest(
    'has the base rules overridden by the appropriate extension rules',
    ({ expectedOverrides, unfilteredConfigRules }) => {
      expect(unfilteredConfigRules).toMatchObject(expectedOverrides);
    },
  );
});

describe('stylistic-type-checked-only.ts', () => {
  localTest.scoped({ configName: 'stylistic-type-checked-only' });

  localTest(
    'contains only type-checked stylistic rules',
    ({ actualConfigRulesObject, expectedConfigRulesObject }) => {
      // note: include deprecated rules so that the config doesn't change between major bumps

      expect(actualConfigRulesObject).toStrictEqual(expectedConfigRulesObject);
    },
  );

  localTest(
    'has the base rules overridden by the appropriate extension rules',
    ({ expectedOverrides, unfilteredConfigRules }) => {
      expect(unfilteredConfigRules).toMatchObject(expectedOverrides);
    },
  );
});

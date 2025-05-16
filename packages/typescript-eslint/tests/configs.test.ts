import type { ESLintPluginDocs } from '@typescript-eslint/eslint-plugin/use-at-your-own-risk/rules';
import type {
  FlatConfig,
  RuleModuleWithMetaDocs,
  RuleRecommendation,
} from '@typescript-eslint/utils/ts-eslint';

import { clearCandidateTSConfigRootDirs } from '@typescript-eslint/typescript-estree';

import { configs } from '../src/index.js';
import { RULE_NAME_PREFIX, rulesEntriesList } from './test-utils/test-utils.js';

vi.mock(
  import('@typescript-eslint/typescript-estree'),
  async importOriginal => {
    const actual = await importOriginal();

    return {
      ...actual,
      get addCandidateTSConfigRootDir() {
        return mockAddCandidateTSConfigRootDir;
      },
      default: actual.default,
    };
  },
);

type Configs = Omit<typeof configs, 'base' | 'eslintRecommended'>;

type ConfigName = keyof Configs;

type ConfigRules = NonNullable<
  {
    [ConfigNameType in ConfigName]: Configs[ConfigNameType] extends FlatConfig.Config
      ? Configs[ConfigNameType]['rules']
      : Configs[ConfigNameType] extends FlatConfig.ConfigArray
        ? Configs[ConfigNameType][2]['rules']
        : never;
  }[ConfigName]
>;

type ConfigRulesKeys = keyof ConfigRules;

type ConfigRulesValues = ConfigRules[ConfigRulesKeys];

type ConfigRulesEntries = [
  ruleName: ConfigRulesKeys,
  ruleEntry: ConfigRulesValues,
][];

type RuleEntryWithSeverityString =
  | [ruleLevel: FlatConfig.SeverityString, ...ruleOptions: unknown[]]
  | FlatConfig.SeverityString;

type PrefixedRuleName = Extract<
  `${typeof RULE_NAME_PREFIX}${string}`,
  ConfigRulesKeys
>;

const mockGetTSConfigRootDirFromStack = vi.fn();

vi.mock(
  import('../src/getTSConfigRootDirFromStack.js'),
  async importOriginal => {
    const actual = await importOriginal();

    return {
      ...actual,
      get getTSConfigRootDirFromStack() {
        return mockGetTSConfigRootDirFromStack;
      },
    };
  },
);

function filterRules(
  ruleEntries: ConfigRulesEntries,
): [
  prefixedRuleName: PrefixedRuleName,
  ruleEntry: RuleEntryWithSeverityString,
][] {
  return ruleEntries.filter(
    (
      rules,
    ): rules is [
      prefixedRuleName: PrefixedRuleName,
      ruleEntry: RuleEntryWithSeverityString,
    ] => rules[1] != null && rules[0].startsWith(RULE_NAME_PREFIX),
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
): [
  prefixedRuleName: PrefixedRuleName,
  ruleEntry: RuleEntryWithSeverityString,
][] {
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
    result = result.filter(([, ruleModuleWithMetaDocs]) =>
      typeCheckMode === 'exclude'
        ? !ruleModuleWithMetaDocs.meta.docs.requiresTypeChecking
        : ruleModuleWithMetaDocs.meta.docs.requiresTypeChecking,
    );

    if (typeCheckMode === true) {
      return result.map(
        ([ruleName]) => [`${RULE_NAME_PREFIX}${ruleName}`, 'off'] as const,
      );
    }
  }

  if (recommendations) {
    result = result.filter(([, ruleModuleWithMetaDocs]) => {
      const { recommended } = ruleModuleWithMetaDocs.meta.docs;

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

  return result.map(([ruleName, ruleModuleWithMetaDocs]) => {
    const { recommended } = ruleModuleWithMetaDocs.meta.docs;

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
  unfilteredConfigRules: ConfigRules;
  expectedOverrides: Record<string, 'off'>;
  actualConfigRulesObject: Record<
    PrefixedRuleName,
    RuleEntryWithSeverityString
  >;
  expectedConfigRulesObject: Record<
    PrefixedRuleName,
    RuleEntryWithSeverityString
  >;
}>({
  actualConfigRulesObject: [
    async ({ configName }, use) => {
      const isAll = configName === 'all';

      const isRecommended = configName.startsWith('recommended');

      const isStrict = configName.startsWith('strict');

      const isStylistic = configName.startsWith('stylistic');

      const isDisableTypeChecked = configName === 'disableTypeChecked';

      const isTypeChecked =
        isAll || (!isDisableTypeChecked && configName.endsWith('TypeChecked'));

      const isTypeCheckedOnly = configName.endsWith('TypeCheckedOnly');

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
      ) satisfies Record<
        PrefixedRuleName,
        RuleEntryWithSeverityString
      > as Record<PrefixedRuleName, RuleEntryWithSeverityString>;

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
      ) satisfies Record<
        PrefixedRuleName,
        RuleEntryWithSeverityString
      > as Record<PrefixedRuleName, RuleEntryWithSeverityString>;

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
            unknown[],
            Omit<ESLintPluginDocs, 'extendsBaseRule'> &
              Required<Pick<ESLintPluginDocs, 'extendsBaseRule'>>
          >,
        ] => rules[1].meta.docs.extendsBaseRule != null,
      )
      .map(
        ([ruleName, ruleModuleWithMetaDocs]) =>
          [
            `${RULE_NAME_PREFIX}${ruleName}`,
            typeof ruleModuleWithMetaDocs.meta.docs.extendsBaseRule === 'string'
              ? ruleModuleWithMetaDocs.meta.docs.extendsBaseRule
              : ruleName,
          ] as const,
      ),
    { auto: false },
  ],

  unfilteredConfigRules: [
    async ({ configName }, use) => {
      const config =
        configName === 'disableTypeChecked'
          ? configs[configName]
          : configs[configName][2];

      const { rules } = config;

      assert.isDefined(rules);

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
  localTest.scoped({ configName: 'disableTypeChecked' });

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
  localTest.scoped({ configName: 'recommendedTypeChecked' });

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
  localTest.scoped({ configName: 'recommendedTypeCheckedOnly' });

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
  localTest.scoped({ configName: 'strictTypeChecked' });

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
  localTest.scoped({ configName: 'strictTypeCheckedOnly' });

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

describe('stylistic-type-checked.ts', () => {
  localTest.scoped({ configName: 'stylisticTypeChecked' });

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
  localTest.scoped({ configName: 'stylisticTypeCheckedOnly' });

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

const mockAddCandidateTSConfigRootDir = vi.fn();

describe('Candidate tsconfigRootDirs', () => {
  beforeEach(() => {
    clearCandidateTSConfigRootDirs();
    mockAddCandidateTSConfigRootDir.mockClear();
  });

  describe.for(Object.keys(configs))('%s', configKey => {
    it('does not populate a candidate tsconfigRootDir when accessed and one cannot be inferred from the stack', () => {
      mockGetTSConfigRootDirFromStack.mockReturnValueOnce(undefined);

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      configs[configKey as keyof typeof configs];

      expect(mockAddCandidateTSConfigRootDir).not.toHaveBeenCalled();
    });

    it('populates a candidate tsconfigRootDir when accessed and one can be inferred from the stack', () => {
      const tsconfigRootDir = 'a/b/c/';

      mockGetTSConfigRootDirFromStack.mockReturnValueOnce(tsconfigRootDir);

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      configs[configKey as keyof typeof configs];

      expect(mockAddCandidateTSConfigRootDir).toHaveBeenLastCalledWith(
        tsconfigRootDir,
      );
    });
  });
});

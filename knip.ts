import type { KnipConfig } from 'knip' with { 'resolution-mode': 'import' };

import * as path from 'node:path';

export default {
  cspell: {
    config: [path.posix.join(__dirname, '.cspell.json')],
  },

  entry: ['src/index.ts'],

  eslint: {
    config: [path.posix.join(__dirname, 'eslint.config.mjs')],
    entry: [path.posix.join(__dirname, 'eslint.config.mjs')],
  },

  'github-actions': {
    config: [path.posix.join(__dirname, '.github/workflows/**/*.yml')],
    entry: [
      path.posix.join(__dirname, '.github/actions/breaking-pr-check/index.js'),
    ],
  },

  husky: {
    config: [path.posix.join(__dirname, '.husky/pre-commit')],
  },

  'lint-staged': {
    config: [path.posix.join(__dirname, '.lintstagedrc')],
  },

  markdownlint: {
    config: [path.posix.join(__dirname, '.markdownlint.json')],
  },

  node: {
    config: ['package.json'],
    entry: ['package.json'],
  },

  nx: {
    config: [path.posix.join(__dirname, 'nx.json'), 'project.json'],
  },

  prettier: {
    config: [path.posix.join(__dirname, '.prettierrc.json')],
  },

  project: ['src/**/*.ts'],

  rules: {
    classMembers: 'off',
    duplicates: 'off',
    enumMembers: 'off',
    exports: 'off',
    nsExports: 'off',
    nsTypes: 'off',
    types: 'off',
    unresolved: 'off',
  },

  vite: false,

  vitest: {
    config: ['vitest.config.mts'],
    entry: ['tests/**/*.{bench,test,test-d}.?(c|m)ts?(x)'],
  },

  workspaces: {
    '.': {
      entry: ['tools/release/changelog-renderer.js', 'tools/scripts/**/*.mts'],
      ignoreDependencies: [
        '@nx/workspace',
        // imported for type purposes only
        'website',
      ],

      project: [
        'tools/scripts/**/*.mts',
        '!tools/scripts/typings/typescript.d.ts',
        '!typings/*.d.ts',
      ],
    },

    'packages/ast-spec': {
      ignore: [
        // @typescript-eslint/typescript-estree is not listed in dependencies to avoid circular dependency errors
        // You can check a more detailed explanation in this file
        'tests/util/parsers/typescript-estree-import.ts',
      ],

      project: ['src/**/*.ts', 'tests/util/**/*.ts', '!src/**/fixtures/**'],

      vitest: {
        config: ['vitest.config.mts'],
        entry: [
          'tests/**/*.{bench,test,test-d}.?(c|m)ts?(x)',
          'tests/util/setupVitest.mts',
        ],
      },
    },
    'packages/eslint-plugin': {
      ignore: [
        'tests/fixtures/**',
        'typings/eslint-rules.d.ts',
        'typings/typescript.d.ts',
      ],
    },
    'packages/eslint-plugin-internal': {
      ignore: ['tests/fixtures/**'],
    },
    'packages/integration-tests': {
      ignore: ['fixtures/**'],
    },
    'packages/parser': {
      ignore: ['tests/fixtures/**'],

      vitest: {
        config: ['vitest.config.mts'],
        entry: ['tests/lib/**/*.{bench,test,test-d}.?(c|m)ts?(x)'],
      },
    },
    'packages/rule-tester': {
      ignore: ['typings/eslint.d.ts'],

      mocha: {
        entry: ['tests/eslint-base/eslint-base.test.js'],
      },
    },
    'packages/scope-manager': {
      ignore: ['tests/fixtures/**'],

      vitest: {
        config: ['vitest.config.mts'],
        entry: [
          'tests/**/*.{bench,test,test-d}.?(c|m)ts?(x)',
          'tests/test-utils/serializers/index.ts',
        ],
      },
    },
    'packages/type-utils': {
      ignore: ['tests/fixtures/**', 'typings/typescript.d.ts'],
    },
    'packages/typescript-estree': {
      entry: ['src/use-at-your-own-risk.ts'],
      ignore: ['tests/fixtures/**', 'typings/typescript.d.ts'],

      vitest: {
        config: ['vitest.config.mts'],
        entry: ['tests/lib/**/*.{bench,test,test-d}.?(c|m)ts?(x)'],
      },
    },
    'packages/utils': {
      ignore: [
        'typings/eslint.d.ts',
        'typings/eslint-community-eslint-utils.d.ts',
      ],
    },
    'packages/website': {
      entry: [
        'docusaurus.config.mts',
        'src/pages/**/*.tsx',

        // imported in MDX docs
        'src/components/**/*.tsx',

        // used by Docusaurus
        'src/theme/**/*.tsx',
        'src/theme/prism-include-languages.js',
      ],
      ignoreDependencies: [
        // used in MDX docs
        'raw-loader',

        // it's imported only as type (esquery types are forked and defined in packages/website/typings/esquery.d.ts)
        'esquery',

        '@docusaurus/mdx-loader',
        '@docusaurus/types',
        '@docusaurus/plugin-content-docs',
        '@docusaurus/plugin-content-blog',
        '@docusaurus/theme-search-algolia',
        '@docusaurus/ExecutionEnvironment',
        '@docusaurus/Link',
        '@docusaurus/router',
        '@docusaurus/useDocusaurusContext',
        '@docusaurus/useBaseUrl',
        '@docusaurus/BrowserOnly',
        '@docusaurus/module-type-aliases',
        '@generated/docusaurus.config',
        '^@theme/.*',
        '^@theme-original/.*',
        'docusaurus-plugin-typedoc',
        'typedoc-plugin-markdown',
      ],

      paths: {
        '@site/*': ['./*'],
      },

      project: [
        'src/**/*.ts?(x)',
        'plugins/**/*.ts?(x)',
        '!src/hooks/useRulesMeta.ts',
        '!src/{globals,types}.d.ts',
      ],

      vitest: false,
    },
    'packages/website-eslint': {
      entry: [
        'src/index.js',
        'src/mock/assert.js',
        'src/mock/empty.js',
        'src/mock/eslint-rules.js',
        'src/mock/eslint.js',
        'src/mock/lru-cache.js',
        'src/mock/parser.js',
        'src/mock/path.js',
        'src/mock/typescript.js',
        'src/mock/util.js',
      ],
      ignoreDependencies: [
        // virtual module
        'vt',
      ],

      vitest: false,
    },

    'tools/dummypkg': {
      vitest: false,
    },
  },

  yarn: {
    entry: [path.posix.join(__dirname, '.yarnrc.yml')],
  },
} satisfies KnipConfig;

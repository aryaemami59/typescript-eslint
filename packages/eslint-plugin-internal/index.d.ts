import type { FlatConfig } from '@typescript-eslint/utils/ts-eslint';

import type rules from './src/rules/index';

declare const cjsExport: {
  meta: FlatConfig.PluginMeta;
  rules: typeof rules;
};
export = cjsExport;

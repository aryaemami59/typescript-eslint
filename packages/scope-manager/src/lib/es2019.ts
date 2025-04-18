// THIS CODE WAS AUTOMATICALLY GENERATED
// DO NOT EDIT THIS CODE BY HAND
// RUN THE FOLLOWING COMMAND FROM THE WORKSPACE ROOT TO REGENERATE:
// npx nx generate-lib repo

import type { LibDefinition } from '../variable';

import { es2018 } from './es2018';
import { es2019_array } from './es2019.array';
import { es2019_intl } from './es2019.intl';
import { es2019_object } from './es2019.object';
import { es2019_string } from './es2019.string';
import { es2019_symbol } from './es2019.symbol';

export const es2019: LibDefinition = {
  libs: [
    es2018,
    es2019_array,
    es2019_object,
    es2019_string,
    es2019_symbol,
    es2019_intl,
  ],
  variables: [],
};

// THIS CODE WAS AUTOMATICALLY GENERATED
// DO NOT EDIT THIS CODE BY HAND
// RUN THE FOLLOWING COMMAND FROM THE WORKSPACE ROOT TO REGENERATE:
// npx nx generate-lib repo

import type { LibDefinition } from '../variable';

import { es2021 } from './es2021';
import { es2022_array } from './es2022.array';
import { es2022_error } from './es2022.error';
import { es2022_intl } from './es2022.intl';
import { es2022_object } from './es2022.object';
import { es2022_regexp } from './es2022.regexp';
import { es2022_string } from './es2022.string';

export const es2022: LibDefinition = {
  libs: [
    es2021,
    es2022_array,
    es2022_error,
    es2022_intl,
    es2022_object,
    es2022_regexp,
    es2022_string,
  ],
  variables: [],
};

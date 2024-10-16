import * as path from 'node:path';

import type { Variable } from '../../src/index.js';

import { ImplicitLibVariable } from '../../src/index.js';

export function getRealVariables(variables: Variable[]): Variable[] {
  return variables.filter(v => !(v instanceof ImplicitLibVariable));
}

export const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

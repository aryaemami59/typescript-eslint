// THIS CODE WAS AUTOMATICALLY GENERATED
// DO NOT EDIT THIS CODE BY HAND
// RUN THE FOLLOWING COMMAND FROM THE WORKSPACE ROOT TO REGENERATE:
// npx nx generate-lib repo

import type { LibDefinition } from '../variable';

import { dom } from './dom';
import { dom_asynciterable } from './dom.asynciterable';
import { dom_iterable } from './dom.iterable';
import { es2019 } from './es2019';
import { scripthost } from './scripthost';
import { webworker_importscripts } from './webworker.importscripts';

export const es2019_full: LibDefinition = {
  libs: [
    es2019,
    dom,
    webworker_importscripts,
    scripthost,
    dom_iterable,
    dom_asynciterable,
  ],
  variables: [],
};

import type * as H from 'history';

import { useHistory } from '@docusaurus/router';
import { useSyncExternalStore } from 'react';

export type HistorySelector<T> = (history: H.History) => T;

export function useHistorySelector<T>(
  selector: HistorySelector<T>,
  getServerSnapshot: () => T,
): T {
  const history = useHistory();
  return useSyncExternalStore(
    history.listen,
    () => selector(history),
    getServerSnapshot,
  );
}

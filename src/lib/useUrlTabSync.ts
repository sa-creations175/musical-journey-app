import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Sync a module's internal tab/filter state from a URL search
 * parameter. Each time the URL changes and the named param parses to
 * a valid tab id, `apply(next)` is called — letting the existing
 * state + pref machinery in the module treat the URL as just another
 * input source without needing a refactor.
 *
 * Typical usage (inside a tabbed module):
 *
 *   const [tab, setTab] = useState<TabId>('active');
 *   useUrlTabSync('tab', isTabId, setTab);
 *
 * The sidebar emits `/repertoire?tab=want-to-learn`; this hook picks
 * that up and flips `tab`. Internal tab changes (clicking the tab
 * strip) are unaffected — they just don't update the URL, which is
 * intentional: the URL is a landing signal, not a mirror of current
 * state.
 */
export function useUrlTabSync<T extends string>(
  paramName: string,
  isValid: (value: string) => value is T,
  apply: (next: T) => void,
): void {
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const raw = searchParams.get(paramName);
    if (raw && isValid(raw)) apply(raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
}

/**
 * Same shape as `useUrlTabSync` but for comma-separated
 * multi-select params (e.g. `?category=modes,intervals`). When the
 * URL carries at least one valid value, `apply(next)` is called with
 * the filtered set.
 */
export function useUrlMultiSelectSync<T extends string>(
  paramName: string,
  isValid: (value: string) => value is T,
  apply: (next: T[]) => void,
): void {
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const raw = searchParams.get(paramName);
    if (!raw) return;
    const parts = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const valid = parts.filter(isValid) as T[];
    if (valid.length > 0) apply(valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
}

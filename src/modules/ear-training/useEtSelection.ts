/**
 * Per-tracker bulk selection state. Owned by the tracker so the
 * "Select" toggle, the checkboxes, and the bulk action bar all
 * read the same source.
 *
 *   · active     — true while selection mode is on
 *   · selected   — Set<itemRef> of currently-picked items
 *   · enter()    — open selection mode (selected starts empty)
 *   · exit()     — close + clear selection
 *   · toggle(id) — flip an item's membership
 *   · clear()    — empty the selection but stay in selection mode
 *   · selectAll(ids) — replace selection with the given itemRefs
 */
import { useCallback, useState } from 'react';

export interface EtSelectionState {
  active: boolean;
  selected: ReadonlySet<string>;
  enter: () => void;
  exit: () => void;
  toggle: (itemRef: string) => void;
  clear: () => void;
  selectAll: (itemRefs: ReadonlyArray<string>) => void;
}

export function useEtSelection(): EtSelectionState {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const enter = useCallback(() => {
    setActive(true);
    setSelected(new Set());
  }, []);

  const exit = useCallback(() => {
    setActive(false);
    setSelected(new Set());
  }, []);

  const toggle = useCallback((itemRef: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(itemRef)) next.delete(itemRef);
      else next.add(itemRef);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set());
  }, []);

  const selectAll = useCallback((itemRefs: ReadonlyArray<string>) => {
    setSelected(new Set(itemRefs));
  }, []);

  return { active, selected, enter, exit, toggle, clear, selectAll };
}

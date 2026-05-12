import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Phrase } from '../../lib/db';

/**
 * Per-song clipboard for cross-section phrase copy/paste. The lead-
 * sheet UI lets the user toggle "select mode" inside a section,
 * tick one or more phrase lines, and copy them; sibling sections
 * then surface a "Paste phrase lines" button that appends the
 * copied phrases (with fresh ids, so paste is a deep copy).
 *
 * Lives at the SongDetailView level — clipboard is scoped to a
 * single song to avoid cross-song confusion. The provider wraps the
 * lead-sheet rendering area. Consumers (LeadSheetSection) read the
 * clipboard via `usePhraseClipboard()`.
 */
export interface PhraseClipboardState {
  /** Phrases that were copied. Each entry is the source phrase as-is
   *  (NOT pre-cloned) — the paste handler re-clones on every paste
   *  so the same clipboard can be pasted into multiple sections. */
  phrases: ReadonlyArray<Phrase>;
  /** Section the phrases were copied from. Used so the "Paste" button
   *  only shows on OTHER sections — pasting back into the source is a
   *  duplicate-line operation that has its own affordance. */
  sourceSectionId: string | null;
}

export interface PhraseClipboardContextValue {
  state: PhraseClipboardState;
  setClipboard: (next: PhraseClipboardState) => void;
  clear: () => void;
}

const PhraseClipboardContext = createContext<PhraseClipboardContextValue | null>(null);

export function PhraseClipboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PhraseClipboardState>({
    phrases: [],
    sourceSectionId: null,
  });

  const setClipboard = useCallback((next: PhraseClipboardState) => {
    setState(next);
  }, []);

  const clear = useCallback(() => {
    setState({ phrases: [], sourceSectionId: null });
  }, []);

  const value = useMemo<PhraseClipboardContextValue>(
    () => ({ state, setClipboard, clear }),
    [state, setClipboard, clear],
  );

  return (
    <PhraseClipboardContext.Provider value={value}>
      {children}
    </PhraseClipboardContext.Provider>
  );
}

/**
 * Returns the active clipboard. Falls back to an empty no-op
 * value when no provider is mounted so the helper is safe to call
 * unconditionally inside section components (the lead sheet still
 * renders standalone in tests that don't wrap it in a provider).
 */
export function usePhraseClipboard(): PhraseClipboardContextValue {
  const ctx = useContext(PhraseClipboardContext);
  if (ctx) return ctx;
  return {
    state: { phrases: [], sourceSectionId: null },
    setClipboard: () => {},
    clear: () => {},
  };
}

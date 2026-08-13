import { useEffect, useState } from 'react';

/** How long the tick stays up. Long enough to notice while glancing
 *  away from the field, short enough not to linger over the next edit. */
const SAVED_VISIBLE_MS = 1600;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * A phrase's note — read-only text until the surface is in edit mode,
 * then a small inline field.
 *
 * SHARED by the per-section strip and the Progressions drawer. They are
 * two windows onto the same stored `sequenceView`, and a note that
 * committed on blur in one place and on change in the other would be
 * two behaviours for one field.
 *
 * COMMITS ON BLUR, and only when the text actually changed, so typing
 * doesn't write on every keystroke and tabbing away from an untouched
 * field doesn't write at all.
 *
 * AND SAYS SO. Commit-on-blur with no feedback is typing into a void:
 * nothing distinguishes a saved note from one that never landed. That
 * was not a theoretical worry — until 13.10 an annotation written on a
 * not-yet-migrated section was orphaned by the very commit that saved
 * it, and the field looked exactly the same either way.
 *
 * So the outcome is reported, and reported HONESTLY: the tick appears
 * only after the write resolves, and a rejected write shows a failure
 * that does NOT fade. A confirmation that appears regardless of what
 * happened is worse than none, because it converts an invisible
 * failure into a false reassurance.
 *
 * A save BUTTON was considered and rejected: the note already commits
 * on blur, so a button would be theatre — pressing it would confirm
 * something that had already happened. The tick describes what the
 * mechanism actually does rather than pretending to drive it.
 */
export default function PhraseNote({
  note,
  editing,
  onChange,
}: {
  note?: string;
  editing: boolean;
  /** Awaited, so failure is visible. A caller that discards the promise
   *  makes every write look successful. */
  onChange: (next: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(note ?? '');
  const [state, setState] = useState<SaveState>('idle');

  useEffect(() => setDraft(note ?? ''), [note]);

  // The tick fades; a failure does not. An error that clears itself is
  // one the user can miss entirely.
  useEffect(() => {
    if (state !== 'saved') return;
    const t = setTimeout(() => setState('idle'), SAVED_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [state]);

  const commit = async (value: string) => {
    if (value === (note ?? '')) return;
    setState('saving');
    try {
      await onChange(value);
      setState('saved');
    } catch {
      setState('error');
    }
  };

  if (!editing) {
    return note ? (
      <span className="text-[10px] italic text-neutral-500 normal-case">
        {note}
      </span>
    ) : null;
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="text"
        value={draft}
        onChange={e => {
          setDraft(e.target.value);
          // Typing again retracts a stale failure — it described the
          // previous attempt, not this one.
          if (state === 'error') setState('idle');
        }}
        onBlur={() => void commit(draft)}
        placeholder="note"
        aria-label="phrase note"
        className="text-[10px] italic w-24 px-1 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300"
      />
      {/* Clearing the field and blurring ALWAYS removed the note —
          `setPhraseNote` maps blank to undefined — but nothing said so,
          so the only way to find out was to try it and hope. This is
          that same path with a handle on it. */}
      {draft !== '' && (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            void commit('');
          }}
          aria-label="delete note"
          title="delete this note"
          className="text-[10px] leading-none px-1 text-neutral-400 hover:text-needswork"
        >
          ×
        </button>
      )}
      {/* Polite, so it is announced without interrupting typing. */}
      <span aria-live="polite" className="text-[10px] leading-none">
        {state === 'saved' && (
          <span className="text-fluent" aria-label="note saved">
            ✓
          </span>
        )}
        {state === 'error' && (
          <span className="text-needswork not-italic" role="alert">
            not saved
          </span>
        )}
      </span>
    </span>
  );
}

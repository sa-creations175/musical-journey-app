import { useEffect, useRef, useState } from 'react';

/** How long the tick stays up. Long enough to notice while glancing
 *  away from the field, short enough not to linger over the next edit. */
const SAVED_VISIBLE_MS = 1600;

/** Floor for the growing field, in characters — about the width it had
 *  when it was fixed, so a short note looks unchanged. */
const MIN_WIDTH_CH = 12;

/** Slack so the caret and the last glyph are never flush to the edge. */
const WIDTH_SLACK_CH = 2;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * A phrase's note — read-only text until the surface is in edit mode,
 * then a small inline field that grows with what is being typed.
 *
 * SHARED by the per-section strip and the Progressions drawer. They are
 * two windows onto the same stored `sequenceView`, and a note that
 * behaved differently in each would be two features built from one
 * field.
 *
 * COMMITS ON BLUR, and only when the text actually changed, so typing
 * doesn't write on every keystroke and tabbing away from an untouched
 * field doesn't write at all.
 *
 * AND SAYS SO. Commit-on-blur with no feedback is typing into a void:
 * nothing distinguishes a saved note from one that never landed. Until
 * 13.10 an annotation written on a not-yet-migrated section was
 * orphaned by the very commit that saved it, and the field looked
 * identical either way. So the outcome is reported HONESTLY — the tick
 * appears only after the write resolves, and a rejected write shows a
 * failure that does NOT fade. A confirmation that appears regardless of
 * what happened converts an invisible failure into a false one.
 *
 * IT TAKES ITS OWN LINE WHILE EDITING, and that is load-bearing rather
 * than cosmetic. Both surfaces render this as a sibling flex item in
 * the SAME wrapping row as the chord tokens, so a field that widened as
 * you typed moved the wrap points and reflowed the chords of every
 * following phrase — visible movement under the user's hands, on every
 * keystroke. `basis-full` in edit mode takes the note out of that
 * contest entirely: growth can only ever push downward.
 *
 * The trade is that edit mode is taller than the read-only view. That
 * is predictable movement on a mode switch, which beats unpredictable
 * movement mid-word.
 *
 * A TEXTAREA, NOT AN INPUT, because an input physically cannot wrap:
 * past the responsive width cap the text has to go somewhere, and the
 * only alternative is scrolling it out of sight — which is the
 * complaint this change answers.
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
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setDraft(note ?? ''), [note]);

  // The tick fades; a failure does not. An error that clears itself is
  // one the user can miss.
  useEffect(() => {
    if (state !== 'saved') return;
    const t = setTimeout(() => setState('idle'), SAVED_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [state]);

  // Height follows the content once the width cap forces a wrap.
  // Measured rather than counted, because where a line breaks depends
  // on the glyphs, not on the character count.
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing]);

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
    <span className="basis-full inline-flex items-start gap-1">
      <textarea
        ref={fieldRef}
        rows={1}
        value={draft}
        /* Grows with the content; `max-w` does the capping, so the
           text wraps rather than scrolling out of view. Smaller
           ceiling on phone, both short of the drawer's edge. */
        style={{ width: `${draft.length + WIDTH_SLACK_CH + MIN_WIDTH_CH}ch` }}
        onChange={e => {
          // Newlines are collapsed rather than kept: the read-only view
          // is a span, so a stored line break would silently vanish on
          // save. Pasting a paragraph in gives one long note, not a
          // note that loses half of itself.
          setDraft(e.target.value.replace(/\s*\n+\s*/g, ' '));
          // Typing again retracts a stale failure — it described the
          // previous attempt, not this one.
          if (state === 'error') setState('idle');
        }}
        onKeyDown={e => {
          // Enter commits. It cannot insert a line break, for the same
          // reason newlines are collapsed.
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onBlur={() => void commit(draft)}
        placeholder="note"
        aria-label="phrase note"
        className="text-[10px] italic min-w-[6rem] max-w-[14rem] sm:max-w-[22rem] px-1 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 resize-none overflow-hidden leading-snug"
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
          className="text-[10px] leading-none px-1 pt-1 text-neutral-400 hover:text-needswork"
        >
          ×
        </button>
      )}
      {/* Polite, so it is announced without interrupting typing. */}
      <span aria-live="polite" className="text-[10px] leading-none pt-1">
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

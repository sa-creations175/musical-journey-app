import { useEffect, useState } from 'react';

/**
 * A phrase's note — read-only text until the surface is in edit mode,
 * then a small inline field.
 *
 * EXTRACTED so the per-section strip and the Progressions drawer share
 * one implementation. They are two windows onto the same stored
 * `sequenceView`, and a note that committed on blur in one place and
 * on change in the other would be two behaviours for one field.
 *
 * Commits on BLUR, and only when the text actually changed, so typing
 * doesn't write on every keystroke and tabbing away from an untouched
 * field doesn't write at all.
 */
export default function PhraseNote({
  note,
  editing,
  onChange,
}: {
  note?: string;
  editing: boolean;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState(note ?? '');
  useEffect(() => setDraft(note ?? ''), [note]);

  if (!editing) {
    return note ? (
      <span className="text-[10px] italic text-neutral-500 normal-case">
        {note}
      </span>
    ) : null;
  }
  return (
    <input
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== (note ?? '')) onChange(draft);
      }}
      placeholder="note"
      aria-label="phrase note"
      className="text-[10px] italic w-24 px-1 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300"
    />
  );
}

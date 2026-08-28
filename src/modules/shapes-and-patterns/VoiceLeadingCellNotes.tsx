/**
 * The two boxes on a voice-leading cell.
 *
 * =====================================================================
 * WHY TWO, AND NOT ONE WITH A CHECKBOX.
 *
 * The PATTERN box belongs to the row and follows it into all twelve
 * keys. It is about the shape, and it never names a note. The KEY box
 * belongs to this cell alone, and it is the only place a note name is
 * safe to write down.
 *
 * One box would mean wording written while practising in E♭ appearing
 * in F, asserting things that are false there. The split is what makes
 * the pattern box safe to reuse and the key box safe to be specific
 * in; a flag on a single box would put both jobs on one string and
 * leave the reader to remember which mode they were in.
 * =====================================================================
 *
 * SHIPS EMPTY. Only the Extended Voicings rows carry a default, and it
 * is the catalog hint. Every other box starts blank, so the control
 * beside it says Clear rather than Reset To Default — there is nothing
 * to reset to, and offering it would promise a restoration that would
 * produce an empty box.
 */
import { useEffect, useState } from 'react';
import {
  applyNote,
  clearNote,
  isOverridden,
  loadVoiceLeadingNotes,
  noteText,
  saveVoiceLeadingNotes,
  type VoiceLeadingNotes,
} from './voiceLeadingNotes';

export default function VoiceLeadingCellNotes({
  patternKey,
  keyKey,
  patternDefault,
  keyLabel,
}: {
  /** `patternId:rowId` — see `voiceLeadingNotes`. */
  patternKey: string;
  /** `patternId:rowId:keyName`. */
  keyKey: string;
  /** The catalog hint, where the row has one. Empty for most rows. */
  patternDefault: string;
  /** The key as the reader spells it, for the second box's heading. */
  keyLabel: string;
}) {
  const [notes, setNotes] = useState<VoiceLeadingNotes | null>(null);

  useEffect(() => {
    let live = true;
    void loadVoiceLeadingNotes().then(n => { if (live) setNotes(n); });
    return () => { live = false; };
  }, []);

  // Nothing until the stored map is in hand. Rendering an empty box
  // first would show the reader a blank where their own words are
  // about to appear, and invite them to type over it.
  if (notes === null) return null;

  const commit = (next: VoiceLeadingNotes) => {
    setNotes(next);
    void saveVoiceLeadingNotes(next);
  };

  return (
    <div className="space-y-3">
      <NoteBox
        heading="Pattern Description"
        hint="About the shape — it follows this row into every key, so keep note names out of it."
        value={noteText(notes, patternKey, patternDefault)}
        overridden={isOverridden(notes, patternKey)}
        hasDefault={patternDefault.trim() !== ''}
        emptyLine={null}
        onSave={text => commit(applyNote(notes, patternKey, text, patternDefault))}
        onReset={() => commit(clearNote(notes, patternKey))}
      />
      <NoteBox
        heading={`In ${keyLabel}`}
        hint="This key only — note names belong here."
        value={noteText(notes, keyKey)}
        overridden={isOverridden(notes, keyKey)}
        hasDefault={false}
        // An empty key box says so rather than showing a blank: the
        // absence is a fact about this cell, not a gap in the page.
        emptyLine={`Nothing key-specific noted for ${keyLabel} yet.`}
        onSave={text => commit(applyNote(notes, keyKey, text))}
        onReset={() => commit(clearNote(notes, keyKey))}
      />
    </div>
  );
}

/**
 * One box: read until pressed, a textarea once it is.
 *
 * SAVES ON BLUR, and Escape abandons. A drill modal is a place the
 * reader is mid-task, so an explicit Save button would be a second
 * thing to remember; blur is the gesture they are already making when
 * they look back at the keyboard.
 */
function NoteBox({
  heading, hint, value, overridden, hasDefault, emptyLine, onSave, onReset,
}: {
  heading: string;
  hint: string;
  value: string;
  overridden: boolean;
  /** Drives WHICH control shows — see the note at the component top. */
  hasDefault: boolean;
  /** Shown in place of a blank when there is nothing at all. */
  emptyLine: string | null;
  onSave: (text: string) => void;
  onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const open = () => { setDraft(value); setEditing(true); };

  return (
    <div className="rounded-md border border-black/[0.07] dark:border-neutral-700 p-3 space-y-1.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">
          {heading}
        </span>
        {overridden && (
          <span
            data-testid="note-edited"
            className="text-[10px] uppercase tracking-wide text-developing"
          >
            Edited
          </span>
        )}
        {overridden && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto text-[11px] text-neutral-500 hover:text-fluent underline"
          >
            {hasDefault ? 'Reset To Default' : 'Clear'}
          </button>
        )}
      </div>

      {editing ? (
        <textarea
          autoFocus
          value={draft}
          rows={2}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { onSave(draft); setEditing(false); }}
          onKeyDown={e => {
            if (e.key === 'Escape') { setEditing(false); }
          }}
          className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
        />
      ) : (
        <button
          type="button"
          onClick={open}
          className="block w-full text-left text-sm text-neutral-700 dark:text-neutral-200 hover:text-fluent"
        >
          {value !== ''
            ? value
            : (
              <span className="text-neutral-400 italic">
                {emptyLine ?? hint}
              </span>
            )}
        </button>
      )}
    </div>
  );
}

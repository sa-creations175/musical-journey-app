import { useEffect, useRef, useState } from 'react';
import type { Beat, Phrase } from '../../lib/db';
import {
  insertBeatAt,
  isInstrumentalPhrase,
  normalizePhrase,
  removeBeat,
  setChordOnBeat,
} from './beatsModel';
import { useToast } from '../../components/Toaster';

interface Props {
  phrase: Phrase;
  activeArrangementId: string;
  /** Additional arrangements whose chord rows should render above the
   *  beats in read-only compare mode. */
  compareArrangementIds?: string[];
  /** arrangementId → display name, for the compare rows. */
  arrangementName: (id: string) => string;
  /** Called whenever the phrase's beats or chord placements change.
   *  Caller commits to DB. */
  onChange: (next: Phrase) => Promise<void>;
  /** Flash animation when this phrase is just created / just moved. */
  highlighted?: boolean;
  /** When `highlighted` is true, which beat to auto-focus (by id). */
  autofocusBeatId?: string;
}

/**
 * Beat-based phrase editor. Renders three conceptual rows:
 *   1. (Optional) comparison chord rows — one per extra arrangement.
 *   2. Active chord row — editable chord slots above each beat.
 *   3. Beat row — word text for word beats, a small · for blank beats,
 *      with tiny "+" affordances between beats to insert blank beats.
 *
 * Chord slots use a pattern that avoids the cursor-at-position-0 bug:
 * local draft state is only re-synced when the beat id or arrangement
 * id changes (i.e. a different slot is being rendered), NEVER on
 * value changes while the user is typing. Click placement, Tab
 * navigation, and normal text editing all behave as users expect.
 */
export default function PhraseLineEditor({
  phrase,
  activeArrangementId,
  compareArrangementIds = [],
  arrangementName,
  onChange,
  highlighted,
  autofocusBeatId,
}: Props) {
  const normalised = normalizePhrase(phrase);
  const beats = normalised.beats;
  const activePlacements = normalised.chordsByArrangement[activeArrangementId] ?? {};
  const { toast } = useToast();

  // --- Mutation helpers ------------------------------------------

  const insertBlankAt = async (index: number): Promise<Beat> => {
    const { beats: nextBeats, inserted } = insertBeatAt(beats, index, 'blank');
    await onChange({ ...normalised, beats: nextBeats });
    return inserted;
  };

  const deleteBeat = async (beatId: string) => {
    const beat = beats.find(b => b.id === beatId);
    if (!beat) return;
    const snapshotBeats = beats;
    const snapshotChords = normalised.chordsByArrangement;
    const { beats: nextBeats, chordsByArrangement: nextChords } = removeBeat(
      beats,
      normalised.chordsByArrangement,
      beatId,
    );
    await onChange({ ...normalised, beats: nextBeats, chordsByArrangement: nextChords });
    toast({
      message: beat.type === 'word' && beat.text
        ? `Beat deleted: "${beat.text}"`
        : 'Beat deleted.',
      variant: 'warning',
      action: {
        label: 'Undo',
        onClick: async () => {
          await onChange({
            ...normalised,
            beats: snapshotBeats,
            chordsByArrangement: snapshotChords,
          });
        },
      },
    });
  };

  const commitChord = async (beatId: string, chord: string) => {
    const next = setChordOnBeat(
      normalised.chordsByArrangement,
      activeArrangementId,
      beatId,
      chord,
    );
    await onChange({ ...normalised, chordsByArrangement: next });
  };

  const updateWordText = async (beatId: string, text: string) => {
    const nextBeats = beats.map(b => b.id === beatId ? { ...b, text } : b);
    await onChange({ ...normalised, beats: nextBeats });
  };

  // --- Render -----------------------------------------------------

  const instrumental = isInstrumentalPhrase(normalised);
  const showInstrumentalLabel = instrumental && beats.length > 0;

  return (
    <div
      id={`phrase-${phrase.id}`}
      className={`rounded-md px-1 py-1 -mx-1 ${highlighted ? 'repertoire-flash' : ''}`}
    >
      {/* Compare arrangements: stacked chord rows above the active
          one. Read-only; arrow / label on the left identifies each. */}
      {compareArrangementIds.map(arrId => {
        const placements = normalised.chordsByArrangement[arrId] ?? {};
        return (
          <CompareChordRow
            key={arrId}
            label={arrangementName(arrId)}
            beats={beats}
            placements={placements}
          />
        );
      })}

      {/* Active chord row — editable */}
      <ChordRow
        active
        label={compareArrangementIds.length > 0 ? arrangementName(activeArrangementId) : undefined}
        beats={beats}
        placements={activePlacements}
        autofocusBeatId={autofocusBeatId}
        onCommit={commitChord}
      />

      {/* Beat row — word text or small · placeholder, with "+"
          insertion slots between beats. */}
      <BeatRow
        beats={beats}
        onInsert={insertBlankAt}
        onDelete={deleteBeat}
        onUpdateText={updateWordText}
      />

      {showInstrumentalLabel && (
        <div className="text-[11px] italic text-neutral-400 ml-2 mt-0.5">
          [Instrumental]
        </div>
      )}
      {beats.length === 0 && (
        <div className="flex items-center gap-2 pl-1 py-1">
          <InsertPoint
            onClick={async () => {
              const inserted = await insertBlankAt(0);
              // Flash the newly-inserted beat by re-rendering with
              // autofocusBeatId — caller passes this in via state.
              void inserted;
            }}
            label="add a beat"
          />
          <span className="text-xs text-neutral-400 italic">empty line — click "+" to add a beat</span>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------

interface ChordRowProps {
  /** Label shown to the left (only used in compare mode). */
  label?: string;
  beats: Beat[];
  placements: Record<string, string>;
  active?: boolean;
  autofocusBeatId?: string;
  onCommit?: (beatId: string, chord: string) => Promise<void>;
}

function ChordRow({ label, beats, placements, active, autofocusBeatId, onCommit }: ChordRowProps) {
  return (
    <div className="flex items-end flex-wrap">
      {label !== undefined && (
        <span className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium mr-2 min-w-[7rem] text-right shrink-0">
          {label}:
        </span>
      )}
      {/* The chord row mirrors the beat row's layout so chords sit
          directly above their beats. Includes zero-width spacers for
          the insertion "+" positions so the columns align. */}
      <div className="flex flex-wrap">
        <InsertSpacer />
        {beats.map(beat => (
          <span key={beat.id} className="inline-flex items-end">
            {active && onCommit ? (
              <ChordSlot
                beatId={beat.id}
                value={placements[beat.id] ?? ''}
                autofocus={autofocusBeatId === beat.id}
                onCommit={chord => onCommit(beat.id, chord)}
              />
            ) : (
              <ReadOnlyChordSlot value={placements[beat.id] ?? ''} />
            )}
            <InsertSpacer />
          </span>
        ))}
      </div>
    </div>
  );
}

function CompareChordRow({
  label,
  beats,
  placements,
}: { label: string; beats: Beat[]; placements: Record<string, string> }) {
  return (
    <ChordRow label={label} beats={beats} placements={placements} />
  );
}

// -------------------------------------------------------------------

interface BeatRowProps {
  beats: Beat[];
  onInsert: (index: number) => Promise<Beat>;
  onDelete: (beatId: string) => Promise<void>;
  onUpdateText: (beatId: string, text: string) => Promise<void>;
}

function BeatRow({ beats, onInsert, onDelete, onUpdateText }: BeatRowProps) {
  return (
    <div className="flex flex-wrap items-start">
      <InsertPoint onClick={() => onInsert(0)} />
      {beats.map((beat, idx) => (
        <span key={beat.id} className="inline-flex items-start">
          <BeatCell
            beat={beat}
            onDelete={() => onDelete(beat.id)}
            onUpdateText={text => onUpdateText(beat.id, text)}
          />
          <InsertPoint onClick={() => onInsert(idx + 1)} />
        </span>
      ))}
    </div>
  );
}

function BeatCell({
  beat,
  onDelete,
  onUpdateText,
}: { beat: Beat; onDelete: () => void; onUpdateText: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(beat.text ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft only when the beat identity changes — NOT on external
  // text updates during the user's own typing session.
  useEffect(() => {
    setDraft(beat.text ?? '');
  }, [beat.id]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (beat.type === 'blank') {
    return (
      <span className="inline-flex items-center group relative min-h-[1.5rem] px-0.5">
        <span aria-hidden className="text-neutral-300 dark:text-neutral-700 text-sm select-none">·</span>
        <button
          onClick={onDelete}
          title="remove blank beat"
          className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 text-[9px] text-neutral-400 hover:text-needswork bg-white dark:bg-neutral-900 rounded-full w-3 h-3 flex items-center justify-center"
        >
          ×
        </button>
      </span>
    );
  }

  // Word beat
  return (
    <span className="inline-flex items-center group relative">
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            const next = draft.trim();
            if (next !== (beat.text ?? '')) onUpdateText(next);
            setEditing(false);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { setDraft(beat.text ?? ''); setEditing(false); }
          }}
          className="bg-transparent border-0 border-b border-dashed border-fluent/50 focus:outline-none px-0.5 py-0 text-sm font-mono tracking-tight text-neutral-800 dark:text-neutral-100"
          style={{ width: `${Math.max(2, draft.length + 1)}ch` }}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-sm font-mono tracking-tight text-neutral-800 dark:text-neutral-100 hover:bg-fluent/5 rounded px-0.5 cursor-text"
          title="click to edit word"
        >
          {beat.text || '·'}
        </button>
      )}
      {/* Trailing space so words have breathing room inline. */}
      <span aria-hidden className="inline-block w-1" />
    </span>
  );
}

// -------------------------------------------------------------------

interface ChordSlotProps {
  beatId: string;
  value: string;
  autofocus?: boolean;
  onCommit: (chord: string) => Promise<void>;
}

function ChordSlot({ beatId, value, autofocus, onCommit }: ChordSlotProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only resync the draft when the slot identity changes — i.e. a
  // different beat's chord is being shown. We explicitly do NOT depend
  // on `value` because that would stomp the user's in-flight edit
  // every time a sibling commit triggered a parent re-render.
  useEffect(() => {
    setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatId]);

  useEffect(() => {
    if (autofocus) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [autofocus]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed !== (value ?? '').trim()) {
      void onCommit(trimmed);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Tab') {
      // Let the default tab order handle focus navigation. No
      // preventDefault so inputs with `tabIndex` naturally chain.
    }
  };

  const filled = draft.trim() !== '';

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKey}
      placeholder=" "
      spellCheck={false}
      className={`bg-transparent border-0 border-b border-dashed text-center px-0.5 py-0 text-sm font-mono tracking-tight focus:outline-none focus:border-fluent transition-colors ${
        filled
          ? 'text-fluent border-fluent/30'
          : 'text-neutral-400 border-transparent hover:border-neutral-300 dark:hover:border-neutral-600'
      }`}
      style={{ width: `${Math.max(2, draft.length + 1)}ch`, minWidth: '1.5rem' }}
      title="chord slot — click to edit, Tab to next"
    />
  );
}

function ReadOnlyChordSlot({ value }: { value: string }) {
  return (
    <span
      className={`inline-block text-center text-sm font-mono tracking-tight px-0.5 ${
        value.trim() === '' ? 'text-neutral-300 dark:text-neutral-700' : 'text-neutral-600 dark:text-neutral-300'
      }`}
      style={{ minWidth: '1.5rem' }}
    >
      {value.trim() === '' ? '·' : value}
    </span>
  );
}

// -------------------------------------------------------------------

/** Tiny "+" between two beats. Subtle by default, brighter on hover. */
function InsertPoint({ onClick, label = 'insert a beat here' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center w-3 h-5 text-xs text-neutral-300 hover:text-fluent hover:bg-fluent/10 rounded transition-colors"
    >
      +
    </button>
  );
}

/** Matches the width of an InsertPoint so chord slots above align with
 *  the beats below even though the chord row doesn't have +. */
function InsertSpacer() {
  return <span aria-hidden className="inline-block w-3" />;
}

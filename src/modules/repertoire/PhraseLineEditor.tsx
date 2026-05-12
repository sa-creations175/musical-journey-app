import { useEffect, useRef, useState } from 'react';
import type { Beat, ChordFunction, Phrase } from '../../lib/db';
import {
  applySyllableSplit,
  breakJoinBefore,
  concatGroupText,
  insertBeatAt,
  isInstrumentalPhrase,
  normalizePhrase,
  removeBeat,
  setChordOnBeat,
  syllableGroupAt,
} from './beatsModel';
import {
  isEmpty as chordIsEmpty,
  parseChordFunction,
  renderNumbers,
  renderRoman,
  renderConcrete,
  type NotationMode,
} from './chordFunction';
import { useToast } from '../../components/Toaster';
import SyllableSplitModal from './SyllableSplitModal';

interface Props {
  phrase: Phrase;
  activeArrangementId: string;
  /** Additional arrangements whose chord rows should render above the
   *  beats in read-only compare mode. */
  compareArrangementIds?: string[];
  /** arrangementId → display name, for the compare rows. */
  arrangementName: (id: string) => string;
  /** App-wide notation mode (numbers / roman / stacked / concrete). */
  notationMode: NotationMode;
  /** Section's current key. Needed for concrete-chord display and for
   *  parsing user-entered concrete chord names. */
  sectionKey?: string;
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
  notationMode,
  sectionKey,
  onChange,
  highlighted,
  autofocusBeatId,
}: Props) {
  const normalised = normalizePhrase(phrase);
  const beats = normalised.beats;
  const activePlacements = normalised.chordsByArrangement[activeArrangementId] ?? {};
  const { toast } = useToast();
  // Beat id whose syllable group is being edited in the split modal.
  const [splitTargetBeatId, setSplitTargetBeatId] = useState<string | null>(null);

  // --- Mutation helpers ------------------------------------------

  const insertBlankAt = async (index: number): Promise<Beat> => {
    const { beats: afterInsert, inserted } = insertBeatAt(beats, index, 'blank');
    // If the insert lands in the middle of a syllable group, break the
    // `joinToNext` chain at that point so the blank doesn't render
    // mid-word (e.g. "A-[blank]-maz-ing").
    const finalBeats = breakJoinBefore(afterInsert, index);
    await onChange({ ...normalised, beats: finalBeats });
    return inserted;
  };

  const applySplit = async (
    groupStartIndex: number,
    groupLength: number,
    text: string,
    splitIndices: number[],
  ) => {
    const oldGroupBeats = beats.slice(groupStartIndex, groupStartIndex + groupLength);
    const { beats: nextBeats, inserted } = applySyllableSplit(
      beats,
      groupStartIndex,
      groupLength,
      text,
      splitIndices,
    );
    // The new syllable beats have fresh ids, so every chord placement
    // on the old group beats would be orphaned. Carry the first old
    // beat's chord onto the first new syllable (downbeat preserves its
    // chord); drop the rest rather than guess.
    const firstOldId = oldGroupBeats[0]?.id;
    const firstNewId = inserted[0]?.id;
    const nextChords: Record<string, Record<string, ChordFunction>> = {};
    for (const [arrId, placements] of Object.entries(normalised.chordsByArrangement)) {
      const copy: Record<string, ChordFunction> = { ...placements };
      for (const b of oldGroupBeats) delete copy[b.id];
      if (firstOldId && firstNewId && placements[firstOldId]) {
        copy[firstNewId] = placements[firstOldId];
      }
      nextChords[arrId] = copy;
    }
    await onChange({ ...normalised, beats: nextBeats, chordsByArrangement: nextChords });
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

  const commitChord = async (beatId: string, rawInput: string) => {
    // Empty input clears the slot. Anything else parses into a
    // ChordFunction; unparseable inputs are preserved with
    // `unparsed: true` so the user doesn't lose their typing.
    const trimmed = rawInput.trim();
    if (trimmed === '') {
      const cleared = setChordOnBeat(
        normalised.chordsByArrangement,
        activeArrangementId,
        beatId,
        null,
      );
      await onChange({ ...normalised, chordsByArrangement: cleared });
      return;
    }
    const parsed = parseChordFunction(trimmed, sectionKey);
    if (parsed) {
      const next = setChordOnBeat(
        normalised.chordsByArrangement,
        activeArrangementId,
        beatId,
        parsed,
      );
      await onChange({ ...normalised, chordsByArrangement: next });
    }
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
          one. Read-only; label on the left identifies each. */}
      {compareArrangementIds.map(arrId => {
        const placements = normalised.chordsByArrangement[arrId] ?? {};
        return (
          <ChordRow
            key={arrId}
            label={arrangementName(arrId)}
            beats={beats}
            placements={placements}
            notationMode={notationMode}
            sectionKey={sectionKey}
          />
        );
      })}

      {/* Active chord row — editable */}
      <ChordRow
        active
        label={compareArrangementIds.length > 0 ? arrangementName(activeArrangementId) : undefined}
        beats={beats}
        placements={activePlacements}
        notationMode={notationMode}
        sectionKey={sectionKey}
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
        onSplitBeat={beatId => setSplitTargetBeatId(beatId)}
      />

      {splitTargetBeatId && (() => {
        const group = syllableGroupAt(beats, splitTargetBeatId);
        if (!group) return null;
        const text = concatGroupText(group.beats);
        // initialSplits: cumulative char positions where each beat
        // after the first begins within the concatenated text.
        const initial: number[] = [];
        let runningPos = 0;
        for (let i = 0; i < group.beats.length - 1; i++) {
          runningPos += (group.beats[i].text ?? '').length;
          initial.push(runningPos);
        }
        return (
          <SyllableSplitModal
            word={text}
            initialSplits={initial}
            onCancel={() => setSplitTargetBeatId(null)}
            onApply={async splits => {
              await applySplit(group.startIndex, group.beats.length, text, splits);
              setSplitTargetBeatId(null);
            }}
          />
        );
      })()}

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
  placements: Record<string, ChordFunction>;
  active?: boolean;
  notationMode: NotationMode;
  sectionKey?: string;
  autofocusBeatId?: string;
  onCommit?: (beatId: string, raw: string) => Promise<void>;
}

function ChordRow({
  label,
  beats,
  placements,
  active,
  notationMode,
  sectionKey,
  autofocusBeatId,
  onCommit,
}: ChordRowProps) {
  return (
    <div className="flex items-end flex-wrap">
      {label !== undefined && (
        <span className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium mr-2 min-w-[7rem] text-right shrink-0">
          {label}:
        </span>
      )}
      <div className="flex flex-wrap">
        <InsertSpacer />
        {beats.map(beat => (
          <span key={beat.id} className="inline-flex items-end">
            {active && onCommit ? (
              <ChordSlot
                beatId={beat.id}
                chord={placements[beat.id]}
                notationMode={notationMode}
                sectionKey={sectionKey}
                autofocus={autofocusBeatId === beat.id}
                onCommit={raw => onCommit(beat.id, raw)}
              />
            ) : (
              <ReadOnlyChordSlot
                chord={placements[beat.id]}
                notationMode={notationMode}
                sectionKey={sectionKey}
              />
            )}
            <InsertSpacer />
          </span>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------

interface BeatRowProps {
  beats: Beat[];
  onInsert: (index: number) => Promise<Beat>;
  onDelete: (beatId: string) => Promise<void>;
  onUpdateText: (beatId: string, text: string) => Promise<void>;
  onSplitBeat: (beatId: string) => void;
}

function BeatRow({ beats, onInsert, onDelete, onUpdateText, onSplitBeat }: BeatRowProps) {
  return (
    <div className="flex flex-wrap items-start">
      <InsertPoint onClick={() => onInsert(0)} />
      {beats.map((beat, idx) => (
        <span key={beat.id} className="inline-flex items-start">
          <BeatCell
            beat={beat}
            joinToNext={beat.joinToNext === true}
            onDelete={() => onDelete(beat.id)}
            onUpdateText={text => onUpdateText(beat.id, text)}
            onSplit={beat.type === 'word' ? () => onSplitBeat(beat.id) : undefined}
          />
          {beat.joinToNext ? (
            // Joined syllables render with a visual hyphen between
            // them. Width matches InsertPoint so chord slots above
            // stay column-aligned.
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-3 h-5 text-sm text-neutral-400 select-none"
            >
              -
            </span>
          ) : (
            <InsertPoint onClick={() => onInsert(idx + 1)} />
          )}
        </span>
      ))}
    </div>
  );
}

function BeatCell({
  beat,
  joinToNext,
  onDelete,
  onUpdateText,
  onSplit,
}: {
  beat: Beat;
  joinToNext: boolean;
  onDelete: () => void;
  onUpdateText: (t: string) => void;
  onSplit?: () => void;
}) {
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
  const hasText = (beat.text ?? '').trim() !== '';
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
      {/* Split affordance — visible on hover. Hidden when the word is
          empty (nothing to split) or already editing (avoid jitter). */}
      {onSplit && hasText && !editing && (
        <button
          onClick={onSplit}
          title="split into syllables"
          aria-label="split into syllables"
          className="absolute -top-2 -right-1 opacity-0 group-hover:opacity-100 text-[9px] text-neutral-400 hover:text-fluent bg-white dark:bg-neutral-900 rounded px-1 leading-none py-0.5 border border-neutral-200 dark:border-neutral-700"
        >
          split
        </button>
      )}
      {/* Trailing breathing space — suppressed when joined to the
          next beat so the hyphen sits tight against the syllable. */}
      {!joinToNext && <span aria-hidden className="inline-block w-1" />}
    </span>
  );
}

// -------------------------------------------------------------------

/**
 * Convert the stored ChordFunction back to a string that the user
 * would recognise as "what they typed", rendered in the currently-
 * selected notation. Used as the initial value of the edit input so
 * users see their own notation when they click to edit. When the
 * slot is empty, returns "".
 */
function chordToDisplay(
  chord: ChordFunction | undefined,
  mode: NotationMode,
  sectionKey?: string,
): string {
  if (!chord || chordIsEmpty(chord)) return '';
  if (chord.unparsed) return chord.raw ?? '';
  switch (mode) {
    case 'numbers':
    case 'stacked':
      return renderNumbers(chord);
    case 'roman':
      return renderRoman(chord);
    case 'concrete':
      return renderConcrete(chord, sectionKey);
  }
}

interface ChordSlotProps {
  beatId: string;
  chord: ChordFunction | undefined;
  notationMode: NotationMode;
  sectionKey?: string;
  autofocus?: boolean;
  onCommit: (raw: string) => Promise<void>;
}

function ChordSlot({ beatId, chord, notationMode, sectionKey, autofocus, onCommit }: ChordSlotProps) {
  const display = chordToDisplay(chord, notationMode, sectionKey);
  const [draft, setDraft] = useState(display);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only resync the draft when the slot identity changes — i.e. a
  // different beat's chord is being shown, OR the notation mode
  // switched while this slot isn't being edited. Never on the user's
  // in-flight edit.
  useEffect(() => {
    if (!editing) setDraft(display);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatId, notationMode, sectionKey]);

  useEffect(() => {
    if (autofocus) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [autofocus]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== display.trim()) {
      void onCommit(draft);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(display);
      setEditing(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  const filled = draft.trim() !== '';
  const unparsed = chord?.unparsed === true;
  const stackedRoman = notationMode === 'stacked' && chord && !chord.unparsed
    ? renderRoman(chord)
    : '';

  return (
    <span className="inline-flex flex-col items-center">
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={commit}
        onKeyDown={handleKey}
        placeholder="1"
        spellCheck={false}
        className={`bg-transparent border-0 border-b border-dashed text-center px-0.5 py-0 text-sm font-mono tracking-tight focus:outline-none focus:border-fluent transition-colors placeholder:text-neutral-300 dark:placeholder:text-neutral-600 ${
          unparsed
            ? 'text-developing border-developing/40'
            : filled
              ? 'text-fluent border-fluent/30'
              : 'text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500'
        }`}
        style={{ width: `${Math.max(2, draft.length + 1)}ch`, minWidth: '1.5rem' }}
        title={unparsed
          ? "couldn't parse — saved as raw text"
          : 'chord slot — numbers (4maj7), Roman (IVmaj7), or concrete (Fmaj7 — uses section key)'}
      />
      {stackedRoman && (
        <span
          className="text-[9px] font-mono text-neutral-400 -mt-0.5 leading-none"
          aria-hidden
        >
          {stackedRoman}
        </span>
      )}
    </span>
  );
}

interface ReadOnlyChordSlotProps {
  chord: ChordFunction | undefined;
  notationMode: NotationMode;
  sectionKey?: string;
}

function ReadOnlyChordSlot({ chord, notationMode, sectionKey }: ReadOnlyChordSlotProps) {
  const display = chordToDisplay(chord, notationMode, sectionKey);
  const empty = display === '';
  const stackedRoman = notationMode === 'stacked' && chord && !chord.unparsed
    ? renderRoman(chord)
    : '';
  return (
    <span className="inline-flex flex-col items-center">
      <span
        className={`inline-block text-center text-sm font-mono tracking-tight px-0.5 ${
          empty ? 'text-neutral-300 dark:text-neutral-700' : 'text-neutral-600 dark:text-neutral-300'
        }`}
        style={{ minWidth: '1.5rem' }}
      >
        {empty ? '·' : display}
      </span>
      {stackedRoman && (
        <span className="text-[9px] font-mono text-neutral-400 -mt-0.5 leading-none" aria-hidden>
          {stackedRoman}
        </span>
      )}
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

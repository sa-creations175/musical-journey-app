import { useEffect, useRef, useState } from 'react';
import type { Beat, ChordFunction } from '../../lib/db';
import BottomSheet from '../../components/BottomSheet';
import { chordToDisplay, type NotationMode } from './chordFunction';

interface Props {
  /** Sheet open state; the sheet renders nothing when false. */
  open: boolean;
  /** All beats in the phrase line being edited — used for the line
   *  preview and Prev/Next navigation. */
  beats: Beat[];
  /** Chord placements for the active arrangement. Read-only here —
   *  edits flow through `onCommit`. */
  placements: Record<string, ChordFunction>;
  /** Beat currently in focus. The sheet shows this beat's chord in
   *  the input and highlights it in the line preview. */
  activeBeatId: string;
  notationMode: NotationMode;
  sectionKey?: string;
  /** Caller updates the active beat (Prev/Next navigation). */
  onActiveBeatChange: (beatId: string) => void;
  /** Commit the typed chord against the active beat. Empty string
   *  clears the slot — matches `commitChord` semantics. */
  onCommit: (beatId: string, rawInput: string) => Promise<void>;
  onClose: () => void;
}

const PALETTE = ['1', '2', '3', '4', '5', '6', '7'] as const;

/**
 * Tap-to-edit chord sheet, used by `PhraseLineEditor` on mobile.
 *
 * Mounts inside a `BottomSheet`. Shows the full phrase line at the
 * top with the active beat highlighted, then the chord input below.
 * Quick-pick palette (1–7) tap-fills the input so the user doesn't
 * have to type single-digit chord numbers on the on-screen keyboard.
 *
 * Commit semantics match the inline desktop slot: empty input clears
 * the placement, otherwise the input string is sent to the parent's
 * `commitChord` which parses + persists. Saves fire only on Prev,
 * Next, Done, or backdrop close — never on every keystroke (matches
 * the user's flow on this kind of bulk-entry surface).
 */
export default function ChordEditBottomSheet({
  open,
  beats,
  placements,
  activeBeatId,
  notationMode,
  sectionKey,
  onActiveBeatChange,
  onCommit,
  onClose,
}: Props) {
  const activeBeat = beats.find(b => b.id === activeBeatId);
  const currentChord = activeBeat ? placements[activeBeat.id] : undefined;
  const initialDraft = chordToDisplay(currentChord, notationMode, sectionKey);

  const [draft, setDraft] = useState(initialDraft);
  const initialDraftRef = useRef(initialDraft);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resync the draft (and remembered baseline) whenever the active
  // beat changes. The user typed something, hit Next → we save it,
  // then the new beat's chord becomes the new draft.
  useEffect(() => {
    setDraft(initialDraft);
    initialDraftRef.current = initialDraft;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBeatId]);

  // When the sheet opens or the active beat changes, push focus into
  // the input so the iOS keyboard surfaces and the user can type
  // immediately. Short timeout lets the sheet finish mounting before
  // the focus call — mobile browsers ignore focus during heavy mount.
  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 60);
    return () => window.clearTimeout(handle);
  }, [open, activeBeatId]);

  if (!open || !activeBeat) return null;

  const activeIdx = beats.findIndex(b => b.id === activeBeatId);
  const hasPrev = activeIdx > 0;
  const hasNext = activeIdx >= 0 && activeIdx < beats.length - 1;

  const saveIfChanged = async () => {
    if (draft.trim() !== initialDraftRef.current.trim()) {
      await onCommit(activeBeat.id, draft);
    }
  };

  const handlePrev = async () => {
    await saveIfChanged();
    if (hasPrev) onActiveBeatChange(beats[activeIdx - 1].id);
    else onClose();
  };

  const handleNext = async () => {
    await saveIfChanged();
    if (hasNext) onActiveBeatChange(beats[activeIdx + 1].id);
    else onClose();
  };

  const handleDone = async () => {
    await saveIfChanged();
    onClose();
  };

  const handleClear = async () => {
    setDraft('');
    initialDraftRef.current = '';
    await onCommit(activeBeat.id, '');
  };

  const handlePalette = (token: string) => {
    setDraft(token);
    // Re-focus so the user can append (e.g. "1" → "1maj7") without
    // an extra tap into the input.
    inputRef.current?.focus();
  };

  const wordLabel = activeBeat.type === 'blank'
    ? '·'
    : (activeBeat.text || '·');

  const footer = (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => void handlePrev()}
        disabled={!hasPrev}
        className="px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-700 dark:text-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ← Prev
      </button>
      <button
        type="button"
        onClick={() => void handleNext()}
        disabled={!hasNext}
        className="px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-700 dark:text-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Next →
      </button>
      <button
        type="button"
        onClick={() => void handleClear()}
        className="px-3 py-2 rounded-md border border-needswork/40 text-needswork text-sm"
      >
        Clear
      </button>
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => void handleDone()}
        className="px-4 py-2 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
      >
        Done
      </button>
    </div>
  );

  return (
    <BottomSheet
      open={open}
      onClose={() => void handleDone()}
      title="Edit chord"
      footer={footer}
    >
      {/* Line preview — every beat in the phrase, with the active
          one highlighted. Lets the user keep orientation while
          tapping through Prev/Next. */}
      <div className="flex flex-wrap gap-x-1.5 gap-y-1.5 pb-3 mb-3 border-b border-neutral-100 dark:border-neutral-800">
        {beats.map(beat => {
          const isActive = beat.id === activeBeatId;
          const chord = placements[beat.id];
          const chordText = chordToDisplay(chord, notationMode, sectionKey);
          const wordText = beat.type === 'blank' ? '·' : (beat.text || '·');
          return (
            <button
              key={beat.id}
              type="button"
              onClick={() => {
                // Tapping a beat in the preview jumps to it without
                // closing the sheet — same as Prev/Next.
                if (beat.id === activeBeatId) return;
                void saveIfChanged().then(() => onActiveBeatChange(beat.id));
              }}
              className={`inline-flex flex-col items-start text-xs font-mono leading-tight rounded px-1 py-0.5 transition-colors ${
                isActive
                  ? 'bg-fluent/10 ring-1 ring-fluent text-fluent'
                  : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              <span className="block">{chordText || '·'}</span>
              <span className={`block ${
                isActive ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-500'
              }`}>
                {wordText}
              </span>
            </button>
          );
        })}
      </div>

      <div className="text-[11px] text-neutral-500 mb-1">
        chord for <span className="font-mono text-neutral-700 dark:text-neutral-200">"{wordLabel}"</span>
      </div>

      <input
        ref={inputRef}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void handleNext();
          }
        }}
        placeholder="1, 4maj7, 3(#9), Fmaj7…"
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        inputMode="text"
        className="w-full rounded-md border border-fluent/60 bg-white dark:bg-neutral-900 px-3 py-2 text-base font-mono focus:outline-none focus:ring-2 focus:ring-fluent/30 focus:border-fluent"
      />

      {/* Quick-pick palette: 1–7 single-tap chord numbers. Lets the
          user fill the most common case without surfacing the iOS
          number-row keyboard each time. Tapping replaces the draft —
          users editing "4maj7 → 5maj7" will more naturally type than
          tap, so the destructive replace is the right default. */}
      <div className="grid grid-cols-7 gap-1 mt-2">
        {PALETTE.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => handlePalette(n)}
            className="py-2 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm font-mono text-neutral-700 dark:text-neutral-100 hover:bg-fluent/10 active:bg-fluent/20"
          >
            {n}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

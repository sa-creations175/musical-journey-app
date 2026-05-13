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
  /** Remove the active beat from the phrase entirely. The sheet
   *  navigates to the neighbouring beat (or closes if it was the
   *  last one). */
  onDeleteBeat: (beatId: string) => Promise<void>;
  /** Optional: close the sheet and put the whole phrase line into
   *  "edit as text" mode. Owned by LeadSheetSection, threaded
   *  through PhraseLineEditor. Omit if not available. */
  onEditAsText?: () => void;
  onClose: () => void;
}

const NUMBERS_PALETTE = ['1', '2', '3', '4', '5', '6', '7'] as const;

// Suffix tokens grouped into pickable categories. Buttons in this
// palette append to the current input (e.g. tap "4", switch palette,
// tap "#9", tap "#5" → "4#9#5") so the user can build up extended
// chords without typing on the keyboard. ø = half-diminished.
const SUFFIX_CATEGORIES: ReadonlyArray<{ label: string; tokens: readonly string[] }> = [
  { label: 'Quality',     tokens: ['maj', 'm', 'dim', 'aug', 'sus2', 'sus4'] },
  { label: '7ths',        tokens: ['7', 'maj7', 'm7', 'm7b5', 'dim7'] },
  { label: 'Extensions',  tokens: ['9', '11', '13', 'add9', 'add2', '6', '6/9'] },
  { label: 'Alterations', tokens: ['b5', '#5', 'b9', '#9', 'b13', '#11'] },
  { label: 'Slash',       tokens: ['/3', '/5', '/7', '/2', '/6', '/'] },
];

/**
 * Tap-to-edit chord sheet, used by `PhraseLineEditor` on mobile.
 *
 * Mounts inside a `BottomSheet`. Shows the full phrase line at the
 * top with the active beat highlighted, then a two-palette
 * quick-pick (Numbers view by default; Suffixes view via toggle)
 * above the chord input. The Numbers palette **replaces** the draft
 * — it starts a new chord. The Suffixes palette **appends** so the
 * user can build "4#9#5" with three taps + a toggle.
 *
 * Commit semantics match the inline desktop slot: empty input clears
 * the placement, otherwise the input string is sent to the parent's
 * `commitChord` which parses + persists. Saves fire only on Prev,
 * Next, Done, Delete-word, Edit-line, or backdrop close — never on
 * every keystroke (matches the user's flow on this kind of
 * bulk-entry surface).
 *
 * Footer hosts two button rows:
 *   row 1: ← Prev / Next → / Clear / Done (main navigation)
 *   row 2: Delete word / Edit line (secondary, structural changes)
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
  onDeleteBeat,
  onEditAsText,
  onClose,
}: Props) {
  const activeBeat = beats.find(b => b.id === activeBeatId);
  const currentChord = activeBeat ? placements[activeBeat.id] : undefined;
  const initialDraft = chordToDisplay(currentChord, notationMode, sectionKey);

  const [draft, setDraft] = useState(initialDraft);
  const [paletteView, setPaletteView] = useState<'numbers' | 'suffixes'>('numbers');
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

  // Delete the active beat entirely. Skip save-if-changed: the user
  // just said "remove this", any pending draft is moot. Compute the
  // landing beat BEFORE deletion (beats array still includes the
  // target); the same id is valid after the parent re-renders with
  // the new beat list.
  const handleDeleteBeat = async () => {
    const fallbackIdx = activeIdx + 1 < beats.length
      ? activeIdx + 1
      : activeIdx > 0
        ? activeIdx - 1
        : -1;
    const nextBeatId = fallbackIdx >= 0 ? beats[fallbackIdx].id : null;
    await onDeleteBeat(activeBeat.id);
    if (nextBeatId) onActiveBeatChange(nextBeatId);
    else onClose();
  };

  const handleEditLine = async () => {
    if (!onEditAsText) return;
    // Save any in-flight chord before handing the line off to the
    // text-edit input — phraseFromLyricsPreserveChords will carry
    // it through if the user doesn't change the corresponding word.
    await saveIfChanged();
    onClose();
    onEditAsText();
  };

  const handleNumberPick = (token: string) => {
    // Numbers START a chord — destructive replace matches the user's
    // mental model ("I want a different chord now"). Use the
    // keyboard to edit an existing number in place.
    setDraft(token);
    inputRef.current?.focus();
  };

  const handleSuffixAppend = (token: string) => {
    setDraft(prev => prev + token);
    inputRef.current?.focus();
  };

  const wordLabel = activeBeat.type === 'blank'
    ? '·'
    : (activeBeat.text || '·');

  const footer = (
    <div className="space-y-2">
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
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <button
          type="button"
          onClick={() => void handleDeleteBeat()}
          className="text-needswork hover:opacity-80"
        >
          🗑 Delete word/beat
        </button>
        {onEditAsText && (
          <button
            type="button"
            onClick={() => void handleEditLine()}
            className="text-neutral-500 hover:text-fluent"
          >
            ✎ Edit line
          </button>
        )}
      </div>
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

      <div className="text-[11px] text-neutral-500 mb-2">
        chord for <span className="font-mono text-neutral-700 dark:text-neutral-200">"{wordLabel}"</span>
      </div>

      {/* Quick-pick palette toggle + content. Palette sits above the
          input — when iOS surfaces the keyboard for the input, the
          palette stays in the scrollable content area above so the
          user can switch between typing and tapping. */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium">
            {paletteView === 'numbers' ? 'numbers' : 'suffixes'}
          </span>
          <button
            type="button"
            onClick={() => {
              setPaletteView(v => (v === 'numbers' ? 'suffixes' : 'numbers'));
              // Pointer leaving the input briefly is unavoidable on
              // touch; re-focus so iOS keeps the keyboard surfaced.
              inputRef.current?.focus();
            }}
            className="text-xs text-fluent hover:opacity-80 px-2 py-1 rounded"
          >
            {paletteView === 'numbers' ? 'Suffixes ▾' : 'Numbers ▴'}
          </button>
        </div>

        {paletteView === 'numbers' ? (
          <div className="grid grid-cols-7 gap-1">
            {NUMBERS_PALETTE.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => handleNumberPick(n)}
                className="py-2 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm font-mono text-neutral-700 dark:text-neutral-100 hover:bg-fluent/10 active:bg-fluent/20"
              >
                {n}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {SUFFIX_CATEGORIES.map(category => (
              <div key={category.label} className="flex items-baseline gap-2">
                <span className="text-[10px] uppercase tracking-wide text-neutral-400 min-w-[4.5rem] shrink-0">
                  {category.label}
                </span>
                <div className="flex flex-wrap gap-1">
                  {category.tokens.map(token => (
                    <button
                      key={token}
                      type="button"
                      onClick={() => handleSuffixAppend(token)}
                      className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs font-mono text-neutral-700 dark:text-neutral-100 hover:bg-fluent/10 active:bg-fluent/20"
                    >
                      {token}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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
    </BottomSheet>
  );
}

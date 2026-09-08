/**
 * Pressing the notes of one chord.
 *
 * =====================================================================
 * ONE PANEL, TWO HOSTS. This was `ChordEditorPopover`'s voicing section,
 * living inside a 3,541-line bar-grid file and exported to nobody.
 * Ruling 5 makes it a shared component: the same press-the-notes editor
 * on a song's lead sheet and on a chord movement, rather than a second
 * one that starts identical and drifts.
 *
 * `PianoKeyboard` was already standalone and moves as-is. This is the
 * panel around it — the draft, the save, the no-key hint, the voicing
 * library and the naming flow.
 *
 * =====================================================================
 * WHAT IS ALLOWED TO DIFFER BETWEEN THE TWO HOSTS, AND WHY.
 *
 * Anything not on this list may not differ. If a difference is needed
 * that is not here, it goes on this list with its reason or it does not
 * happen.
 *
 *  1. THE FRAME AROUND IT. The lead sheet renders this inside a
 *     popover — a bottom sheet on mobile, anchored under the chord on
 *     md+ — and a movement renders it inline under its grid. Because
 *     one is opened from a cell in a dense grid and must not push the
 *     grid around, and the other is a section of a page that is always
 *     there. The panel itself has no positioning of its own.
 *
 *  2. WHETHER A PRESS COMMITS IMMEDIATELY (`liveEditing`). The lead
 *     sheet keeps its Save / Cancel: the popover is transient and sits
 *     over a dense grid where a mis-tap must be undoable. The movement
 *     screen commits each press, because the signed-off prototype does
 *     — the editor there is a permanent panel, not something you are
 *     passing through.
 *
 *  3. WHETHER THE VOICING LIBRARY IS OFFERED (`showLibrary`). The lead
 *     sheet has the carousel, the pins and Save to Library. The
 *     prototype's movement editor has none of them, and adding one
 *     would be inventing a screen nobody has walked.
 *
 *  4. WHETHER ANYTHING SOUNDS (`onPreviewChord`, `onNotePressed`).
 *     Rulings 17 and the prototype's "Hear this chord" belong to the
 *     movement screen. The lead sheet gets neither, because it must
 *     behave exactly as it did before this extraction — whether a lead
 *     sheet should make a sound is a decision Silas has not been asked.
 *
 *  5. WHETHER A VOICING CAN BE COPIED AND PASTED (`clipboard`). Ruling
 *     13's copy-by-chord-tone is the movement screen's. Same reason as
 *     4: the lead sheet's behaviour is frozen here.
 *
 *  6. THE DERIVED MARKER (`derivedNote`). A movement says out loud when
 *     nothing is pressed and the app is filling the voicing in, because
 *     it is about to PLAY that guess. A lead sheet plays nothing, so it
 *     has nothing to disclose.
 *
 * Everything else — the keyboard, the hands, the offsets, the spelling,
 * the "set the key" hint, the closest-match label, what a saved voicing
 * is — is the same on both, and is why this is one component.
 * =====================================================================
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import PianoKeyboard from './PianoKeyboard';
import type { ChordFunction, VoicingEntry, VoicingHand, VoicingPattern } from '../lib/db';
import { normalizeVoicing, sanitizeVoicing } from '../lib/voicingColors';
import { copyVoicing, pasteVoicing, type CopiedVoicing } from '../lib/voicingClipboard';
import { qualityIdFromSuffix } from '../modules/shapes-and-patterns/voicingQualityMap';
import { CHORD_QUALITY_BY_ID } from '../modules/shapes-and-patterns/catalog';
import {
  createUserVoicingPattern,
  loadVoicingCandidates,
  orderVoicingCandidates,
} from '../modules/shapes-and-patterns/voicingPatterns';

export interface ChordVoicingPanelProps {
  chord: ChordFunction;
  voicing: Array<number | VoicingEntry> | undefined;
  voicingPatternId?: string;
  pinnedVoicingIds?: string[];
  /** Pitch class of the chord's root, or < 0 when the key is unknown. */
  rootPc: number;
  preferFlats: boolean;
  /** Absent means the host cannot resolve a root — the panel shows the
   *  reason instead of a keyboard. */
  keyIsSet: boolean;
  onVoicingChange?: (voicing: VoicingEntry[], voicingPatternId?: string) => void | Promise<void>;
  onVoicingPinsChange?: (pinnedVoicingIds: string[]) => void | Promise<void>;

  // --- differences 2 to 6 above -------------------------------------
  liveEditing?: boolean;
  showLibrary?: boolean;
  onPreviewChord?: () => void;
  onNotePressed?: (offset: number, hand: VoicingHand) => void;
  clipboard?: {
    copied: CopiedVoicing | null;
    onCopy: (copied: CopiedVoicing) => void;
  };
  /** Shown when nothing is pressed and the host will fill the voicing
   *  in — see difference 6. */
  derivedNote?: string;
}

export default function ChordVoicingPanel({
  chord, voicing, voicingPatternId, pinnedVoicingIds, rootPc, preferFlats,
  keyIsSet, onVoicingChange, onVoicingPinsChange,
  liveEditing = false, showLibrary = false,
  onPreviewChord, onNotePressed, clipboard, derivedNote,
}: ChordVoicingPanelProps) {
  const canVoice = Boolean(onVoicingChange) && rootPc >= 0 && keyIsSet;
  const savedVoicing = voicing;
  const hasVoicing = Boolean(savedVoicing && savedVoicing.length > 0);

  const [editingVoicing, setEditingVoicing] = useState(false);
  const [draftVoicing, setDraftVoicing] = useState<VoicingEntry[]>([]);
  const [namingPattern, setNamingPattern] = useState<{
    offsets: VoicingEntry[];
    thenStopEditing: boolean;
  } | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const closeNaming = () => {
    setNamingPattern(null);
    setNameDraft('');
  };

  // LIVE EDITING HAS NO DRAFT. The saved voicing IS the draft, which is
  // what makes each press commit — see difference 2.
  const shown = liveEditing ? normalizeVoicing(savedVoicing) : draftVoicing;
  const editing = liveEditing || editingVoicing;

  const beginEditVoicing = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeNaming();
    setDraftVoicing(normalizeVoicing(savedVoicing));
    setEditingVoicing(true);
  };
  // Tap a key: if its offset is already present (any hand) remove it,
  // otherwise add it with the hand the keyboard's L/R pill has selected.
  const toggleVoicingOffset = (offset: number, hand: VoicingHand) => {
    const next = shown.some(e => e.offset === offset)
      ? shown.filter(e => e.offset !== offset)
      : [...shown, { offset, hand }].sort((a, b) => a.offset - b.offset);
    if (liveEditing) {
      // A PRESS SOUNDS; A RELEASE DOES NOT (ruling 17). Adding a note is
      // the gesture that says "this one" — taking one away is not.
      if (!shown.some(e => e.offset === offset)) onNotePressed?.(offset, hand);
      void onVoicingChange?.(sanitizeVoicing(next));
      return;
    }
    setDraftVoicing(next);
  };
  const saveVoicing = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onVoicingChange) return;
    // Hand-edit → no pattern id (clears provenance). sanitizeVoicing
    // de-dupes + sorts; not a register rewrite (offsets are canonical).
    void onVoicingChange(sanitizeVoicing(draftVoicing));
    closeNaming();
    setEditingVoicing(false);
  };
  const cancelVoicing = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeNaming();
    setEditingVoicing(false);
  };

  // --- Voicing carousel: candidate patterns for this chord's quality ---
  const qualityMatch = qualityIdFromSuffix(chord.quality);
  const qualityId = qualityMatch.id;
  // When the chord's quality isn't a known one, we voice the nearest base —
  // name it so the user knows the candidates are a best-effort match.
  const approxLabel = qualityMatch.exact
    ? null
    : CHORD_QUALITY_BY_ID.get(qualityId)?.label ?? qualityId;
  const pinnedIds = pinnedVoicingIds ?? [];
  const pinnedKey = pinnedIds.join('|');
  const candidates = useLiveQuery(
    async () =>
      showLibrary
        ? orderVoicingCandidates(
          await loadVoicingCandidates(qualityId, pinnedIds),
          pinnedIds,
        )
        : [],
    [qualityId, pinnedKey, showLibrary],
    [] as VoicingPattern[],
  );
  const CUSTOM_SLIDE_ID = '__custom__';
  const appliedIsPattern = candidates.some(p => p.id === voicingPatternId);
  const customSlide: VoicingPattern | null =
    hasVoicing && !appliedIsPattern
      ? {
        id: CUSTOM_SLIDE_ID,
        qualityId,
        label: 'Custom',
        offsets: normalizeVoicing(savedVoicing),
        isSystem: false,
        sortOrder: -1,
        source: 'user',
        createdAt: 0,
        updatedAt: 0,
      }
      : null;
  const slides: VoicingPattern[] = customSlide ? [customSlide, ...candidates] : candidates;

  const appliedIndex = customSlide
    ? 0
    : slides.findIndex(p => p.id === voicingPatternId);
  const [navIndex, setNavIndex] = useState<number | null>(null);
  const rawIndex = navIndex ?? (appliedIndex >= 0 ? appliedIndex : 0);
  const carouselIndex = slides.length
    ? Math.min(Math.max(rawIndex, 0), slides.length - 1)
    : 0;
  const current: VoicingPattern | undefined = slides[carouselIndex];
  const isCustomSlide = current?.id === CUSTOM_SLIDE_ID;
  const currentIsApplied = isCustomSlide || current?.id === voicingPatternId;
  const currentIsPinned = !isCustomSlide && !!current && pinnedIds.includes(current.id);

  const stepCarousel = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const n = slides.length;
    if (n === 0) return;
    setNavIndex((((carouselIndex + delta) % n) + n) % n);
  };
  const applyCurrent = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onVoicingChange || !current) return;
    void onVoicingChange(sanitizeVoicing(current.offsets), current.id);
  };
  const togglePinCurrent = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onVoicingPinsChange || !current || isCustomSlide) return;
    const id = current.id;
    void onVoicingPinsChange(
      pinnedIds.includes(id) ? pinnedIds.filter(x => x !== id) : [...pinnedIds, id],
    );
  };
  const persistAsPattern = (
    offsets: VoicingEntry[],
    thenStopEditing: boolean,
    label?: string,
  ) => {
    if (!onVoicingChange) return;
    const clean = sanitizeVoicing(offsets);
    if (clean.length === 0) return;
    void (async () => {
      const p = await createUserVoicingPattern(qualityId, clean, label);
      await onVoicingChange(clean, p.id);
      if (thenStopEditing) setEditingVoicing(false);
    })();
  };
  const beginNaming = (offsets: VoicingEntry[], thenStopEditing: boolean) => {
    if (sanitizeVoicing(offsets).length === 0) return;
    setNameDraft('');
    setNamingPattern({ offsets, thenStopEditing });
  };
  const confirmNaming = () => {
    if (!namingPattern) return;
    persistAsPattern(
      namingPattern.offsets,
      namingPattern.thenStopEditing,
      nameDraft.trim() || undefined,
    );
    closeNaming();
  };
  const saveAsPattern = (e: React.MouseEvent) => {
    e.stopPropagation();
    beginNaming(draftVoicing, true);
  };
  const saveCustomAsPattern = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (current) beginNaming(normalizeVoicing(current.offsets), false);
  };
  const namingField = (
    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <input
        autoFocus
        type="text"
        value={nameDraft}
        onChange={e => setNameDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            confirmNaming();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            closeNaming();
          }
        }}
        placeholder="Voicing Name…"
        className="flex-1 min-w-0 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-[11px]"
      />
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          confirmNaming();
        }}
        className="text-fluent hover:underline text-[11px]"
      >
        Save
      </button>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          closeNaming();
        }}
        className="text-neutral-500 hover:text-needswork text-[11px]"
      >
        Cancel
      </button>
    </div>
  );

  if (!onVoicingChange) return null;

  return (
    <div
      className="px-2 py-1.5 border-t border-neutral-200 dark:border-neutral-800 space-y-1.5"
      data-testid="chord-voicing-panel"
    >
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-neutral-500">Voicing</span>
        <div className="flex items-center gap-2">
          {onPreviewChord && canVoice && (
            <button
              type="button"
              data-testid="voicing-preview"
              onClick={e => {
                e.stopPropagation();
                onPreviewChord();
              }}
              className="text-fluent hover:underline"
            >
              Hear this chord
            </button>
          )}
          {clipboard && canVoice && (
            <>
              <button
                type="button"
                data-testid="voicing-copy"
                onClick={e => {
                  e.stopPropagation();
                  clipboard.onCopy(copyVoicing(shown, chord.quality));
                }}
                className="text-fluent hover:underline disabled:opacity-30"
                disabled={shown.length === 0}
              >
                Copy voicing
              </button>
              <button
                type="button"
                data-testid="voicing-paste"
                onClick={e => {
                  e.stopPropagation();
                  if (!clipboard.copied) return;
                  void onVoicingChange(
                    sanitizeVoicing(pasteVoicing(clipboard.copied, chord.quality)),
                  );
                }}
                className="text-fluent hover:underline disabled:opacity-30"
                disabled={!clipboard.copied}
              >
                Paste voicing
              </button>
            </>
          )}
          {canVoice && !liveEditing && (
            editingVoicing ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={saveVoicing} className="text-fluent hover:underline">
                  Save
                </button>
                {showLibrary && (
                  <button
                    type="button"
                    onClick={saveAsPattern}
                    disabled={draftVoicing.length === 0}
                    className="text-fluent hover:underline disabled:opacity-30"
                  >
                    Save to Library
                  </button>
                )}
                <button type="button" onClick={cancelVoicing} className="text-neutral-500 hover:text-needswork">
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" onClick={beginEditVoicing} className="text-fluent hover:underline">
                {hasVoicing ? 'Edit / custom' : '+ Custom voicing'}
              </button>
            )
          )}
        </div>
      </div>

      {derivedNote && !hasVoicing && canVoice && (
        <p
          data-testid="voicing-derived-note"
          className="text-[11px] text-neutral-500 italic"
        >
          {derivedNote}
        </p>
      )}

      {!canVoice ? (
        <p className="text-[11px] text-neutral-400 italic">
          set the song key to add a voicing
        </p>
      ) : editing ? (
        <div onClick={e => e.stopPropagation()} className="space-y-1">
          <PianoKeyboard
            rootPc={rootPc}
            preferFlats={preferFlats}
            voicing={shown}
            editable
            onToggle={toggleVoicingOffset}
            octaves={4}
            absoluteOffsets
          />
          {namingPattern && namingField}
        </div>
      ) : (
        <div onClick={e => e.stopPropagation()} className="space-y-1">
          {approxLabel && (
            <p className="text-[10px] text-neutral-400 italic text-center">
              ≈ closest match: {approxLabel}
            </p>
          )}
          <PianoKeyboard
            rootPc={rootPc}
            preferFlats={preferFlats}
            voicing={current?.offsets ?? []}
            faint={!current}
            octaves={4}
            absoluteOffsets
          />
          {showLibrary && current && (
            <>
              <div className="flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={stepCarousel(-1)}
                  disabled={slides.length < 2}
                  aria-label="previous voicing"
                  className="px-1.5 py-0.5 rounded hover:text-fluent disabled:opacity-30"
                >
                  ‹
                </button>
                <div className="flex flex-col items-center leading-tight">
                  <span className="text-neutral-600 dark:text-neutral-300">{current.label}</span>
                  <span className="text-neutral-400">
                    {carouselIndex + 1} of {slides.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={stepCarousel(1)}
                  disabled={slides.length < 2}
                  aria-label="next voicing"
                  className="px-1.5 py-0.5 rounded hover:text-fluent disabled:opacity-30"
                >
                  ›
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                {isCustomSlide ? (
                  <button type="button" onClick={saveCustomAsPattern} className="text-fluent hover:underline">
                    Save to Library
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={togglePinCurrent}
                    aria-pressed={currentIsPinned}
                    className={currentIsPinned ? 'text-amber-500' : 'text-neutral-400 hover:text-amber-500'}
                  >
                    {currentIsPinned ? '★ pinned' : '☆ pin'}
                  </button>
                )}
                {currentIsApplied ? (
                  <span className="text-fluent">✓ Applied</span>
                ) : (
                  <button type="button" onClick={applyCurrent} className="text-fluent hover:underline">
                    Use this voicing
                  </button>
                )}
              </div>
              {namingPattern && namingField}
            </>
          )}
        </div>
      )}
    </div>
  );
}

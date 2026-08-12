import type { ChordFunction, Song, SongSection } from '../../lib/db';
import {
  deriveBarGrid,
  effectiveHarmonicTag,
  effectiveTimeSignature,
  isDominantQuality,
  parseTimeSignature,
} from './barGrid';
import { activeArrangementIdFor } from './barTiling';
import {
  buildPhrases,
  EMPTY_SEQUENCE_VIEW,
  type SequencePhrase,
} from './sequenceView';
import {
  detectPatterns,
  type DetectChord,
  type PatternMatch,
} from '../../lib/progressionDetection';

/**
 * The whole song's chord movement, section by section — the model
 * behind the Progressions drawer.
 *
 * NAMED "OUTLINE", NOT "SONG PROGRESSION". `songProgression.ts` already
 * owns that name for an unrelated meaning: which practice path a song
 * takes after it becomes comfortable (deepen / expand-keys /
 * maintenance). Two different senses of "progression" live in this
 * module and only one of them is about chords.
 *
 * ONE SONG, TWO READINGS. Per-section framing gives section shapes but
 * not the song's arc, and sections resemble each other closely enough
 * to be mistaken for one another at a glance. Headings plus a
 * continuous run gives both: scan the headings for shapes, read
 * straight down for the arc.
 *
 * IT IS A VIEW, NOT A SECOND STORE. Every section keeps its own
 * `sequenceView`, exactly as the per-section strip writes it. This
 * aggregates them for display and writes nothing. That works only
 * because annotations key on `ChordPlacement.id` rather than position,
 * so reading them from a different surface needs no re-keying — and it
 * is what makes the drawer and the per-section strip two windows onto
 * one thing rather than two copies of it.
 *
 * KEYED BY (sectionId, placementId). Placement ids are unique in
 * practice — `mat-{arr}-{phrase}-{beat}` or a uuid — but a song-level
 * list has no reason to depend on that, and a collision would silently
 * merge two chords from different sections.
 *
 * HIDDEN TOKENS ARE CARRIED, NOT DROPPED. `buildPhrases` filters them
 * out, which is right for the strip but wrong here: the drawer reveals
 * them greyed in place so they can be tapped to unhide. So phrases are
 * built with hiding switched OFF and each token carries a `hidden`
 * flag instead. The phrase STRUCTURE is identical either way — a break
 * on a hidden token still breaks, by design — so this changes
 * membership only, never boundaries.
 */

export interface ProgressionToken {
  /** Stable across the whole song. */
  key: string;
  sectionId: string;
  placementId: string;
  /** Raw chord. Formatting is the caller's job, so this module stays
   *  free of notation mode, song key and theme. */
  chord: ChordFunction;
  barIndex: number;
  /** Hidden from the default reading; revealable and un-hideable. */
  hidden: boolean;
}

export interface ProgressionPhrase {
  /** Every token in the phrase, hidden ones included and flagged. */
  tokens: ProgressionToken[];
  endKind: SequencePhrase['endKind'];
  endsAfterPlacementId?: string;
  note?: string;
}

export interface ProgressionSection {
  sectionId: string;
  /** Section name. Read-only in the drawer — song structure is edited
   *  on the lead sheet. */
  heading: string;
  /** Which arrangement this section is showing. Resolved per section:
   *  a song-level view cannot assume one arrangement throughout. */
  arrangementId: string;
  phrases: ProgressionPhrase[];
  /** Live token order, unfiltered — the anchor set annotations resolve
   *  against, and what an orphan check compares to. */
  order: string[];
  /** Detected patterns. Computed from the TRUE grid, never from the
   *  visible tokens: hiding must not be able to manufacture a ii-V-I
   *  by removing the chord in between. */
  patterns: PatternMatch[];
  hiddenCount: number;
}

/** `${sectionId}:${placementId}` — see the header on keying. */
export function tokenKey(sectionId: string, placementId: string): string {
  return `${sectionId}:${placementId}`;
}

/**
 * Map an ordered chord run onto the detector's input shape.
 *
 * Extracted so the drawer and the per-section strip cannot drift: two
 * surfaces reporting different patterns for the same chords would be
 * the same "two windows disagreeing" failure the drawer exists to
 * remove. The effective harmonic tag (manual over auto) decides
 * whether a chord is acting as a secondary dominant and so cannot fill
 * a tonic or subdominant slot.
 */
export function toDetectChords(
  sequence: ReadonlyArray<{ chord: ChordFunction; barIndex: number }>,
): DetectChord[] {
  const chords: DetectChord[] = [];
  for (const { chord, barIndex } of sequence) {
    if (chord.unparsed || chord.function === '') continue;
    const q = chord.quality ?? '';
    const qLower = q.toLowerCase();
    const isMinor = qLower.startsWith('m') && !qLower.startsWith('maj');
    chords.push({
      degree: chord.function,
      isMinor,
      isDominant: isDominantQuality(q),
      effectiveTag: effectiveHarmonicTag(chord),
      barIndex,
    });
  }
  return chords;
}

/**
 * One section's progression. Returns null when the section has no
 * chords, so the drawer skips the heading entirely rather than
 * printing an empty one.
 *
 * Mirrors `detectionSequence` in LeadSheetSection: one token per
 * placement, tied continuations skipped, so annotations anchor
 * unambiguously.
 */
export function buildSectionProgression(
  song: Pick<Song, 'timeSignature' | 'eighths'>,
  section: SongSection,
): ProgressionSection | null {
  const { beatsPerBar } = parseTimeSignature(
    effectiveTimeSignature(song as Song, section),
  );
  const arrangementId = activeArrangementIdFor(section);
  const bars = deriveBarGrid(
    section,
    arrangementId,
    beatsPerBar,
    song.eighths === true,
  );

  const sequence: Array<{
    chord: ChordFunction;
    barIndex: number;
    placementId: string;
  }> = [];
  for (const bar of bars) {
    for (const cell of bar.cells) {
      if (cell.tiedFromPrev) continue;
      sequence.push({
        chord: cell.chord,
        barIndex: bar.index,
        placementId: cell.placementId,
      });
    }
  }
  if (sequence.length === 0) return null;

  const view = section.sequenceView ?? EMPTY_SEQUENCE_VIEW;
  const hidden = new Set(view.hidden);
  const order = sequence.map(s => s.placementId);
  const byId = new Map(sequence.map(s => [s.placementId, s]));

  // Hiding switched OFF: the drawer needs hidden tokens in place, and
  // phrase boundaries are identical either way.
  const structure = buildPhrases(order, { ...view, hidden: [] });

  const phrases: ProgressionPhrase[] = structure.map(p => ({
    tokens: p.placementIds.map(id => {
      const s = byId.get(id)!;
      return {
        key: tokenKey(section.id, id),
        sectionId: section.id,
        placementId: id,
        chord: s.chord,
        barIndex: s.barIndex,
        hidden: hidden.has(id),
      };
    }),
    endKind: p.endKind,
    endsAfterPlacementId: p.endsAfterPlacementId,
    note: p.note,
  }));

  return {
    sectionId: section.id,
    heading: section.name,
    arrangementId,
    phrases,
    order,
    patterns: detectPatterns(toDetectChords(sequence)),
    hiddenCount: order.filter(id => hidden.has(id)).length,
  };
}

/**
 * The whole song, in section order.
 *
 * Sections the user has hidden are EXCLUDED, matching the lead sheet
 * and the cross-key grid — a section hidden there should not reappear
 * here. Sections with no chords are skipped rather than given an empty
 * heading.
 */
export function buildSongProgression(
  song: Pick<Song, 'timeSignature' | 'eighths'>,
  sections: ReadonlyArray<SongSection>,
): ProgressionSection[] {
  const out: ProgressionSection[] = [];
  for (const section of [...sections].sort((a, b) => a.order - b.order)) {
    if (section.hidden) continue;
    const built = buildSectionProgression(song, section);
    if (built) out.push(built);
  }
  return out;
}

/**
 * Hide ids in a section's view that name a chord no longer in the grid.
 *
 * ONLY HIDES. Orphaned BREAKS are deliberately left alone: `buildPhrases`
 * already carries a dead break's note forward into the next surviving
 * phrase, so those work as intended, and clearing them would destroy
 * phrase notes the user wrote. A dead hide has no such behaviour — it
 * filters nothing, renders nothing, and no surface can reach it, so it
 * is purely a dead reference.
 *
 * Takes the live order rather than deriving it, so the caller can pass
 * `[]` for a section with no chords at all — where every hide is dead.
 */
export function orphanedHides(
  section: SongSection,
  liveOrder: ReadonlyArray<string>,
): string[] {
  const view = section.sequenceView;
  if (!view || view.hidden.length === 0) return [];
  const live = new Set(liveOrder);
  return view.hidden.filter(id => !live.has(id));
}

/**
 * The patch that clears a section's dead hide references, or null when
 * there are none. Breaks and the tail note pass through untouched.
 */
export function clearOrphanedHides(
  section: SongSection,
  liveOrder: ReadonlyArray<string>,
): Pick<SongSection, 'sequenceView'> | null {
  const dead = orphanedHides(section, liveOrder);
  if (dead.length === 0) return null;
  const view = section.sequenceView!;
  const gone = new Set(dead);
  return {
    sequenceView: {
      ...view,
      hidden: view.hidden.filter(id => !gone.has(id)),
    },
  };
}

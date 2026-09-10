/**
 * The shared progression list — one list, read by the drill and the ear.
 *
 * =====================================================================
 * IT IS THE SHAPES & PATTERNS CATALOG, NOT A SECOND COPY OF IT.
 *
 * Every entry here is a row of Chord Movements & Passes: the same
 * chords, the same thickness rows, the same positions, the same names.
 * The ear-training card asks which of them you just heard and from
 * which position, and the answer has to be the thing you drill — a
 * second list would drift within a month, and then the card would be
 * teaching a 2 5 1 the grid does not have.
 *
 * TWO THINGS ARE ADDED HERE AND NOWHERE ELSE:
 *
 *   · THE ROTATIONS. `6 4 1 5` and `4 1 5 6` are the 1 5 6 4 loop
 *     entered by a different door. They are one row on the grid and
 *     THREE ENTRIES here, because "which progression is this" has three
 *     different right answers depending on where the loop started, and
 *     a reader who can only ever hear it from the 1 has not learned the
 *     loop. Silas's brief of 10 Sep says so in terms.
 *
 *   · THE OTHER LANDING. The two dark-tension passes resolve to a minor
 *     chord and can be made to resolve to a major one instead; the
 *     reveal offers both so the surprise can be heard against the
 *     expected. It changes nothing about the answer.
 *
 * =====================================================================
 * POSITIONS ARE VARIANTS OF ONE ENTRY, NOT ENTRIES OF THEIR OWN.
 *
 * The chord-recognition model: one card kind, and the inversion is a
 * second question rather than a second card. So `1 5 6 4` is one chip
 * on the filter and one chip in the answer row, and Position 1 and
 * Position 2 are the same progression heard two ways.
 * =====================================================================
 */
import {
  KEYS,
  VOICE_LEADING_PATTERNS,
  VOICE_LEADING_PATTERN_BY_ID,
  patternRowLabel,
  type VLChord,
  type VoiceLeadingPattern,
} from '../../shapes-and-patterns/catalog';
import type { Thickness } from '../../../lib/builtAnswers/chordShapes';
import type { RowOptions } from '../../../lib/progressionRow';

/** How thick the card plays, in the ladder's own words. */
export type ListRung = Extract<Thickness, 'guide' | 'seventh' | 'full'>;

/** The thickness rows of the grid, in the grid's order. */
export const LIST_RUNGS: ReadonlyArray<ListRung> = ['guide', 'seventh', 'full'];

export const RUNG_LABEL: Readonly<Record<ListRung, string>> = {
  guide: 'Guide tones',
  seventh: 'Seventh chords',
  full: 'Extended voicings',
};

/** One entry of the shared list. */
export interface SharedProgression {
  /** Stable id. The grid's pattern id, or a rotation of it. */
  id: string;
  /** The grid row this comes from. Two entries share one for the
   *  rotations. */
  patternId: string;
  /** What the chip says. */
  name: string;
  /** The chords, in the order this entry plays them. */
  chords: ReadonlyArray<VLChord>;
  /** Which rungs it can be played at. */
  rungs: ReadonlyArray<ListRung>;
  /** How many positions each rung has. */
  positions: Readonly<Record<ListRung, number>>;
  /** Whether the reveal offers "Rotate progression start". */
  rotates: boolean;
  /**
   * A landing this pass can be given instead, for the reveal's
   * "As asked / → 1maj9 instead". Null where there is none.
   */
  otherLanding: { index: number; quality: string; label: string } | null;
}

/** The label a rung's position takes. One word everywhere: Position. */
export function positionLabel(n: number): string {
  return `Position ${n}`;
}

/** The one rung each four-position pass is played at. */
const PASS_RUNG: Readonly<Record<string, ListRung>> = {
  dom7b9: 'full',
  dim7: 'seventh',
};

/** How many positions a pattern's rung has, off the catalog. */
function positionCount(p: VoiceLeadingPattern, rung: ListRung): number {
  switch (p.kind) {
    case 'type-position': {
      const row = p.types.find(t => (rung === 'full'
        ? t.type === 'full-voicing' || t.type === 'aba-structure'
        : rung === 'guide' ? t.type === 'guide-tones' : t.type === 'seventh-chords'));
      return row?.positions.length ?? 0;
    }
    // =================================================================
    // THE PASSES HAVE ONE ROW EACH AND IT IS THE ONE THEY ARE.
    //
    // A pass is not a progression played thicker or thinner — it IS a
    // voicing. The 7♯9♯5 is an extended voicing with two starting
    // shapes; the 7♭9 is an extended voicing with four; the dim7 is a
    // seventh-chord shape with four; the diatonic cycle is seventh
    // chords with three. Silas's prototype fixes each of them to its
    // own rung and offers no ladder, and that is what this reads.
    // =================================================================
    case 'minor-aba': return rung === 'full' ? p.positions.length : 0;
    case 'inversion-4': return rung === PASS_RUNG[p.id] ? p.positions.length : 0;
    case 'diatonic-cycle': return rung === 'seventh' ? p.startingPositions.length : 0;
  }
}

/** Which rungs a pattern offers at all. */
function rungsOf(p: VoiceLeadingPattern): ListRung[] {
  return LIST_RUNGS.filter(r => positionCount(p, r) > 0);
}

/**
 * The surprise landing the two dark-tension passes can be given.
 *
 * BOTH OF THEM RESOLVE TO A MINOR CHORD and can be made to resolve to a
 * major one instead — the sound of an expectation being broken, which
 * is a thing to hear rather than a thing to answer. The dim7 pass has
 * no entry: Silas's prototype offers it on the 7♯9♯5 and the 7♭9 only.
 */
const OTHER_LANDING: Readonly<Record<string, SharedProgression['otherLanding']>> = {
  'minor-aba': { index: 1, quality: 'maj7', label: '→ 1maj9 instead (the surprise landing)' },
  dom7b9: { index: 1, quality: 'maj7', label: '→ 1maj9 instead (the surprise landing)' },
};

/** The rotations of the 1 5 6 4 loop, as their own entries. */
const ROTATIONS: ReadonlyArray<{ id: string; name: string; turns: number }> = [
  { id: '6-4-1-5', name: '6 4 1 5', turns: 2 },
  { id: '4-1-5-6', name: '4 1 5 6', turns: 3 },
];

/**
 * An entry's name, spelled the way the reader has asked for.
 *
 * `name` on the entry stays the baked default — it is what a test pins
 * and what an id-shaped comparison uses — and this is what goes on a
 * chip or above a card. Pass the card's rung where there is one: every
 * rung this list offers is a seventh-chord reading, so a dealt card
 * spells a half-diminished with its seventh name while the filter chip
 * above it, which has no rung, uses the triad name.
 */
export function nameOf(
  entry: Pick<SharedProgression, 'patternId' | 'name'>,
  opts: RowOptions = {},
): string {
  return patternRowLabel(entry.patternId, entry.name, opts);
}

function entryOf(p: VoiceLeadingPattern): SharedProgression {
  const rungs = rungsOf(p);
  return {
    id: p.id,
    patternId: p.id,
    name: p.label,
    chords: p.chords,
    rungs,
    positions: Object.fromEntries(
      LIST_RUNGS.map(r => [r, positionCount(p, r)]),
    ) as Record<ListRung, number>,
    // ONE LOOP ROTATES AND NOTHING ELSE DOES. Rotating a 2 5 1 gives a
    // 5 1 2, which is not a progression anybody plays. The 1 5 6 4 is
    // the loop the deck already teaches four doors into — `pr-9` says
    // so — and its three entries here are those doors.
    rotates: p.id === '1-5-6-4',
    otherLanding: OTHER_LANDING[p.id] ?? null,
  };
}

/**
 * Every entry, in the grid's own order with the rotations beside the
 * loop they rotate.
 */
export const SHARED_PROGRESSIONS: ReadonlyArray<SharedProgression> = (() => {
  const out: SharedProgression[] = [];
  for (const p of VOICE_LEADING_PATTERNS) {
    out.push(entryOf(p));
    if (p.id === '1-5-6-4') {
      for (const r of ROTATIONS) {
        const base = entryOf(p);
        const turns = r.turns % p.chords.length;
        out.push({
          ...base,
          id: r.id,
          name: r.name,
          chords: [...p.chords.slice(turns), ...p.chords.slice(0, turns)],
        });
      }
    }
  }
  return out;
})();

export const SHARED_PROGRESSION_BY_ID: ReadonlyMap<string, SharedProgression> =
  new Map(SHARED_PROGRESSIONS.map(p => [p.id, p]));

/** Every position number a rung offers, as 1-based numbers. */
export function positionsOf(
  entry: SharedProgression, rung: ListRung,
): number[] {
  return Array.from({ length: entry.positions[rung] }, (_, i) => i + 1);
}

/** The keys a card may be asked in — the grid's twelve. */
export const LIST_KEYS = KEYS;

/**
 * The itemRef a card is filed under.
 *
 * THE ENTRY AND THE POSITION, so a reader's history here is per
 * position exactly as the grid's is — `vl:major-251:seventh-chords:B:F`
 * is one cell with one rating, and hearing that cell is one item too.
 */
export function fullProgressionItemId(
  entryId: string, position: number,
): string {
  return `full-progression:${entryId}:pos${position}`;
}

/** The grid row an entry drills, for a link back to it. */
export function patternFor(entry: SharedProgression): VoiceLeadingPattern {
  return VOICE_LEADING_PATTERN_BY_ID.get(entry.patternId)!;
}

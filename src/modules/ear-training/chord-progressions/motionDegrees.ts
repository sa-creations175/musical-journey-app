/**
 * The degree chips a chord-motion answer is built from.
 *
 * =====================================================================
 * THE ANSWER IS A DEGREE, WHICH IS THE QUESTION THE CARD ASKS.
 *
 * Chord Motion asked its answer on a keyboard: tap the key the move
 * landed on. That is a fine way to answer and it is still offered — but
 * it makes the reader translate a degree they heard into a letter, in a
 * key the card named, before they can say what they heard. Silas's
 * ruling of 10 Sep 2026 puts degrees first and the board second.
 *
 * SEVEN CHIPS DIATONIC, FIFTEEN CHROMATIC: the seven, the five
 * chromatic degrees between them, and the three borrowed qualities
 * (2ø, 4m, 5m) beside their diatonic twins — the motion pool's own
 * `DEGREE_TABLE`, so a chip cannot exist for a motion the pool cannot
 * produce.
 *
 * THE QUALITY SUFFIX IS THE APP'S OWN. "7°" or "7dim" is the
 * progression-spelling setting, read through `qualitySuffix`, so the
 * chips agree with every grid row and flashcard on the same screen.
 * =====================================================================
 */
import { qualitySuffix } from '../../../lib/progressionRow';
import {
  DEFAULT_PROGRESSION_SPELLING, type ProgressionSpelling,
} from '../../../lib/progressionSpellingShape';
import type { Thickness } from '../../../lib/builtAnswers/chordShapes';
import { DEGREE_TABLE, type DegreeLabel, type Motion } from './chordMotionPool';

/** The chord-shape quality a degree's chord takes, for the suffix. */
const SUFFIX_QUALITY: Readonly<Record<string, string>> = {
  major: 'maj7',
  minor: 'm7',
  dominant: '7',
  'half-dim': 'm7b5',
  diminished: 'dim7',
};

/**
 * The rung Chord Motion's chords are, unless a caller says otherwise.
 *
 * SEVENTH CHORDS, because that is what the card deals and what its
 * ladder offers (guide tones, seventh chords, full voicing — every one a
 * seventh-chord reading). The Focus panel, the tracker and the
 * dashboard have no ladder of their own and name the motion as the card
 * plays it.
 */
const CARD_RUNG: Thickness = 'seventh';

/** What a triad chip stands for: the root and the triad under it. */
function triadKey(label: DegreeLabel): string {
  const e = DEGREE_TABLE.find(x => x.label === label);
  if (e === undefined) return label;
  const triad = e.quality === 'minor' ? 'min'
    : e.quality === 'half-dim' || e.quality === 'diminished' ? 'dim'
      : 'maj';
  return `${e.semi}:${triad}`;
}

/**
 * Whether an answered chip names the chord that was asked, at a rung.
 *
 * AT TRIADS THE ♯4'S TWO SEVENTHS ARE ONE CHORD. F♯m7♭5 and F♯dim7
 * share their triad, F♯°, so a Triads row shows one ♯4° chip and it
 * answers a card dealt from either entry. At every other rung a chip
 * names its own chord and nothing else.
 */
export function sameChordAt(
  yours: DegreeLabel,
  asked: DegreeLabel,
  rung: Thickness = CARD_RUNG,
): boolean {
  if (yours === asked) return true;
  return rung === 'triads' && triadKey(yours) === triadKey(asked);
}

export interface DegreeChip {
  label: DegreeLabel;
  /** What the chip says: "1", "2m", "7°". */
  text: string;
  diatonic: boolean;
}

/**
 * The chips on offer.
 *
 * `chromatic` adds the five borrowed degrees; without it the row is the
 * seven of the major scale, which is what the card asks about unless
 * Note context says otherwise.
 *
 * NO RUNG PASSED, so a diminished takes its TRIAD name — the chip names
 * a degree of the key rather than a voicing of it, which is the same
 * reading a grid row label takes.
 */
export function degreeChips(
  chromatic: boolean,
  settings?: ProgressionSpelling,
  rung: Thickness = CARD_RUNG,
): DegreeChip[] {
  const seen = new Set<string>();
  return DEGREE_TABLE
    .filter(e => chromatic || e.diatonic)
    // ONE CHIP PER TRIAD AT TRIADS — the ♯4's two sevenths collapse to
    // the first of them, ♯4°. See `sameChordAt`.
    .filter(e => {
      if (rung !== 'triads') return true;
      const k = triadKey(e.label);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(e => ({
      label: e.label,
      text: chipText(e.label, settings, rung),
      diatonic: e.diatonic,
    }));
}

/**
 * What a degree's chip says: "1", "2m", "♯4°".
 *
 * ONE SPELLING FOR THE CHIP AND EVERY LINE THAT NAMES IT. The result
 * line and the verdict say "the 4m", not "the 4" or "B♭m7", so a reader
 * checks their answer against the same words they tapped.
 */
export function chipText(
  label: DegreeLabel,
  settings?: ProgressionSpelling,
  rung: Thickness = CARD_RUNG,
): string {
  const entry = DEGREE_TABLE.find(e => e.label === label);
  const degree = (entry?.degree ?? label).replace(/b/g, '♭').replace(/#/g, '♯');
  // =====================================================================
  // THE DIMINISHED FAMILY SPELLS AS SETTINGS SAYS, BY RUNG. Silas's
  // ruling of 10 Sep 2026. On a Triads row every diminished chord is
  // the triad — ° (or dim). On a seventh-chord row — guide tones,
  // seventh chords, full voicing — the m7♭5 is ø (or m7♭5) and the dim7
  // is the triad's sign with a 7: °7 (or dim7). So the 7 reads 7ø on
  // this card, where it read 7° when chips took no rung at all.
  //
  // THE DIM7 IS SPELLED HERE, not by `qualitySuffix`, which files a dim7
  // with the half-diminished and would write it ø at a seventh rung.
  // =====================================================================
  if (entry?.quality === 'diminished' && rung !== 'triads') {
    return `${degree}${(settings ?? DEFAULT_PROGRESSION_SPELLING).halfDimTriad}7`;
  }
  return degree + qualitySuffix(SUFFIX_QUALITY[entry?.quality ?? 'major'] ?? 'maj7', {
    ...(settings ? { settings } : {}),
    rung,
  });
}

/**
 * The arrow between a motion's two chords: the bass's direction.
 *
 * =====================================================================
 * ↑ WHEN THE BASS WENT UP, ↓ WHEN IT WENT DOWN, → ON A SAME ROOT.
 * Silas's ruling of 10 Sep 2026. Every pair is two cards now, and
 * "1 → 6m" could be either of them; "1 ↑ 6m" and "1 ↓ 6m" cannot. The
 * same straight arrows the Bass level row and the octave buttons use,
 * never ↗ ↘. Written here and nowhere else, so the verdict, the result
 * line, the Focus panel, the stats panel, the dashboard and the starter
 * line all draw the same one.
 * =====================================================================
 */
export function motionArrow(m: Pick<Motion, 'direction'>): '↑' | '↓' | '→' {
  return m.direction === 'asc' ? '↑' : m.direction === 'desc' ? '↓' : '→';
}

/**
 * A motion by name, the way its chips spell it and the bass moves it:
 * "1 ↑ 2ø", "♭2 ↓ 3m", "4 → 4m".
 *
 * =====================================================================
 * THE ONE FORMATTER. Three places named a motion — the Focus panel, the
 * progressions tracker and the dashboard's rows — and each wrote its
 * stored id straight to the screen: "1 → 2m7b5 (Up)", "b2 → 3". An id is
 * a key, not a name; the chips had the name all along.
 *
 * SAFE FOR THE READ LAYER. Nothing under this imports React or Dexie —
 * the spelling comes from `progressionSpellingShape`, not from the file
 * with the hooks — so the dashboard can call it. Without `settings` it
 * spells at the app's default (° and ø), at the card's seventh-chord
 * rung — the ♯4's two chords need their two names to be told apart.
 *
 * NO DIRECTION. A pair of chords has one motion in the pool, so "(Up)"
 * said nothing the two names do not, and the direction a reader cares
 * about is the one the bass took, which the verdict now says.
 * =====================================================================
 */
export function motionName(
  m: Pick<Motion, 'startLabel' | 'destLabel' | 'direction'>,
  settings?: ProgressionSpelling,
  rung: Thickness = CARD_RUNG,
): string {
  return `${chipText(m.startLabel, settings, rung)} ${motionArrow(m)} ${chipText(m.destLabel, settings, rung)}`;
}

/** A degree's pitch class in a key. */
export function degreePc(keyPc: number, label: DegreeLabel): number {
  const entry = DEGREE_TABLE.find(e => e.label === label);
  return (((keyPc + (entry?.semi ?? 0)) % 12) + 12) % 12;
}

/**
 * The degree a tapped key is, in a key.
 *
 * THE PIANO ANSWERS WITH A NOTE, AND THE RESULT LINE NAMES IT AS A
 * DEGREE. "It landed on the 4, not the 5" — never "not the C", because
 * the card's question is which degree, and a letter would make the
 * reader translate their own answer back before they could read it.
 * A PITCH HAS NO QUALITY, so a tap on the 4's key is the 4, never the
 * 4m: the table lists each diatonic chord before its borrowed twin and
 * this takes the first.
 */
export function degreeOfPc(keyPc: number, pc: number): DegreeLabel {
  const semi = (((pc - keyPc) % 12) + 12) % 12;
  return DEGREE_TABLE.find(e => e.semi === semi)?.label ?? '1';
}

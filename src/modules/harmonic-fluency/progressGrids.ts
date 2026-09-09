/**
 * Harmonic fluency's grids — what each category genuinely varies by.
 *
 * =====================================================================
 * ORDER IS PASSED. IT IS NEVER COLLECTED OFF THE CARDS.
 *
 * Every `values` here is a list that already exists — `HF_MAJOR_KEYS`,
 * `SCALE_DEGREES`, `INTERVAL_SEMITONES`, `FLAT_TWELVE` — exported from
 * the module that generates the cards rather than written out again
 * beside the grid. Two lists of the same twelve keys is how a column
 * comes to exist that no card can land in.
 *
 * A CATEGORY WITHOUT AN ENTRY RENDERS FLAT, and that is a real answer
 * rather than a gap: the twenty hand-written progression cards vary by
 * nothing a grid could show, and inventing coordinates to force them
 * into a 1x1 would be making structure up.
 * =====================================================================
 */
import type { AxisSpec, GridSpec } from '../../components/moduleHome/axis';
import {
  CATEGORY_LABELS, ENHARMONIC_SPELLINGS, HF_MAJOR_KEYS, INTERVAL_SEMITONES,
  SCALE_DEGREES,
} from './catalog';
import {
  FLAT_TWELVE, MODE_BY_DEGREE, SLASH_SHAPES, THIRTEEN_KEYS,
} from './catalogExpansions';
import { withAccidentalGlyphs } from '../reading/pitch';
import { MODAL_CHORDS } from './modalImprovisation';
import { DEGREE_MOVEMENTS } from './scaleDegreeQualityCards';
import { canonicaliseKey, sortByCircleOfFourths } from '../repertoire/circleOfFourths';
import { spellKey } from '../../lib/spelling';

const axis = (
  field: string,
  label: string,
  values: readonly (string | number)[],
  labelFor?: (v: string | number) => string,
): AxisSpec => ({
  field,
  label,
  ...(labelFor ? { labelFor } : {}),
  views: [{ id: 'default', label, values }],
});

/**
 * The key axis, with its two readings.
 *
 * DERIVED FROM ONE LIST. The circle order is `HF_MAJOR_KEYS` itself,
 * which is declared in circle-of-fifths order; the chromatic view sorts
 * the SAME twelve by pitch class. Neither adds or drops a key, which is
 * what makes the toggle display-only — see `viewsAgree`.
 */
const CHROMATIC_INDEX = new Map(
  // Keyed by IDENTITY, because that is what the axis holds now.
  FLAT_TWELVE.map((k, i) => [canonicaliseKey(k) ?? k, i] as const),
);

/**
 * TWELVE COLUMNS FOR TWELVE PITCHES.
 *
 * It was THIRTEEN, and the extra one was a disagreement made visible:
 * `catalog.ts` wrote F♯ into a card's coordinates and the expansion
 * generators wrote G♭, so no twelve-key axis could hold both and the
 * union was the only honest picture. Picking one silently dropped the
 * other's cards into the tail — how three mode cards and one
 * progression card went missing the first time this was wired.
 *
 * The generators agree now: every id and axis coordinate is minted
 * from the identity vocabulary, so there is one spelling to hold. The
 * axis is the identity twelve, and the column is LABELLED by
 * `spellKey` rather than by whichever string a generator happened to
 * use.
 */
const HF_KEY_COLUMNS: ReadonlyArray<string> = HF_MAJOR_KEYS;

/**
 * The column header. HARDCODED FLAT, AND THAT IS A NARROWING RATHER
 * THAN A LIMITATION.
 *
 * The whole harmonic-fluency corpus is flat by design — `FLAT_TWELVE`
 * and the argument above it — so a spelling channel here would be a
 * setting with one correct value. If HF ever gains a sharp-side view,
 * this is where it changes: the axis needs the reader's `Spelling`
 * threaded in, which `AxisSpec.labelFor` has no parameter for today,
 * so that view would add one.
 */
function spellKeyColumn(v: string | number): string {
  return spellKey(String(v), 'flat');
}

/**
 * THE CIRCLE VIEW DID NOT ORDER BY THE CIRCLE.
 *
 * It served `HF_KEY_COLUMNS` as declared, which is `FLAT_TWELVE`
 * followed by whatever the other generator spells differently — that
 * is chromatic order with F♯ pushed to the end. Against a chromatic
 * view of the same twelve it moved exactly one column, so the toggle
 * looked broken because it very nearly was.
 *
 * It sorts through the shared wheel now. The id stays `fifths` because
 * it is a stored preference: renaming it would silently reset every
 * reader who had chosen this view. The LABEL is what they read, and it
 * says what the ordering actually is.
 */
const keyAxis: AxisSpec = {
  field: 'key',
  label: 'key',
  labelFor: spellKeyColumn,
  views: [
    {
      id: 'fifths',
      label: 'Circle of 4ths',
      values: sortByCircleOfFourths(HF_KEY_COLUMNS),
    },
    {
      id: 'chromatic',
      label: 'Chromatic',
      // No enharmonic lookup any more: the axis holds one spelling of
      // each pitch, so a pitch-class sort is total on its own.
      values: [...HF_KEY_COLUMNS].sort((a, b) =>
        (CHROMATIC_INDEX.get(a) ?? 99) - (CHROMATIC_INDEX.get(b) ?? 99)),
    },
  ],
};

// THE FIELD IS STILL `degree` AND THE WORD IS `number` (ruling 29).
// The first is a coordinate the cards are built from; the second is
// what a reader reads above the rows.
const degreeAxis = axis('degree', 'number', SCALE_DEGREES);

/**
 * The thirteen-key axis, labelled as written (rulings 39, 40 and 42).
 *
 * =====================================================================
 * THIS IS THE TWELVE-COLUMN ARGUMENT ABOVE, REVERSED BY A RULING.
 *
 * That argument is still right for a family whose keys are pitch
 * classes: one name each, one column each, laid out by the shared
 * wheel. The families that regenerate under ruling 39 are not those any
 * more. "The mode of F♯ major starting on G♯" and "the mode of G♭ major
 * starting on A♭" are two questions with two answers, so they are two
 * cards and they need two columns; the same holds for a slash chord, a
 * key signature, a pentatonic and a progression.
 *
 * AND THE HEADER IS NOT SPELLED BY THE SETTING. `spellKeyColumn` runs
 * every column through `spellKey(_, 'flat')`, which would print "G♭"
 * over both of these. Ruling 40 says the ♭/♯ setting changes how a note
 * INSIDE a key is spelled and never merges or hides a key, so the
 * header is the key's own name with its accidental drawn properly —
 * a respelling of one letter, not a choice between two keys.
 *
 * ONE VIEW, not the circle/chromatic pair the other grids offer. The
 * wheel holds twelve names and cannot order thirteen; a toggle whose
 * two orderings had to disagree about which keys exist is worse than no
 * toggle, and `AxisViewToggle` renders nothing for a single ordering.
 * =====================================================================
 */
const thirteenKeyAxis: AxisSpec = {
  field: 'key',
  label: 'key',
  labelFor: v => withAccidentalGlyphs(String(v)),
  views: [{ id: 'default', label: 'key', values: THIRTEEN_KEYS }],
};

/**
 * Scale degree math — 7 start degrees down, 24 movements across.
 *
 * IT SCROLLS SIDEWAYS, AND THAT IS ACCEPTED. The grid was briefly
 * transposed to put the long axis vertical; Silas looked at both and
 * kept this one. The reader who wants the other shape now has a
 * control for it — see `ProgressDetail` — rather than the page having
 * decided on their behalf.
 *
 * The 24 are one list, exported from the generator that walks them, so
 * the columns and the cards' coordinates cannot come from two sources
 * that drift. `labelFor` reads the same list; nothing here spells a
 * quality or a direction a second time.
 */
const MOVEMENT_LABEL = new Map(DEGREE_MOVEMENTS.map(m => [m.id, m.label] as const));

const movementAxis = axis('movement', 'movement', DEGREE_MOVEMENTS.map(m => m.id),
  v => MOVEMENT_LABEL.get(String(v)) ?? String(v));

export const HARMONIC_FLUENCY_GRIDS: Readonly<Record<string, GridSpec>> = {
  [CATEGORY_LABELS['scale-degree-math']]: {
    columns: movementAxis,
    rows: degreeAxis,
  },

  // `named-notes` HAD ONE HERE AND ITS CARDS ARE GONE. A grid keyed on
  // a label no card carries renders an empty page rather than nothing,
  // so it goes with them.
  //
  // `reverse-key-pivots` HAD ONE HERE AND ITS CARDS ARE GONE TOO — the
  // third leg of the triangle joined the family on 3 Sep 2026.
  //
  // `degree-notes` GETS NONE, AND THAT IS DELIBERATE. Its coordinates
  // are a key and a degree, but FOUR cards share every cell — name it,
  // place it, press it and which-key — and a grid whose cell means four
  // different questions is a cell that cannot be coloured honestly.
  // Diatonic Chord Qualities, Chord Construction and Ear-Theory
  // Crossover already render without one.

  // Intervals compare along their SPAN, and the starting note is what
  // makes two cards of the same span different questions.
  //
  // THIRTEEN ROWS SINCE RULING 43, for the mode axis's reason: the
  // start-note vocabulary is the key vocabulary, and F♯ and G♭ are two
  // of it. The row header is the note's own name — running it through
  // the spelling setting would print G♭ over both.
  [CATEGORY_LABELS.intervals]: {
    columns: axis('semitones', 'semitones', INTERVAL_SEMITONES),
    rows: axis('from', 'from', THIRTEEN_KEYS,
      v => withAccidentalGlyphs(String(v))),
  },

  // Two kinds share this category — respelled notes and respelled
  // degrees — so `kind` is the row and the spelling being asked about
  // is the column.
  // The three functional-harmony generators share a key axis and are
  // told apart by `shape` — which is why each supplies one.
  // TWO ROWS SINCE THE 2-5-1 MOVED. `ii-V-I` was the first of three and
  // it is gone rather than left empty: the eleven generated cards fold
  // into Progression Vocabulary, and a row with nothing in it is a row
  // that claims coverage the family does not have. `fh-3` still asks
  // the cadence in C, hand-written and without coordinates, so it lands
  // in the tail with the other prose cards.
  [CATEGORY_LABELS['functional-harmony']]: {
    columns: keyAxis,
    rows: axis('shape', 'progression', ['V/V', 'V/vi']),
  },

  [CATEGORY_LABELS.modes]: {
    columns: thirteenKeyAxis,
    // "number", not "degree" (ruling 29) — the field stays `degree`
    // because the cards are built from it; the word above the rows is
    // what a reader reads.
    rows: axis('degree', 'number', MODE_BY_DEGREE.map(m => Number(m.degree)),
      v => MODE_BY_DEGREE.find(m => Number(m.degree) === v)?.mode ?? String(v)),
  },

  // THIRTEEN COLUMNS SINCE RULING 40, the mode axis's reason: F♯ major
  // and G♭ major are two keys with two sets of answers.
  [CATEGORY_LABELS['slash-chords']]: {
    columns: thirteenKeyAxis,
    rows: axis('shape', 'shape', SLASH_SHAPES.map(sh => sh.id),
      v => SLASH_SHAPES.find(sh => sh.id === v)?.label ?? String(v)),
  },

  /**
   * THIRTEEN COLUMNS AND SIX ROWS.
   *
   * One row and six cards before commit 8. Every progression the family
   * names AND can be written in a major key is now generated in all
   * thirteen, so the grid is the eight of them.
   *
   * THE ROW ORDER IS THE FAMILY'S OWN. The four numbered shapes first,
   * in the order the cards teach them, then the four named ones.
   *
   * The twelve one-offs still land in the tail: six ask about a
   * progression in no key, and five name a progression the ruled list
   * does not. Coordinates were not invented for either.
   */
  [CATEGORY_LABELS.progressions]: {
    columns: thirteenKeyAxis,
    rows: axis('shape', 'progression', [
      '1-5-6-4', 'ii-V-I', '1-6-4-5', '1-6-2-5', '1-4-5', 'backdoor',
    ]),
  },

  /**
   * THIRTEEN COLUMNS AND SIX ROWS.
   *
   * The rows were `relation` — relative or parallel — because those
   * were the only two generated sets. Commit 8 adds the count, the
   * relative pair the other way round, and the two count-to-key
   * questions, so what separates the cards is no longer a RELATION but
   * WHAT IS ASKED about the key's signature. `relation` stays on the
   * cards that have one, because the Maj/Min Key Relation filter reads
   * it and its chips are ruled.
   *
   * Every row value is a phrase from the family's own card text —
   * "the relative major of", "the major key with 3 flats" — rather than
   * a new name for a row.
   */
  [CATEGORY_LABELS['key-signatures']]: {
    columns: thirteenKeyAxis,
    rows: axis('ask', 'question', [
      'count', 'relative', 'relative major', 'major key', 'minor key',
      'parallel',
    ]),
  },

  // PENTATONICS SPELLS ITS ROOTS THREE WAYS. Minor roots run sharp
  // (C#, F#, G#) and major roots flat (Db, Gb, Ab) — the same pitches
  // under two spellings — so one root axis would drop half the deck
  // into the tail. The union, in the generator's own orders.
  // FIFTEEN COLUMNS FOR TWELVE PITCHES, until the ids canonicalised.
  // `MAJOR_ROOTS` spells the flat side and `MINOR_ROOTS` the sharp —
  // each scale reads the way it is written — so the union carried C♯,
  // F♯ and G♯ as extra columns beside D♭, G♭ and A♭. The card's ROOT
  // coordinate is the identity now, so one column holds both shapes
  // and the header is labelled rather than inherited.
  /**
   * THIRTEEN ROOTS, AND ONE ROW IS SHORTER THAN THE OTHERS.
   *
   * The major and lick cards carry the root as written, because F♯
   * major pentatonic and G♭ major pentatonic are two different sets of
   * notes. The minor cards carry the identity root, because C♯ minor
   * and D♭ minor are one root spelled to suit the shape — which the
   * card's own "C♯ (D♭)" name already says.
   *
   * So the minor row has twelve of thirteen. G♭ minor pentatonic is
   * G♭ B𝄫 C♭ D♭ F♭, and the follow-up ruling that let double
   * accidentals into the deck said not to widen it beyond intervals.
   * The empty cell is that stop, on screen.
   */
  [CATEGORY_LABELS['pentatonic-scales']]: {
    columns: {
      field: 'root',
      label: 'root',
      labelFor: v => withAccidentalGlyphs(String(v)),
      views: [{ id: 'default', label: 'root', values: THIRTEEN_KEYS }],
    },
    rows: axis('shape', 'shape', ['minor', 'major', 'lick']),
  },

  /**
   * THIRTEEN COLUMNS AND TEN ROWS, with four cells empty.
   *
   * The five in-key chords first, in the order the family teaches
   * them, then the five that point out of the key — the prototype's own
   * chip row read top to bottom.
   *
   * THE ROW IS LABELLED BY THE CHORD'S NUMBER, not by its name. "D7"
   * is the 5 of 5 in G and the 4 in A; the number is the one word that
   * means the same thing down a column of thirteen keys.
   *
   * FOUR CELLS ARE EMPTY AND EACH ONE IS A STOP. The decoy guard
   * refuses `5 of 3` in D♭ and D and `5 of 4` in F and F♯ — see
   * `MODAL_IMPROV_STOPS`, which names them and says why. The same
   * shape as G♭ minor pentatonic's missing cell above: a rule said
   * stop, and the stop is on screen rather than papered over.
   */
  [CATEGORY_LABELS['modal-improvisation']]: {
    columns: thirteenKeyAxis,
    rows: axis('chord', 'the band is on', MODAL_CHORDS.map(c => c.id),
      v => MODAL_CHORDS.find(c => c.id === v)?.num ?? String(v)),
  },

  [CATEGORY_LABELS['enharmonic-equivalents']]: {
    columns: axis('spelling', 'spelling', ENHARMONIC_SPELLINGS),
    rows: axis('kind', 'kind', ['note', 'interval'], v =>
      v === 'note' ? 'notes' : 'numbers'),
  },
};


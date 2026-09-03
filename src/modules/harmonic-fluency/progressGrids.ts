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
  FLAT_TWELVE, MODE_BY_DEGREE, SLASH_SHAPES,
} from './catalogExpansions';
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

const degreeAxis = axis('degree', 'degree', SCALE_DEGREES);

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
  [CATEGORY_LABELS.intervals]: {
    columns: axis('semitones', 'semitones', INTERVAL_SEMITONES),
    rows: axis('from', 'from', FLAT_TWELVE),
  },

  // Two kinds share this category — respelled notes and respelled
  // degrees — so `kind` is the row and the spelling being asked about
  // is the column.
  // The three functional-harmony generators share a key axis and are
  // told apart by `shape` — which is why each supplies one.
  [CATEGORY_LABELS['functional-harmony']]: {
    columns: keyAxis,
    rows: axis('shape', 'progression', ['ii-V-I', 'V/V', 'V/vi']),
  },

  [CATEGORY_LABELS.modes]: {
    columns: keyAxis,
    rows: axis('degree', 'degree', MODE_BY_DEGREE.map(m => Number(m.degree)),
      v => MODE_BY_DEGREE.find(m => Number(m.degree) === v)?.mode ?? String(v)),
  },

  [CATEGORY_LABELS['slash-chords']]: {
    columns: keyAxis,
    rows: axis('shape', 'shape', SLASH_SHAPES.map(sh => sh.id),
      v => SLASH_SHAPES.find(sh => sh.id === v)?.label ?? String(v)),
  },

  // Six keyed cards and twenty one-offs. The grid shows the six; the
  // twenty land in the tail, which is the shape 2b already handles and
  // the reason no coordinates were invented for them.
  [CATEGORY_LABELS.progressions]: {
    columns: keyAxis,
    rows: axis('shape', 'progression', ['1-5-6-4']),
  },

  [CATEGORY_LABELS['key-signatures']]: {
    columns: keyAxis,
    rows: axis('relation', 'minor', ['relative', 'parallel']),
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
  [CATEGORY_LABELS['pentatonic-scales']]: {
    columns: {
      field: 'root',
      label: 'root',
      labelFor: spellKeyColumn,
      views: [{ id: 'default', label: 'root', values: HF_KEY_COLUMNS }],
    },
    rows: axis('shape', 'shape', ['minor', 'major', 'relative']),
  },

  [CATEGORY_LABELS['enharmonic-equivalents']]: {
    columns: axis('spelling', 'spelling', ENHARMONIC_SPELLINGS),
    rows: axis('kind', 'kind', ['note', 'interval'], v =>
      v === 'note' ? 'notes' : 'degrees'),
  },
};


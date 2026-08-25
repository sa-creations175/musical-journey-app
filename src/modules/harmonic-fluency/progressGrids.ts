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
import { MAJOR_ROOTS, MINOR_ROOTS } from './pentatonics';

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
  FLAT_TWELVE.map((k, i) => [k, i] as const),
);

/** F♯ and G♭ are the same pitch class spelled two ways; the key list
 *  says F♯ and `FLAT_TWELVE` says G♭, so the lookup needs both. */
const ENHARMONIC: Readonly<Record<string, string>> = { 'F#': 'Gb' };

/**
 * THIRTEEN COLUMNS FOR TWELVE PITCHES, AND THAT IS THE HONEST PICTURE.
 *
 * The generators disagree about how to spell the sixth key.
 * `catalog.ts` walks `HF_MAJOR_KEYS`, which says F♯; every generator in
 * `catalogExpansions.ts` walks `FLAT_TWELVE`, which says G♭. Both write
 * that string into the card's coordinates, so no single twelve-key axis
 * can hold both — and picking one SILENTLY DROPS the other's cards into
 * the tail, which is exactly how three mode cards and one progression
 * card went missing the first time this was wired.
 *
 * So the axis is the union, and F♯ and G♭ appear as separate columns.
 * That makes the disagreement visible on the screen it affects rather
 * than hiding it behind a mapping. It is not the fix — the fix is for
 * the two generators to agree, which is a change to stored card ids and
 * therefore its own decision. See the report.
 */
const HF_KEY_COLUMNS: ReadonlyArray<string> = [
  ...FLAT_TWELVE,
  ...HF_MAJOR_KEYS.filter(k => !FLAT_TWELVE.includes(k)),
];

const keyAxis: AxisSpec = {
  field: 'key',
  label: 'key',
  views: [
    { id: 'fifths', label: 'circle of 5ths', values: HF_KEY_COLUMNS },
    {
      id: 'chromatic',
      label: 'chromatic',
      values: [...HF_KEY_COLUMNS].sort((a, b) =>
        (CHROMATIC_INDEX.get(ENHARMONIC[a] ?? a) ?? 99)
        - (CHROMATIC_INDEX.get(ENHARMONIC[b] ?? b) ?? 99)
        // F♯ and G♭ tie on pitch class; order them by spelling so the
        // sort is total and the two views stay stable.
        || a.localeCompare(b)),
    },
  ],
};

const degreeAxis = axis('degree', 'degree', SCALE_DEGREES);

export const HARMONIC_FLUENCY_GRIDS: Readonly<Record<string, GridSpec>> = {
  [CATEGORY_LABELS['named-notes']]: { columns: keyAxis, rows: degreeAxis },
  [CATEGORY_LABELS['reverse-key-pivots']]: { columns: keyAxis, rows: degreeAxis },

  // Intervals compare along their SPAN, and the starting note is what
  // makes two cards of the same span different questions.
  [CATEGORY_LABELS.intervals]: {
    columns: axis('semitones', 'semitones', INTERVAL_SEMITONES),
    rows: axis('from', 'from', FLAT_TWELVE),
  },

  // ONE DIMENSION, HONESTLY. A tritone has exactly one partner, so a
  // note x partner grid would be a diagonal with 132 empty cells. The
  // twelve notes in a row is the whole category.
  [CATEGORY_LABELS['tritone-pairs']]: {
    columns: axis('note', 'note', FLAT_TWELVE),
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
  [CATEGORY_LABELS['pentatonic-scales']]: {
    columns: axis('root', 'root',
      [...MAJOR_ROOTS, ...MINOR_ROOTS.filter(r => !MAJOR_ROOTS.includes(r))]),
    rows: axis('shape', 'shape', ['minor', 'major', 'relative']),
  },

  [CATEGORY_LABELS['enharmonic-equivalents']]: {
    columns: axis('spelling', 'spelling', ENHARMONIC_SPELLINGS),
    rows: axis('kind', 'kind', ['note', 'interval'], v =>
      v === 'note' ? 'notes' : 'degrees'),
  },
};


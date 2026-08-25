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
import { FLAT_TWELVE } from './catalogExpansions';

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

const keyAxis: AxisSpec = {
  field: 'key',
  label: 'key',
  views: [
    { id: 'fifths', label: 'circle of 5ths', values: HF_MAJOR_KEYS },
    {
      id: 'chromatic',
      label: 'chromatic',
      values: [...HF_MAJOR_KEYS].sort((a, b) =>
        (CHROMATIC_INDEX.get(ENHARMONIC[a] ?? a) ?? 99)
        - (CHROMATIC_INDEX.get(ENHARMONIC[b] ?? b) ?? 99)),
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
  [CATEGORY_LABELS['enharmonic-equivalents']]: {
    columns: axis('spelling', 'spelling', ENHARMONIC_SPELLINGS),
    rows: axis('kind', 'kind', ['note', 'interval'], v =>
      v === 'note' ? 'notes' : 'degrees'),
  },
};


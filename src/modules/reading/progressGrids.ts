/**
 * Reading's grids — what each of its four skills genuinely varies by.
 *
 * =====================================================================
 * ORDER IS PASSED, NEVER DERIVED FROM THE ITEMS.
 *
 * Every `values` here is a list that already exists — `SIGNATURES`,
 * `NOTE_POSITIONS`, `CHORD_QUALITIES`, `SHAPE_FAMILIES` — passed by
 * reference or mapped from it in place. Nothing collects the values off
 * the records, because that produces first-appearance order: an
 * accident of the catalog walk that changes silently when a generator
 * is reordered.
 * =====================================================================
 *
 * THE KEY AXIS GETS TWO VIEWS. Signatures are keys, so they read one
 * way as a chromatic run and another as the circle — and which one you
 * want depends on what you are looking for, not on what the data is.
 * Both hold the same thirteen signatures; the toggle only reorders.
 */
import {
  CHORD_QUALITIES, CLEFS, NOTE_POSITIONS, SHAPE_FAMILIES, SHAPE_FAMILY_LABEL,
  SIGNATURES, SIGNATURE_DIRECTIONS, TRIAD_POSITIONS, SEVENTH_POSITIONS,
  type Clef,
} from './catalog';
import { ledgerLinesFor, pitchAtStaffPosition, scientificPitch } from './pitch';
import NoteLadder from './NoteLadder';
import { CIRCLE_OF_FOURTHS_KEYS } from '../repertoire/matrix/keys';
import type { AxisSpec, GridSpec } from '../../components/moduleHome/axis';
import { READING_CATEGORY_LABEL } from './skillRecords';

/**
 * Signatures in circle order.
 *
 * DERIVED FROM THE SHARED CIRCLE, not written out again. Reading names
 * signatures (`3f`) where the matrix names keys (`Eb`), so the shared
 * list is mapped through each signature's own major spelling — which
 * keeps one source for the cycle while letting reading keep its ids.
 * A signature the circle does not mention keeps its chromatic place at
 * the end rather than being dropped.
 */
const SIGNATURES_IN_CIRCLE: readonly string[] = (() => {
  const byMajor = new Map<string, string>(SIGNATURES.map(s => [s.major, s.id]));
  const inCircle: string[] = [];
  for (const k of CIRCLE_OF_FOURTHS_KEYS) {
    const id = byMajor.get(k);
    if (id !== undefined) inCircle.push(id);
  }
  const seen = new Set(inCircle);
  return [...inCircle, ...SIGNATURES.map(s => s.id).filter(id => !seen.has(id))];
})();

/** Signatures in chromatic-ish order — the catalog's own, which runs
 *  6 flats to 6 sharps and therefore reads as a run of accidentals. */
const SIGNATURES_BY_ACCIDENTAL: readonly string[] = SIGNATURES.map(s => s.id as string);

const SIGNATURE_LABEL = new Map<string, string>(SIGNATURES.map(s => [s.id, s.major]));

const signatureAxis: AxisSpec = {
  field: 'signature',
  label: 'key',
  labelFor: v => SIGNATURE_LABEL.get(String(v)) ?? String(v),
  views: [
    { id: 'accidentals', label: 'By Accidentals', values: SIGNATURES_BY_ACCIDENTAL },
    { id: 'fourths', label: 'Circle of 4ths', values: SIGNATURES_IN_CIRCLE },
  ],
};

/** One axis, one ordering — the common case. */
const oneView = (
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

const QUALITY_LABEL = new Map(CHORD_QUALITIES.map(q => [q.id, q.label]));

/** Clef names for the grid's row headers. See the note at `NOTE_GRID`. */
const CLEF_LABEL: Readonly<Record<string, string>> = {
  treble: 'Treble', bass: 'Bass',
};
const POSITION_LABEL: Readonly<Record<string, string>> = {
  root: 'Root', inv1: '1st', inv2: '2nd', inv3: '3rd',
};

/**
 * Chord positions, widest family first.
 *
 * `SEVENTH_POSITIONS` rather than `TRIAD_POSITIONS`, because a seventh
 * reaches a third inversion a triad does not — using the triad list
 * would push every seventh's `inv3` into the tail, which is exactly the
 * silent drop the tail exists to make visible rather than to cause.
 */
const CHORD_POSITIONS = SEVENTH_POSITIONS.length >= TRIAD_POSITIONS.length
  ? SEVENTH_POSITIONS
  : TRIAD_POSITIONS;

/**
 * Note recognition — ONE GRID PER CLEF, each with real note names.
 *
 * =====================================================================
 * A SHARED AXIS OF INDICES COULD NOT BE LABELLED TRUTHFULLY.
 *
 * It was two rows — treble and bass — over one axis running −4 to 12.
 * Those are staff positions, and a staff position is not a pitch: 0 is
 * E4 in the treble clef and G2 in the bass. One header over both rows
 * could therefore only ever print the coordinate, which is the one
 * thing about the item the reader already knows.
 *
 * Split by clef, each table's headers can say what the note IS. The
 * name is `pitchAtStaffPosition` run through `scientificPitch` — the
 * same two functions the drill's own reveal caption goes through — so
 * the axis and the deck cannot drift apart.
 *
 * THE FRAME IS THE STAFF, and it is derived rather than written: a
 * position is on the staff exactly when it needs no ledger line on
 * either side. Extending the catalog's range moves the frame with it.
 * =====================================================================
 */
const NOTE_GRID: GridSpec = {
  columns: {
    field: 'position',
    label: 'note',
    labelFor: (v, clef) => (
      clef === undefined
        ? String(v)
        : scientificPitch(pitchAtStaffPosition(clef as Clef, Number(v)))
    ),
    inFrame: v => ledgerLinesFor(Number(v)).side === null,
    views: [{ id: 'default', label: 'note', values: NOTE_POSITIONS }],
  },
  // THE VALUE IS THE ITEM REF, THE LABEL IS NOT. `treble` and `bass`
  // are segments of `note:bass:-2`, so the row printed its own id for
  // want of anywhere else to read a name from. A `labelFor` gives the
  // header a real label without touching what the ref is keyed on.
  rows: oneView('clef', 'clef', CLEFS, v => CLEF_LABEL[String(v)] ?? String(v)),
  splitRows: true,
  // THE OTHER WAY UP IS THE NOTATION REFERENCE — the same drawing the
  // reveal panel teaches from, coloured by tier. See `NoteLadder`.
  vertical: NoteLadder,
};

export const READING_GRIDS: Readonly<Record<string, GridSpec | null>> = {
  [READING_CATEGORY_LABEL.sig]: {
    columns: signatureAxis,
    // TWO QUESTIONS, NOT THREE. `which` was a row here while it was an
    // item; it is the second half of a `count` card now, so a row for
    // it would be a row that can never fill.
    rows: oneView('direction', 'question', SIGNATURE_DIRECTIONS, v => ({
      name: 'Name the Key', count: 'Count',
    }[String(v)] ?? String(v))),
  },
  [READING_CATEGORY_LABEL.note]: NOTE_GRID,
  [READING_CATEGORY_LABEL.chord]: {
    columns: oneView('quality', 'quality', CHORD_QUALITIES.map(q => q.id),
      v => QUALITY_LABEL.get(String(v)) ?? String(v)),
    rows: oneView('position', 'inversion', CHORD_POSITIONS,
      v => POSITION_LABEL[String(v)] ?? String(v)),
  },
  [READING_CATEGORY_LABEL.shape]: {
    columns: oneView('family', 'family', SHAPE_FAMILIES,
      v => SHAPE_FAMILY_LABEL[String(v) as keyof typeof SHAPE_FAMILY_LABEL] ?? String(v)),
    rows: oneView('position', 'inversion', CHORD_POSITIONS,
      v => POSITION_LABEL[String(v)] ?? String(v)),
  },
};

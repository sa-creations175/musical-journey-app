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
  CHORD_QUALITIES, NOTE_POSITIONS, SHAPE_FAMILIES, SHAPE_FAMILY_LABEL,
  SIGNATURES, TRIAD_POSITIONS, SEVENTH_POSITIONS,
} from './catalog';
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
    { id: 'accidentals', label: 'by accidentals', values: SIGNATURES_BY_ACCIDENTAL },
    { id: 'fourths', label: 'circle of 4ths', values: SIGNATURES_IN_CIRCLE },
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
const POSITION_LABEL: Readonly<Record<string, string>> = {
  root: 'root', inv1: '1st', inv2: '2nd', inv3: '3rd',
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

export const READING_GRIDS: Readonly<Record<string, GridSpec | null>> = {
  [READING_CATEGORY_LABEL.sig]: {
    columns: signatureAxis,
    rows: oneView('direction', 'question', ['name', 'count', 'which'], v => ({
      name: 'name the key', count: 'count', which: 'which',
    }[String(v)] ?? String(v))),
  },
  [READING_CATEGORY_LABEL.note]: {
    columns: oneView('position', 'staff position', NOTE_POSITIONS),
    rows: oneView('clef', 'clef', ['treble', 'bass']),
  },
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

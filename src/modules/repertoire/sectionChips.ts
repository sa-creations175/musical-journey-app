/**
 * What a song's sections look like from the outside — one chip each.
 *
 * =====================================================================
 * TWO AXES, NOT FOUR STATES.
 *
 * A chip answers two independent questions and never collapses them:
 *
 *   BORDER — is the chart WRITTEN?  `SongSection.chartComplete`, the
 *            user's own tick. Dashed until they say so, solid after.
 *   FILL   — how far has PRACTICE got? The section's own cell test in
 *            the song's original key: empty → practised → passed.
 *
 * All six combinations are legal and one of them is the whole reason
 * the axes are separate: DASHED AND PRACTISED — you have been playing
 * a section whose chart you have not called finished. An enum of four
 * hand-listed states cannot express that, which is how such an enum
 * ends up quietly deciding that practice implies a written chart.
 *
 * So this file returns the two facts and lets the chip draw them. It
 * never returns a class name or a variant id.
 * =====================================================================
 *
 * PASSED IS THE CELL TEST, NOT THE STAGE BADGE. `cellState ===
 * 'comfortable'` is three clean run-throughs of THAT SECTION in the
 * original key — see `SongCell.consecutiveCleanCount`. The stage badge
 * beside these chips is a whole-song rung derived from every key. Two
 * different grains, both on the card, deliberately: neither is the
 * other's summary.
 *
 * THE ORIGINAL KEY, mirroring `songComfortable.ts`. A section's chart
 * is written in the original key, so that is the key its chips report
 * on; cross-key progress has the matrix to show it and does not belong
 * in a six-pixel border.
 */
import type {
  SongCell,
  SongKey,
  SongMatrixSection,
  SongSection,
} from '../../lib/db';

/** How far practice has got on this section, in the original key. */
export type SectionChipFill = 'empty' | 'practised' | 'passed';

export interface SectionChip {
  /** The LEAD-SHEET section id — the row the tick lives on. */
  sectionId: string;
  name: string;
  /** The border axis. */
  chartComplete: boolean;
  /** The fill axis. */
  fill: SectionChipFill;
}

export interface SectionChipReading {
  /** In lead-sheet order. Empty for a song with no sections at all. */
  chips: SectionChip[];
  /** Sections whose chart the user has not ticked. */
  needChords: number;
  passed: number;
  inProgress: number;
}

export interface SectionChipInput {
  /** Lead-sheet sections for ONE song. Order is respected as given. */
  sections: ReadonlyArray<SongSection>;
  /** That song's matrix rows — the bridge from a lead-sheet section to
   *  its cells, since `songCells.sectionId` is a MATRIX id. */
  matrixSections: ReadonlyArray<SongMatrixSection>;
  /** That song's cells. Narrowed by the caller or not; rows for other
   *  sections and other keys are ignored either way. */
  cells: ReadonlyArray<SongCell>;
  /** That song's key rows — the original one is picked out here. */
  songKeys: ReadonlyArray<SongKey>;
}

/**
 * The chips for one song.
 *
 * WALKS THE LEAD SHEET, NOT THE MATRIX. The chart is what a chip is
 * about, so a section exists when the lead sheet says it does. A
 * matrix row with no lead-sheet section behind it is not rendered
 * here — see the report: there is no chart to tick, so there is
 * nothing honest for its border to say yet.
 *
 * MISSING EVIDENCE READS AS `empty`, never as a guess. No original-key
 * row, no matrix row yet (the reconciler runs off a write hook, so a
 * section added seconds ago has none), no materialised cell — each
 * means the cell test has nothing to report, which is exactly what
 * `empty` says.
 */
export function readSectionChips(input: SectionChipInput): SectionChipReading {
  const originalKeyId = input.songKeys.find(k => k.isOriginalKey)?.id ?? null;

  // Lead-sheet section id → live matrix id. Archived rows are skipped:
  // an archived row is off the active surface, and its cells neither
  // gate nor help — the same rule `songComfortable` denominates by.
  const matrixBySection = new Map<string, string>();
  for (const m of input.matrixSections) {
    if (m.isArchived) continue;
    if (m.songSectionId) matrixBySection.set(m.songSectionId, m.id);
  }

  const cellByMatrixSection = new Map<string, SongCell>();
  if (originalKeyId !== null) {
    for (const c of input.cells) {
      if (c.songKeyId !== originalKeyId) continue;
      cellByMatrixSection.set(c.sectionId, c);
    }
  }

  const chips = input.sections.map<SectionChip>(section => {
    const matrixId = matrixBySection.get(section.id);
    const cell = matrixId === undefined
      ? undefined
      : cellByMatrixSection.get(matrixId);
    return {
      sectionId: section.id,
      name: section.name,
      // `=== true` rather than truthiness: absent means unticked, and
      // that is the only other value this field can hold.
      chartComplete: section.chartComplete === true,
      fill: fillFor(cell),
    };
  });

  return {
    chips,
    needChords: chips.filter(c => !c.chartComplete).length,
    passed: chips.filter(c => c.fill === 'passed').length,
    inProgress: chips.filter(c => c.fill === 'practised').length,
  };
}

function fillFor(cell: SongCell | undefined): SectionChipFill {
  if (!cell) return 'empty';
  if (cell.cellState === 'comfortable') return 'passed';
  if (cell.cellState === 'learning') return 'practised';
  return 'empty';
}

/**
 * "6 sections · 1 passed · 2 in progress".
 *
 * ZERO CLAUSES ARE DROPPED, not rendered as "0 passed". A zero is the
 * absence of a thing, and printing it makes a card wider to tell the
 * reader nothing happened. `null` when the song has no sections — the
 * card says so in words instead, and a footer counting nothing would
 * be the "0 of 0" that line exists to avoid.
 */
export function sectionFooterLine(reading: SectionChipReading): string | null {
  const total = reading.chips.length;
  if (total === 0) return null;
  const clauses = [
    `${total} ${plural(total, 'section')}`,
    reading.passed > 0 ? `${reading.passed} passed` : null,
    reading.inProgress > 0 ? `${reading.inProgress} in progress` : null,
  ].filter((c): c is string => c !== null);
  return clauses.join(' · ');
}

/** "2 sections still need chords", or null when none do. */
export function needsChordsLine(reading: SectionChipReading): string | null {
  const n = reading.needChords;
  if (n === 0) return null;
  return `${n} ${plural(n, 'section')} still ${n === 1 ? 'needs' : 'need'} chords`;
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

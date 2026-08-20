/**
 * Every catalog the dashboard divides by.
 *
 * ─── The rule this file exists to enforce ────────────────────────────
 *
 * A coverage denominator is the size of the FULL CATALOG. Never the
 * current filter scope, never the number of items that happen to appear
 * in the log. A denominator that moves — because a setting changed, or
 * because you practised something new — makes the percentage above it
 * mean a different thing on different days.
 *
 * That failure is live today in four dashboard rows:
 * `snapshotEarTrainingModules` derives its totals from items present in
 * `db.attempts`, so its `total` grows as you practise and its
 * `untouched` is permanently 0. `snapshotHarmonicFluency` walks
 * FLASHCARDS and reports a true count. The two have never meant the
 * same thing. These catalogs are what lets both mean the catalog.
 *
 * ─── Rows and items are different counts, on purpose ─────────────────
 *
 * A `CatalogItem` is one ROW of the tree and carries the `itemRefs` it
 * aggregates — usually one, sometimes more. Reading's key signatures
 * are the case that forced this: 78 stored items over three question
 * directions, shown as two rows per key because `count` and `which` are
 * two steps of one skill. Both counts are true and the doc states both,
 * so the model has to hold both. `catalogItemCount` is the denominator;
 * `catalog.items.length` is the row count.
 *
 * ─── Pure ────────────────────────────────────────────────────────────
 *
 * Static data only. Song Repertoire is absent because its catalog is
 * rows in Dexie, not a constant; it arrives with its adapter, built
 * from loaded rows so it stays a pure function of its inputs.
 */
import { FLASHCARDS, CATEGORY_LABELS, CATEGORY_ORDER } from '../../harmonic-fluency/catalog';
import { INTERVAL_SEEDS } from '../../ear-training/intervals/seed';
import { CHORD_SEEDS } from '../../ear-training/chord-recognition/seed';
import { MODES } from '../../ear-training/scales-modes/catalog';
import { PROGRESSIONS } from '../../ear-training/chord-progressions/catalog';
import { KEYS as PROGRESSION_KEYS } from '../../ear-training/chord-progressions/progressionTheory';
import { containsSlashChords } from '../../ear-training/chord-progressions/progressionTheory';
import { ALL_MOTIONS } from '../../ear-training/chord-progressions/ChordMotionTab';
import {
  SIGNATURES, KEY_MODES, CLEFS, NOTE_POSITIONS, CHORD_QUALITIES as READING_CHORD_QUALITIES,
  positionsForFamily, clefsForFamily, SHAPE_FAMILIES, SHAPE_FAMILY_LABEL,
  signatureItemRef, noteItemRef, chordItemRef, shapeItemRef,
} from '../../reading/catalog';
import { PRODUCTION_VOCAB_FLASHCARDS, VOCAB_CLUSTER_LABELS } from '../../production/vocabularyFlashcards';
import { PRODUCTION_LESSONS } from '../../production/content/lessons';
import { PRODUCTION_PATHS } from '../../production/content/paths';
import { enumerateScopeForShapes } from './shapesScope';
import { parseShapesItemRef } from '../../shapes-and-patterns/drillModel';
import { CHORD_QUALITY_BY_ID, inversionStateLabel } from '../../shapes-and-patterns/catalog';
import { SCALE_CELLS } from '../../shapes-and-patterns/scaleSkills';
import { MENTAL_VIZ_ITEMS } from '../../shapes-and-patterns/mentalVizLibrary';
import type { AccuracyKind, CoverageRule } from './itemStats';
import { LESSON_COVERAGE_RULE } from './itemStats';

/** One row of the dashboard tree. */
export interface CatalogItem {
  /** Stable row id. Equals the single itemRef when there is only one. */
  id: string;
  label: string;
  /** Ancestor labels, outermost first. */
  path: readonly string[];
  /**
   * The stored refs this row aggregates. Length > 1 only where two
   * stored items are two steps of one skill — see Reading's
   * conceptual-knowledge row.
   */
  itemRefs: readonly string[];
}

export interface ModuleCatalog {
  /** Matches `AttemptRecord.moduleId` / `SpacingState.moduleRef` for
   *  modules that write one. Sources with neither carry their own key. */
  sourceId: string;
  label: string;
  accuracyKind: AccuracyKind;
  coverageRule?: CoverageRule;
  items: readonly CatalogItem[];
}

/** Rows in the tree. */
export function catalogRowCount(catalog: ModuleCatalog): number {
  return catalog.items.length;
}

/** THE DENOMINATOR — stored items, which a merged row counts more than
 *  once toward. */
export function catalogItemCount(catalog: ModuleCatalog): number {
  return catalog.items.reduce((sum, i) => sum + i.itemRefs.length, 0);
}

/** Every stored ref in the catalog. Used to filter a numerator to
 *  catalog membership so no percentage can exceed 100%. */
export function catalogRefSet(catalog: ModuleCatalog): Set<string> {
  const out = new Set<string>();
  for (const item of catalog.items) for (const ref of item.itemRefs) out.add(ref);
  return out;
}

function one(id: string, label: string, path: readonly string[]): CatalogItem {
  return { id, label, path, itemRefs: [id] };
}

// =====================================================================
// Ear Training
// =====================================================================

/** Ascending and descending are separate items: different sounds,
 *  different skills. The ref composes the interval id with the
 *  direction column — see `itemRefForAttempt`. */
export const intervalsCatalog: ModuleCatalog = {
  sourceId: 'intervals',
  label: 'intervals',
  accuracyKind: 'measured',
  items: INTERVAL_SEEDS.flatMap(seed => (['asc', 'desc'] as const).map(dir =>
    one(
      `${seed.id}:${dir}`,
      `${seed.name} (${dir === 'asc' ? 'ascending' : 'descending'})`,
      ['intervals', dir === 'asc' ? 'ascending' : 'descending'],
    ),
  )),
};

/**
 * One row per chord × inversion, which is what attempts store.
 *
 * Blocked/broken and ascending/descending playback are NOT part of item
 * identity: both buttons are available on every card and the app does
 * not record which was used, so splitting on them would build rows on a
 * guess. Tracking that is queued.
 */
export const chordRecognitionCatalog: ModuleCatalog = {
  sourceId: 'chord-recognition',
  label: 'chord recognition',
  accuracyKind: 'measured',
  items: CHORD_SEEDS.flatMap(chord => {
    const inversions = chord.intervals.length >= 4 ? [0, 1, 2, 3] : [0, 1, 2];
    return inversions.map(inv => one(
      `${chord.id}:${inv}`,
      `${chord.name}${inv === 0 ? '' : ` (inv ${inv})`}`,
      ['chord recognition', chord.tier, chord.name],
    ));
  }),
};

/** 9 modes × 2 tabs. The two tabs are different skills, not two views
 *  of one: single notes ascending and descending, versus naming the
 *  mode from a vamp with a progression and a melody over it. */
export const scalesModesCatalog: ModuleCatalog = {
  sourceId: 'scales-modes',
  label: 'scales & modes',
  accuracyKind: 'measured',
  items: MODES.flatMap(mode => [
    one(`${mode.id}-tab1`, 'hear simple scale', ['scales & modes', mode.name]),
    one(`${mode.id}-tab2`, 'hear mode in context', ['scales & modes', mode.name]),
  ]),
};

/**
 * Chord progressions is three sub-drills sharing one moduleId, split by
 * itemId prefix.
 *
 * CHORD MOTION'S DENOMINATOR IS 132 — every in-octave motion between
 * two distinct chromatic degrees, 12 × 11. The `42` the app shows is
 * `activePool.length` after the diatonic-only filter, which is the
 * default scope, so it looks like the catalog and is not.
 *
 * `motion-first:` is a sibling sub-skill with the same 132 denominator.
 * It is only attemptable in the minimal scaffold, which the affordance
 * must say — otherwise a low number reads as "bad at this" rather than
 * "haven't been in that mode". Narrowing its denominator to motions
 * seen in minimal would be the filter-as-denominator failure again.
 *
 * `motion-mode:{full|partial|minimal}` is DELIBERATELY ABSENT. Those
 * three ids are per-scaffold aggregates, not musical items; as tree
 * rows they would be three permanently-odd entries against a
 * denominator of 3. Stated in the affordance so their attempts are not
 * silently unaccounted for.
 */
export const chordProgressionsCatalog: ModuleCatalog = {
  sourceId: 'chord-progressions',
  label: 'chord progressions',
  accuracyKind: 'measured',
  items: [
    ...PROGRESSION_KEYS.map(key => one(
      `key-detection:${key}`, key, ['chord progressions', 'key detection'],
    )),
    ...ALL_MOTIONS.map(m => one(
      `motion:${m.startLabel}-${m.destLabel}-${m.direction}`,
      `${m.startLabel} → ${m.destLabel} ${m.direction}`,
      ['chord progressions', 'chord motion', 'destination'],
    )),
    ...ALL_MOTIONS.map(m => one(
      `motion-first:${m.startLabel}-${m.destLabel}-${m.direction}`,
      `${m.startLabel} → ${m.destLabel} ${m.direction}`,
      ['chord progressions', 'chord motion', 'first chord'],
    )),
    ...PROGRESSIONS.flatMap(p => {
      const path = ['chord progressions', 'full progression', p.name];
      const rows = [
        one(p.id, 'chord accuracy', path),
        one(`${p.id}-pattern`, 'pattern recognition', path),
      ];
      // Only slash progressions grade inversions — the INV badge.
      if (containsSlashChords(p.numerals)) {
        rows.splice(1, 0, one(`${p.id}-inversion`, 'inversion accuracy', path));
      }
      return rows;
    }),
  ],
};

export const earTrainingCatalogs: ReadonlyArray<ModuleCatalog> = [
  intervalsCatalog,
  chordRecognitionCatalog,
  chordProgressionsCatalog,
  scalesModesCatalog,
];

// =====================================================================
// Harmonic Fluency — 15 categories, 375 cards
// =====================================================================

const HF_CATEGORY_RANK = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));

export const harmonicFluencyCatalog: ModuleCatalog = {
  sourceId: 'harmonic-fluency',
  label: 'harmonic fluency',
  accuracyKind: 'measured',
  items: [...FLASHCARDS]
    .sort((a, b) =>
      (HF_CATEGORY_RANK.get(a.category) ?? 99) - (HF_CATEGORY_RANK.get(b.category) ?? 99))
    .map(card => one(
      card.id, card.question, ['harmonic fluency', CATEGORY_LABELS[card.category]],
    )),
};

// =====================================================================
// Reading — 188 items, and fewer rows than items
// =====================================================================

const SIGNATURE_ROOT = ['reading', 'key signature recognition'] as const;

/**
 * 78 stored items over three directions, shown as two rows per key.
 *
 * `count` ("how many accidentals in D major?") and `which` ("name them,
 * in written order") are two steps of ONE skill — you cannot name them
 * in order without knowing how many there are — so they merge into a
 * single conceptual-knowledge row that aggregates both refs. The module
 * denominator stays 78; only the row count differs, at 26 keys × 2.
 */
function signatureRows(): CatalogItem[] {
  const rows: CatalogItem[] = [];
  for (const sig of SIGNATURES) {
    for (const mode of KEY_MODES) {
      const keyName = `${sig[mode]} ${mode}`;
      const path = [...SIGNATURE_ROOT, keyName];
      rows.push({
        id: `${sig.id}:${mode}:visual`,
        label: 'visual recognition',
        path,
        itemRefs: [signatureItemRef(sig.id, mode, 'name')],
      });
      rows.push({
        id: `${sig.id}:${mode}:conceptual`,
        label: 'conceptual knowledge',
        path,
        // TWO refs, one row. The count is 78 either way.
        itemRefs: [
          signatureItemRef(sig.id, mode, 'count'),
          signatureItemRef(sig.id, mode, 'which'),
        ],
      });
    }
  }
  return rows;
}

export const readingCatalog: ModuleCatalog = {
  sourceId: 'reading',
  label: 'reading',
  accuracyKind: 'measured',
  items: [
    ...signatureRows(),
    ...CLEFS.flatMap(clef => NOTE_POSITIONS.map(pos => one(
      noteItemRef(clef, pos), `${clef} ${pos}`, ['reading', 'note recognition', clef],
    ))),
    ...READING_CHORD_QUALITIES.flatMap(q =>
      clefsForFamily(q.family).flatMap(clef =>
        positionsForFamily(q.family).map(pos => one(
          chordItemRef(q.id, pos, clef),
          `${q.id} ${pos} (${clef})`,
          ['reading', 'chord identification', q.family],
        )))),
    ...SHAPE_FAMILIES.flatMap(family =>
      positionsForFamily(family).map(pos => one(
        shapeItemRef(family, pos),
        `${SHAPE_FAMILY_LABEL[family]} ${pos}`,
        ['reading', 'notation shapes'],
      ))),
  ],
};

// =====================================================================
// Production — lessons and vocabulary are two subtrees
// =====================================================================

const PATH_LABEL = new Map(PRODUCTION_PATHS.map(p => [p.id, p.title]));

/** Self-rated on the five-step lesson scale. Coverage is "tried it"
 *  (75), not an attempt count: a lesson is not a rep you repeat. */
export const productionLessonsCatalog: ModuleCatalog = {
  sourceId: 'production-lessons',
  label: 'production lessons',
  accuracyKind: 'self-rated',
  coverageRule: LESSON_COVERAGE_RULE,
  items: PRODUCTION_LESSONS.map(lesson => one(
    lesson.id,
    lesson.title,
    ['production', 'lessons', PATH_LABEL.get(lesson.pathId) ?? lesson.pathId],
  )),
};

/** 17 categories, 199 cards. "Clusters" in the current UI; the stored
 *  type stays VocabClusterId and only the vocabulary changes. */
export const productionVocabularyCatalog: ModuleCatalog = {
  sourceId: 'production',
  label: 'production vocabulary',
  accuracyKind: 'measured',
  items: PRODUCTION_VOCAB_FLASHCARDS.map(card => one(
    card.id,
    card.termName,
    ['production', 'vocabulary', VOCAB_CLUSTER_LABELS[card.clusterId]],
  )),
};

// =====================================================================
// Shapes & Patterns — self-rated, and no db.attempts rows at all
// =====================================================================

function shapeLabel(itemRef: string): { label: string; path: string[] } {
  const desc = parseShapesItemRef(itemRef);
  if (!desc || desc.kind !== 'chord-shape') {
    return { label: itemRef, path: ['shapes & patterns'] };
  }
  const quality = CHORD_QUALITY_BY_ID.get(desc.quality);
  const inversion = inversionStateLabel(desc.inversionState);
  return {
    label: `${desc.keyName}${inversion ? ` — ${inversion}` : ''}`,
    path: [
      'shapes & patterns', 'chord shapes',
      quality?.label ?? desc.quality,
      inversion || 'voicing',
    ],
  };
}

/**
 * 648 acquisition-path chord shapes + 96 scale cells + 372
 * voice-leading sub-cells.
 *
 * `enumerateAllShapes` already excludes the 72 supplementary rows, and
 * that exclusion is the whole difference between the 720 rows a player
 * can drill and the 648 the denominator counts.
 */
export const shapesCatalog: ModuleCatalog = {
  sourceId: 'shapes-and-patterns',
  label: 'shapes & patterns',
  accuracyKind: 'self-rated',
  items: enumerateScopeForShapes().map((ref: string) => {
    if (ref.startsWith('chord-shape:')) {
      const { label, path } = shapeLabel(ref);
      return { id: ref, label, path, itemRefs: [ref] };
    }
    if (ref.startsWith('scale:')) {
      return one(ref, ref.slice('scale:'.length), ['shapes & patterns', 'scales']);
    }
    return one(ref, ref.slice('vl:'.length), ['shapes & patterns', 'voice-leading']);
  }),
};

/**
 * Mental visualisation is ITS OWN MODULE ROW, not part of Shapes &
 * Patterns.
 *
 * It writes spacing rows under the dedicated `mental-viz` moduleRef and
 * is deliberately excluded from every S&P coverage number (an April 27
 * design call, `RULE_LEGIBILITY` §1.6). Folding it into the S&P tree
 * would reverse that quietly. 504 items since the extended-dominant cut.
 */
export const mentalVizCatalog: ModuleCatalog = {
  sourceId: 'mental-viz',
  label: 'mental visualisation',
  accuracyKind: 'self-rated',
  items: MENTAL_VIZ_ITEMS.map(item => one(
    item.itemRef,
    item.prompt,
    ['mental visualisation', item.itemRef.startsWith('mv:triad:') ? 'triads' : 'sevenths'],
  )),
};

// =====================================================================

/** Every catalog derivable from static data. Song Repertoire is absent
 *  by design — its catalog is Dexie rows, and it is built from loaded
 *  data alongside its adapter. */
export const STATIC_CATALOGS: ReadonlyArray<ModuleCatalog> = [
  ...earTrainingCatalogs,
  harmonicFluencyCatalog,
  readingCatalog,
  productionLessonsCatalog,
  productionVocabularyCatalog,
  shapesCatalog,
  mentalVizCatalog,
];

export function catalogBySourceId(sourceId: string): ModuleCatalog | undefined {
  return STATIC_CATALOGS.find(c => c.sourceId === sourceId);
}

/** Unused today; exported so a caller can enumerate scale cells without
 *  re-deriving them. */
export const SCALE_CELL_REFS: ReadonlyArray<string> = SCALE_CELLS.map(c => c.itemRef);

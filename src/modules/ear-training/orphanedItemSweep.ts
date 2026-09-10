/**
 * Ear-training rows with no live item behind them.
 *
 * =====================================================================
 * THE HARMONIC-FLUENCY SWEEP HAD A HALF THE RULE COULD NOT REACH.
 *
 * "A row with no live item behind it is reported, never deleted by a
 * mover" is the standing rule. Until now the reporter existed for one
 * module. The chord-progressions catalog was cut from sixty-nine named
 * progressions to eight on 9 Sep 2026 and — correctly — nothing
 * deleted the rows the other sixty-one had earned. They sat in four
 * tables, addressable and inert, and nothing said so.
 *
 * This is the other half. Same core, same boot behaviour, same refusal
 * to delete: see `lib/orphanSweep`, which is the argument for all of
 * it. This file says which rows are ear training's, which ids are
 * live, and what the `[et]` line reads like.
 *
 * =====================================================================
 * FIVE ITEM SPACES, AND THEY DO NOT SHARE A VOCABULARY.
 *
 * Harmonic Fluency has one catalog and one kind of id. Ear training
 * has intervals keyed `M3:asc`, chord recognition keyed `maj:0`,
 * progressions keyed by a progression id AND by `key-detection:Eb`
 * AND by `motion:1-5-asc`, and scales & modes keyed `dorian-tab1`.
 * A single union of all of them would let a chord-recognition orphan
 * hide behind an identically-named progression, so each space is its
 * own scope and is asked its own question.
 *
 * =====================================================================
 * FOUR PLACES WHERE A REF IS NOT WHAT IT LOOKS LIKE.
 *
 * AN INVERSION IS NOT AN ITEM. Chord recognition logs `maj:2`, and
 * which inversions a drill will play is a live setting. Reporting
 * `aug:3` as an orphan because the augmented triad has no audible
 * inversion would be reporting a chord that is plainly still in the
 * catalog. So this scope asks about the CHORD, before the colon.
 *
 * THE THREE SUB-SKILL SHAPES ARE LIVE. `{id}-pattern` and
 * `{id}-inversion` are graded halves of one progression round, and
 * `motion-mode:{full|partial|minimal}` is a per-scaffold aggregate the
 * Chord Motion tab still writes. None appears in the dashboard's
 * catalog — deliberately, they are not musical items — but every one
 * of them has a live thing behind it, so none is an orphan.
 *
 * A CURATION ROW CARRIES NO MODULE. `etItemCuration` is keyed on a
 * bare itemRef with no column saying which submodule it came from, so
 * it is checked against the union of every live ear-training ref and
 * reported under "ear training" rather than under a submodule this
 * file would have to guess.
 *
 * THE DIARY'S INTERVAL DESCRIPTIONS ARE A DIFFERENT SPACE FROM THE
 * DRILL'S INTERVALS. `intervalDescriptions` is keyed
 * `minor-3rd-ascending`, from Chord Motion's interval-quality table;
 * the intervals drill is keyed `m3:asc`, from the interval seeds. Two
 * catalogs, two scopes, and folding them would report every row in one
 * of them.
 * =====================================================================
 */
import { db } from '../../lib/db';
import {
  authoredOnAnnotation,
  authoredOnCuration,
  authoredOnSpacing,
  collectOrphans,
  describeAuthored,
  describeCounts,
  type OrphanReport,
  type OrphanScope,
  type SweptRow,
} from '../../lib/orphanSweep';
import {
  INTERVAL_SEEDS, directionsFor, intervalItemRefs, normaliseDirection,
} from './intervals/seed';
import { itemRefForAttempt } from '../dashboard/read/canonicalItemId';
import { CHORD_SEEDS } from './chord-recognition/seed';
import { parseAttemptItemId } from './chord-recognition/inversionUtils';
import { PROGRESSIONS } from './chord-progressions/catalog';
import { ALL_MOTIONS, motionId } from './chord-progressions/chordMotionPool';
import { INTERVAL_QUALITIES, intervalDescriptionKey } from './chord-progressions/intervalQuality';
import { MODES } from './scales-modes/catalog';
import {
  CHORD_MOTION_CATALOG, KEY_DETECTION_KEY_IDS, canonicalSkillId, parseSkillId,
} from '../skills/registry';

/** The four `attempts.moduleId` / `spacingState.moduleRef` values ear
 *  training writes, and the reader's name for each. */
const MODULE_SCOPES: Readonly<Record<string, string>> = {
  intervals: 'intervals',
  'chord-recognition': 'chord recognition',
  'chord-progressions': 'chord progressions',
  'scales-modes': 'scales & modes',
};

/** What the union scopes are called on the line. */
const EAR_TRAINING = 'ear training';

const PHRASES: Readonly<Record<string, string>> = {
  attempts: 'attempt(s)',
  spacing: 'spacing row(s)',
  curation: 'curation row(s)',
  annotations: 'annotation(s)',
  diary: 'diary entr(ies)',
  association: 'association(s)',
  description: 'description(s)',
};

// =====================================================================
// What exists
// =====================================================================

/** `M3:asc`, off the drill's own enumeration rather than a second
 *  one. A unison has one direction, so 25 refs and not 26. */
function liveIntervalRefs(): Set<string> {
  return new Set(intervalItemRefs());
}

/**
 * Every ref the chord-progressions module writes, across its three
 * sub-drills. The sub-skill shapes are here for the reason the header
 * gives: they are not catalog items and they are not orphans either.
 */
function liveProgressionRefs(): Set<string> {
  const out = new Set<string>();
  for (const p of PROGRESSIONS) {
    out.add(p.id);
    out.add(`${p.id}-pattern`);
    // Graded only where the progression has a slash chord, and the
    // catalog cut left none — but the progression is live, so a row
    // logged when it did have one is not an orphan.
    out.add(`${p.id}-inversion`);
  }
  for (const key of KEY_DETECTION_KEY_IDS) out.add(`key-detection:${key}`);
  for (const m of ALL_MOTIONS) {
    const id = motionId(m);
    out.add(id);
    out.add(`motion-first:${id.slice('motion:'.length)}`);
  }
  for (const scaffold of ['full', 'partial', 'minimal']) {
    out.add(`motion-mode:${scaffold}`);
  }
  return out;
}

/** `dorian-tab1` and `dorian-tab2` — the two tabs are two skills. */
function liveModeRefs(): Set<string> {
  const out = new Set<string>();
  for (const m of MODES) {
    out.add(`${m.id}-tab1`);
    out.add(`${m.id}-tab2`);
  }
  return out;
}

/** Whether a chord-recognition ref names a chord the library holds.
 *  The inversion is not part of the question — see the header. */
function chordIsLive(ref: string): boolean {
  return CHORD_SEEDS.some(c => c.id === parseAttemptItemId(ref).chordId);
}

/** Every live ear-training itemRef, for the tables that carry no
 *  module column. */
function liveAnyRef(): (ref: string) => boolean {
  const intervals = liveIntervalRefs();
  const progressions = liveProgressionRefs();
  const modes = liveModeRefs();
  return ref => intervals.has(ref) || progressions.has(ref)
    || modes.has(ref) || chordIsLive(ref);
}

/**
 * Every live ear-training SKILL id — the key `skillAnnotations` and
 * `harmonicDiaryEntries` file under.
 *
 * BUILT THE WAY THE REGISTRY BUILDS THEM, through `canonicalSkillId`
 * and off the same catalogs, so a skill the catalogue can show is
 * never reported as an orphan by this file.
 */
function liveSkillIds(): Set<string> {
  const out = new Set<string>();
  for (const seed of INTERVAL_SEEDS) {
    for (const dir of directionsFor(seed.semitones)) {
      out.add(canonicalSkillId('intervals', dir, seed.id));
    }
  }
  // The diary files Chord Motion's interval descriptions under the
  // intervals module with a subtype of its own.
  for (const q of INTERVAL_QUALITIES) {
    for (const dir of ['ascending', 'descending'] as const) {
      out.add(canonicalSkillId(
        'intervals', 'description', intervalDescriptionKey(q.id, dir),
      ));
    }
  }
  for (const c of CHORD_SEEDS) out.add(canonicalSkillId('chord-recognition', 'item', c.id));
  for (const k of KEY_DETECTION_KEY_IDS) {
    out.add(canonicalSkillId('chord-progressions', 'key-detection', k));
  }
  for (const m of CHORD_MOTION_CATALOG) {
    out.add(canonicalSkillId('chord-progressions', 'motion', m.id));
  }
  for (const p of PROGRESSIONS) out.add(canonicalSkillId('chord-progressions', 'item', p.id));
  for (const m of MODES) out.add(canonicalSkillId('scales-modes', 'mode', m.id));
  return out;
}

// =====================================================================
// The sweep
// =====================================================================

export type { Orphan, OrphanReport } from '../../lib/orphanSweep';

/**
 * Every ear-training row whose item is not in any ear-training
 * catalog.
 *
 * READS ONLY, and reads `attempts` and `spacingState` by index:
 * `attempts` grows for ever and this runs on every app start. The
 * other five tables are small enough to walk — a curation row exists
 * only where the reader touched one.
 */
export async function reportOrphanedEtItems(): Promise<OrphanReport> {
  const byModule = new Map<string, SweptRow[]>(
    Object.keys(MODULE_SCOPES).map(m => [m, []]),
  );

  for (const moduleId of Object.keys(MODULE_SCOPES)) {
    const rows = byModule.get(moduleId)!;
    for (const row of await db.attempts.where('moduleId').equals(moduleId).toArray()) {
      rows.push({ ref: itemRefForAttempt(row), table: 'attempts' });
    }
    for (const row of await db.spacingState.where('moduleRef').equals(moduleId).toArray()) {
      rows.push({
        ref: row.itemRef, table: 'spacing', authored: authoredOnSpacing(row),
      });
    }
  }

  const liveFor: Readonly<Record<string, (ref: string) => boolean>> = {
    intervals: intervalIsLive(liveIntervalRefs()),
    'chord-recognition': chordIsLive,
    'chord-progressions': inSet(liveProgressionRefs()),
    'scales-modes': inSet(liveModeRefs()),
  };

  const scopes: OrphanScope[] = Object.entries(MODULE_SCOPES).map(([moduleId, scope]) => ({
    scope,
    tables: ['attempts', 'spacing'],
    rows: byModule.get(moduleId) ?? [],
    isLive: liveFor[moduleId],
  }));

  // --- Curations, which carry no module column ----------------------
  scopes.push({
    scope: EAR_TRAINING,
    tables: ['curation'],
    rows: (await db.etItemCuration.toArray()).map(row => ({
      ref: row.itemRef, table: 'curation', authored: authoredOnCuration(row),
    })),
    isLive: liveAnyRef(),
  });

  // --- Annotations and diary entries, keyed on a skill id -----------
  const skills = liveSkillIds();
  const etSkillRows: SweptRow[] = [];
  const isEtSkill = (skillId: string): boolean => {
    const parsed = parseSkillId(skillId);
    return parsed !== null && parsed.moduleId in MODULE_SCOPES;
  };
  for (const row of await db.skillAnnotations.toArray()) {
    if (!isEtSkill(row.skillId)) continue;
    etSkillRows.push({
      ref: row.skillId, table: 'annotations', authored: authoredOnAnnotation(row),
    });
  }
  for (const row of await db.harmonicDiaryEntries.toArray()) {
    if (!isEtSkill(row.skillId)) continue;
    etSkillRows.push({ ref: row.skillId, table: 'diary', authored: ['diaryEntry'] });
  }
  scopes.push({
    scope: EAR_TRAINING,
    tables: ['annotations', 'diary'],
    rows: etSkillRows,
    isLive: inSet(skills),
  });

  // --- The three association tables, each its own id space ----------
  const liveProgIds = new Set(PROGRESSIONS.map(p => p.id));
  scopes.push({
    scope: 'chord progressions',
    tables: ['association'],
    rows: (await db.progressionAssociations.toArray()).map(row => ({
      ref: row.progressionId, table: 'association', authored: ['associationText'],
    })),
    isLive: inSet(liveProgIds),
  });

  const liveModeIds = new Set(MODES.map(m => m.id));
  scopes.push({
    scope: 'scales & modes',
    tables: ['association'],
    rows: (await db.modeAssociations.toArray()).map(row => ({
      ref: row.modeId, table: 'association', authored: ['associationText'],
    })),
    isLive: inSet(liveModeIds),
  });

  const liveDescriptionKeys = new Set(
    INTERVAL_QUALITIES.flatMap(q => (['ascending', 'descending'] as const)
      .map(dir => intervalDescriptionKey(q.id, dir))),
  );
  scopes.push({
    scope: 'interval descriptions',
    tables: ['description'],
    rows: (await db.intervalDescriptions.toArray()).map(row => ({
      ref: row.intervalKey, table: 'description', authored: ['descriptionText'],
    })),
    isLive: inSet(liveDescriptionKeys),
  });

  return collectOrphans(scopes);
}

const inSet = (set: ReadonlySet<string>) => (ref: string): boolean => set.has(ref);

/**
 * Whether an interval ref names an interval the drill still has.
 *
 * A UNISON HAS ONE DIRECTION, AND `P1:desc` IS REAL DATA. At zero
 * semitones `playInterval` sounds the same MIDI note twice whichever
 * branch it takes, so the descending unison was merged into the
 * ascending one rather than retired — and rows logged under the old
 * ref are that same practice. `normaliseDirection` is what the rest of
 * the app folds them with; reporting them as orphans would be this
 * sweep inventing a retirement that never happened.
 */
function intervalIsLive(live: ReadonlySet<string>): (ref: string) => boolean {
  return ref => {
    const colon = ref.lastIndexOf(':');
    if (colon < 0) return live.has(ref);
    const id = ref.slice(0, colon);
    const dir = ref.slice(colon + 1);
    if (dir !== 'asc' && dir !== 'desc') return live.has(ref);
    return live.has(`${id}:${normaliseDirection(id, dir)}`);
  };
}

/**
 * The console line, or null when there is nothing to say.
 *
 * SILENCE IS THE EXPECTED OUTCOME, and it is what a clean database
 * gives. A line here means an item left a catalog without its rows —
 * which, on Silas's two devices, is exactly what the cut of
 * 9 Sep 2026 did on purpose.
 *
 * ONE LINE PER ORPHANED ITEM, saying how many rows and in which table,
 * and nothing else. Not what it was, not what to do about it: the
 * decision is a person's and the rows are not going anywhere.
 */
export function describeOrphanedEtItems(r: OrphanReport): string | null {
  if (r.orphans.length === 0) return null;
  return r.orphans.map(o => (
    `[et] ${o.ref} is not in ${o.scope} and still has `
    + `${describeCounts(o.counts, PHRASES)}${describeAuthored(o.authored)}`
  )).join('\n');
}

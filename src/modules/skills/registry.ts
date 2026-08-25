import {
  db,
  type AttemptRecord,
  type DrillSkill,
  type DrillType,
  type FlashcardState,
  type ProductionLesson,
  type ProductionLessonRating,
  type SkillAnnotation,
  type SkillType,
  type SkillPriority,
  type Song,
} from '../../lib/db';
import { computeTier, type Tier } from '../../lib/tier';
import type { TickAttempt } from '../../lib/progressBar';
import { normaliseStage } from '../repertoire/stage';
import { DEFAULT_SPELLING, spellKey, type Spelling } from '../../lib/spelling';
import { bucketReadingAttempts, readingSkillRows } from '../reading/skillRecords';
import {
  bucketAttemptsForCatalog,
  tierAndLastFromAttempts,
} from '../dashboard/read/tierAdapter';
import { CATEGORY_LABELS, FLASHCARDS } from '../harmonic-fluency/catalog';
import { INTERVAL_SEEDS, directionsFor } from '../ear-training/intervals/seed';
import { MODES } from '../ear-training/scales-modes/catalog';
import { PROGRESSIONS } from '../ear-training/chord-progressions/catalog';
import {
  CHORD_QUALITIES,
  KEYS as SHAPES_KEYS,
  MENTAL_VIZ_VARIANTS,
  SCALES,
  VOICE_LEADING_PATTERNS,
} from '../shapes-and-patterns/catalog';
import { freshnessTier, type FreshnessTier } from '../shapes-and-patterns/drillModel';
import { PRODUCTION_LESSONS } from '../production/content/lessons';
import { pathById } from '../production/content/paths';
import { COVERAGE_RATING } from '../production/lessonRating';

const DAY_MS = 24 * 60 * 60 * 1000;
const TIER_WINDOW = 20;

/**
 * Concept-level chord motions that surface in the Skills Catalogue
 * even though the Chord Motion tab doesn't currently log per-motion
 * attempts. Ids match the starter-diary seed in
 * src/modules/harmonic-diary/starters.ts.
 */
export const CHORD_MOTION_CATALOG = [
  { id: '1-to-5-asc',         label: '1 → 5 ascending' },
  { id: '5-to-1-desc',        label: '5 → 1 descending' },
  { id: '1-to-4-asc',         label: '1 → 4 ascending' },
  { id: '4-to-1-desc',        label: '4 → 1 descending' },
  { id: '1-to-6m-desc',       label: '1 → vi descending' },
  { id: '6m-to-1-asc',        label: 'vi → 1 ascending' },
  { id: '2-to-5-asc',         label: 'ii → V ascending' },
  { id: '5-to-6m-deceptive',  label: 'V → vi (deceptive)' },
  { id: '4-to-5-asc',         label: 'IV → V ascending' },
  { id: '6m-to-4-desc',       label: 'vi → IV descending' },
  { id: 'b7-to-1-asc',        label: 'bVII → 1 ascending' },
  { id: 'b6-to-b7-asc',       label: 'bVI → bVII ascending' },
] as const;

/**
 * Key-detection drill skills — one per pitch class. Each represents
 * the "can you hear this is the tonic key" skill the module's Key
 * Detection tab trains. Per-item tiers aren't wired yet so we emit
 * them as concept entries (null tier / null freshness).
 */
/**
 * `id` is the IDENTITY — the ASCII key name the drill's attempts are
 * recorded under. `label` is DERIVED from it rather than written out,
 * because a hand-maintained pair of columns is how they disagree.
 *
 * They already had. Four of the five black keys were spelled with a
 * real ♭ ('D♭ major') and the fifth with an ASCII '#' ('F# major') —
 * so this one catalog rendered two different alphabets, and the sixth
 * key showed a sharp on a screen where everything else showed flats.
 *
 * The label now follows the user's spelling setting via `spellKey`;
 * `KEY_DETECTION_CATALOG` keeps the identity ids so stored attempts
 * still resolve.
 */
export const KEY_DETECTION_KEY_IDS = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
] as const;

export function keyDetectionCatalog(spelling: Spelling) {
  return KEY_DETECTION_KEY_IDS.map(id => ({
    id,
    label: `${spellKey(id, spelling)} major`,
  }));
}

/** Default-spelling view, for callers with no user context to hand. */
export const KEY_DETECTION_CATALOG = keyDetectionCatalog(DEFAULT_SPELLING);

// --- Canonical skill IDs -------------------------------------------
//
// Every skill surfaced by the catalogue has a deterministic id of the
// form `<moduleId>:<subtype>:<itemId>` so:
//   1. User annotations (priority, custom tags) can key onto it
//      without worrying about modules changing their internal ids.
//   2. Harmonic-diary entries and cross-module references stay stable
//      even when the source module re-seeds.
//   3. The catalogue can render a "jump to this skill in its module"
//      link by parsing the id back apart.

export interface ParsedSkillId {
  moduleId: string;
  subtype: string;
  itemId: string;
}

export function canonicalSkillId(moduleId: string, subtype: string, itemId: string): string {
  return `${moduleId}:${subtype}:${itemId}`;
}

export function parseSkillId(id: string): ParsedSkillId | null {
  const parts = id.split(':');
  if (parts.length < 3) return null;
  const [moduleId, subtype, ...rest] = parts;
  return { moduleId, subtype, itemId: rest.join(':') };
}

// --- Skill record --------------------------------------------------

/** Fully-resolved skill row combining module-derived data with
 *  user annotations. Built on demand by `buildSkillRegistry`. */
export interface SkillRecord {
  skillId: string;
  moduleId: string;
  moduleLabel: string;
  moduleRoute: string;
  /** Optional query string appended to the module route that lands
   *  the user on this skill's sub-view. */
  moduleJumpQuery?: string;
  /** Skill-specific identifier inside its source module. */
  itemId: string;
  name: string;
  /** Short human-facing descriptor of category (e.g. "Functional
   *  Harmony" / "Voice-leading" / "Mode"). */
  category: string;
  skillType: SkillType;
  /** Current rolling-window tier, or null when uncomputable (e.g.
   *  song skills whose progress is stage-tracked instead). */
  currentTier: Tier | null;
  freshness: FreshnessTier;
  /** Days since last practised — null = never. */
  daysSince: number | null;
  lastPracticed: number | null;
  totalTime: number;
  /** User-set priority, if any. */
  priority?: SkillPriority;
  /** Merged tag list — user annotations + auto-derived tags. */
  tags: string[];
  /** User-written note (from annotations). */
  note?: string;
  /**
   * The rolling window itself, newest first — not a summary of it.
   *
   * =====================================================================
   * CARRIED, NOT REDUCED AWAY. THIS IS THE WHOLE POINT.
   *
   * Every other field here is a REDUCTION: `currentTier` is twenty reps
   * collapsed to a word, `daysSince` a timestamp collapsed to a number.
   * That was enough for a list. It is not enough for a strip, which has
   * to say WHICH reps and IN WHAT ORDER — and this file was already
   * bucketing exactly those rows and then discarding them.
   *
   * EMPTY IS A STATEMENT ABOUT THE MODULE, NOT ABOUT THE USER. Songs are
   * stage-tracked, shapes read DrillType rows, production lessons carry
   * a self-rating; none of them records reps. Empty there means "this
   * module does not count in reps", not "no reps yet", and each such
   * builder says so at its own call site rather than leaving the reader
   * to infer it.
   *
   * Capped at `TIER_WINDOW` per record. Measured: ~1,026 catalog records
   * across the attempt-shaped modules, so ~20k tick objects at absolute
   * worst — and only for a user who has drilled every item 20+ times.
   * =====================================================================
   */
  window: TickAttempt[];
  /**
   * Where this item sits on its category's axes, when the category has
   * any. Absent means the category renders as a flat list.
   *
   * SUPPLIED FROM TYPED DATA, never parsed back out of an id. Ids exist
   * for stability and several of them cannot be parsed at all.
   */
  axis?: Readonly<Record<string, string | number>>;
}

/**
 * The window rows for one item, newest first, capped and shaped for
 * `ProgressBar`. One implementation, so no builder invents a second.
 */
function windowFrom(attempts: readonly AttemptRecord[]): TickAttempt[] {
  return [...attempts]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, TIER_WINDOW)
    .map(a => ({ correct: a.correct, timestamp: a.timestamp }));
}

function freshnessFrom(ts: number | null): FreshnessTier {
  return freshnessTier(ts);
}

function daysSinceOf(ts: number | null, now: number): number | null {
  if (ts === null) return null;
  return Math.floor((now - ts) / DAY_MS);
}

// --- Tier computation (reused across ear-training modules) ----------

/**
 * Delegates to the read layer's shared adapter. This file used to
 * carry its own copy, one of the three that could disagree about the
 * same item (docs/RULE_LEGIBILITY.md §1.12). Its recency semantics —
 * timestamp from the unfiltered list, so a focus-protected rep still
 * counts as having touched the item — were the correct ones and are
 * what the shared implementation encodes.
 */
function tierForAttempts(attempts: AttemptRecord[], now: number): { tier: Tier; last: number | null } {
  return tierAndLastFromAttempts(attempts, now);
}

function tierForFlashcardState(state: FlashcardState | undefined, now: number): Tier {
  if (!state || state.totalAttempts === 0) return 'untouched';
  const windowTotal = Math.min(TIER_WINDOW, state.totalAttempts);
  const accuracy = state.totalCorrect / state.totalAttempts;
  const windowCorrect = Math.round(accuracy * windowTotal);
  const daysSince = Math.floor((now - state.lastReviewed) / DAY_MS);
  return computeTier({
    windowCorrect,
    windowTotal,
    daysSinceLastAttempt: state.lastReviewed ? daysSince : null,
  });
}

// --- Skill-type decomposition --------------------------------------

const MODULE_LABELS: Record<string, { label: string; route: string }> = {
  'harmonic-fluency':   { label: 'harmonic fluency',  route: '/harmonic-fluency' },
  'intervals':          { label: 'intervals',         route: '/ear-training/intervals' },
  'chord-recognition':  { label: 'chord recognition', route: '/ear-training/chord-recognition' },
  'chord-progressions': { label: 'chord progressions',route: '/ear-training/chord-progressions' },
  'scales-modes':       { label: 'scales & modes',    route: '/ear-training/scales-modes' },
  'repertoire':         { label: 'song repertoire',   route: '/repertoire' },
  'shapes-and-patterns':{ label: 'shapes & patterns', route: '/shapes-and-patterns' },
  'production':         { label: 'production',             route: '/production' },
  'reading':            { label: 'reading',              route: '/reading' },
};

function moduleMeta(moduleId: string): { label: string; route: string } {
  return MODULE_LABELS[moduleId] ?? { label: moduleId, route: '/' };
}

/**
 * Build a complete catalogue of every trackable skill in the app by
 * walking module data + joining with the user-annotation table. This
 * is a pure read operation — nothing is persisted. Callers render it
 * and write annotations back through `upsertAnnotation` when the user
 * sets a priority / tag / note.
 *
 * Result is not cached here; callers should memoise the result since
 * the walk is O(N attempts + flashcards + songs + drills). With a
 * typical user's dataset it runs in single-digit milliseconds.
 */
export async function buildSkillRegistry(now: number = Date.now()): Promise<SkillRecord[]> {
  const [
    attempts,
    flashcardStates,
    songs,
    drillSkills,
    drillTypes,
    annotations,
    productionLessons,
  ] = await Promise.all([
    db.attempts.toArray(),
    db.flashcardStates.toArray(),
    db.songs.toArray(),
    db.drillSkills.toArray(),
    db.drillTypes.toArray(),
    db.skillAnnotations.toArray(),
    db.productionLessons.toArray(),
  ]);

  const annotationById = new Map<string, SkillAnnotation>();
  for (const a of annotations) annotationById.set(a.skillId, a);

  const records: SkillRecord[] = [];

  // --- Harmonic Fluency (one skill per flashcard) ------------------
  const stateByCard = new Map<string, FlashcardState>();
  for (const s of flashcardStates) stateByCard.set(s.cardId, s);
  // HARMONIC FLUENCY'S TIER AND ITS STRIP READ DIFFERENT SOURCES, and
  // that is pre-existing rather than introduced here. The tier comes
  // from `FlashcardState` — lifetime totals scaled into a pseudo-window
  // by `tierForFlashcardState` — while these are the actual attempt
  // rows. They can disagree, and the module-home card already reads the
  // attempts. Reported rather than quietly reconciled: moving the tier
  // onto attempts changes displayed tiers across the catalogue and is
  // its own decision.
  const hfAttemptsByCard = new Map<string, AttemptRecord[]>();
  for (const a of attempts) {
    if (a.moduleId !== 'harmonic-fluency') continue;
    const arr = hfAttemptsByCard.get(a.itemId);
    if (arr) arr.push(a); else hfAttemptsByCard.set(a.itemId, [a]);
  }
  for (const card of FLASHCARDS) {
    const state = stateByCard.get(card.id);
    const tier = tierForFlashcardState(state, now);
    const lastPracticed = state?.lastReviewed ?? null;
    const totalTime = state ? state.totalAttempts * 12 : 0; // ~12s/card rough
    const { label, route } = moduleMeta('harmonic-fluency');
    const skillId = canonicalSkillId('harmonic-fluency', 'card', card.id);
    const ann = annotationById.get(skillId);
    records.push({
      skillId,
      moduleId: 'harmonic-fluency',
      moduleLabel: label,
      moduleRoute: route,
      moduleJumpQuery: `category=${card.category}`,
      itemId: card.id,
      name: ann?.customName ?? card.question.replace(/\s+/g, ' ').trim(),
      category: CATEGORY_LABELS[card.category] ?? card.category,
      skillType: 'theory',
      currentTier: tier,
      freshness: freshnessFrom(lastPracticed),
      daysSince: daysSinceOf(lastPracticed, now),
      lastPracticed,
      totalTime,
      priority: ann?.priority,
      tags: ann?.tags ?? [],
      note: ann?.note,
      window: windowFrom(hfAttemptsByCard.get(card.id) ?? []),
      // Carried straight through. The registry does not know what a
      // key or a degree means here — only that the generator supplied
      // coordinates and the grid will read them.
      ...(card.axis ? { axis: card.axis } : {}),
    });
  }

  // --- Ear Training — per-item tiers from attempts -----------------
  // Buckets on the CATALOG ROLLUP key, not the raw itemId. Chord
  // recognition logs `chordId:inversion` while this file looks each
  // chord up by the bare id from db.chordQualities, so a raw-itemId
  // bucket made every post-inversion-build attempt invisible here and
  // the whole module read as untouched.
  const byModule = bucketAttemptsForCatalog(attempts);

  // Intervals — catalog is fixed. Produce separate asc / desc skill
  // rows because ear-training treats them as distinct (attempts
  // carry a `direction` field) and the diary wants per-direction
  // associations ("Ascending major 3rd: …" vs "Descending minor 6th: …").
  {
    const { label, route } = moduleMeta('intervals');
    const mod = byModule.get('intervals') ?? new Map();
    for (const seed of INTERVAL_SEEDS) {
      const bucket: AttemptRecord[] = mod.get(seed.id) ?? [];
      // `directionsFor`, not ['asc','desc']. A unison has one case, and
      // this builder was still emitting a "Unison (descending)" row for
      // a skill the drill can no longer produce — the catalogue half of
      // the merge, missed when the drill half landed.
      for (const dir of directionsFor(seed.semitones)) {
        // Attempts without a direction value are treated as ascending
        // — older rows pre-date the direction field.
        const filtered = bucket.filter(a => (a.direction ?? 'asc') === dir);
        const skillId = canonicalSkillId('intervals', dir, seed.id);
        const ann = annotationById.get(skillId);
        const { tier, last } = tierForAttempts(filtered, now);
        const dirWord = dir === 'asc' ? 'ascending' : 'descending';
        records.push({
          skillId,
          moduleId: 'intervals',
          moduleLabel: label,
          moduleRoute: route,
          itemId: `${seed.id}:${dir}`,
          name: ann?.customName ?? `${seed.name} (${dirWord})`,
          category: dir === 'asc' ? 'Ascending intervals' : 'Descending intervals',
          axis: { interval: seed.id, semitones: seed.semitones, direction: dir },
          skillType: 'ear',
          currentTier: tier,
          freshness: freshnessFrom(last),
          daysSince: daysSinceOf(last, now),
          lastPracticed: last,
          totalTime: filtered.length * 8,
          priority: ann?.priority,
          tags: ann?.tags ?? [],
          note: ann?.note,
          window: windowFrom(filtered),
        });
      }
    }
  }

  // Chord Recognition — walk the existing chordQualities seed. The
  // seed's `tier` field already groups qualities pedagogically —
  // foundational triads → sevenths → dominants → extensions — so we
  // surface those as the sub-category labels directly. We sort by
  // tier rank before emitting so the grouped view preserves the
  // pedagogical ordering (Dexie's toArray is id-ordered, which
  // doesn't line up).
  {
    const chords = await db.chordQualities.toArray();
    const tierRank: Record<string, number> = {
      foundational: 0, seventh: 1, dominant: 2, extensions: 3,
    };
    chords.sort((a, b) => (tierRank[a.tier] ?? 99) - (tierRank[b.tier] ?? 99));
    const { label, route } = moduleMeta('chord-recognition');
    const mod = byModule.get('chord-recognition') ?? new Map();
    for (const c of chords) {
      const skillId = canonicalSkillId('chord-recognition', 'item', c.id);
      const ann = annotationById.get(skillId);
      const bucket = mod.get(c.id) ?? [];
      const { tier, last } = tierForAttempts(bucket, now);
      records.push({
        skillId,
        moduleId: 'chord-recognition',
        moduleLabel: label,
        moduleRoute: route,
        itemId: c.id,
        name: ann?.customName ?? c.name,
        category: chordTierLabel(c.tier),
        skillType: 'ear',
        currentTier: tier,
        freshness: freshnessFrom(last),
        daysSince: daysSinceOf(last, now),
        lastPracticed: last,
        totalTime: bucket.length * 8,
        priority: ann?.priority,
        tags: ann?.tags ?? [],
        note: ann?.note,
        window: windowFrom(bucket),
      });
    }
  }

  // Chord Progressions — emit in Key Detection → Chord Motion →
  // Full Progression order so the Catalogue's grouped view mirrors
  // the module's tab order exactly.
  {
    const { label, route } = moduleMeta('chord-progressions');
    const mod = byModule.get('chord-progressions') ?? new Map();

    // Key Detection — 12 pitch classes, concept-level.
    for (const k of KEY_DETECTION_CATALOG) {
      const skillId = canonicalSkillId('chord-progressions', 'key-detection', k.id);
      const ann = annotationById.get(skillId);
      records.push({
        skillId,
        moduleId: 'chord-progressions',
        moduleLabel: label,
        moduleRoute: route,
        moduleJumpQuery: 'tab=key-detection',
        itemId: k.id,
        name: ann?.customName ?? k.label,
        category: 'Key Detection',
        skillType: 'ear',
        currentTier: null,
        freshness: freshnessFrom(null),
        daysSince: null,
        lastPracticed: null,
        totalTime: 0,
        priority: ann?.priority,
        tags: ann?.tags ?? [],
        note: ann?.note,
        // Concept entry — the Key Detection tab logs no per-key
        // attempts, so there are no reps to strip. Not "none yet".
        window: [],
      });
    }

    // Chord Motion — 12 named motions, concept-level.
    for (const motion of CHORD_MOTION_CATALOG) {
      const skillId = canonicalSkillId('chord-progressions', 'motion', motion.id);
      const ann = annotationById.get(skillId);
      records.push({
        skillId,
        moduleId: 'chord-progressions',
        moduleLabel: label,
        moduleRoute: route,
        moduleJumpQuery: 'tab=chord-motion',
        itemId: motion.id,
        name: ann?.customName ?? motion.label,
        category: 'Chord Motion',
        skillType: 'ear',
        currentTier: null,
        freshness: freshnessFrom(null),
        daysSince: null,
        lastPracticed: null,
        totalTime: 0,
        priority: ann?.priority,
        tags: ann?.tags ?? [],
        note: ann?.note,
        // Concept entry — the Chord Motion tab logs no per-motion
        // attempts. Not "none yet".
        window: [],
      });
    }

    // Full Progression — tier tracking from the real quiz attempts.
    for (const p of PROGRESSIONS) {
      const skillId = canonicalSkillId('chord-progressions', 'item', p.id);
      const ann = annotationById.get(skillId);
      const bucket = mod.get(p.id) ?? [];
      const { tier, last } = tierForAttempts(bucket, now);
      records.push({
        skillId,
        moduleId: 'chord-progressions',
        moduleLabel: label,
        moduleRoute: route,
        moduleJumpQuery: 'tab=full-progression',
        itemId: p.id,
        name: ann?.customName ?? p.name,
        category: 'Full Progression',
        skillType: 'ear',
        currentTier: tier,
        freshness: freshnessFrom(last),
        daysSince: daysSinceOf(last, now),
        lastPracticed: last,
        totalTime: bucket.length * 10,
        priority: ann?.priority,
        tags: ann?.tags ?? [],
        note: ann?.note,
        window: windowFrom(bucket),
      });
    }
  }

  // Scales & Modes — split the 7 church modes from the harmonic /
  // melodic minor variants so users can scan the two families
  // separately in the Catalogue.
  {
    const { label, route } = moduleMeta('scales-modes');
    const mod = byModule.get('scales-modes') ?? new Map();
    for (const m of MODES) {
      const skillId = canonicalSkillId('scales-modes', 'mode', m.id);
      const ann = annotationById.get(skillId);
      const bucket = mod.get(m.id) ?? [];
      const { tier, last } = tierForAttempts(bucket, now);
      records.push({
        skillId,
        moduleId: 'scales-modes',
        moduleLabel: label,
        moduleRoute: route,
        itemId: m.id,
        name: ann?.customName ?? m.name,
        category: modeCategoryLabel(m.id),
        skillType: 'ear',
        currentTier: tier,
        freshness: freshnessFrom(last),
        daysSince: daysSinceOf(last, now),
        lastPracticed: last,
        totalTime: bucket.length * 10,
        priority: ann?.priority,
        tags: ann?.tags ?? [],
        note: ann?.note,
        window: windowFrom(bucket),
      });
    }
  }

  // --- Reading -----------------------------------------------------
  // The module the registry never walked. Rows and coordinates come
  // from `reading/skillRecords.ts`, because the ref grammar belongs to
  // reading and the registry must not learn it.
  {
    const { label, route } = moduleMeta('reading');
    const byRef = bucketReadingAttempts(attempts);
    for (const row of readingSkillRows()) {
      const bucket = byRef.get(row.itemRef) ?? [];
      const skillId = canonicalSkillId('reading', row.skill, row.itemRef);
      const ann = annotationById.get(skillId);
      const { tier, last } = tierForAttempts(bucket, now);
      records.push({
        skillId,
        moduleId: 'reading',
        moduleLabel: label,
        moduleRoute: route,
        itemId: row.itemRef,
        name: ann?.customName ?? row.name,
        category: row.category,
        skillType: 'theory',
        currentTier: tier,
        freshness: freshnessFrom(last),
        daysSince: daysSinceOf(last, now),
        lastPracticed: last,
        totalTime: bucket.length * 6,
        priority: ann?.priority,
        tags: ann?.tags ?? [],
        note: ann?.note,
        window: windowFrom(bucket),
        axis: row.axis,
      });
    }
  }

  // --- Song Repertoire (flat list — no sub-sections for now) ------
  // Songs live in a single "Songs" category so the Catalogue renders
  // one flat list per module directive. Stage data is still carried
  // as auto-tags + on the skill's currentTier mapping so filters /
  // detail view can read it; the Catalogue just doesn't visually
  // group by stage. Want-to-Learn entries are deliberately not
  // enumerated as Catalogue skills — they live in the Repertoire
  // module's own Want-to-Learn tab until promoted.
  {
    const { label, route } = moduleMeta('repertoire');
    const logs = await db.songPracticeLog.toArray();
    const latestBySong = new Map<string, { ts: number; minutes: number }>();
    for (const log of logs) {
      const existing = latestBySong.get(log.songId);
      if (!existing) {
        latestBySong.set(log.songId, { ts: log.timestamp, minutes: log.durationMin });
      } else {
        latestBySong.set(log.songId, {
          ts: Math.max(existing.ts, log.timestamp),
          minutes: existing.minutes + log.durationMin,
        });
      }
    }
    for (const song of songs) {
      const skillId = canonicalSkillId('repertoire', 'song', song.id);
      const ann = annotationById.get(skillId);
      const agg = latestBySong.get(song.id);
      const stageTag = song.stage ? `stage:${song.stage}` : undefined;
      const genreTag = song.genre ? `genre:${song.genre.toLowerCase()}` : undefined;
      const autoTags = [stageTag, genreTag].filter((t): t is string => Boolean(t));
      records.push({
        skillId,
        moduleId: 'repertoire',
        moduleLabel: label,
        moduleRoute: route,
        itemId: song.id,
        name: ann?.customName ?? `${song.title} — ${song.artist}`,
        category: 'Songs',
        skillType: 'song',
        // Songs track via stage progression, not rolling tier.
        currentTier: mapStageToTier(song),
        freshness: freshnessFrom(agg?.ts ?? null),
        daysSince: daysSinceOf(agg?.ts ?? null, now),
        lastPracticed: agg?.ts ?? null,
        totalTime: Math.round((agg?.minutes ?? 0) * 60),
        priority: ann?.priority,
        tags: mergeTags(ann?.tags, autoTags),
        note: ann?.note,
      // Not attempt-shaped: a song is stage-tracked, not repped.
      window: [],
      });
    }
  }

  // --- Shapes & Patterns drill skills ------------------------------
  // Catalog-driven enumeration — the Catalogue shows EVERY scale /
  // chord-shape / voice-leading drill that CAN be practised, whether
  // or not the user has materialised a DrillSkill row for it yet.
  // When a DrillSkill *has* been materialised, we join its DrillType
  // rows to surface real practice stats. Sub-sections emit in the
  // module's tab order: Scale Drills → Chord Shape Drills →
  // Voice-Leading Drills → Mental Visualisation.
  {
    const { label, route } = moduleMeta('shapes-and-patterns');

    // Index existing DrillSkills by their natural key so we can
    // locate them without N queries per lookup. Each kind uses a
    // distinct composite key because the schema varies.
    const chordShapeIdx = new Map<string, DrillSkill>();
    const scaleIdx = new Map<string, DrillSkill>();
    const voiceLeadingIdx = new Map<string, DrillSkill>();
    const mentalVizIdx = new Map<string, DrillSkill>();
    for (const s of drillSkills) {
      if (s.kind === 'chord-shape' && s.keyName && s.quality) {
        chordShapeIdx.set(`${s.keyName}:${s.quality}`, s);
      } else if (s.kind === 'scale' && s.keyName && s.scale) {
        scaleIdx.set(`${s.keyName}:${s.scale}`, s);
      } else if (s.kind === 'voice-leading' && s.keyName && s.patternId) {
        voiceLeadingIdx.set(`${s.patternId}:${s.keyName}`, s);
      } else if (s.kind === 'mental-viz' && s.variant) {
        mentalVizIdx.set(s.variant, s);
      }
    }

    const typesBySkill = new Map<string, DrillType[]>();
    for (const t of drillTypes) {
      const arr = typesBySkill.get(t.skillId) ?? [];
      arr.push(t);
      typesBySkill.set(t.skillId, arr);
    }

    // Small helper — aggregates a materialized DrillSkill's types
    // into (totalTime, lastPracticed). Returns zeros when nothing
    // materialised yet.
    const aggregate = (existing: DrillSkill | undefined) => {
      if (!existing) return { total: 0, last: null as number | null };
      const ts = typesBySkill.get(existing.id) ?? [];
      let total = 0;
      let last: number | null = null;
      for (const t of ts) {
        total += t.totalSeconds;
        if (t.lastPracticedAt !== null && (last === null || t.lastPracticedAt > last)) {
          last = t.lastPracticedAt;
        }
      }
      return { total, last };
    };

    // --- Scale Drills --------------------------------------------
    // 24 scales total (12 major + 12 natural minor). Split into two
    // sibling Catalogue categories so the sub-section breakdown
    // matches the module's own organisation.
    for (const scale of SCALES) {
      for (const k of SHAPES_KEYS) {
        const skillId = canonicalSkillId('shapes-and-patterns', 'scale', `${scale.id}:${k}`);
        const ann = annotationById.get(skillId);
        const existing = scaleIdx.get(`${k}:${scale.id}`);
        const { total, last } = aggregate(existing);
        records.push({
          skillId,
          moduleId: 'shapes-and-patterns',
          moduleLabel: label,
          moduleRoute: route,
          moduleJumpQuery: 'tab=scales',
          itemId: `${scale.id}:${k}`,
          name: ann?.customName ?? `${k} ${scale.label}`,
          category: scale.id === 'major'
            ? 'Scale Drills · Major'
            : 'Scale Drills · Natural Minor',
          skillType: 'physical-scale',
          currentTier: null,
          freshness: freshnessFrom(last),
          daysSince: daysSinceOf(last, now),
          lastPracticed: last,
          totalTime: total,
          priority: ann?.priority,
          tags: ann?.tags ?? [],
          note: ann?.note,
          // Not attempt-shaped: shapes read DrillType rows.
          window: [],
        });
      }
    }

    // --- Chord Shape Drills --------------------------------------
    // 29 qualities × 12 keys = 348 entries. Iterate qualities in
    // catalog order (triads → sevenths → extensions → specials)
    // and keys in standard order so insertion order is stable.
    for (const q of CHORD_QUALITIES) {
      for (const k of SHAPES_KEYS) {
        const skillId = canonicalSkillId('shapes-and-patterns', 'chord-shape', `${q.id}:${k}`);
        const ann = annotationById.get(skillId);
        const existing = chordShapeIdx.get(`${k}:${q.id}`);
        const { total, last } = aggregate(existing);
        records.push({
          skillId,
          moduleId: 'shapes-and-patterns',
          moduleLabel: label,
          moduleRoute: route,
          moduleJumpQuery: 'tab=chord-shapes',
          itemId: `${q.id}:${k}`,
          name: ann?.customName ?? `${k}${q.suffix} (${q.label.toLowerCase()})`,
          category: 'Chord Shape Drills',
          skillType: 'physical-chord-shape',
          currentTier: null,
          freshness: freshnessFrom(last),
          daysSince: daysSinceOf(last, now),
          lastPracticed: last,
          totalTime: total,
          priority: ann?.priority,
          tags: ann?.tags ?? [],
          note: ann?.note,
          // Not attempt-shaped: shapes read DrillType rows.
          window: [],
        });
      }
    }

    // --- Voice-Leading Drills ------------------------------------
    // 3 patterns × 12 keys = 36 entries.
    for (const pattern of VOICE_LEADING_PATTERNS) {
      for (const k of SHAPES_KEYS) {
        const skillId = canonicalSkillId('shapes-and-patterns', 'voice-leading', `${pattern.id}:${k}`);
        const ann = annotationById.get(skillId);
        const existing = voiceLeadingIdx.get(`${pattern.id}:${k}`);
        const { total, last } = aggregate(existing);
        records.push({
          skillId,
          moduleId: 'shapes-and-patterns',
          moduleLabel: label,
          moduleRoute: route,
          moduleJumpQuery: 'tab=voice-leading',
          itemId: `${pattern.id}:${k}`,
          name: ann?.customName ?? `${pattern.label} in ${k}`,
          category: 'Voice-Leading Drills',
          skillType: 'physical-voice-leading',
          currentTier: null,
          freshness: freshnessFrom(last),
          daysSince: daysSinceOf(last, now),
          lastPracticed: last,
          totalTime: total,
          priority: ann?.priority,
          tags: ann?.tags ?? [],
          note: ann?.note,
          // Not attempt-shaped: shapes read DrillType rows.
          window: [],
        });
      }
    }

    // --- Mental Visualisation ------------------------------------
    // Only the two supported variants (ghost-keyboard was retired).
    // If a user previously materialised ghost-keyboard, those orphan
    // rows are filtered here; MENTAL_VIZ_VARIANTS is the source of
    // truth.
    for (const variant of MENTAL_VIZ_VARIANTS) {
      const skillId = canonicalSkillId('shapes-and-patterns', 'mental-viz', variant.id);
      const ann = annotationById.get(skillId);
      const existing = mentalVizIdx.get(variant.id);
      const { total, last } = aggregate(existing);
      records.push({
        skillId,
        moduleId: 'shapes-and-patterns',
        moduleLabel: label,
        moduleRoute: route,
        moduleJumpQuery: 'tab=mental-viz',
        itemId: variant.id,
        name: ann?.customName ?? variant.label,
        category: 'Mental Visualisation',
        skillType: 'physical-mental-viz',
        currentTier: null,
        freshness: freshnessFrom(last),
        daysSince: daysSinceOf(last, now),
        lastPracticed: last,
        totalTime: total,
        priority: ann?.priority,
        tags: ann?.tags ?? [],
        note: ann?.note,
        // Not attempt-shaped: shapes read DrillType rows.
        window: [],
      });
    }
  }

  // --- Production ---------------------------------------------------
  // Each Phase-1 lesson surfaces as a trackable skill with tier
  // derived from its five-step self-rating. Glossary terms are reference
  // lookups rather than practised skills, so they stay inside the
  // Production module's own Glossary view (with "got it" tracking)
  // and are intentionally NOT enumerated here. A future "glossary
  // flashcards" activity will re-introduce term-level skills when
  // that becomes a practised drill.
  {
    const { label, route } = moduleMeta('production');
    const lessonStateById = new Map<string, ProductionLesson>();
    for (const l of productionLessons) lessonStateById.set(l.id, l);

    for (const lesson of PRODUCTION_LESSONS) {
      const state = lessonStateById.get(lesson.id);
      const rating: ProductionLessonRating = state?.rating ?? 0;
      const lastPracticed = state?.lastOpenedAt ?? null;
      const path = pathById(lesson.pathId);
      const skillId = canonicalSkillId('production', 'lesson', lesson.id);
      const ann = annotationById.get(skillId);
      records.push({
        skillId,
        moduleId: 'production',
        moduleLabel: label,
        moduleRoute: route,
        moduleJumpQuery: `lesson=${lesson.id}`,
        itemId: lesson.id,
        name: ann?.customName ?? lesson.title,
        category: path ? path.title : 'Production',
        skillType: 'production',
        currentTier: mapProductionRating(rating),
        freshness: freshnessFrom(lastPracticed),
        daysSince: daysSinceOf(lastPracticed, now),
        lastPracticed,
        totalTime: 0,
        priority: ann?.priority,
        tags: ann?.tags ?? [],
        note: ann?.note,
      // Not attempt-shaped: a lesson carries a self-rating, not reps.
      window: [],
      });
    }
  }

  return records;
}

/**
 * Map the five-step lesson rating onto the shared Tier vocabulary
 * used across the catalogue.
 *
 * 'fluent' lands on "tried it" (75) — the same line STAGE_FOR_RATING
 * treats as covered — so a lesson reads as practised in the skills
 * grid exactly when it counts toward a coverage goal. The two reading
 * surfaces must not disagree about what "done" means.
 *
 * Both reading steps collapse to 'developing': the Tier vocabulary
 * has no rung between untouched and practised, and inventing one here
 * would put a distinction in the catalogue that no other module has.
 */
function mapProductionRating(rating: ProductionLessonRating): Tier {
  if (rating >= 100) return 'mastered';
  if (rating >= COVERAGE_RATING) return 'fluent';
  if (rating > 0) return 'developing';
  return 'untouched';
}

function mapStageToTier(song: Song): Tier {
  // Read through normaliseStage: legacy rows may still hold the
  // retired 'maintenance' string, which collapses onto internalized —
  // where this mapping already sent it, so nothing moves tier.
  switch (normaliseStage(song.stage)) {
    case 'internalized':
      return 'mastered';
    case 'cross-key':
      return 'fluent';
    case 'comfortable':
      return 'developing';
    case 'learning':
    default:
      return 'needsWork';
  }
}

function mergeTags(userTags: string[] | undefined, autoTags: string[]): string[] {
  const set = new Set<string>();
  if (userTags) for (const t of userTags) set.add(t);
  for (const t of autoTags) set.add(t);
  return [...set];
}

/** Sub-category label for Chord Recognition — mirrors the
 *  pedagogical tier ordering in the module's seed catalog. */
function chordTierLabel(tier: string): string {
  switch (tier) {
    case 'foundational': return 'Foundational Triads';
    case 'seventh':      return 'Seventh Chords';
    case 'dominant':     return 'Dominant Variants';
    case 'extensions':   return 'Extensions & Colors';
    default:             return tier || 'Chord Qualities';
  }
}

/** Sub-category label for Scales & Modes — seven modes vs the
 *  minor-scale variants (harmonic / melodic minor). */
function modeCategoryLabel(modeId: string): string {
  if (modeId === 'harmonic-minor' || modeId === 'melodic-minor') {
    return 'Minor Scale Variants';
  }
  return 'Modes';
}

// --- Annotation read/write -----------------------------------------

export async function upsertAnnotation(
  skillId: string,
  patch: Partial<Omit<SkillAnnotation, 'skillId' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  const now = Date.now();
  const existing = await db.skillAnnotations.get(skillId);
  if (existing) {
    await db.skillAnnotations.put({
      ...existing,
      ...patch,
      tags: patch.tags ?? existing.tags,
      skillId,
      updatedAt: now,
    });
  } else {
    await db.skillAnnotations.put({
      skillId,
      tags: [],
      createdAt: now,
      updatedAt: now,
      ...patch,
    });
  }
}

// --- Aggregate views -----------------------------------------------

export interface TierDistribution {
  mastered: number;
  fluent: number;
  developing: number;
  needsWork: number;
  stale: number;
  untouched: number;
  total: number;
}

export function tierDistribution(records: SkillRecord[]): TierDistribution {
  const d: TierDistribution = {
    mastered: 0, fluent: 0, developing: 0, needsWork: 0, stale: 0, untouched: 0, total: 0,
  };
  for (const r of records) {
    d.total += 1;
    const t = r.currentTier;
    if (t === null) continue;
    switch (t) {
      case 'mastered':  d.mastered += 1; break;
      case 'fluent':    d.fluent += 1; break;
      case 'developing':d.developing += 1; break;
      case 'needsWork': d.needsWork += 1; break;
      case 'stale':     d.stale += 1; break;
      case 'untouched': d.untouched += 1; break;
    }
  }
  return d;
}

export interface PerModuleSummary {
  moduleId: string;
  moduleLabel: string;
  moduleRoute: string;
  count: number;
  distribution: TierDistribution;
  lastPracticed: number | null;
}

export function summariseByModule(records: SkillRecord[]): PerModuleSummary[] {
  const byModule = new Map<string, SkillRecord[]>();
  for (const r of records) {
    const arr = byModule.get(r.moduleId) ?? [];
    arr.push(r);
    byModule.set(r.moduleId, arr);
  }
  const out: PerModuleSummary[] = [];
  for (const [moduleId, group] of byModule.entries()) {
    const first = group[0];
    let lastPracticed: number | null = null;
    for (const r of group) {
      if (r.lastPracticed !== null && (lastPracticed === null || r.lastPracticed > lastPracticed)) {
        lastPracticed = r.lastPracticed;
      }
    }
    out.push({
      moduleId,
      moduleLabel: first.moduleLabel,
      moduleRoute: first.moduleRoute,
      count: group.length,
      distribution: tierDistribution(group),
      lastPracticed,
    });
  }
  // Sort modules by the pedagogical order used throughout the app.
  // Harmonic Fluency → Ear Training submodules → Shapes & Patterns
  // → Repertoire → Production. Submodules of Ear Training sort
  // immediately after Harmonic Fluency.
  const order = [
    'harmonic-fluency',
    'intervals',
    'chord-recognition',
    'chord-progressions',
    'scales-modes',
    'shapes-and-patterns',
    'repertoire',
    'production',
  ];
  out.sort((a, b) => order.indexOf(a.moduleId) - order.indexOf(b.moduleId));
  return out;
}

/** Pick the top N skills whose tier + freshness combination deserves
 *  attention — surfaces weak-spot and going-stale items on the
 *  Skills Catalogue summary view. */
export function pickAttentionItems(records: SkillRecord[], limit: number): SkillRecord[] {
  const scored = records
    .map(r => ({ r, score: attentionScore(r) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(x => x.r);
}

function attentionScore(r: SkillRecord): number {
  let s = 0;
  if (r.currentTier === 'needsWork') s += 3;
  if (r.currentTier === 'developing') s += 1.5;
  if (r.currentTier === 'stale') s += 2.5;
  if (r.freshness === 'stale') s += 1.5;
  if (r.freshness === 'aging') s += 0.7;
  if (r.priority === 'deep') s += 1;
  if (r.currentTier === 'mastered') s -= 2; // mastered rarely needs attention
  return s;
}

/** Pick top N fluent/mastered skills the user has practised recently
 *  — feeds the "strong spots" card on the summary view. */
export function pickStrongSpots(records: SkillRecord[], limit: number): SkillRecord[] {
  return records
    .filter(r =>
      (r.currentTier === 'mastered' || r.currentTier === 'fluent') &&
      (r.freshness === 'fresh' || r.freshness === 'recent'),
    )
    .sort((a, b) => (b.lastPracticed ?? 0) - (a.lastPracticed ?? 0))
    .slice(0, limit);
}

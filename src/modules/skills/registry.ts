import {
  db,
  type AttemptRecord,
  type DrillSkill,
  type DrillType,
  type FlashcardState,
  type SkillAnnotation,
  type SkillType,
  type SkillPriority,
  type Song,
} from '../../lib/db';
import { computeTier, type Tier } from '../../lib/tier';
import { CATEGORY_LABELS, FLASHCARDS } from '../harmonic-fluency/catalog';
import { INTERVAL_SEEDS } from '../ear-training/intervals/seed';
import { MODES } from '../ear-training/scales-modes/catalog';
import { PROGRESSIONS } from '../ear-training/chord-progressions/catalog';
import { freshnessTier, type FreshnessTier } from '../shapes-and-patterns/drillModel';

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
}

function freshnessFrom(ts: number | null): FreshnessTier {
  return freshnessTier(ts);
}

function daysSinceOf(ts: number | null, now: number): number | null {
  if (ts === null) return null;
  return Math.floor((now - ts) / DAY_MS);
}

// --- Tier computation (reused across ear-training modules) ----------

function tierForAttempts(attempts: AttemptRecord[], now: number): { tier: Tier; last: number | null } {
  if (attempts.length === 0) return { tier: 'untouched', last: null };
  const sorted = [...attempts].sort((a, b) => b.timestamp - a.timestamp);
  const window = sorted.filter(a => !a.excludeFromFluency).slice(0, TIER_WINDOW);
  const correct = window.filter(a => a.correct).length;
  const daysSince = Math.floor((now - sorted[0].timestamp) / DAY_MS);
  const tier = computeTier({
    windowCorrect: correct,
    windowTotal: window.length,
    daysSinceLastAttempt: daysSince,
  });
  return { tier, last: sorted[0].timestamp };
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
  ] = await Promise.all([
    db.attempts.toArray(),
    db.flashcardStates.toArray(),
    db.songs.toArray(),
    db.drillSkills.toArray(),
    db.drillTypes.toArray(),
    db.skillAnnotations.toArray(),
  ]);

  const annotationById = new Map<string, SkillAnnotation>();
  for (const a of annotations) annotationById.set(a.skillId, a);

  const records: SkillRecord[] = [];

  // --- Harmonic Fluency (one skill per flashcard) ------------------
  const stateByCard = new Map<string, FlashcardState>();
  for (const s of flashcardStates) stateByCard.set(s.cardId, s);
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
    });
  }

  // --- Ear Training — per-item tiers from attempts -----------------
  const byModule = new Map<string, Map<string, AttemptRecord[]>>();
  for (const a of attempts) {
    const mod = byModule.get(a.moduleId) ?? new Map<string, AttemptRecord[]>();
    const arr = mod.get(a.itemId) ?? [];
    arr.push(a);
    mod.set(a.itemId, arr);
    byModule.set(a.moduleId, mod);
  }

  // Intervals — catalog is fixed. Produce separate asc / desc skill
  // rows because ear-training treats them as distinct (attempts
  // carry a `direction` field) and the diary wants per-direction
  // associations ("Ascending major 3rd: …" vs "Descending minor 6th: …").
  {
    const { label, route } = moduleMeta('intervals');
    const mod = byModule.get('intervals') ?? new Map();
    for (const seed of INTERVAL_SEEDS) {
      const bucket: AttemptRecord[] = mod.get(seed.id) ?? [];
      for (const dir of ['asc', 'desc'] as const) {
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
          category: 'Interval',
          skillType: 'ear',
          currentTier: tier,
          freshness: freshnessFrom(last),
          daysSince: daysSinceOf(last, now),
          lastPracticed: last,
          totalTime: filtered.length * 8,
          priority: ann?.priority,
          tags: ann?.tags ?? [],
          note: ann?.note,
        });
      }
    }
  }

  // Chord Recognition — walk the existing chordQualities seed.
  {
    const chords = await db.chordQualities.toArray();
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
        category: 'Chord quality',
        skillType: 'ear',
        currentTier: tier,
        freshness: freshnessFrom(last),
        daysSince: daysSinceOf(last, now),
        lastPracticed: last,
        totalTime: bucket.length * 8,
        priority: ann?.priority,
        tags: ann?.tags ?? [],
        note: ann?.note,
      });
    }
  }

  // Chord Progressions — the catalog's PROGRESSIONS list.
  {
    const { label, route } = moduleMeta('chord-progressions');
    const mod = byModule.get('chord-progressions') ?? new Map();
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
        category: 'Progression',
        skillType: 'ear',
        currentTier: tier,
        freshness: freshnessFrom(last),
        daysSince: daysSinceOf(last, now),
        lastPracticed: last,
        totalTime: bucket.length * 10,
        priority: ann?.priority,
        tags: ann?.tags ?? [],
        note: ann?.note,
      });
    }
  }

  // Chord motions — concept-level skills (no attempts today; they
  // sit under the Chord Progressions module so users drill them
  // inside the Chord Motion tab). Each carries a diary starter, so
  // including them here lets the Catalogue surface them as real
  // searchable skills rather than ghosts in the diary.
  {
    const { label, route } = moduleMeta('chord-progressions');
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
        category: 'Chord motion',
        skillType: 'ear',
        currentTier: null,
        freshness: freshnessFrom(null),
        daysSince: null,
        lastPracticed: null,
        totalTime: 0,
        priority: ann?.priority,
        tags: ann?.tags ?? [],
        note: ann?.note,
      });
    }
  }

  // Scales & Modes
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
        category: 'Mode',
        skillType: 'ear',
        currentTier: tier,
        freshness: freshnessFrom(last),
        daysSince: daysSinceOf(last, now),
        lastPracticed: last,
        totalTime: bucket.length * 10,
        priority: ann?.priority,
        tags: ann?.tags ?? [],
        note: ann?.note,
      });
    }
  }

  // --- Song Repertoire (one skill per song) ------------------------
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
        category: song.genre ? `Song · ${song.genre}` : 'Song',
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
      });
    }
  }

  // --- Shapes & Patterns drill skills ------------------------------
  {
    const { label, route } = moduleMeta('shapes-and-patterns');
    const typesBySkill = new Map<string, DrillType[]>();
    for (const t of drillTypes) {
      const arr = typesBySkill.get(t.skillId) ?? [];
      arr.push(t);
      typesBySkill.set(t.skillId, arr);
    }
    for (const skill of drillSkills) {
      const skillId = canonicalSkillId('shapes-and-patterns', skill.kind, skill.id);
      const ann = annotationById.get(skillId);
      const ts = typesBySkill.get(skill.id) ?? [];
      let total = 0;
      let last: number | null = null;
      for (const t of ts) {
        total += t.totalSeconds;
        if (t.lastPracticedAt !== null && (last === null || t.lastPracticedAt > last)) {
          last = t.lastPracticedAt;
        }
      }
      records.push({
        skillId,
        moduleId: 'shapes-and-patterns',
        moduleLabel: label,
        moduleRoute: route,
        moduleJumpQuery: `tab=${drillKindToTab(skill.kind)}`,
        itemId: skill.id,
        name: ann?.customName ?? skill.label ?? 'drill skill',
        category: drillKindCategory(skill.kind),
        skillType: drillKindToSkillType(skill.kind),
        currentTier: null,
        freshness: freshnessFrom(last),
        daysSince: daysSinceOf(last, now),
        lastPracticed: last,
        totalTime: total,
        priority: ann?.priority,
        tags: ann?.tags ?? [],
        note: ann?.note,
      });
    }
  }

  return records;
}

function mapStageToTier(song: Song): Tier {
  switch (song.stage) {
    case 'maintenance':
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

function drillKindCategory(kind: DrillSkill['kind']): string {
  switch (kind) {
    case 'chord-shape':  return 'Chord shape';
    case 'scale':        return 'Scale';
    case 'voice-leading':return 'Voice-leading';
    case 'mental-viz':   return 'Mental visualisation';
  }
}

function drillKindToSkillType(kind: DrillSkill['kind']): SkillType {
  switch (kind) {
    case 'chord-shape':  return 'physical-chord-shape';
    case 'scale':        return 'physical-scale';
    case 'voice-leading':return 'physical-voice-leading';
    case 'mental-viz':   return 'physical-mental-viz';
  }
}

function drillKindToTab(kind: DrillSkill['kind']): string {
  switch (kind) {
    case 'chord-shape':  return 'chord-shapes';
    case 'scale':        return 'scales';
    case 'voice-leading':return 'voice-leading';
    case 'mental-viz':   return 'mental-viz';
  }
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
  // Sort modules by the navigation order.
  const order = [
    'harmonic-fluency',
    'intervals',
    'chord-recognition',
    'chord-progressions',
    'scales-modes',
    'repertoire',
    'shapes-and-patterns',
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

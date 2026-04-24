import { db, type AttemptRecord, type FlashcardState, type SongPracticeLog } from '../../lib/db';
import { computeTier, type Tier } from '../../lib/tier';
import { localDayKey } from '../../lib/dailyGoal';
import {
  defaultDailyGoal,
} from '../../lib/goalConfig';
import { FLASHCARDS } from '../harmonic-fluency/catalog';
import { freshnessTier, aggregateCell } from '../shapes-and-patterns/drillModel';
import { PRODUCTION_LESSONS } from '../production/content/lessons';
import { GLOSSARY } from '../production/content/glossary';

// Rolling-window size for tier calculations — matches what quiz modules use.
const TIER_WINDOW = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

// --- Module fluency snapshots --------------------------------------

export interface TierCounts {
  mastered: number;
  fluent: number;
  developing: number;
  needsWork: number;
  stale: number;
  untouched: number;
  total: number;
}

function emptyCounts(): TierCounts {
  return { mastered: 0, fluent: 0, developing: 0, needsWork: 0, stale: 0, untouched: 0, total: 0 };
}

/**
 * Group attempts by itemId and compute the tier for each using the
 * rolling-window rules defined in src/lib/tier.ts. Matches what the
 * module-level fluency trackers do internally, so dashboard numbers
 * agree with the per-module views. Attempts flagged
 * `excludeFromFluency` are ignored — they shouldn't skew tier
 * classifications.
 */
function tierCountsFromAttempts(attempts: AttemptRecord[], now: number = Date.now()): TierCounts {
  const byItem = new Map<string, AttemptRecord[]>();
  for (const a of attempts) {
    if (a.excludeFromFluency) continue;
    const bucket = byItem.get(a.itemId) ?? [];
    bucket.push(a);
    byItem.set(a.itemId, bucket);
  }
  const counts = emptyCounts();
  for (const bucket of byItem.values()) {
    bucket.sort((a, b) => b.timestamp - a.timestamp);
    const window = bucket.slice(0, TIER_WINDOW);
    const correct = window.filter(a => a.correct).length;
    const lastTs = bucket[0].timestamp;
    const daysSince = Math.floor((now - lastTs) / DAY_MS);
    const tier = computeTier({
      windowCorrect: correct,
      windowTotal: window.length,
      daysSinceLastAttempt: daysSince,
    });
    bumpTier(counts, tier);
  }
  return counts;
}

function bumpTier(counts: TierCounts, tier: Tier) {
  counts.total += 1;
  switch (tier) {
    case 'mastered':  counts.mastered += 1;  break;
    case 'fluent':    counts.fluent += 1;    break;
    case 'developing':counts.developing += 1;break;
    case 'needsWork': counts.needsWork += 1; break;
    case 'stale':     counts.stale += 1;     break;
    case 'untouched': counts.untouched += 1; break;
  }
}

export interface ModuleSnapshot {
  moduleId: string;
  label: string;
  route: string;
  counts: TierCounts;
  attemptsToday: number;
  dailyGoal: number;
  goalMet: boolean;
  /** Days since last attempt; null if never practised. */
  lastPracticedDaysAgo: number | null;
}

interface ModuleDef {
  moduleId: string;
  label: string;
  route: string;
}

const EAR_TRAINING_MODULES: ModuleDef[] = [
  { moduleId: 'intervals',          label: 'intervals',           route: '/ear-training/intervals' },
  { moduleId: 'chord-recognition',  label: 'chord recognition',   route: '/ear-training/chord-recognition' },
  { moduleId: 'chord-progressions', label: 'chord progressions',  route: '/ear-training/chord-progressions' },
  { moduleId: 'scales-modes',       label: 'scales & modes',      route: '/ear-training/scales-modes' },
];

/**
 * Snapshot every quiz-style module in one sweep. Walks `db.attempts`
 * grouped by `moduleId` — one read total — and fans out into per-
 * module tier counts + today's counts + last-practised timestamps.
 */
export async function snapshotEarTrainingModules(): Promise<ModuleSnapshot[]> {
  const today = localDayKey();
  const startOfToday = (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  })();

  const allAttempts = await db.attempts.toArray();
  const byModule = new Map<string, AttemptRecord[]>();
  for (const a of allAttempts) {
    const arr = byModule.get(a.moduleId) ?? [];
    arr.push(a);
    byModule.set(a.moduleId, arr);
  }

  const snapshots: ModuleSnapshot[] = [];
  for (const mod of EAR_TRAINING_MODULES) {
    const attempts = byModule.get(mod.moduleId) ?? [];
    const counts = tierCountsFromAttempts(attempts);
    const attemptsToday = attempts.filter(a => a.timestamp >= startOfToday).length;
    const goal = await readDailyGoal(mod.moduleId);
    const latest = attempts.reduce<number | null>(
      (acc, a) => (acc === null || a.timestamp > acc ? a.timestamp : acc),
      null,
    );
    snapshots.push({
      ...mod,
      counts,
      attemptsToday,
      dailyGoal: goal,
      goalMet: attemptsToday >= goal,
      lastPracticedDaysAgo: latest === null
        ? null
        : Math.max(0, daysBetweenKeys(localDayKey(new Date(latest)), today)),
    });
  }
  return snapshots;
}

function daysBetweenKeys(olderKey: string, newerKey: string): number {
  const [y1, m1, d1] = olderKey.split('-').map(Number);
  const [y2, m2, d2] = newerKey.split('-').map(Number);
  const a = new Date(y1, m1 - 1, d1).getTime();
  const b = new Date(y2, m2 - 1, d2).getTime();
  return Math.round((b - a) / DAY_MS);
}

async function readDailyGoal(moduleId: string): Promise<number> {
  const key = `dailyGoal${pascal(moduleId)}`;
  const row = await db.userPrefs.get(key);
  if (row && typeof row.value === 'number' && Number.isFinite(row.value)) {
    return row.value;
  }
  return defaultDailyGoal(moduleId);
}

function pascal(s: string): string {
  return s.split('-').map(p => p ? p.charAt(0).toUpperCase() + p.slice(1) : '').join('');
}

// --- Harmonic Fluency snapshot -------------------------------------

export interface HarmonicFluencySnapshot {
  counts: TierCounts;
  attemptsToday: number;
  dailyGoal: number;
  goalMet: boolean;
  lastPracticedDaysAgo: number | null;
}

/**
 * Harmonic Fluency tier counts computed from `flashcardStates` rather
 * than `attempts`. The module uses SM-2 spacing and tracks per-card
 * totals on the state row, so we can cheaply reconstruct the same
 * tier verdict the UI shows.
 */
export async function snapshotHarmonicFluency(): Promise<HarmonicFluencySnapshot> {
  const today = localDayKey();
  const startOfToday = (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  })();
  const [states, attemptsToday] = await Promise.all([
    db.flashcardStates.toArray(),
    db.attempts
      .where('moduleId').equals('harmonic-fluency')
      .and(a => a.timestamp >= startOfToday)
      .count(),
  ]);

  const byId = new Map<string, FlashcardState>();
  for (const s of states) byId.set(s.cardId, s);

  const now = Date.now();
  const counts = emptyCounts();
  for (const card of FLASHCARDS) {
    const state = byId.get(card.id);
    if (!state) {
      bumpTier(counts, 'untouched');
      continue;
    }
    const windowTotal = Math.min(TIER_WINDOW, state.totalAttempts);
    // Approximate: assume recent-window accuracy ≈ overall accuracy when
    // totalAttempts is small; for >= TIER_WINDOW attempts the proxy is
    // close enough for dashboard aggregation (module view recomputes
    // from `attempts` with higher fidelity).
    const accuracy = state.totalAttempts > 0 ? state.totalCorrect / state.totalAttempts : 0;
    const windowCorrect = Math.round(accuracy * windowTotal);
    const daysSince = Math.floor((now - state.lastReviewed) / DAY_MS);
    const tier = computeTier({
      windowCorrect,
      windowTotal,
      daysSinceLastAttempt: state.lastReviewed ? daysSince : null,
    });
    bumpTier(counts, tier);
  }

  const latestReview = states.reduce<number | null>(
    (acc, s) => (acc === null || s.lastReviewed > acc ? s.lastReviewed : acc),
    null,
  );
  const goal = await readDailyGoal('harmonic-fluency');
  return {
    counts,
    attemptsToday,
    dailyGoal: goal,
    goalMet: attemptsToday >= goal,
    lastPracticedDaysAgo: latestReview === null
      ? null
      : Math.max(0, daysBetweenKeys(localDayKey(new Date(latestReview)), today)),
  };
}

// --- Shapes & Patterns snapshot ------------------------------------

export interface ShapesSnapshot {
  /** Total seconds drilled in past 30 days, weighted 2x for past 7. */
  weightedRecentSeconds: number;
  /** Count of skills with any drill activity ever. */
  skillsTouched: number;
  /** Count of skills whose drill-type coverage is imbalanced (one type
   *  dominates). Surfaces in the attention list. */
  imbalancedSkills: number;
  /** Last-practised timestamp across all drill sessions, or null. */
  lastPracticedAt: number | null;
  /** Imbalanced skill details for the attention list. Up to 5 entries. */
  imbalanceHints: Array<{ skillId: string; label: string }>;
}

export async function snapshotShapesAndPatterns(now: number = Date.now()): Promise<ShapesSnapshot> {
  const weekAgo = now - 7 * DAY_MS;
  const monthAgo = now - 30 * DAY_MS;

  const [sessions, types, skills] = await Promise.all([
    db.drillSessions.where('timestamp').above(monthAgo).toArray(),
    db.drillTypes.toArray(),
    db.drillSkills.toArray(),
  ]);

  let weightedSeconds = 0;
  const skillsWithActivity = new Set<string>();
  let lastAt: number | null = null;
  for (const s of sessions) {
    const isRecent7 = s.timestamp >= weekAgo;
    weightedSeconds += s.durationSeconds * (isRecent7 ? 2 : 1);
    skillsWithActivity.add(s.skillId);
    if (lastAt === null || s.timestamp > lastAt) lastAt = s.timestamp;
  }

  // Imbalance per skill — aggregate its types.
  const typesBySkill = new Map<string, typeof types>();
  for (const t of types) {
    const arr = typesBySkill.get(t.skillId) ?? [];
    arr.push(t);
    typesBySkill.set(t.skillId, arr);
  }
  const imbalanceHints: ShapesSnapshot['imbalanceHints'] = [];
  for (const skill of skills) {
    const ts = typesBySkill.get(skill.id) ?? [];
    const agg = aggregateCell(ts);
    if (agg.imbalanced) {
      imbalanceHints.push({ skillId: skill.id, label: skill.label ?? 'a drill skill' });
    }
  }

  return {
    weightedRecentSeconds: weightedSeconds,
    skillsTouched: skillsWithActivity.size,
    imbalancedSkills: imbalanceHints.length,
    lastPracticedAt: lastAt,
    imbalanceHints: imbalanceHints.slice(0, 5),
  };
}

// --- Repertoire snapshot -------------------------------------------

export interface RepertoireSnapshot {
  /** Count of songs per stage (including null = 'learning' default). */
  byStage: Record<string, number>;
  /** Past-30-day practice minutes weighted 2x for past 7. */
  weightedRecentMinutes: number;
  /** Last-practised timestamp across all repertoire, or null. */
  lastPracticedAt: number | null;
  /** Songs whose freshness is 'aging' or 'stale' (worth revisiting). */
  goingStale: Array<{ songId: string; title: string; artist: string; daysSince: number }>;
  /** Performance-ready songs (Internalized / Maintenance stage). */
  performanceReady: Array<{ songId: string; title: string; artist: string }>;
}

export async function snapshotRepertoire(now: number = Date.now()): Promise<RepertoireSnapshot> {
  const weekAgo = now - 7 * DAY_MS;
  const monthAgo = now - 30 * DAY_MS;

  const [songs, logs] = await Promise.all([
    db.songs.toArray(),
    db.songPracticeLog.where('timestamp').above(monthAgo).toArray(),
  ]);

  const byStage: Record<string, number> = {};
  const performanceReady: RepertoireSnapshot['performanceReady'] = [];
  for (const song of songs) {
    const stage = song.stage ?? 'learning';
    byStage[stage] = (byStage[stage] ?? 0) + 1;
    if (stage === 'internalized' || stage === 'maintenance' || stage === 'cross-key') {
      performanceReady.push({ songId: song.id, title: song.title, artist: song.artist });
    }
  }

  let weightedMinutes = 0;
  let lastAt: number | null = null;
  const latestBySong = new Map<string, SongPracticeLog>();
  for (const log of logs) {
    const isRecent7 = log.timestamp >= weekAgo;
    weightedMinutes += log.durationMin * (isRecent7 ? 2 : 1);
    if (lastAt === null || log.timestamp > lastAt) lastAt = log.timestamp;
    const existing = latestBySong.get(log.songId);
    if (!existing || log.timestamp > existing.timestamp) {
      latestBySong.set(log.songId, log);
    }
  }

  // Going stale: songs with `stage` active (not just 'maintenance') whose
  // latest log is older than 10 days (aging) or no recent log at all.
  const goingStale: RepertoireSnapshot['goingStale'] = [];
  for (const song of songs) {
    if (song.stage === 'maintenance') continue;
    const latestLog = latestBySong.get(song.id);
    const lastTs = latestLog?.timestamp ?? null;
    const tier = freshnessTier(lastTs);
    if (tier === 'aging' || tier === 'stale') {
      const days = lastTs === null
        ? Infinity
        : Math.max(0, Math.floor((now - lastTs) / DAY_MS));
      goingStale.push({ songId: song.id, title: song.title, artist: song.artist, daysSince: days });
    }
  }
  goingStale.sort((a, b) => b.daysSince - a.daysSince);

  return {
    byStage,
    weightedRecentMinutes: weightedMinutes,
    lastPracticedAt: lastAt,
    goingStale: goingStale.slice(0, 5),
    performanceReady,
  };
}

// --- Creative snapshot (thin re-export so Dashboard can use one import) --

export { aggregateCreativeStats } from '../creative/engine';

// --- Consistency & streak ------------------------------------------

export interface ConsistencyStats {
  /** Unique practice days in the past 14. */
  recentPracticeDays: number;
  /** Unique practice days this week (past 7). */
  weekPracticeDays: number;
  /** Current day streak — consecutive days ending today/yesterday
   *  with at least one tracked practice event. */
  dayStreak: number;
  /** Total minutes of tracked practice today. Rough — 8s per ear-
   *  training attempt + actual seconds for drill/song/creative. */
  todayMinutes: number;
}

export async function consistencySnapshot(now: number = Date.now()): Promise<ConsistencyStats> {
  const startOfToday = (() => {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  })();
  const twoWeeksAgo = now - 14 * DAY_MS;
  const weekAgo = now - 7 * DAY_MS;

  const [attempts, drillSessions, songLogs, creatives] = await Promise.all([
    db.attempts.where('timestamp').above(twoWeeksAgo).toArray(),
    db.drillSessions.where('timestamp').above(twoWeeksAgo).toArray(),
    db.songPracticeLog.where('timestamp').above(twoWeeksAgo).toArray(),
    db.creativeSessions.where('timestamp').above(twoWeeksAgo).toArray(),
  ]);

  const allDays = new Set<string>();
  const weekDays = new Set<string>();
  const addDay = (ts: number) => {
    const key = localDayKey(new Date(ts));
    allDays.add(key);
    if (ts >= weekAgo) weekDays.add(key);
  };
  for (const a of attempts) addDay(a.timestamp);
  for (const d of drillSessions) addDay(d.timestamp);
  for (const s of songLogs) addDay(s.timestamp);
  for (const c of creatives) addDay(c.timestamp);

  // Day streak — walk back from today until we hit a non-practiced day.
  // If today has no activity, allow the streak to still be alive ending
  // at yesterday (so the counter doesn't drop to zero mid-morning).
  let streak = 0;
  let cursor = localDayKey(new Date(now));
  if (!allDays.has(cursor)) {
    cursor = previousDayKey(cursor);
  }
  while (allDays.has(cursor)) {
    streak += 1;
    cursor = previousDayKey(cursor);
  }

  // Today minutes: 8s/attempt is a rough proxy (attempts don't store
  // duration); drills, songs, and creatives carry real seconds/minutes.
  let todaySeconds = 0;
  for (const a of attempts) if (a.timestamp >= startOfToday) todaySeconds += 8;
  for (const d of drillSessions) if (d.timestamp >= startOfToday) todaySeconds += d.durationSeconds;
  for (const s of songLogs) if (s.timestamp >= startOfToday) todaySeconds += s.durationMin * 60;
  for (const c of creatives) if (c.timestamp >= startOfToday) todaySeconds += c.durationSeconds;

  return {
    recentPracticeDays: allDays.size,
    weekPracticeDays: weekDays.size,
    dayStreak: streak,
    todayMinutes: Math.round(todaySeconds / 60),
  };
}

function previousDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const prev = new Date(y, m - 1, d - 1);
  return localDayKey(prev);
}

// --- Musician Balance radar ----------------------------------------

export interface MusicianBalance {
  theoretical: number;
  physical: number;
  musical: number;
  creative: number;
  consistency: number;
  /** One-sentence driver explanation per dimension. */
  drivers: Record<keyof MusicianBalanceValues, string>;
  /** Suggested action per dimension (CTA text). */
  suggestions: Record<keyof MusicianBalanceValues, string>;
}

type MusicianBalanceValues = Pick<MusicianBalance, 'theoretical' | 'physical' | 'musical' | 'creative' | 'consistency'>;

// Targets calibrated for "a 100 score feels earned". Anything above the
// target caps at 100 — overshoot just tells you you're exceeding the
// goal for that dimension.
const TARGET_EAR_ATTEMPTS_PER_WINDOW = 400;   // ~13/day over 30d weighted
const TARGET_PHYSICAL_SECONDS = 30 * 60 * 6;  // ~6 drill sessions of 30min weighted
const TARGET_MUSICAL_MINUTES = 300;           // ~10min/day × 30d weighted
const TARGET_CREATIVE_SECONDS = 30 * 60 * 4;  // ~4 sessions of 30min weighted

function clamp01To100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 100)));
}

export async function musicianBalance(now: number = Date.now()): Promise<MusicianBalance> {
  const weekAgo = now - 7 * DAY_MS;
  const monthAgo = now - 30 * DAY_MS;

  const [attempts, drillSessions, songLogs, creatives] = await Promise.all([
    db.attempts.where('timestamp').above(monthAgo).toArray(),
    db.drillSessions.where('timestamp').above(monthAgo).toArray(),
    db.songPracticeLog.where('timestamp').above(monthAgo).toArray(),
    db.creativeSessions.where('timestamp').above(monthAgo).toArray(),
  ]);

  // Theoretical = weighted attempts (ear + harmonic fluency).
  let weightedAttempts = 0;
  for (const a of attempts) {
    weightedAttempts += a.timestamp >= weekAgo ? 2 : 1;
  }
  const theoretical = clamp01To100(weightedAttempts / TARGET_EAR_ATTEMPTS_PER_WINDOW);

  // Physical = weighted drill seconds.
  let weightedPhysicalSec = 0;
  for (const d of drillSessions) {
    weightedPhysicalSec += d.durationSeconds * (d.timestamp >= weekAgo ? 2 : 1);
  }
  const physical = clamp01To100(weightedPhysicalSec / TARGET_PHYSICAL_SECONDS);

  // Musical = weighted song-practice minutes.
  let weightedMusicalMin = 0;
  for (const s of songLogs) {
    weightedMusicalMin += s.durationMin * (s.timestamp >= weekAgo ? 2 : 1);
  }
  const musical = clamp01To100(weightedMusicalMin / TARGET_MUSICAL_MINUTES);

  // Creative = weighted creative seconds.
  let weightedCreativeSec = 0;
  for (const c of creatives) {
    weightedCreativeSec += c.durationSeconds * (c.timestamp >= weekAgo ? 2 : 1);
  }
  const creative = clamp01To100(weightedCreativeSec / TARGET_CREATIVE_SECONDS);

  // Consistency = unique practice days in past 14 / 14.
  const twoWeeksAgo = now - 14 * DAY_MS;
  const days = new Set<string>();
  for (const a of attempts) if (a.timestamp >= twoWeeksAgo) days.add(localDayKey(new Date(a.timestamp)));
  for (const d of drillSessions) if (d.timestamp >= twoWeeksAgo) days.add(localDayKey(new Date(d.timestamp)));
  for (const s of songLogs) if (s.timestamp >= twoWeeksAgo) days.add(localDayKey(new Date(s.timestamp)));
  for (const c of creatives) if (c.timestamp >= twoWeeksAgo) days.add(localDayKey(new Date(c.timestamp)));
  const consistency = clamp01To100(days.size / 14);

  const drivers: MusicianBalance['drivers'] = {
    theoretical: `${Math.round(weightedAttempts)} weighted ear-training reps in the last 30 days (2× for the past week).`,
    physical:    `${Math.round(weightedPhysicalSec / 60)} weighted drill minutes across Shapes & Patterns.`,
    musical:     `${Math.round(weightedMusicalMin)} weighted minutes practising repertoire.`,
    creative:    `${Math.round(weightedCreativeSec / 60)} weighted minutes of Just Play / Just Produce.`,
    consistency: `${days.size} unique practice days in the last 14.`,
  };
  const suggestions: MusicianBalance['suggestions'] = {
    theoretical: 'drill 10 ear-training reps this morning',
    physical:    'queue a quick chord-shape drill',
    musical:     'pull up a song from your repertoire',
    creative:    'log 10 minutes of just play',
    consistency: 'a short session today keeps the streak alive',
  };

  return { theoretical, physical, musical, creative, consistency, drivers, suggestions };
}

// --- Top-level combined snapshot -----------------------------------

export interface ProductionSnapshot {
  totalLessons: number;
  completed: number;
  inProgress: number;
  glossaryGotIt: number;
  glossaryTotal: number;
}

export interface DashboardData {
  earTraining: ModuleSnapshot[];
  harmonicFluency: HarmonicFluencySnapshot;
  shapes: ShapesSnapshot;
  repertoire: RepertoireSnapshot;
  production: ProductionSnapshot;
  consistency: ConsistencyStats;
  balance: MusicianBalance;
}

export async function gatherDashboardData(): Promise<DashboardData> {
  const [earTraining, harmonicFluency, shapes, repertoire, production, consistency, balance] = await Promise.all([
    snapshotEarTrainingModules(),
    snapshotHarmonicFluency(),
    snapshotShapesAndPatterns(),
    snapshotRepertoire(),
    snapshotProduction(),
    consistencySnapshot(),
    musicianBalance(),
  ]);
  return { earTraining, harmonicFluency, shapes, repertoire, production, consistency, balance };
}

async function snapshotProduction(): Promise<ProductionSnapshot> {
  const [lessons, terms] = await Promise.all([
    db.productionLessons.toArray(),
    db.glossaryTermStates.toArray(),
  ]);
  const totalLessons = PRODUCTION_LESSONS.length;
  let completed = 0;
  let inProgress = 0;
  for (const l of lessons) {
    if (l.mastery === 'completed' || l.mastery === 'mastered') completed += 1;
    else if (l.mastery === 'in-progress') inProgress += 1;
  }
  const glossaryGotIt = terms.filter(t => t.mastery === 'got-it').length;
  return {
    totalLessons,
    completed,
    inProgress,
    glossaryGotIt,
    glossaryTotal: GLOSSARY.length,
  };
}

// --- Formatting helpers --------------------------------------------

export function formatMinutes(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatHumanAgo(ts: number | null, now: number = Date.now()): string {
  if (ts === null) return 'never';
  const days = Math.floor((now - ts) / DAY_MS);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
  return `${Math.floor(days / 30)} month${days < 60 ? '' : 's'} ago`;
}

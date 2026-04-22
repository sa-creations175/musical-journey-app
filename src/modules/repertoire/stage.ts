import type { RepertoireStage, SongPracticeLog } from '../../lib/db';

// Ordered so indexOf() gives each stage a natural rank, and the next
// stage above any given one is just STAGES[indexOf(stage)+1].
export const STAGES: RepertoireStage[] = [
  'learning',
  'comfortable',
  'internalized',
  'cross-key',
  'maintenance',
];

export const STAGE_LABEL: Record<RepertoireStage, string> = {
  'learning': 'Learning',
  'comfortable': 'Comfortable',
  'internalized': 'Internalized',
  'cross-key': 'Cross-key',
  'maintenance': 'Maintenance',
};

/** Short two-to-three-word tagline shown beside the stage badge. */
export const STAGE_TAGLINE: Record<RepertoireStage, string> = {
  'learning': 'building the shape',
  'comfortable': 'smoothing the flow',
  'internalized': 'owning the song',
  'cross-key': 'stretching across keys',
  'maintenance': 'keeping it warm',
};

/** Multi-sentence coaching guidance shown on Song Detail and as a
 *  tooltip on Active Repertoire. Tone is coaching, not nagging. */
export const STAGE_GUIDANCE: Record<RepertoireStage, string> = {
  'learning':
    'Focus on accuracy at slow tempo. Break sections apart. Aim for clean play-throughs before increasing tempo.',
  'comfortable':
    'Work at or near target tempo. Smooth flow across sections. Make sure transitions are seamless.',
  'internalized':
    'Maintain through regular replay. Explore voicings and small variations. Begin exploring emotional expression.',
  'cross-key':
    'Take sections through other keys. Start with 5ths up/down and relative minor. Build understanding, not just finger patterns.',
  'maintenance':
    'Light-touch replay every 1–2 weeks. Keep the song at your fingertips for any performance moment.',
};

/** Tailwind badge classes. Reuses the established tier palette so the
 *  Repertoire badges feel visually related to Ear Training's tier pills.
 *  "Maintenance" borrows the info-blue because it reads as "steady"
 *  rather than "needs work". */
export const STAGE_BADGE_CLASS: Record<RepertoireStage, string> = {
  'learning': 'bg-needswork/10 text-needswork border-needswork/30',
  'comfortable': 'bg-developing/10 text-developing border-developing/30',
  'internalized': 'bg-fluent/10 text-fluent border-fluent/30',
  'cross-key': 'bg-mastered/10 text-mastered border-mastered/30',
  'maintenance': 'bg-info/10 text-info border-info/30',
};

export const STAGE_DOT_CLASS: Record<RepertoireStage, string> = {
  'learning': 'bg-needswork',
  'comfortable': 'bg-developing',
  'internalized': 'bg-fluent',
  'cross-key': 'bg-mastered',
  'maintenance': 'bg-info',
};

/** Default stage for newly-seeded / newly-added songs. */
export const DEFAULT_STAGE: RepertoireStage = 'learning';

export function nextStage(stage: RepertoireStage): RepertoireStage | null {
  const idx = STAGES.indexOf(stage);
  if (idx < 0 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1];
}

// --- Advancement suggestions ----------------------------------------

// System-suggested stage advancement — soft nudges only. User always
// has the final word via the "Advance stage" button.
//
// Criteria:
//   Learning → Comfortable:
//     5+ sessions marked at target tempo with feel ≥ 3.
//   Comfortable → Internalized:
//     3+ weeks of recent practice (≥1 session in last 7 days) with
//     average feel ≥ 4 across the last 5+ sessions.
//   Internalized → Cross-key:
//     ≥2 non-original keys practised on at least 1 section.
//   Cross-key → Maintenance:
//     ≥6 distinct keys covered across at least 3 different sections.

export interface AdvancementEvaluation {
  /** True when the criteria for advancing from `currentStage` are met. */
  suggest: boolean;
  /** Short reason shown beside the suggestion ("5 sessions at target
   *  tempo — consider advancing to Comfortable"). */
  reason?: string;
}

export interface AdvancementInputs {
  currentStage: RepertoireStage;
  logs: SongPracticeLog[];
  /** Home/original key for this song. Used by Internalized → Cross-key
   *  to count *non-original* keys. */
  originalKey?: string;
  /** Per-section cross-key coverage — from songCrossKeyProgress. */
  crossKeyPairs: Array<{ sectionId: string; keyName: string; sessionCount: number }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function evaluateAdvancement(input: AdvancementInputs): AdvancementEvaluation {
  switch (input.currentStage) {
    case 'learning': {
      const qualifying = input.logs.filter(
        l => l.atTargetTempo === true && l.feelRating >= 3,
      ).length;
      if (qualifying >= 5) {
        return {
          suggest: true,
          reason: `${qualifying} sessions at target tempo — consider advancing to Comfortable.`,
        };
      }
      return { suggest: false };
    }
    case 'comfortable': {
      const now = Date.now();
      const weekAgo = now - 7 * DAY_MS;
      const recentSessions = input.logs.filter(l => l.timestamp >= weekAgo);
      if (recentSessions.length === 0) return { suggest: false };
      const byWeek = new Map<number, SongPracticeLog[]>();
      for (const log of input.logs) {
        const weekStart = Math.floor(log.timestamp / (7 * DAY_MS));
        const arr = byWeek.get(weekStart) ?? [];
        arr.push(log);
        byWeek.set(weekStart, arr);
      }
      const recentEnough = [...byWeek.keys()]
        .filter(w => w * 7 * DAY_MS >= now - 21 * DAY_MS).length;
      const last5 = [...input.logs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
      const avgFeel = last5.length === 0
        ? 0
        : last5.reduce((s, l) => s + l.feelRating, 0) / last5.length;
      if (recentEnough >= 3 && avgFeel >= 4 && last5.length >= 5) {
        return {
          suggest: true,
          reason: `3+ weeks of practice with feel ≥ 4 — consider advancing to Internalized.`,
        };
      }
      return { suggest: false };
    }
    case 'internalized': {
      const nonOriginal = new Set<string>();
      for (const p of input.crossKeyPairs) {
        if (p.sessionCount <= 0) continue;
        if (input.originalKey && p.keyName === input.originalKey) continue;
        nonOriginal.add(p.keyName);
      }
      if (nonOriginal.size >= 2) {
        return {
          suggest: true,
          reason: `${nonOriginal.size} non-original keys touched — consider advancing to Cross-key.`,
        };
      }
      return { suggest: false };
    }
    case 'cross-key': {
      const sectionsByKey = new Set<string>();
      const keysTouched = new Set<string>();
      for (const p of input.crossKeyPairs) {
        if (p.sessionCount <= 0) continue;
        sectionsByKey.add(p.sectionId);
        keysTouched.add(p.keyName);
      }
      if (keysTouched.size >= 6 && sectionsByKey.size >= 3) {
        return {
          suggest: true,
          reason: `${keysTouched.size} keys across ${sectionsByKey.size} sections — consider advancing to Maintenance.`,
        };
      }
      return { suggest: false };
    }
    case 'maintenance':
      return { suggest: false };
  }
}

// --- Freshness (practice recency) -----------------------------------

export type Freshness = 'fresh' | 'recent' | 'aging' | 'stale';

export const FRESHNESS_DOT_CLASS: Record<Freshness, string> = {
  fresh: 'bg-fluent',
  recent: 'bg-developing',
  aging: 'bg-[#E88943]', // orange between amber and red
  stale: 'bg-needswork',
};

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: 'last 3 days',
  recent: '4–10 days ago',
  aging: '11–20 days ago',
  stale: '20+ days ago',
};

export function freshnessFor(lastPracticedAt: number | null): Freshness {
  if (lastPracticedAt === null) return 'stale';
  const daysAgo = (Date.now() - lastPracticedAt) / DAY_MS;
  if (daysAgo <= 3) return 'fresh';
  if (daysAgo <= 10) return 'recent';
  if (daysAgo <= 20) return 'aging';
  return 'stale';
}

export function daysSince(timestamp: number | null): number | null {
  if (timestamp === null) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / DAY_MS));
}

/** Human-friendly "today" / "yesterday" / "N days ago" / "never". */
export function humanAgo(timestamp: number | null): string {
  if (timestamp === null) return 'never';
  const days = daysSince(timestamp) ?? 0;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

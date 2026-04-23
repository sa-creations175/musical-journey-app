import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DrillSession, type DrillSkill, type DrillType } from '../../lib/db';
import { localDayKey, startOfLocalDay } from '../../lib/dailyGoal';
import {
  aggregateCell,
  formatDuration,
  humanAgo,
} from './drillModel';

const MS_24H = 24 * 60 * 60 * 1000;

/**
 * Top-of-module "today" summary strip + "what needs attention"
 * recommendations. Recommendations draw from two buckets:
 *   · going-stale: cells with meaningful investment (>= 5 min) whose
 *                  freshness has decayed past 20 days.
 *   · incomplete: cells flagged as imbalanced (a drill type lags
 *                  significantly vs its siblings).
 */
export default function TodayAndAttention() {
  const allSkills = useLiveQuery<DrillSkill[]>(() => db.drillSkills.toArray(), []) ?? [];
  const allTypes = useLiveQuery<DrillType[]>(() => db.drillTypes.toArray(), []) ?? [];
  const todayStart = startOfLocalDay();
  const todaysSessions = useLiveQuery<DrillSession[]>(
    () => db.drillSessions
      .where('timestamp').aboveOrEqual(todayStart)
      .toArray(),
    [todayStart],
  ) ?? [];

  const today = useMemo(() => {
    const drillsCompleted = todaysSessions.length;
    const minutes = Math.round(todaysSessions.reduce((s, r) => s + r.durationSeconds, 0) / 60);
    return { drillsCompleted, minutes };
  }, [todaysSessions]);

  const recommendations = useMemo(() => {
    // Build per-skill aggregates.
    const typesBySkill = new Map<string, DrillType[]>();
    for (const t of allTypes) {
      const arr = typesBySkill.get(t.skillId) ?? [];
      arr.push(t);
      typesBySkill.set(t.skillId, arr);
    }
    const candidates: Array<{
      skill: DrillSkill;
      reason: 'going-stale' | 'incomplete';
      message: string;
      daysSince: number | null;
    }> = [];
    for (const skill of allSkills) {
      const types = typesBySkill.get(skill.id) ?? [];
      if (types.length === 0) continue;
      const agg = aggregateCell(types);
      if (agg.totalSeconds < 5 * 60) continue; // Needs real investment to flag.
      const daysSince = agg.lastPracticedAt === null
        ? null
        : Math.floor((Date.now() - agg.lastPracticedAt) / MS_24H);
      if (daysSince !== null && daysSince >= 20) {
        candidates.push({
          skill,
          reason: 'going-stale',
          message: `${skill.label ?? 'Skill'} is going stale — last practised ${humanAgo(agg.lastPracticedAt)}.`,
          daysSince,
        });
      } else if (agg.imbalanced) {
        // Find the under-practised type to name it in the recommendation.
        const top = Math.max(...types.map(t => t.totalSeconds));
        const laggard = types.find(t => t.totalSeconds < top * 0.3 && t.totalSeconds < 600);
        if (laggard) {
          candidates.push({
            skill,
            reason: 'incomplete',
            message: `${skill.label ?? 'Skill'} · "${laggard.name}" is under-practised (${formatDuration(laggard.totalSeconds)} vs ${formatDuration(top)} on other drills).`,
            daysSince,
          });
        }
      }
    }
    // Prioritise going-stale cells by how long they've been idle, then
    // imbalance. Cap at 5 items — long lists feel like nagging.
    candidates.sort((a, b) => {
      if (a.reason !== b.reason) return a.reason === 'going-stale' ? -1 : 1;
      const ad = a.daysSince ?? 0;
      const bd = b.daysSince ?? 0;
      return bd - ad;
    });
    return candidates.slice(0, 5);
  }, [allSkills, allTypes]);

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-4">
      {/* Today summary */}
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-medium tracking-tight">today's drilling</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            no daily goal here — this module is about ongoing accumulation.
          </p>
        </div>
        <div className="text-sm text-neutral-700 dark:text-neutral-200">
          {today.drillsCompleted === 0 ? (
            <span className="text-neutral-500 italic">no drills completed yet</span>
          ) : (
            <>
              <span className="font-mono tabular-nums font-medium">{today.drillsCompleted}</span>{' '}
              drill{today.drillsCompleted === 1 ? '' : 's'}
              <span className="text-neutral-400 mx-1.5">·</span>
              <span className="font-mono tabular-nums font-medium">{today.minutes}</span>{' '}
              min{today.minutes === 1 ? '' : 's'} of practice
              <span className="text-neutral-400 ml-1.5">({localDayKey()})</span>
            </>
          )}
        </div>
      </div>

      {/* Attention recommendations */}
      {recommendations.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium">
            what needs attention
          </h3>
          <ul className="space-y-1">
            {recommendations.map((r, i) => (
              <li
                key={`${r.skill.id}-${i}`}
                className={`text-sm rounded-md border px-3 py-2 inline-flex items-start gap-2 ${
                  r.reason === 'going-stale'
                    ? 'border-needswork/40 bg-needswork/5 text-neutral-700 dark:text-neutral-200'
                    : 'border-developing/40 bg-developing/5 text-neutral-700 dark:text-neutral-200'
                }`}
              >
                <span aria-hidden className="shrink-0">
                  {r.reason === 'going-stale' ? '⏳' : '⚖️'}
                </span>
                <span>{r.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

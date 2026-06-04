import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DrillSkill, type DrillType } from '../../lib/db';
import {
  aggregateCell,
  formatDuration,
  humanAgo,
} from './drillModel';

const MS_24H = 24 * 60 * 60 * 1000;

/**
 * "What needs attention" recommendations for the S&P module. Two
 * buckets:
 *   · going-stale: cells with meaningful investment (>= 5 min) whose
 *                  freshness has decayed past 20 days.
 *   · incomplete: cells flagged as imbalanced (a drill type lags
 *                  significantly vs its siblings).
 *
 * The old "today's drilling" summary strip was removed — it carried no
 * actionable signal (no daily goal exists for this module). When there
 * are no recommendations this renders nothing rather than an empty card.
 */
export default function TodayAndAttention() {
  const allSkills = useLiveQuery<DrillSkill[]>(() => db.drillSkills.toArray(), []) ?? [];
  const allTypes = useLiveQuery<DrillType[]>(() => db.drillTypes.toArray(), []) ?? [];

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

  // Nothing actionable → render nothing (no empty card).
  if (recommendations.length === 0) return null;

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5">
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
    </section>
  );
}

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DrillSkill, type DrillType } from '../../lib/db';
import { MENTAL_VIZ_VARIANTS } from './catalog';
import {
  findOrCreateSkill,
  formatDuration,
  humanAgo,
} from './drillModel';
import DrillListModal from './DrillListModal';

/**
 * Mental-visualisation activity area. No heat grid here — these are
 * away-from-keyboard cognitive drills, not key-pinned. Each variant
 * surfaces as a large card with cumulative stats + "open drills".
 */
export default function MentalVizDrills() {
  const [openSkill, setOpenSkill] = useState<DrillSkill | null>(null);
  const skills = useLiveQuery<DrillSkill[]>(
    () => db.drillSkills.where('kind').equals('mental-viz').toArray(),
    [],
  ) ?? [];
  const allTypes = useLiveQuery<DrillType[]>(() => db.drillTypes.toArray(), []) ?? [];

  const statsFor = (skillId: string) => {
    const types = allTypes.filter(t => t.skillId === skillId);
    let totalSeconds = 0;
    let reps = 0;
    let last: number | null = null;
    for (const t of types) {
      totalSeconds += t.totalSeconds;
      reps += t.repCount;
      if (t.lastPracticedAt !== null && (last === null || t.lastPracticedAt > last)) {
        last = t.lastPracticedAt;
      }
    }
    return { totalSeconds, reps, last };
  };

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-4">
      <div>
        <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          mental visualisation drills
        </h3>
        <p className="text-xs text-neutral-500 mt-0.5">
          away-from-keyboard drills for chord shapes and inversions. practise at a desk, on a walk, or in bed.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {MENTAL_VIZ_VARIANTS.map(v => {
          const skill = skills.find(s => s.variant === v.id);
          const stats = skill ? statsFor(skill.id) : null;
          return (
            <article
              key={v.id}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 flex flex-col gap-2 hover:border-fluent/40 transition"
            >
              <div className="font-medium text-sm">{v.label}</div>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-snug">
                {v.description}
              </p>
              <div className="text-[11px] text-neutral-500">
                {stats === null || stats.reps === 0 ? (
                  <span className="italic">not practised yet</span>
                ) : (
                  <>
                    <span className="font-mono tabular-nums">{stats.reps}</span> rep{stats.reps === 1 ? '' : 's'}
                    <span className="text-neutral-400 mx-1.5">·</span>
                    <span className="font-mono tabular-nums">{formatDuration(stats.totalSeconds)}</span>
                    <span className="text-neutral-400 mx-1.5">·</span>
                    last {humanAgo(stats.last)}
                  </>
                )}
              </div>
              <button
                onClick={async () => {
                  const s = await findOrCreateSkill({ kind: 'mental-viz', variant: v.id });
                  setOpenSkill(s);
                }}
                className="px-3 py-1.5 rounded-md border border-fluent text-fluent text-xs font-medium hover:bg-fluent/10 self-start"
              >
                open drills
              </button>
            </article>
          );
        })}
      </div>

      {openSkill && (
        <DrillListModal skill={openSkill} onClose={() => setOpenSkill(null)} />
      )}
    </section>
  );
}

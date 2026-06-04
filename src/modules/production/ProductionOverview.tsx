import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ProductionLessonMastery } from '../../lib/db';
import { PRODUCTION_PATHS } from './content/paths';
import { lessonById, lessonsByPath, PRODUCTION_LESSONS } from './content/lessons';
import { GLOSSARY } from './content/glossary';

interface Props {
  onOpenPath: (pathId: string) => void;
  onOpenLesson: (lessonId: string) => void;
  onOpenGlossary: () => void;
  onOpenReferenceTracks: () => void;
  onOpenVocabulary: () => void;
}

const MASTERY_DOT: Record<ProductionLessonMastery, string> = {
  'not-started': 'bg-neutral-200 dark:bg-neutral-700',
  'in-progress': 'bg-developing',
  'completed':   'bg-fluent',
  'mastered':    'bg-mastered',
};

/**
 * Production module landing view. Three rails: a stats strip,
 * per-path progress cards, and "recent lessons" (most recently
 * opened). The content is real — Phase-1 paths get live progress,
 * Phase-2 paths render as disabled placeholders.
 */
export default function ProductionOverview({
  onOpenPath,
  onOpenLesson,
  onOpenGlossary,
  onOpenReferenceTracks,
  onOpenVocabulary,
}: Props) {
  const rawLessonStates = useLiveQuery(async () => db.productionLessons.toArray(), []);
  const rawTermStates = useLiveQuery(async () => db.glossaryTermStates.toArray(), []);
  const lessonStates = useMemo(() => rawLessonStates ?? [], [rawLessonStates]);
  const termStates = useMemo(() => rawTermStates ?? [], [rawTermStates]);
  const refTracks = useLiveQuery(
    async () => db.referenceTracks.filter(r => !r.archived).count(),
    [],
  ) ?? 0;

  const stateById = useMemo(() => {
    const m = new Map<string, typeof lessonStates[number]>();
    for (const s of lessonStates) m.set(s.id, s);
    return m;
  }, [lessonStates]);

  const totals = useMemo(() => {
    const total = PRODUCTION_LESSONS.length;
    let completed = 0;
    let inProgress = 0;
    for (const s of lessonStates) {
      if (s.mastery === 'completed' || s.mastery === 'mastered') completed += 1;
      else if (s.mastery === 'in-progress') inProgress += 1;
    }
    return { total, completed, inProgress };
  }, [lessonStates]);

  const glossaryTotals = useMemo(() => {
    const all = GLOSSARY.length;
    const gotIt = termStates.filter(s => s.mastery === 'got-it').length;
    return { all, gotIt };
  }, [termStates]);

  const recent = useMemo(() => {
    return [...lessonStates]
      .filter(s => s.lastOpenedAt !== null)
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
      .slice(0, 5);
  }, [lessonStates]);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Stats strip */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label="lessons" value={`${totals.completed}/${totals.total}`} accent="text-production" />
        <Stat label="in progress" value={String(totals.inProgress)} />
        <Stat
          label="glossary"
          value={`${glossaryTotals.gotIt}/${glossaryTotals.all}`}
          onClick={onOpenGlossary}
        />
        <Stat
          label="vocabulary"
          value="practice →"
          accent="text-production"
          onClick={onOpenVocabulary}
        />
        <Stat
          label="reference tracks"
          value={String(refTracks)}
          onClick={onOpenReferenceTracks}
        />
      </section>

      {/* Paths */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          the six paths
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {PRODUCTION_PATHS.map(p => {
            const lessons = lessonsByPath(p.id);
            const completed = lessons.filter(l => {
              const m = stateById.get(l.id)?.mastery;
              return m === 'completed' || m === 'mastered';
            }).length;
            const pct = lessons.length === 0 ? 0 : Math.round((completed / lessons.length) * 100);
            const planned = p.status === 'planned';
            return (
              <button
                key={p.id}
                onClick={() => onOpenPath(p.id)}
                className={`text-left rounded-2xl border p-4 transition-colors ${
                  planned
                    ? 'border-neutral-200 dark:border-neutral-800 opacity-60 hover:opacity-80'
                    : 'border-production/30 hover:border-production'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-sm font-medium">{p.title}</span>
                  {planned ? (
                    <span className="text-[10px] uppercase tracking-wide text-neutral-500 border border-neutral-200 dark:border-neutral-700 rounded-full px-2 py-0.5">
                      phase 2
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono tabular-nums text-neutral-500">
                      {completed}/{lessons.length}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500 leading-relaxed line-clamp-2">
                  {p.subtitle}
                </p>
                {!planned && (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <span className="block h-full bg-production" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-neutral-500">{pct}%</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent lessons */}
      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
            recent lessons
          </h2>
          <ul className="rounded-2xl border border-black/[0.07] overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800">
            {recent.map(s => {
              const l = lessonById(s.id);
              if (!l) return null;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => onOpenLesson(l.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-production/5 transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${MASTERY_DOT[s.mastery]}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{l.title}</div>
                      <div className="text-[10px] text-neutral-500 truncate">{l.goal}</div>
                    </div>
                    <span className="text-[10px] text-neutral-400 shrink-0">
                      {formatAgo(s.lastOpenedAt ?? 0)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

// -------------------------------------------------------------------

function Stat({
  label,
  value,
  accent,
  onClick,
}: {
  label: string;
  value: string;
  accent?: string;
  onClick?: () => void;
}) {
  const base = 'rounded-2xl border border-black/[0.07] p-3 text-left';
  const className = onClick
    ? `${base} hover:border-production/60 transition-colors cursor-pointer`
    : base;
  const inner = (
    <>
      <div className={`text-lg font-mono tabular-nums ${accent ?? ''}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mt-0.5">{label}</div>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className={className}>{inner}</button>
  ) : (
    <div className={className}>{inner}</div>
  );
}

function formatAgo(ts: number): string {
  if (!ts) return '';
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}

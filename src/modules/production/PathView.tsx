import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ProductionLessonMastery } from '../../lib/db';
import { lessonsByPath } from './content/lessons';
import { pathById } from './content/paths';

interface Props {
  pathId: string;
  onOpenLesson: (lessonId: string) => void;
  onBack: () => void;
}

const MASTERY_DOT: Record<ProductionLessonMastery, string> = {
  'not-started': 'bg-neutral-200 dark:bg-neutral-700',
  'in-progress': 'bg-developing',
  'completed':   'bg-fluent',
  'mastered':    'bg-mastered',
};

const MASTERY_LABEL: Record<ProductionLessonMastery, string> = {
  'not-started': 'not started',
  'in-progress': 'in progress',
  'completed':   'got it',
  'mastered':    'mastered',
};

/**
 * Lesson list for a single path. Shows each lesson's goal, mastery
 * dot, and revisit count; click to open the LessonView. Stub paths
 * (planned) render a "Coming in Phase 2" placeholder.
 */
export default function PathView({ pathId, onOpenLesson, onBack }: Props) {
  const path = pathById(pathId);
  const lessons = lessonsByPath(pathId);

  const states = useLiveQuery(
    async () => db.productionLessons.where('pathId').equals(pathId).toArray(),
    [pathId],
  ) ?? [];
  const stateById = new Map(states.map(s => [s.id, s]));

  if (!path) {
    return (
      <div className="space-y-3">
        <button onClick={onBack} className="text-xs text-neutral-500 hover:text-fluent">← back</button>
        <p className="text-sm text-neutral-500 italic">path not found.</p>
      </div>
    );
  }

  if (path.status === 'planned') {
    return (
      <div className="space-y-3 max-w-2xl">
        <button onClick={onBack} className="text-xs text-neutral-500 hover:text-production">← back to production</button>
        <h1 className="text-2xl font-medium tracking-tight">{path.title}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 italic">{path.subtitle}</p>
        <div className="rounded-card border border-dashed border-production/40 bg-production/5 p-6 text-sm text-neutral-600 dark:text-neutral-300">
          <p className="font-medium text-production">Coming in Phase 2.</p>
          <p className="mt-2">
            Lessons for this path are planned for the next build. Paths 1, 2, and 3 are live now; this path will follow with full surface + deep dive content.
          </p>
        </div>
      </div>
    );
  }

  const completedCount = states.filter(s => s.mastery === 'completed' || s.mastery === 'mastered').length;
  const progressPct = lessons.length === 0 ? 0 : Math.round((completedCount / lessons.length) * 100);

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <header className="space-y-2">
        <button onClick={onBack} className="text-xs text-neutral-500 hover:text-production">
          ← back to production
        </button>
        <h1 className="text-2xl font-medium tracking-tight">{path.title}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 italic">{path.subtitle}</p>
        <div className="flex items-center gap-3 pt-1">
          <span className="text-[11px] text-neutral-500">
            {completedCount} of {lessons.length} lessons completed
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden max-w-[200px]">
            <span className="block h-full bg-production" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-[11px] font-mono tabular-nums text-neutral-500">{progressPct}%</span>
        </div>
      </header>

      {/* Lesson list */}
      <ul className="rounded-card border border-neutral-200 dark:border-neutral-800 overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800">
        {lessons.map(l => {
          const s = stateById.get(l.id);
          const mastery = (s?.mastery ?? 'not-started') as ProductionLessonMastery;
          const revisits = s?.revisitCount ?? 0;
          return (
            <li key={l.id}>
              <button
                onClick={() => onOpenLesson(l.id)}
                className="w-full grid grid-cols-12 gap-3 items-center px-4 py-3 text-left hover:bg-production/5 transition-colors"
              >
                <span className={`col-span-1 w-2.5 h-2.5 rounded-full shrink-0 ${MASTERY_DOT[mastery]}`} aria-hidden />
                <div className="col-span-8 sm:col-span-9 min-w-0">
                  <div className="text-sm font-medium truncate">
                    <span className="font-mono tabular-nums text-neutral-400 mr-2">{String(l.order).padStart(2, '0')}</span>
                    {l.title}
                  </div>
                  <div className="text-[11px] text-neutral-500 line-clamp-2 mt-0.5">{l.goal}</div>
                </div>
                <div className="col-span-3 sm:col-span-2 text-right">
                  <div className="text-[11px] text-neutral-500">{MASTERY_LABEL[mastery]}</div>
                  {revisits > 0 && (
                    <div className="text-[10px] text-neutral-400">{revisits}× revisit</div>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

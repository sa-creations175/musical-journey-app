import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import CategoryCardGrid from '../../components/moduleHome/CategoryCardGrid';
import ModuleHomeHeader from '../../components/moduleHome/ModuleHomeHeader';
import { lessonById, PRODUCTION_LESSONS } from './content/lessons';
import { GLOSSARY } from './content/glossary';
import { isCovered, isStarted, ratingOption } from './lessonRating';
import {
  PRODUCTION_MODULE_ID,
  VOCABULARY_CARD_KEY,
  isProductionPathKey,
  productionCards,
} from './homeCards';

interface Props {
  onOpenPath: (pathId: string) => void;
  onOpenLesson: (lessonId: string) => void;
  onOpenGlossary: () => void;
  onOpenReferenceTracks: () => void;
  onOpenVocabulary: () => void;
}

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

  const totals = useMemo(() => {
    const total = PRODUCTION_LESSONS.length;
    // Covered = tried it or better. Started = read about, not yet run.
    let covered = 0;
    let started = 0;
    for (const s of lessonStates) {
      if (isCovered(s.rating ?? 0)) covered += 1;
      else if (isStarted(s.rating ?? 0)) started += 1;
    }
    return { total, covered, started };
  }, [lessonStates]);

  const glossaryTotals = useMemo(() => {
    const all = GLOSSARY.length;
    const gotIt = termStates.filter(s => s.mastery === 'got-it').length;
    return { all, gotIt };
  }, [termStates]);

  const attempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(PRODUCTION_MODULE_ID).toArray(),
    [],
  ) ?? [];
  const now = Date.now();
  const cards = useMemo(
    () => productionCards(lessonStates, attempts, now),
    // `now` is deliberately not a dep — freshness moves in days.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessonStates, attempts],
  );

  const recent = useMemo(() => {
    return [...lessonStates]
      .filter(s => s.lastOpenedAt !== null)
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
      .slice(0, 5);
  }, [lessonStates]);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* The flame is true here: vocabulary writes real attempts. */}
      <ModuleHomeHeader
        moduleIds={[PRODUCTION_MODULE_ID]}
        moduleId={PRODUCTION_MODULE_ID}
        calendarTo="/production/calendar"
        intro={{
          description: "Create soundscapes and experiences by learning the tools, terms, and techniques to build them.",
        }}
      />

      {/* Stats strip */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label="lessons tried" value={`${totals.covered}/${totals.total}`} accent="text-production" />
        <Stat label="in progress" value={String(totals.started)} />
        <Stat
          label="glossary"
          value={`${glossaryTotals.gotIt}/${glossaryTotals.all}`}
          onClick={onOpenGlossary}
        />
        {/* NO VOCABULARY TILE. It has a card below now, and two doors
            to one drill is how a reader starts wondering whether they
            are two drills. Glossary and reference tracks keep theirs —
            neither is a path nor the vocabulary drill, and the sidebar
            links straight to them. */}
        <Stat
          label="reference tracks"
          value={String(refTracks)}
          onClick={onOpenReferenceTracks}
        />
      </section>

      {/* THE PATHS AND VOCABULARY, AS CARDS.

          ONE GRID, TWO KINDS OF EVIDENCE. A path is lessons the reader
          declares a state on, so its card carries no tier and no bar.
          Vocabulary is a drill that writes real attempts, so it carries
          both. A grid where one card has a bar and six do not is the
          honest rendering of a module that measures two things.

          THE HEADING WENT WITH THE HAND-BUILT GRID. It said "the six
          paths" above what is now seven cards. */}
      <CategoryCardGrid
        cards={cards}
        moduleId={PRODUCTION_MODULE_ID}
        onDrill={key => {
          if (key === VOCABULARY_CARD_KEY) onOpenVocabulary();
          else if (isProductionPathKey(key)) onOpenPath(key);
        }}
        now={now}
      />

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
                    <span className={`w-2 h-2 rounded-full shrink-0 ${ratingOption(s.rating).dot}`} aria-hidden />
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

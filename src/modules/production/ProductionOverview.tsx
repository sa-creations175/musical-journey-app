import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import CategoryCardGrid from '../../components/moduleHome/CategoryCardGrid';
import ModuleHomeHeader, { ReferenceLink } from '../../components/moduleHome/ModuleHomeHeader';
import SummaryTiles from '../../components/moduleHome/SummaryTiles';
import { lessonById, PRODUCTION_LESSONS } from './content/lessons';
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
  onOpenVocabulary: () => void;
  /* NO `onOpenGlossary` OR `onOpenReferenceTracks`. Both were tiles
     that opened a view through a callback; they are links now, to the
     same `?view=` addresses the sidebar already points at, so the two
     ways in behave identically — including what the back button does.
     See `ReferenceLink`. */
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
  onOpenVocabulary,
}: Props) {
  const rawLessonStates = useLiveQuery(async () => db.productionLessons.toArray(), []);
  const lessonStates = useMemo(() => rawLessonStates ?? [], [rawLessonStates]);
  /* THE GLOSSARY AND REFERENCE-TRACK READS ARE GONE WITH THEIR TILES.
     Both counted reference material rather than anything done, and
     nothing on this page asks for either number now. */

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

  /** The vocabulary card, so its tile cannot disagree with it. */
  const vocabulary = cards.find(c => c.key === VOCABULARY_CARD_KEY);

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
        /* THE TWO REFERENCE DOORS, in the slot Reading's Notation
           Reference already occupies — the left end of a row that is
           otherwise right-aligned, so they cost no vertical space. They
           were tiles; a tile carries something you are TRACKING, and
           neither of these is. See `ReferenceLink`. */
        leading={(
          <span className="inline-flex items-center gap-2">
            <ReferenceLink to="/production?view=glossary">Glossary</ReferenceLink>
            <span aria-hidden className="text-neutral-400">·</span>
            <ReferenceLink to="/production?view=reference-tracks">
              Reference Tracks
            </ReferenceLink>
          </span>
        )}
        moduleIds={[PRODUCTION_MODULE_ID]}
        moduleId={PRODUCTION_MODULE_ID}
        calendarTo="/production/calendar"
        intro={{
          description: "Create soundscapes and experiences by learning the tools, terms, and techniques to build them.",
        }}
      />

      {/* =============================================================
          THE SAME TILE ROW THE SHAPES PAGES USE.

          These were four tall boxes with the value stacked above its
          label, in a monospace face nothing else in the app uses —
          about eighty pixels of chrome above the thing the page is for,
          and the reason this module read as a different product. One
          line each now, body font, roughly a third of the height, and
          the same component every other module reaches for.

          NO VOCABULARY TILE. It has a card below, and two doors to one
          drill is how a reader starts wondering whether they are two
          drills. Glossary and reference tracks keep theirs — neither is
          a path nor the vocabulary drill, and the sidebar links
          straight to them.
          ============================================================= */}
      <SummaryTiles
        tiles={[
          {
            label: 'lessons tried',
            value: `${totals.covered}/${totals.total}`,
            testId: 'summary-tile-lessons-tried',
          },
          {
            label: 'in progress',
            value: String(totals.started),
            testId: 'summary-tile-in-progress',
          },
          {
            /* READ OFF THE VOCABULARY CARD'S OWN MODEL, not counted a
               second time here. The tile and the card are the same
               figure about the same drill, and the only way they cannot
               drift is by being one computation.

               THIS IS THE TILE THAT WAS MISSING. Vocabulary is a drill,
               it is one of Production's dashboard categories, and it is
               tracked — which is what a tile is for. */
            label: 'vocabulary',
            value: `${vocabulary?.itemsSeen ?? 0}/${vocabulary?.itemCount ?? 0}`,
            onClick: onOpenVocabulary,
            testId: 'summary-tile-vocabulary',
          },
        ]}
      />

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

/* `Stat` IS GONE. Its four tiles are `SummaryTiles` now — one shell
   for every module, so a fifth cannot quietly grow a fifth look. */

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

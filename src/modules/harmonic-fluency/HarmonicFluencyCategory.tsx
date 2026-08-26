/**
 * One category's page — where that category's drills are started.
 *
 * =====================================================================
 * A SUB-ITEM LANDS SOMEWHERE, WHICH IT DID NOT USED TO.
 *
 * The nav's twelve sub-items pointed at `/harmonic-fluency?category=x`,
 * and the only thing on the module home that read that parameter was
 * the mixed drill's pool — so pressing one produced a page identical to
 * the one before it, having quietly narrowed a button labelled "all
 * categories mixed". Ear training's sub-items have always been real
 * pages. These are now too.
 * =====================================================================
 *
 * THE DRILL IS `FluencyDrill`, the same component the module home runs.
 * A category page that built its own queue would be a second set of
 * rules about focus protection and session defaults, and the second set
 * is always the one that falls behind.
 */
import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import CategoryCardGrid from '../../components/moduleHome/CategoryCardGrid';
import ModuleHomeHeader from '../../components/moduleHome/ModuleHomeHeader';
import { db } from '../../lib/db';
import { useSpacingIntervals } from '../../lib/useSpacingIntervals';
import { useEndOnModuleHome } from '../../lib/useEndOnModuleHome';
import { harmonicFluencyCards } from './homeCards';
import FluencyDrill, { MODULE_ID, SESSION_TARGET } from './FluencyDrill';
import FluencySessionSettings from './FluencySessionSettings';
import { useFluencyPrefs } from './useFluencyPrefs';
import PoolPicker, { togglePool } from '../../components/moduleHome/PoolPicker';
import { isCategory } from './categoryRoutes';
import type { SessionStats } from './HarmonicFluencySession';
import { CATEGORY_LABELS, CATEGORY_ORDER, type FlashcardCategory } from './catalog';

/** The row's options — one per category, in the order the module
 *  teaches them. Derived, never listed. */
const POOL_OPTIONS = CATEGORY_ORDER.map(id => ({ id, label: CATEGORY_LABELS[id] }));

export default function HarmonicFluencyCategory() {
  const { category } = useParams<{ category: string }>();
  /**
   * WHAT THE DRILL WILL DRAW FROM. This category alone to begin with,
   * and any combination the reader lights on top of it.
   *
   * Keyed on the route param through the component's identity: a
   * different category is a different `:category`, which remounts this
   * and re-seeds the set. Nothing is persisted — arriving at a
   * category's page means arriving at that category.
   */
  const [lit, setLit] = useState<ReadonlySet<string>>(() => new Set([category ?? '']));
  const [running, setRunning] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [lastSummary, setLastSummary] = useState<SessionStats | null>(null);
  const [caughtUp, setCaughtUp] = useState(false);

  // Pressing the module name in the nav leaves a running drill. Here it
  // also leaves the page, so this only has to cover the case where the
  // reader is on this page and presses THIS category again.
  useEndOnModuleHome(() => setRunning(false));

  const totalAttempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(MODULE_ID).count(),
    [],
  ) ?? 0;
  const prefs = useFluencyPrefs(totalAttempts);
  const flaggedCount = useLiveQuery(
    () => db.flashcardStates.filter(s => s.isFlagged === true).count(),
    [],
  ) ?? 0;
  const attempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(MODULE_ID).toArray(),
    [],
  ) ?? [];
  const spacingIntervals = useSpacingIntervals(MODULE_ID);
  const now = Date.now();

  // A slug that is not a category is a bad link, not a page. Home,
  // rather than an empty drill over nothing.
  if (category === undefined || !isCategory(category)) {
    return <Navigate to="/harmonic-fluency" replace />;
  }

  // THE SAME CARDS THE MODULE HOME DRAWS, filtered to what is lit —
  // so the cards under the row are the pool the row describes. Built
  // from the same adapter, so the count, the freshness and the tier all
  // say here exactly what they say there.
  const cards = harmonicFluencyCards(attempts, spacingIntervals, now)
    .filter(c => lit.has(c.key));
  const pool = CATEGORY_ORDER.filter(c => lit.has(c)) as FlashcardCategory[];

  const start = () => {
    setCaughtUp(false);
    setLastSummary(null);
    setRunning(true);
  };

  return (
    <div className="space-y-6" data-testid="hf-category-page" data-category={category}>
      <ModuleHomeHeader
        moduleIds={[MODULE_ID]}
        moduleId={MODULE_ID}
        calendarTo="/harmonic-fluency/calendar"
        showIntro={false}
      />

      {running ? (
        <FluencyDrill
          categories={pool}
          flaggedOnly={flaggedOnly}
          onCaughtUp={() => { setRunning(false); setCaughtUp(true); }}
          onExit={stats => { setRunning(false); setLastSummary(stats); }}
        />
      ) : (
        <>
          {/* THE POOL, ACROSS THE TOP. This category is lit; lighting
              others adds them, so one page can launch any combination
              and the reader can see which. */}
          <PoolPicker
            options={POOL_OPTIONS}
            lit={lit}
            onToggle={id => setLit(prev => togglePool(prev, id))}
            moduleId={MODULE_ID}
          />

          <button
            onClick={start}
            data-testid="hf-category-start"
            className="w-full py-3.5 rounded-xl bg-fluent text-white text-base font-semibold shadow-sm hover:opacity-90"
          >
            Start drill
          </button>

          {/* Drilling from a card lands on the page it is already on,
              so it starts rather than navigating. */}
          <CategoryCardGrid
            cards={cards}
            moduleId={MODULE_ID}
            onDrill={() => start()}
            now={now}
          />

          <FluencySessionSettings
            prefs={prefs}
            flaggedOnly={flaggedOnly}
            onFlaggedOnlyChange={setFlaggedOnly}
            flaggedCount={flaggedCount}
            onStart={start}
            caughtUp={caughtUp}
            lastSummary={lastSummary}
            sessionTarget={SESSION_TARGET}
          />
        </>
      )}
    </div>
  );
}

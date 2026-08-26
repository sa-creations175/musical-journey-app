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
import { isCategory } from './categoryRoutes';
import type { SessionStats } from './HarmonicFluencySession';
import { CATEGORY_LABELS } from './catalog';

export default function HarmonicFluencyCategory() {
  const { category } = useParams<{ category: string }>();
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

  // THE SAME CARD THE MODULE HOME DRAWS, filtered to this one. Built
  // from the same adapter, so the count, the freshness and the tier all
  // say here exactly what they say there.
  const cards = harmonicFluencyCards(attempts, spacingIntervals, now)
    .filter(c => c.key === category);

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
          categories={[category]}
          flaggedOnly={flaggedOnly}
          onCaughtUp={() => { setRunning(false); setCaughtUp(true); }}
          onExit={stats => { setRunning(false); setLastSummary(stats); }}
        />
      ) : (
        <>
          <button
            onClick={start}
            data-testid="hf-category-start"
            className="w-full py-3.5 rounded-xl bg-fluent text-white text-base font-semibold shadow-sm hover:opacity-90"
          >
            Start drill · {CATEGORY_LABELS[category]}
          </button>

          {/* Drilling from the card lands on the page it is already on,
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

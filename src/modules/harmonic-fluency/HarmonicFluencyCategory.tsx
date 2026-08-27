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
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ModuleHomeHeader from '../../components/moduleHome/ModuleHomeHeader';
import { db } from '../../lib/db';
import { countStudyLater } from '../../lib/flashcards/cardSpacing';
import { useEndOnModuleHome } from '../../lib/useEndOnModuleHome';
import FluencyDrill, { MODULE_ID, SESSION_TARGET } from './FluencyDrill';
import FluencySessionSettings, { SESSION_SETTINGS_LABEL } from './FluencySessionSettings';
import { useFluencyPrefs } from './useFluencyPrefs';
import PoolPicker from '../../components/moduleHome/PoolPicker';
import CategoryDetailStack, {
  type DetailEntry,
} from '../../components/moduleHome/CategoryDetailStack';
import { useAxisViews } from '../../components/moduleHome/useAxisViews';
import { moduleMetaById } from '../../lib/moduleMeta';
import { buildSkillRegistry, type SkillRecord } from '../skills/registry';
import { HARMONIC_FLUENCY_GRIDS } from './progressGrids';
import { useLitPool } from '../../lib/useLitPool';
import { useDetailLanding } from '../../lib/detailLanding';
import { isCategory } from './categoryRoutes';
import type { SessionStats } from './HarmonicFluencySession';
import { CATEGORY_LABELS, CATEGORY_ORDER, type FlashcardCategory } from './catalog';

/** The row's options — one per category, in the order the module
 *  teaches them. Derived, never listed. */
const POOL_OPTIONS = CATEGORY_ORDER.map(id => ({ id, label: CATEGORY_LABELS[id] }));

/**
 * THE PARAM IS THE PAGE'S IDENTITY, so it keys the body.
 *
 * React Router reuses one instance across a param change, which means
 * every `useState` on this page survives a nav press to a different
 * category — a drill kept running, a summary kept showing, all of it
 * about the category the reader had just left. Keying on the category
 * makes a different category a different page, which is what it is.
 */
export default function HarmonicFluencyCategory() {
  const { category } = useParams<{ category: string }>();

  // A slug that is not a category is a bad link, not a page. Home,
  // rather than an empty drill over nothing.
  if (category === undefined || !isCategory(category)) {
    return <Navigate to="/harmonic-fluency" replace />;
  }
  return <CategoryPage key={category} category={category} />;
}

function CategoryPage({ category }: { category: FlashcardCategory }) {
  /**
   * WHAT THE DRILL WILL DRAW FROM — read from the URL, not held here.
   * This category is always lit because it is the page; `?also=` holds
   * whatever else the reader has lit beside it. The nav writes the
   * first, the chip row writes the second, and both are the same value
   * this reads. See `useLitPool`.
   */
  const { lit, toggle, lightAll } = useLitPool(category, isCategory);
  const [running, setRunning] = useState(false);
  /**
   * Which detail blocks are open. The page's own starts open and
   * everything else lit starts collapsed — the chip row says what is in
   * the pool, and this says which of them the reader is reading.
   *
   * Unbounded: comparing two categories is exactly what a reader lights
   * a second chip to do, and an accordion that closed the last one
   * would make it impossible.
   */
  const [expandedDetails, setExpandedDetails] = useState<ReadonlySet<string>>(
    () => new Set([category]),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    () => countStudyLater(MODULE_ID),
    [],
  ) ?? 0;
  const attempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(MODULE_ID).toArray(),
    [],
  ) ?? [];
  const now = Date.now();
  const axisViews = useAxisViews();
  /**
   * A card on the module home asked to land on this page's chart.
   *
   * The block is already expanded — it is the page's own category — so
   * all that is left is to bring it into view. See `detailLanding`.
   */
  const landing = useDetailLanding(category);

  /**
   * The registry, for the detail blocks below.
   *
   * It walks every module, so it is fetched once here and re-fetched
   * when this module's attempts move — the same trade the module home
   * makes, except that a drill page always shows at least one detail
   * block and therefore always needs it.
   */
  const [records, setRecords] = useState<SkillRecord[] | null>(null);
  useEffect(() => {
    let live = true;
    void buildSkillRegistry().then(r => { if (live) setRecords(r); });
    return () => { live = false; };
  }, [attempts]);

  const pool = CATEGORY_ORDER.filter(c => lit.has(c)) as FlashcardCategory[];

  const start = () => {
    setCaughtUp(false);
    setLastSummary(null);
    setRunning(true);
  };

  /**
   * ONE ENTRY PER LIT CATEGORY, in the chip row's order.
   *
   * Derived from `lit` rather than held beside it, so the detail block
   * and the chips cannot say different things about what is in the
   * pool — the defect this page had before the pool moved to the URL.
   */
  const detailEntries: DetailEntry[] = useMemo(
    () => CATEGORY_ORDER.filter(c => lit.has(c)).map(c => ({
      key: c,
      label: CATEGORY_LABELS[c],
      grid: HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS[c]] ?? null,
      items: (records ?? []).filter(
        r => r.moduleId === MODULE_ID && r.category === CATEGORY_LABELS[c],
      ),
    })),
    [lit, records],
  );

  const toggleDetail = (key: string) => setExpandedDetails(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div className="space-y-6" data-testid="hf-category-page" data-category={category}>
      {/* SESSION SETTINGS AS A LINK, at the left end of the streak
              row. It used to be a full-width collapsed card halfway
              down the page — a band of vertical space spent on a
              heading for a panel that is opened rarely and closed at
              once. The row it moves into is right-aligned and its left
              half was empty, so this costs no height at all. */}
      <ModuleHomeHeader
        leading={(
          <button
            type="button"
            data-testid="session-settings-link"
            onClick={() => setSettingsOpen(true)}
            className="hover:text-fluent"
          >
            {SESSION_SETTINGS_LABEL}
          </button>
        )}
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
            onToggle={toggle}
            onSelectAll={lightAll}
            locked={category}
            moduleId={MODULE_ID}
          />

          <button
            onClick={start}
            data-testid="hf-category-start"
            className="w-full py-3.5 rounded-xl bg-fluent text-white text-base font-semibold shadow-sm hover:opacity-90"
          >
            Start Drill
          </button>

          <FluencySessionSettings
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            prefs={prefs}
            flaggedOnly={flaggedOnly}
            onFlaggedOnlyChange={setFlaggedOnly}
            flaggedCount={flaggedCount}
            onStart={start}
            caughtUp={caughtUp}
            lastSummary={lastSummary}
            sessionTarget={SESSION_TARGET}
          />

          {/* THE DETAIL BLOCK IS THE PAGE'S ACCOUNT OF ITSELF.
              A summary card used to sit above it, saying in a count and
              a bar what the grid below says cell by cell — about the
              one category the reader is already on, named by the lit
              chip at the top. Two summaries of one thing, and the
              smaller one first. The card is gone; this is what is left,
              and it is the more honest of the two.

              The page's own category expanded, everything else lit
              collapsed. */}
          {axisViews.loaded && (
            <CategoryDetailStack
              entries={detailEntries}
              expanded={expandedDetails}
              onToggle={toggleDetail}
              accentHex={moduleMetaById(MODULE_ID)?.accentHex ?? '#7a5aa8'}
              now={now}
              viewFor={axisViews.viewFor}
              onViewChange={axisViews.setView}
              scrollTo={landing.scrollTo}
              onScrolled={landing.onScrolled}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * One reading skill's page — where that skill's drills are started.
 *
 * =====================================================================
 * "OPEN" ON A CARD USED TO GO NOWHERE.
 *
 * The drill lived under the cards on the module home, so pressing Open
 * on the Notes card set a variable and started a question three
 * screenfuls down the page you were already on. The nav's four
 * sub-items did less than that — they only chose which skill that drill
 * would be on, without starting it — so pressing "notes" produced a
 * page identical to the one before it.
 *
 * A skill is a page now, the way ear training's four sub-modules
 * already are, and Open goes to it.
 * =====================================================================
 *
 * THE DRILL COMPONENT IS UNCHANGED. `ReadingDrill` still owns the card,
 * the answer and the attempt; what moved is where it is mounted.
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import CategoryCardGrid from '../../components/moduleHome/CategoryCardGrid';
import ModuleHomeHeader from '../../components/moduleHome/ModuleHomeHeader';
import { db } from '../../lib/db';
import { isNarrowed, useDrillFilter } from '../../lib/drillFilter';
import { useSpacingIntervals } from '../../lib/useSpacingIntervals';
import { useEndOnModuleHome } from '../../lib/useEndOnModuleHome';
import ReadingDrill from './ReadingDrill';
import { readingSkillForItemRef } from './catalog';
import PoolPicker from '../../components/moduleHome/PoolPicker';
import CategoryDetailStack, {
  type DetailEntry,
} from '../../components/moduleHome/CategoryDetailStack';
import { useAxisViews } from '../../components/moduleHome/useAxisViews';
import { moduleMetaById } from '../../lib/moduleMeta';
import { buildSkillRegistry, type SkillRecord } from '../skills/registry';
import { READING_CATEGORY_LABEL } from './skillRecords';
import { READING_GRIDS } from './progressGrids';
import { useLitPool } from '../../lib/useLitPool';
import { useDetailLanding } from '../../lib/detailLanding';
import {
  READING_MODULE_ID, READING_SKILL_LABELS, READING_SKILL_ORDER,
  isReadingCardKey, readingCards,
} from './homeCards';
import { readingSkillForSlug } from './skillRoutes';
import type { ReadingDrillSkill } from './pickCard';

/**
 * THE SLUG IS THE PAGE'S IDENTITY, so it keys the body.
 *
 * React Router reuses one instance across a param change, so every
 * `useState` here would survive a nav press to a different skill —
 * leaving a drill running on the skill the reader had just left.
 * Keying on the skill makes a different skill a different page.
 */
export default function ReadingSkill() {
  const { skill: slug } = useParams<{ skill: string }>();
  const skill = slug === undefined ? null : readingSkillForSlug(slug);
  if (skill === null) return <Navigate to="/reading" replace />;
  return <SkillPage key={skill} skill={skill} />;
}

function SkillPage({ skill }: { skill: ReadingDrillSkill }) {
  /**
   * WHAT THE DRILL WILL DRAW FROM — read from the URL, not held here.
   * This skill is always lit because it is the page; `?also=` holds
   * whatever else is lit beside it. The nav writes the first, the chip
   * row writes the second. See `useLitPool`.
   */
  const { lit, toggle, lightAll } = useLitPool(skill, isReadingCardKey);

  /**
   * `?focus=ref,ref` — the dashboard sending you here from a tapped
   * row. Applied only when the refs belong to THIS skill, so a link
   * into signatures cannot narrow the notes drill.
   */
  const filter = useDrillFilter(READING_MODULE_ID);
  const focusRefs = isNarrowed(filter) ? filter.keys : undefined;
  const focusSkill = focusRefs
    ? readingSkillForItemRef(focusRefs[0]) ?? undefined
    : undefined;

  const [drilling, setDrilling] = useState(false);
  useEndOnModuleHome(() => setDrilling(false));

  /** Which detail blocks are open — this skill's to begin with. Any
   *  number may be open at once; see `CategoryDetailStack`. */
  const [expandedDetails, setExpandedDetails] = useState<ReadonlySet<string>>(
    () => new Set([skill]),
  );
  /**
   * A skill to bring into view — asked for by a card's Progress Detail,
   * here or on the module home. One mechanism for both: the module home
   * writes it into the URL, this page's own cards set it directly, and
   * `CategoryDetailStack` does the scrolling either way.
   */
  const landing = useDetailLanding(skill);
  const [scrollTo, setScrollTo] = useState<string | null>(null);

  const attempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(READING_MODULE_ID).toArray(),
    [],
  ) ?? [];
  const spacingIntervals = useSpacingIntervals(READING_MODULE_ID);
  const now = Date.now();
  const axisViews = useAxisViews();

  const dueByItem = useLiveQuery(async () => {
    const rows = await db.spacingState
      .where('moduleRef').equals(READING_MODULE_ID).toArray();
    return new Map(rows.map(r => [r.itemRef, r.nextDueAt] as const));
  }, []) ?? new Map<string, number | null>();

  /** The registry, for the detail blocks below. A drill page always
   *  shows at least one, so it is always needed here. */
  const [records, setRecords] = useState<SkillRecord[] | null>(null);
  useEffect(() => {
    let live = true;
    void buildSkillRegistry().then(r => { if (live) setRecords(r); });
    return () => { live = false; };
  }, [attempts]);

  // The same cards the module home draws, filtered to what is lit — so
  // the cards under the row are the pool the row describes.
  const cards = readingCards(attempts, spacingIntervals, now)
    .filter(c => lit.has(c.key));
  const pool = READING_SKILL_ORDER.filter(s => lit.has(s)) as ReadingDrillSkill[];

  /** One entry per lit skill, in the chip row's order — derived from
   *  `lit`, so the two cannot disagree. */
  const detailEntries: DetailEntry[] = useMemo(
    () => READING_SKILL_ORDER.filter(sk => lit.has(sk)).map(sk => ({
      key: sk,
      label: READING_CATEGORY_LABEL[sk],
      grid: READING_GRIDS[READING_CATEGORY_LABEL[sk]] ?? null,
      items: (records ?? []).filter(
        r => r.moduleId === READING_MODULE_ID
          && r.category === READING_CATEGORY_LABEL[sk],
      ),
    })),
    [lit, records],
  );

  const toggleDetail = (key: string) => setExpandedDetails(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  /** A card's Progress Detail: open that skill's block, then bring it
   *  into view. Expanding first — scrolling to a collapsed header would
   *  be barely better than the nothing this button used to do. */
  const openDetail = (key: string) => {
    if (!isReadingCardKey(key)) return;
    setExpandedDetails(prev => new Set(prev).add(key));
    setScrollTo(key);
  };


  return (
    <div className="space-y-6" data-testid="reading-skill-page" data-skill={skill}>
      <ModuleHomeHeader
        moduleIds={[READING_MODULE_ID]}
        moduleId={READING_MODULE_ID}
        calendarTo="/reading/calendar"
        showIntro={false}
      />

      {/* THE POOL, ACROSS THE TOP. This skill is lit; lighting others
          adds them, so one page can launch any combination.

          DISABLED ONCE A DRILL IS RUNNING. The pool is decided when the
          run starts — the drill below keys its selection on it, and a
          row that could still be pressed would promise a change the
          card on screen will not make. */}
      <PoolPicker
        options={READING_SKILL_ORDER.map(s => ({ id: s, label: READING_SKILL_LABELS[s] }))}
        lit={lit}
        onToggle={toggle}
        onSelectAll={lightAll}
        locked={skill}
        moduleId={READING_MODULE_ID}
        disabled={drilling}
      />

      <CategoryCardGrid
        cards={cards}
        moduleId={READING_MODULE_ID}
        onDrill={() => setDrilling(true)}
        onProgressDetail={openDetail}
        now={now}
      />

      {/* Remounting per POOL resets the drill's local state without the
          drill needing to know the pool can change under it. The key is
          the pool and nothing else — anything the cards can change
          would discard the card mid-answer on every tap, and the pool
          itself cannot change while a drill runs because the row above
          is disabled then. */}
      <ReadingDrill
        key={pool.join(',')}
        skills={pool}
        autoStart={drilling}
        {...(focusRefs && focusSkill !== undefined && lit.has(focusSkill) ? { focusRefs } : {})}
      />

      {/* THE DETAIL BLOCK, below the drill. This skill expanded,
          everything else lit collapsed. */}
      {axisViews.loaded && (
        <CategoryDetailStack
          entries={detailEntries}
          expanded={expandedDetails}
          onToggle={toggleDetail}
          accentHex={moduleMetaById(READING_MODULE_ID)?.accentHex ?? '#6f4a2f'}
          now={now}
          viewFor={axisViews.viewFor}
          onViewChange={axisViews.setView}
          dueByItem={dueByItem}
          scrollTo={scrollTo ?? landing.scrollTo}
          onScrolled={() => { setScrollTo(null); landing.onScrolled(); }}
        />
      )}
    </div>
  );
}

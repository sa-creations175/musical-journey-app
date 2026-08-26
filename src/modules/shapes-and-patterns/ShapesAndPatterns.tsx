import { useEffect, useMemo } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import TodayAndAttention from './TodayAndAttention';
import {
  cleanupGhostKeyboardIfNeeded,
  cleanupScaleDirectionalDrillsIfNeeded,
} from './cleanup';
import CategoryCardGrid from '../../components/moduleHome/CategoryCardGrid';
import ModuleHomeHeader from '../../components/moduleHome/ModuleHomeHeader';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import {
  MENTAL_VIZ_MODULE_REF,
  SHAPES_MODULE_ID,
  SHAPES_MODULE_REF,
  isShapesSectionId,
  shapesCards,
} from './homeCards';
import { SCROLL_TO_DETAIL_STATE, shapesSectionPath } from './sectionRoutes';
import { shapesTimeInvested } from './timeInvested';

export default function ShapesAndPatterns() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    void (async () => {
      // Retire any ghost-keyboard orphan drill rows from legacy data.
      await cleanupGhostKeyboardIfNeeded();
      // Collapse legacy ascending/descending scale drills into the
      // single "Scale drill" row.
      await cleanupScaleDirectionalDrillsIfNeeded();
    })();
  }, []);

  /**
   * `?tab=<id>` STILL LANDS, and now it lands on the section's page.
   *
   * The skills catalogue's jump and the session generator's
   * quick-launch both build one, and both are stored as strings in
   * places this module does not own. Rewriting them would be a
   * migration; redirecting is a line, and the redirect is where the
   * old address is turned into the new one exactly once.
   *
   * DECIDED HERE, RETURNED BELOW — after every hook has run. An early
   * return above them would make the hook list depend on the URL,
   * which is the one thing React will not have.
   */
  const tabParam = searchParams.get('tab');
  const redirectTo = tabParam !== null && isShapesSectionId(tabParam)
    ? shapesSectionPath(tabParam)
    : null;

  const shapesRows = useLiveQuery(
    () => db.spacingState.where('moduleRef').equals(SHAPES_MODULE_REF).toArray(),
    [],
  ) ?? [];
  const mentalVizRows = useLiveQuery(
    () => db.spacingState.where('moduleRef').equals(MENTAL_VIZ_MODULE_REF).toArray(),
    [],
  ) ?? [];
  /**
   * TIME INVESTED — read, never written for this. Every S&P drill has
   * always recorded a duration; nothing added them up. Chord shapes
   * store a `DrillSkill` id rather than an itemRef, so the skills
   * table comes along for the join.
   */
  const sessions = useLiveQuery(() => db.drillSessions.toArray(), []) ?? [];
  const drillSkills = useLiveQuery(() => db.drillSkills.toArray(), []) ?? [];
  const timeBySection = shapesTimeInvested(sessions, drillSkills);
  const now = Date.now();
  const cards = useMemo(
    () => shapesCards(shapesRows, mentalVizRows, now, timeBySection),
    // `now` is deliberately not a dep — freshness moves in days.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shapesRows, mentalVizRows],
  );

  if (redirectTo !== null) return <Navigate to={redirectTo} replace />;

  return (
    <div className="space-y-6">
      <ModuleHomeHeader
        moduleIds={[SHAPES_MODULE_ID]}
        moduleId={SHAPES_MODULE_ID}
        calendarTo="/shapes-and-patterns/calendar"
        intro={{
          description: "Master scales, chord shapes, and voice-leading so that they're under your hands and in your mind's eye.",
        }}
      />

      <TodayAndAttention />

      {/* THE CARDS REPLACE THE TAB STRIP. The tabs said which section
          was selected and nothing about how it was going; a card
          carries the coverage and the last time it was worked, which is
          what decides where to start.

          NO BADGE AND NO BAR ON ANY OF THEM — this module records a
          duration and a self-rating, never a right answer. The adapter
          passes `accuracy: null` and the card omits both rather than
          drawing an empty one.

          THE MATRICES LEFT THIS PAGE. Each sub-module is a route now —
          see `ShapesAndPatternsSection` — so Open goes to it rather
          than switching a section underneath the cards. `?tab=` still
          lands: the redirect above turns it into the same address. */}
      <CategoryCardGrid
        cards={cards}
        moduleId={SHAPES_MODULE_ID}
        onDrill={key => {
          if (isShapesSectionId(key)) navigate(shapesSectionPath(key));
        }}
        onProgressDetail={key => {
          if (!isShapesSectionId(key)) return;
          // The detail this asks about is that page's matrix, so the
          // press is a navigation carrying the request with it.
          navigate(shapesSectionPath(key), { state: SCROLL_TO_DETAIL_STATE });
        }}
        now={now}
      />
    </div>
  );
}

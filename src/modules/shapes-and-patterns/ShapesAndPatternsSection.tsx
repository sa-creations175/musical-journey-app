/**
 * One Shapes & Patterns sub-module's page — its card, then its matrix.
 *
 * =====================================================================
 * THE MATRICES USED TO LIVE ON THE MODULE HOME.
 *
 * All four rendered inline under the cards, switched by a `tab` state
 * the cards also wrote — so pressing Open on a card scrolled you down
 * the page you were already on, and the nav's four sub-items landed on
 * that same page with a different section selected. Harmonic fluency
 * and reading moved their drills onto real routes for exactly this
 * reason; this is the same move.
 * =====================================================================
 *
 * THE MATRIX IS THIS PAGE'S DETAIL. Unlike harmonic fluency and reading
 * there is no second surface to build — the grid a reader came here for
 * is the grid the Progress Detail button is asking about, so that
 * button navigates here and brings it into view.
 */
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import CategoryCardGrid from '../../components/moduleHome/CategoryCardGrid';
import ModuleHomeHeader from '../../components/moduleHome/ModuleHomeHeader';
import { db } from '../../lib/db';
import { getPref, setPref } from '../../lib/userPrefs';
import ChordShapeDrills from './ChordShapeDrills';
import ScaleDrills from './ScaleDrills';
import VoiceLeadingDrills from './VoiceLeadingDrills';
import MentalVizDrills from './MentalVizDrills';
import type { QualityKind } from './catalog';
import {
  MENTAL_VIZ_MODULE_REF,
  SHAPES_MODULE_ID,
  SHAPES_MODULE_REF,
  isShapesSectionId,
  shapesCards,
  type ShapesSectionId,
} from './homeCards';
import { wantsDetail } from './sectionRoutes';
import { shapesTimeInvested } from './timeInvested';

const PREF_CHORD_SCOPE = 'shapesAndPatternsChordScope';

/**
 * THE SLUG IS THE PAGE'S IDENTITY, so it keys the body.
 *
 * React Router reuses one instance across a param change, so a nav
 * press to a different sub-module would leave every `useState` here
 * describing the one just left.
 */
export default function ShapesAndPatternsSection() {
  const { section } = useParams<{ section: string }>();
  if (section === undefined || !isShapesSectionId(section)) {
    return <Navigate to="/shapes-and-patterns" replace />;
  }
  return <SectionPage key={section} section={section} />;
}

function SectionPage({ section }: { section: ShapesSectionId }) {
  const location = useLocation();
  const detailRef = useRef<HTMLDivElement>(null);

  const [chordScope, setChordScope] = useState<QualityKind | 'all'>('all');
  useEffect(() => {
    if (section !== 'chord-shapes') return;
    let live = true;
    void (async () => {
      const s = await getPref<QualityKind | 'all'>(PREF_CHORD_SCOPE, 'all');
      if (!live) return;
      if (s === 'all' || s === 'triad' || s === 'seventh' || s === 'extension' || s === 'special') {
        setChordScope(s);
      }
    })();
    return () => { live = false; };
  }, [section]);

  const setScope = (scope: QualityKind | 'all') => {
    setChordScope(scope);
    void setPref(PREF_CHORD_SCOPE, scope);
  };

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
  const cards = shapesCards(shapesRows, mentalVizRows, now, timeBySection)
    .filter(c => c.key === section);

  const scrollToDetail = () => {
    // `scrollIntoView` is absent in jsdom, so the call is guarded
    // rather than assumed.
    detailRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  // ARRIVED FROM A PROGRESS DETAIL BUTTON. The detail is on this page,
  // so the press that asked for it is a navigation; the flag it carried
  // is read once the page it asked for exists.
  useEffect(() => {
    if (!wantsDetail(location.state)) return;
    scrollToDetail();
  }, [location.state, location.key]);

  return (
    <div className="space-y-6" data-testid="shapes-section-page" data-section={section}>
      <ModuleHomeHeader
        moduleIds={[SHAPES_MODULE_ID]}
        moduleId={SHAPES_MODULE_ID}
        calendarTo="/shapes-and-patterns/calendar"
        showIntro={false}
      />

      {/* The same card the module home draws, filtered to this one —
          same adapter, so the count and the freshness say here exactly
          what they say there. Both of its buttons lead to the matrix
          below, which is what this page is. */}
      <CategoryCardGrid
        cards={cards}
        moduleId={SHAPES_MODULE_ID}
        onDrill={scrollToDetail}
        onProgressDetail={scrollToDetail}
        now={now}
      />

      <div ref={detailRef} id="shapes-section-detail" data-testid="shapes-section-detail">
        {section === 'chord-shapes' && (
          <ChordShapeDrills scope={chordScope} onScopeChange={setScope} />
        )}
        {section === 'scales' && <ScaleDrills />}
        {section === 'voice-leading' && <VoiceLeadingDrills />}
        {section === 'mental-viz' && <MentalVizDrills />}
      </div>
    </div>
  );
}

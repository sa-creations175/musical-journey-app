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
import ModuleHomeHeader from '../../components/moduleHome/ModuleHomeHeader';
import SummaryTiles from '../../components/moduleHome/SummaryTiles';
import { shapesSummaryTiles } from './summaryTiles';
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
import { SCROLL_ROOM_CLASS, scrollSectionToTop } from '../../lib/scrollSectionToTop';

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

  // THE APP'S SCROLL, not `scrollIntoView`. The bare call aligns with
  // the top of the scrollport, which is UNDERNEATH the sticky header,
  // and stops as soon as the element is visible by its own reckoning —
  // so the drills arrived behind the chrome, or at the bottom of the
  // screen with the card you had just pressed still filling it. See
  // `scrollSectionToTop`.
  const scrollToDetail = () => {
    scrollSectionToTop(detailRef.current);
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

      {/* =============================================================
          THE PEACH CARD IS GONE. ITS FACTS ARE THESE THREE TILES.

          It was the module home's card, drawn again on the page for
          the one section you were already looking at: a large tinted
          box repeating the Fluent+ count the header two inches below
          it already printed, and — on chord shapes, where nothing had
          been drilled — with a blank body under that. Both its buttons
          scrolled to the matrix directly beneath it.

          THE SAME ADAPTER STILL FEEDS IT, so the time and the freshness
          say here exactly what they say on the module home. What went
          is the box, not the facts. See `shapesSummaryTiles`.
          ============================================================= */}
      {cards[0] && <SummaryTiles tiles={shapesSummaryTiles(cards[0])} />}

      {/* ROOM TO REACH THE TOP. This block is the last thing on the
          page, so without a floor a short one cannot be scrolled clear
          of the header however it is asked — see `SCROLL_ROOM_CLASS`.
          A floor only fills when the drills are shorter than a screen,
          which is exactly the case that was landing short. */}
      <div
        ref={detailRef}
        id="shapes-section-detail"
        data-testid="shapes-section-detail"
        className={SCROLL_ROOM_CLASS}
      >
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

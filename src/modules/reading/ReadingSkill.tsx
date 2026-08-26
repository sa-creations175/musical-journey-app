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
import { useState } from 'react';
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
import { READING_MODULE_ID, readingCards } from './homeCards';
import { readingSkillForSlug } from './skillRoutes';

export default function ReadingSkill() {
  const { skill: slug } = useParams<{ skill: string }>();
  const skill = slug === undefined ? null : readingSkillForSlug(slug);

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

  const attempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(READING_MODULE_ID).toArray(),
    [],
  ) ?? [];
  const spacingIntervals = useSpacingIntervals(READING_MODULE_ID);
  const now = Date.now();

  if (skill === null) return <Navigate to="/reading" replace />;

  // The same card the module home draws, filtered to this one.
  const cards = readingCards(attempts, spacingIntervals, now)
    .filter(c => c.key === skill);

  return (
    <div className="space-y-6" data-testid="reading-skill-page" data-skill={skill}>
      <ModuleHomeHeader
        moduleIds={[READING_MODULE_ID]}
        moduleId={READING_MODULE_ID}
        calendarTo="/reading/calendar"
        showIntro={false}
      />

      <CategoryCardGrid
        cards={cards}
        moduleId={READING_MODULE_ID}
        onDrill={() => setDrilling(true)}
        now={now}
      />

      {/* Remounting per skill resets the drill's local state without
          the drill needing to know a skill can change under it. The key
          is the skill and nothing else — anything the cards can change
          would discard the card mid-answer on every tap. */}
      <ReadingDrill
        key={skill}
        skill={skill}
        autoStart={drilling}
        {...(focusRefs && skill === focusSkill ? { focusRefs } : {})}
      />
    </div>
  );
}

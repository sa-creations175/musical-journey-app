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
import PoolPicker, { togglePool } from '../../components/moduleHome/PoolPicker';
import {
  READING_MODULE_ID, READING_SKILL_LABELS, READING_SKILL_ORDER, readingCards,
} from './homeCards';
import { readingSkillForSlug } from './skillRoutes';
import type { ReadingDrillSkill } from './pickCard';

export default function ReadingSkill() {
  const { skill: slug } = useParams<{ skill: string }>();
  const skill = slug === undefined ? null : readingSkillForSlug(slug);

  /**
   * WHAT THE DRILL WILL DRAW FROM. This skill alone to begin with, and
   * any combination the reader lights on top of it. Nothing is
   * persisted: arriving at a skill's page means arriving at that skill.
   */
  const [lit, setLit] = useState<ReadonlySet<string>>(() => new Set([skill ?? '']));

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

  // The same cards the module home draws, filtered to what is lit — so
  // the cards under the row are the pool the row describes.
  const cards = readingCards(attempts, spacingIntervals, now)
    .filter(c => lit.has(c.key));
  const pool = READING_SKILL_ORDER.filter(s => lit.has(s)) as ReadingDrillSkill[];

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
        onToggle={id => setLit(prev => togglePool(prev, id))}
        moduleId={READING_MODULE_ID}
        disabled={drilling}
      />

      <CategoryCardGrid
        cards={cards}
        moduleId={READING_MODULE_ID}
        onDrill={() => setDrilling(true)}
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
    </div>
  );
}

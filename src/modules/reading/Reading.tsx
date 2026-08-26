/**
 * Reading — module home.
 *
 * Four skills as cards. NO SESSION SEQUENCING: chord identification is
 * selectable from the start rather than unlocking once the other three
 * reach maintenance. That suggest-and-confirm rule was deferred, and
 * may not be built at all — picking which skills a month's goals cover
 * already produces the ordering, so a hard-coded gate would duplicate
 * it.
 *
 * THE CARDS REPLACE THE TAB STRIP. The tabs said which skill was
 * selected and how many items it held; they could not say how it was
 * going, so the only progress reading offered was inside the drill.
 * A card carries both, and "drill category" is the tab's job.
 *
 * The `SEPIA` literal went with them. The grid resolves reading's
 * accent from `moduleMeta`, which is where the same hex already lived.
 *
 * Nothing here writes an attempt; see ReadingDrill.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import CategoryCardGrid from '../../components/moduleHome/CategoryCardGrid';
import ModuleHomeHeader from '../../components/moduleHome/ModuleHomeHeader';
import ProgressDetail from '../../components/moduleHome/ProgressDetail';
import { useAxisViews } from '../../components/moduleHome/useAxisViews';
import { moduleMetaById } from '../../lib/moduleMeta';
import { buildSkillRegistry, type SkillRecord } from '../skills/registry';
import { READING_CATEGORY_LABEL } from './skillRecords';
import { READING_GRIDS } from './progressGrids';
import { db } from '../../lib/db';
import { useSpacingIntervals } from '../../lib/useSpacingIntervals';
import { READING_MODULE_ID, isReadingCardKey, readingCards } from './homeCards';
import { readingSkillPath } from './skillRoutes';
import type { ReadingDrillSkill } from './pickCard';

export default function Reading() {
  const navigate = useNavigate();

  /**
   * THE DRILL LEFT THIS PAGE.
   *
   * It used to render under the cards, so "Open" on the Notes card
   * started a question three screenfuls down the page you were already
   * on, and the nav's four sub-items only chose which skill that drill
   * would be on. Each skill is a page now — see `ReadingSkill` — and
   * both routes lead to it.
   *
   * The `?focus=` and `?skill=` handling went with it. A focus link
   * carries the refs, and the skill they belong to is read off them
   * there rather than being resolved here and passed down.
   */

  /** Which skill's progress detail is open, if any. */
  const [detailSkill, setDetailSkill] = useState<ReadingDrillSkill | null>(null);
  const axisViews = useAxisViews();

  const attempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(READING_MODULE_ID).toArray(),
    [],
  ) ?? [];
  const spacingIntervals = useSpacingIntervals(READING_MODULE_ID);
  const now = Date.now();
  // The registry, only while a detail panel is open. It walks every
  // module, so paying for it on arrival would make the module home
  // slower for a surface most visits never open.
  const [records, setRecords] = useState<SkillRecord[] | null>(null);
  useEffect(() => {
    if (detailSkill === null) return;
    let live = true;
    void buildSkillRegistry().then(r => { if (live) setRecords(r); });
    return () => { live = false; };
  }, [detailSkill, attempts]);

  const dueByItem = useLiveQuery(async () => {
    const rows = await db.spacingState
      .where('moduleRef').equals(READING_MODULE_ID).toArray();
    return new Map(rows.map(r => [r.itemRef, r.nextDueAt] as const));
  }, []) ?? new Map<string, number | null>();

  const cards = useMemo(
    () => readingCards(attempts, spacingIntervals, now),
    // `now` is deliberately not a dep — it changes every render and
    // freshness moves in days.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attempts, spacingIntervals],
  );

  return (
    /* No width, padding or gap here. The grid owns the card's size —
       this wrapper used to narrow it to `max-w-2xl` and pad it again
       inside the shell's own padding, which is why reading's cards came
       out smaller than every other module home's. */
    <div className="space-y-6">
      {/* No module heading here. The pinned header in Layout already
          carries the name and the module tagline — see pageTitle.ts —
          and no other module repeats its own. */}
      {/* THE SHARED HEADER, with the staff reference at the left end of
          its row — the row is right-aligned and its left half was
          empty, so the reference costs no vertical space. */}
      <ModuleHomeHeader
        leading={(
          <Link to="/reading/reference" className="hover:text-fluent">
            Notation Reference
          </Link>
        )}
        moduleIds={[READING_MODULE_ID]}
        moduleId={READING_MODULE_ID}
        calendarTo="/reading/calendar"
        intro={{
          description: "Read notation so that you can instantly know what's happening musically from the page, decoding notes, key signatures, chord symbols, ledger lines and all.",
        }}
      />

      <CategoryCardGrid
        cards={cards}
        moduleId={READING_MODULE_ID}
        onDrill={key => { if (isReadingCardKey(key)) navigate(readingSkillPath(key)); }}
        onProgressDetail={key => { if (isReadingCardKey(key)) setDetailSkill(key); }}
        now={now}
      />

      {detailSkill !== null && axisViews.loaded && (
        <ProgressDetail
          categoryLabel={READING_CATEGORY_LABEL[detailSkill]}
          items={(records ?? []).filter(
            r => r.moduleId === READING_MODULE_ID
              && r.category === READING_CATEGORY_LABEL[detailSkill],
          )}
          grid={READING_GRIDS[READING_CATEGORY_LABEL[detailSkill]] ?? null}
          accentHex={moduleMetaById(READING_MODULE_ID)?.accentHex ?? '#6f4a2f'}
          now={now}
          viewFor={axisViews.viewFor}
          onViewChange={axisViews.setView}
          dueByItem={dueByItem}
          onClose={() => setDetailSkill(null)}
        />
      )}
    </div>
  );
}

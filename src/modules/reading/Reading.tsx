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

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import CategoryCardGrid from '../../components/moduleHome/CategoryCardGrid';
import ModuleHomeHeader from '../../components/moduleHome/ModuleHomeHeader';
import { db } from '../../lib/db';
import { useSpacingIntervals } from '../../lib/useSpacingIntervals';
import ReadingDrill from './ReadingDrill';
import { mixedDrillLabel } from '../../components/moduleHome/mixedDrillLabel';
import { useEndOnModuleHome } from '../../lib/useEndOnModuleHome';
import {
  READING_MODULE_ID, READING_SKILL_ORDER, isReadingCardKey, readingCards,
} from './homeCards';
import { readingSkillPath } from './skillRoutes';
import { detailHref } from '../../lib/detailLanding';

export default function Reading() {
  const navigate = useNavigate();

  /**
   * A DRILL ACROSS ALL FOUR SKILLS, started explicitly.
   *
   * The page used to carry a drill on ONE skill, chosen by a card or by
   * a nav sub-item, rendered under the cards — so "Open" on the Notes
   * card started a question three screenfuls down the page you were
   * already on. A skill is a page now (see `ReadingSkill`), and what a
   * card opens is that page.
   *
   * What is left here is the whole-module run: the same machine a skill
   * page starts, with every skill lit. `?focus=` went with the drill —
   * a focus link carries the refs and lands on the page for the skill
   * they belong to.
   */
  const [drilling, setDrilling] = useState(false);
  // Pressing the module name is the way out of a running drill; there
  // is no route change to notice, because this page IS that route.
  useEndOnModuleHome(() => setDrilling(false));

  const attempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(READING_MODULE_ID).toArray(),
    [],
  ) ?? [];
  const spacingIntervals = useSpacingIntervals(READING_MODULE_ID);
  const now = Date.now();
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

      {/* THE WHOLE-MODULE DRILL, ABOVE THE CARDS — the same shape, the
          same place and now the same LABEL harmonic fluency's mixed
          drill uses. Every skill lit; a single skill is what a card
          opens. The count comes off the pool the button starts, so it
          cannot describe a different set from the run. */}
      {!drilling && (
        <button
          onClick={() => setDrilling(true)}
          data-testid="reading-start-all"
          className="w-full py-3.5 rounded-xl bg-fluent text-white text-base font-semibold shadow-sm hover:opacity-90"
        >
          {mixedDrillLabel(READING_SKILL_ORDER.length)}
        </button>
      )}


      {/* THE MIXED DRILL REPLACES THE CARDS, the way harmonic fluency's
          does. It used to unfold BENEATH them, which left the reader
          scrolling past four summaries of a module they had just told
          the app they were done summarising.

          PROGRESS DETAIL GOES TO THE SKILL'S PAGE, landing on its
          chart — the same page Open goes to, differing only in where it
          lands. */}
      {drilling ? (
        <ReadingDrill
          skills={READING_SKILL_ORDER}
          onEnd={() => setDrilling(false)}
          autoStart
        />
      ) : (
        <CategoryCardGrid
          cards={cards}
          moduleId={READING_MODULE_ID}
          onDrill={key => { if (isReadingCardKey(key)) navigate(readingSkillPath(key)); }}
          onProgressDetail={key => {
            if (isReadingCardKey(key)) navigate(detailHref(readingSkillPath(key)));
          }}
          sortable
          now={now}
        />
      )}

    </div>
  );
}

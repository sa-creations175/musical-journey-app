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
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ReadingDrill from './ReadingDrill';
import CategoryCardGrid from '../../components/moduleHome/CategoryCardGrid';
import { db } from '../../lib/db';
import { useSpacingIntervals } from '../../lib/useSpacingIntervals';
import { readingSkillForItemRef } from './catalog';
import { READING_MODULE_ID, isReadingCardKey, readingCards } from './homeCards';
import type { ReadingDrillSkill } from './pickCard';

export default function Reading() {
  const [params] = useSearchParams();
  /**
   * `?focus=ref,ref` — the dashboard sending you here from a tapped
   * row. The skill opens on whichever one those refs belong to, so
   * tapping "conceptual knowledge" for D major lands in the signatures
   * drill rather than on the default note tab.
   */
  const focusRefs = useMemo(() => {
    const raw = params.get('focus');
    if (!raw) return undefined;
    const refs = raw.split(',').map(r => r.trim()).filter(Boolean);
    return refs.length > 0 ? refs : undefined;
  }, [params]);
  const focusSkill = focusRefs
    ? readingSkillForItemRef(focusRefs[0]) ?? undefined
    : undefined;

  const [skill, setSkill] = useState<ReadingDrillSkill>(focusSkill ?? 'note');

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
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* No module heading here. The pinned header in Layout already
          carries the name and the module tagline — see pageTitle.ts —
          and no other module repeats its own. */}
      <CategoryCardGrid
        cards={cards}
        moduleId={READING_MODULE_ID}
        onDrill={key => { if (isReadingCardKey(key)) setSkill(key); }}
        now={now}
      />

      {/* Remounting per skill resets the drill's local state without
          the drill needing to know a skill can change under it.

          THE KEY IS THE SKILL AND NOTHING ELSE. Adding anything the
          cards can change — a filter, an expansion — would discard the
          card mid-answer on every tap. 2c has to keep this true. */}
      <ReadingDrill
        key={skill}
        skill={skill}
        {...(focusRefs && skill === focusSkill ? { focusRefs } : {})}
      />
    </div>
  );
}

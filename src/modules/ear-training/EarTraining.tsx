/**
 * Ear training — module home.
 *
 * =====================================================================
 * NO START BUTTON HERE, AND THAT IS THE ASYMMETRY.
 *
 * This page runs no drill. Its four children are separate drills with
 * separate routes, not filters over one pool, so there is nothing for a
 * Start to start — a button here would have to pick a sub-module on the
 * reader's behalf and then look like the same control harmonic fluency
 * uses to begin a session it can actually begin.
 *
 * So a card here NAVIGATES. Same card, same expansion, same bar; the
 * action is "open" rather than "drill", and it is labelled that way
 * because calling it "drill category" would promise a question and
 * deliver a page with a play button on it.
 * =====================================================================
 *
 * The four cards replace the hand-written sub-module list. That list
 * carried a label, a route and a description and could not say how any
 * of the four was going — the reason to come to this page at all is to
 * decide which one needs you.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import CategoryCardGrid from '../../components/moduleHome/CategoryCardGrid';
import ModuleHomeHeader from '../../components/moduleHome/ModuleHomeHeader';
import { db } from '../../lib/db';
import { useSpacingIntervals } from '../../lib/useSpacingIntervals';
import {
  EAR_TRAINING_MODULE_ID,
  EAR_TRAINING_SUB_MODULES,
  earTrainingCards,
  earTrainingRouteFor,
} from './homeCards';

export default function EarTraining() {
  const navigate = useNavigate();

  const attempts = useLiveQuery(
    () => db.attempts
      .where('moduleId')
      .anyOf(EAR_TRAINING_SUB_MODULES.map(m => m.id))
      .toArray(),
    [],
  ) ?? [];

  // One call per sub-module: `useSpacingIntervals` is keyed on a single
  // module ref, and the hook count is fixed because the list is a
  // module-level constant. Merging the four maps would let two
  // modules' identically named itemRefs collide.
  const intervals = useSpacingIntervals('intervals');
  const chordRecognition = useSpacingIntervals('chord-recognition');
  const chordProgressions = useSpacingIntervals('chord-progressions');
  const scalesModes = useSpacingIntervals('scales-modes');

  const now = Date.now();
  const cards = useMemo(
    () => earTrainingCards(
      attempts,
      new Map([
        ['intervals', intervals],
        ['chord-recognition', chordRecognition],
        ['chord-progressions', chordProgressions],
        ['scales-modes', scalesModes],
      ]),
      now,
    ),
    // `now` is deliberately not a dep — freshness moves in days.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attempts, intervals, chordRecognition, chordProgressions, scalesModes],
  );

  return (
    <div className="space-y-6">
      {/* THE SHARED HEADER, WITH TWO OF ITS THREE PARTS ABSENT — and
          absent rather than filled in.

          NO DAY STREAK. It counts days that met a daily GOAL, and ear
          training has none: `MODULE_DEFAULT_GOALS` lists the four
          sub-modules, not their parent, so a goal here would be the
          unknown-module fallback of 30 measured against the union of
          four drills the reader set separately. That is a target
          nobody chose.

          NO CALENDAR LINK. Each sub-module has its own calendar route;
          `/ear-training/calendar` does not exist, and a link that opens
          nothing is worse than no link.

          NO INTRO. The four sub-module pages each carry their own copy;
          this page has never had any, and copy is written, not
          generated. See the report.

          The flame is real: consecutive correct answers across all four
          sub-modules, which is what a session here actually is. */}
      <ModuleHomeHeader moduleIds={EAR_TRAINING_SUB_MODULES.map(m => m.id)} />

      <CategoryCardGrid
        cards={cards}
        moduleId={EAR_TRAINING_MODULE_ID}
        onDrill={key => {
          const route = earTrainingRouteFor(key);
          if (route !== null) navigate(route);
        }}
        // "open", not "drill": this lands on a page with a play button
        // rather than on a question. See the header.
        drillLabel="open module"
        now={now}
      />
    </div>
  );
}

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
  );
}

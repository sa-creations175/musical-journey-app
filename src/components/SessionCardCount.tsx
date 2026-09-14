/**
 * "cards this session: N" — the line at the top of a running drill.
 *
 * =====================================================================
 * ONE LINE, NOT ONE PER MODULE.
 *
 * It lived inside `FlashcardSession`, which is why only the flashcard
 * modules said how many cards a run had answered. Ear Training's four
 * drills and Reading's drill are their own components, so the line is
 * lifted here and every drill draws this one (14 Sep 2026).
 * =====================================================================
 *
 * TWO WAYS TO KNOW THE COUNT.
 *
 * A flashcard session holds its own queue, so it passes `count` and the
 * queue length as `total` — the line it always drew.
 *
 * Every other drill passes its `moduleId`, and the count is the answered
 * cards it has written since the drill started: attempts under that
 * module stamped at or after `since`. `since` defaults to when this line
 * mounted, which is when the drill mounted, because the line is part of
 * the drill's own header. A drill that ends with End Session unmounts,
 * so the next run starts from zero.
 *
 * ONE ANSWERED CARD IS ONE ATTEMPT ROW in every drill that uses the
 * module form — Chord Recognition's two-stage card writes a single row
 * whichever path it takes — so counting rows counts cards.
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';

type Props =
  | { count: number; total?: number; moduleId?: never; since?: never }
  | { moduleId: string; since?: number; count?: never; total?: never };

/** Attempts under `moduleId` stamped at or after `since`, live. */
export function useCardsThisSession(moduleId: string | undefined, since: number): number {
  return useLiveQuery(
    () => (moduleId === undefined
      ? 0
      : db.attempts
        .where('moduleId').equals(moduleId)
        .filter(a => a.timestamp >= since)
        .count()),
    [moduleId, since],
  ) ?? 0;
}

export default function SessionCardCount(props: Props) {
  const [mountedAt] = useState(() => Date.now());
  const live = useCardsThisSession(props.moduleId, props.since ?? mountedAt);
  const count = props.count ?? live;
  return (
    <span className="text-xs text-neutral-400" data-testid="cards-this-session">
      cards this session: <span className="font-mono tabular-nums">{count}</span>
      {props.total !== undefined && ` / ${props.total}`}
    </span>
  );
}

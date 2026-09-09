/**
 * The movements that exist, live, for a screen that has to count them.
 *
 * =====================================================================
 * THE TABLE'S NAME STAYS INSIDE ITS OWN MODULE.
 *
 * A movement is part of the shapes denominator — one row across twelve
 * keys — so a goal has to know how many there are, both when it is
 * OFFERED and when it is MEASURED. It must never be repertoire, and
 * `movementStore`'s own test asserts that by checking that nothing
 * under `modules/goals/`, `modules/repertoire/`, `modules/dashboard/`
 * or `lib/sessionAlgorithm/` so much as names the table.
 *
 * Those two are only in tension if everyone reads it. They ask for the
 * list instead — `listMovementIds` where a promise will do, this where
 * a render needs the answer to change as movements are added.
 *
 * =====================================================================
 * A HOOK BECAUSE THE ONE CALLER IS A MODULE-SCOPE CONSTANT.
 *
 * The goal flows computed their shapes total at import — `const
 * SP_COUNTS = shapesCounts()` — which is before any component exists
 * and long before Dexie can be asked. Everything else on this path
 * takes the list as an argument, which is `cellTargets`'s own rule; the
 * flows are where that rule runs out, and this is the smallest thing
 * that supplies it.
 *
 * `[]` while the query is in flight, which is the catalog-only answer —
 * exactly what the number was before this existed, so a first paint
 * shows the old figure rather than a wrong one.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/db';

export function useMovementIds(): readonly string[] {
  return useLiveQuery(
    async () => (await db.chordMovements.toArray()).map(m => m.id),
    [],
  ) ?? [];
}

import type { SongKey } from '../../../lib/db';

/**
 * Non-blocking banner shown above the matrix grid when at least one
 * key has all cells comfortable but hasn't yet passed the whole-song
 * test. Per spec line N (step 5 design): user picks when to attempt
 * the test — auto-firing a modal mid-flow is too pushy because they
 * may want to take a break first.
 *
 * Multi-key handling: when >1 key qualifies, the banner names them
 * inline ("D, F# are…") and the action button targets the first
 * (most recently engaged, ordered by parent). Re-firing the banner
 * for each one keeps the surface uncluttered; the user can run them
 * one at a time and the banner re-derives eligibility each render.
 *
 * No dismissal: stays visible until at least one of the named keys
 * passes the test (which removes it from the eligibility list, since
 * keyState flips to solid). Same persistence model as the cross-key
 * follow-up modal — re-mounting re-evaluates from the data.
 */

interface Props {
  /** Keys that qualify: keyState === 'comfortable' AND
   *  wholeSongTestPassedAt === null. Ordered with the most-recently-
   *  engaged first by the parent so the action button targets the
   *  freshest one. */
  eligibleKeys: ReadonlyArray<SongKey>;
  onRunTest: (songKeyId: string) => void;
}

export default function WholeSongTestBanner({ eligibleKeys, onRunTest }: Props) {
  if (eligibleKeys.length === 0) return null;

  const target = eligibleKeys[0];
  const keyNamesText = formatKeyList(eligibleKeys.map(k => k.keyName));
  const headline = eligibleKeys.length === 1
    ? `All sections of ${target.keyName} are comfortable.`
    : `${keyNamesText} are all comfortable.`;

  return (
    <div className="rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
          {headline}
        </div>
        <div className="text-xs text-blue-800 dark:text-blue-200 mt-0.5">
          Ready to run the whole-song test? 3 consecutive clean run-throughs
          unlocks Solid.
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRunTest(target.id)}
        className="shrink-0 px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 font-medium"
      >
        Run test → {eligibleKeys.length > 1 ? `(${target.keyName})` : ''}
      </button>
    </div>
  );
}

function formatKeyList(names: ReadonlyArray<string>): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

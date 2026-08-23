import type { SongStageDemotion } from '../../lib/db';
import { spellKey, type Spelling } from '../../lib/spelling';
import { KEY_QUADRANTS } from './matrix/keyProgress';
import { STAGE_LABEL } from './stage';

/**
 * That the song lost a rung, when, and what is still standing.
 *
 * ---------------------------------------------------------------
 * NOT A TOAST, AND IT PERSISTS.
 *
 * A demotion happens while nobody is watching — a key goes overdue on
 * a Tuesday and the drop is computed the next time the page opens. A
 * toast would be gone before you looked up from the keyboard, and
 * would announce something that had already happened days earlier. So
 * it is stored, and shown until the song is back at the rung it fell
 * from.
 *
 * SHOWS WHAT STILL HOLDS, NOT ONLY WHAT FELL. A list of absences says
 * a rung was lost; the four quadrants with their holders says where
 * the song actually is, which is the thing worth knowing. That is why
 * the snapshot is stored rather than read live — re-prove the key and
 * a live read would show the quadrant covered again, contradicting a
 * notice that says it fell.
 * ---------------------------------------------------------------
 *
 * TWO NAMING RULES, and they apply to every rung and key the app
 * writes in prose. A rung always carries "status" — "Cross-key status"
 * rather than "Cross-key", which reads as jargon. A key always carries
 * "key" or "keys" — "the key of A", never a bare letter at the start
 * of a sentence, where it reads as a word.
 */
export default function DemotionNotice({
  demotion,
  spelling,
}: {
  demotion: SongStageDemotion;
  spelling: Spelling;
}) {
  const when = new Date(demotion.at).toLocaleDateString(undefined, {
    month: 'long', day: 'numeric',
  });
  const held = demotion.heldByQuadrant;

  return (
    <div className="rounded-md border border-[#E88943]/40 bg-[#E88943]/5 px-3 py-2.5 space-y-2">
      <p className="text-xs font-medium text-neutral-800 dark:text-neutral-100">
        This song dropped from {STAGE_LABEL[demotion.from]} status to{' '}
        {STAGE_LABEL[demotion.to]} status on {when}.
      </p>

      {held ? (
        <>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
            {STAGE_LABEL[demotion.from]} status requires one key at Comfortable
            status or above from each of the four quadrants.
          </p>
          <ul className="space-y-0.5">
            {KEY_QUADRANTS.map((quadrant, i) => (
              <li key={i} className="flex items-baseline gap-3 text-[11px]">
                <span className="font-mono text-neutral-700 dark:text-neutral-200 w-24 shrink-0">
                  {quadrant.map(k => spellKey(k, spelling)).join('  ')}
                </span>
                {held[i] ? (
                  <span className="text-neutral-600 dark:text-neutral-300">
                    ✓&nbsp; key of {spellKey(held[i]!, spelling)}
                  </span>
                ) : (
                  <span className="text-needswork">—&nbsp; none held</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
            {lapsedSentence(demotion, spelling)} {recoverySentence(held, spelling)}
          </p>
        </>
      ) : (
        // A drop with nothing to do with quadrants — the whole-song
        // test, for instance. Falls back to what the criterion said.
        <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
          {demotion.criterionLabel}
          {demotion.criterionLabel.endsWith('.') ? '' : '.'}
          {demotion.detail ? ` ${demotion.detail}` : ''}
        </p>
      )}
    </div>
  );
}

/** "The key of A went overdue, leaving the fourth quadrant uncovered." */
function lapsedSentence(d: SongStageDemotion, spelling: Spelling): string {
  const lapsed = d.lapsedKeys ?? [];
  const uncovered = (d.heldByQuadrant ?? [])
    .map((h, i) => (h === null ? i : null))
    .filter((i): i is number => i !== null);

  if (lapsed.length === 0) {
    return uncovered.length === 1
      ? `The ${ORDINAL[uncovered[0]] ?? 'a'} quadrant is uncovered.`
      : 'Some quadrants are uncovered.';
  }
  const names = joinKeys(lapsed.map(k => spellKey(k, spelling)));
  const verb = lapsed.length === 1 ? 'went' : 'went';
  const noun = lapsed.length === 1 ? 'The key of' : 'The keys';
  const tail = uncovered.length === 1
    ? `, leaving the ${ORDINAL[uncovered[0]] ?? 'fourth'} quadrant uncovered.`
    : uncovered.length > 1
      ? `, leaving ${uncovered.length} quadrants uncovered.`
      : '.';
  return `${noun} ${names} ${verb} overdue${tail}`;
}

/** "Prove any of keys A, D or G to Comfortable status and the rung
 *  comes back." — names every key that would restore it, because the
 *  rule asks for one FROM the quadrant, not for a specific one. */
function recoverySentence(
  held: Array<string | null>,
  spelling: Spelling,
): string {
  const firstUncovered = held.findIndex(h => h === null);
  if (firstUncovered < 0) return '';
  const options = (KEY_QUADRANTS[firstUncovered] ?? []).map(k => spellKey(k, spelling));
  if (options.length === 0) return '';
  return `Prove any of keys ${joinKeys(options)} to Comfortable status and the `
    + 'rung comes back.';
}

const ORDINAL: Record<number, string> = {
  0: 'first', 1: 'second', 2: 'third', 3: 'fourth',
};

/** "A, D or G" — an Oxford-free list, because these are alternatives
 *  and "or" is the whole point. */
function joinKeys(names: ReadonlyArray<string>): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

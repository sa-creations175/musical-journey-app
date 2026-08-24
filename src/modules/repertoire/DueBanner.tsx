import { spellKey, type Spelling } from '../../lib/spelling';
import { daysUntilDue } from './matrix/keySpacing';
import type { SongDueReading } from './songDueState';

/**
 * That a key is coming due, before it costs anything.
 *
 * ---------------------------------------------------------------
 * THE RULE VISIBLE BEFORE IT ACTS, NOT ONLY AFTER.
 *
 * `DemotionNotice` says what a song LOST, and says it well: the date,
 * the criterion, the key, and what still holds. But it can only speak
 * once the loss has happened. The per-key markers in the grid say
 * "due" and "soon" at the right grain and are invisible until you
 * scroll to the matrix and read a twelve-row column of two-character
 * labels.
 *
 * Between those two there was nothing at song level — no moment where
 * the app said "this is about to cost you something, and here is what
 * to play". That gap is the half the spec's "the rule is visible
 * before it acts" was asking for, and this is it.
 * ---------------------------------------------------------------
 *
 * NEVER SHOWN FOR AN OVERDUE KEY. See `songDueReading`: overdue is
 * different in kind, the rung has already dropped, and the demotion
 * notice owns that ground. Two banners about one key, one saying "act
 * now" and one saying "it is gone", would be the page arguing with
 * itself.
 *
 * NAMES THE KEY AND THE WORK. "Something is due" sends you looking;
 * the key name and the number of days are what you act on. The rung
 * carries "status" and the key carries "the key of", the same two
 * naming rules `DemotionNotice` states at length.
 */
export default function DueBanner({
  due, now, spelling,
}: {
  due: SongDueReading;
  now: number;
  spelling: Spelling;
}) {
  const overdueTone = due.state === 'due';
  const keys = overdueTone ? due.dueKeys : due.soonKeys;
  const names = keys.map(k => spellKey(k.key.keyName, spelling));

  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs ${
        overdueTone
          ? 'border-[#E88943]/40 bg-[#E88943]/5 text-neutral-700 dark:text-neutral-200'
          : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
      }`}
    >
      <span className="font-medium">
        {overdueTone
          ? `${keyPhrase(names)} due to be proven again.`
          : `${keyPhrase(names)} due soon${soonestSuffix(due, now)}.`}
      </span>{' '}
      <span className="text-neutral-600 dark:text-neutral-300">
        {/* WHAT TO PLAY, not just that something is wrong. A warning
            you cannot act on is a warning you learn to scroll past,
            and the action here is one sentence long. */}
        Three clean run-throughs in a row, in one sitting, holds it —
        and pushes the next one further out.
      </span>
    </div>
  );
}

/** "The key of A", "keys A and D", "keys A, D and 2 more". Never a
 *  bare letter at the start of a sentence, where it reads as a word. */
function keyPhrase(names: ReadonlyArray<string>): string {
  if (names.length === 1) return `The key of ${names[0]} is`;
  if (names.length === 2) return `Keys ${names[0]} and ${names[1]} are`;
  const rest = names.length - 2;
  return `Keys ${names[0]}, ${names[1]} and ${rest} more are`;
}

/**
 * " — in 4 days" when that can be said, nothing when it cannot.
 *
 * The soonest of the warned keys, because a range would need two
 * numbers to say one thing. Omitted rather than guessed when the due
 * date is missing: a warning with an invented deadline is worse than
 * one with none.
 */
function soonestSuffix(due: SongDueReading, now: number): string {
  const days = due.soonKeys
    .map(k => daysUntilDue(k.nextDueAt, now))
    .filter((d): d is number => d !== null);
  if (days.length === 0) return '';
  const soonest = Math.min(...days);
  if (soonest <= 0) return '';
  return ` — in ${soonest} day${soonest === 1 ? '' : 's'}`;
}

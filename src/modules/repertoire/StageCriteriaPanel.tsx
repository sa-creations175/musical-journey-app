import { spellKey, type Spelling } from '../../lib/spelling';
import { KEY_DUE_STATE_LABEL, type KeyDueState } from './matrix/keySpacing';
import type { StageCriterion } from './stage';

/** One key that can hold a rung, and where it stands. */
export interface HoldingKey {
  keyName: string;
  state: KeyDueState;
  /** Whole days until due; negative once past it, null when the key
   *  has never been proven. */
  daysUntil: number | null;
}

/**
 * What would advance this song, with progress against it.
 *
 * ---------------------------------------------------------------
 * VISIBLE BEFORE IT FIRES, WHICH IS THE ENTIRE POINT.
 *
 * The stage rules used to explain themselves only once they had
 * already triggered — a ✨ banner appeared and said why. Before that
 * there was no way to ask "what would advance this song?", and
 * STAGE_GUIDANCE is coaching prose ("work at or near target tempo"),
 * not criteria. So every rule was invisible until it was moot, which
 * is exactly the hidden-rule class the dashboard's per-row panel was
 * built to close.
 *
 * Criteria come from `stageCriteria`, which `evaluateAdvancement` is
 * itself derived from — so this panel cannot show three of three
 * beside a rule that declines to fire.
 * ---------------------------------------------------------------
 */
export default function StageCriteriaPanel({
  criteria,
  holding,
  spelling,
}: {
  criteria: StageCriterion[];
  /** The keys currently capable of holding a rung — comfortable or
   *  better. Empty until a song has one. */
  holding: HoldingKey[];
  spelling: Spelling;
}) {
  // Terminal stage. Saying "nothing more to do" would be wrong —
  // there is upkeep — but that belongs to STAGE_GUIDANCE above,
  // which carries it. An empty panel is the honest render.
  if (criteria.length === 0) return null;

  const metCount = criteria.filter(c => c.met).length;

  return (
    <div className="rounded-md border border-black/[0.07] bg-neutral-50 dark:bg-neutral-900 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide font-medium text-neutral-500 dark:text-neutral-400">
          what would advance this song
        </span>
        <span className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
          {metCount}/{criteria.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {criteria.map(c => (
          <CriterionRow key={c.label} criterion={c} />
        ))}
      </ul>
      <HoldingThisRung holding={holding} spelling={spelling} />
    </div>
  );
}

/**
 * Which keys are holding the rung, and for how much longer.
 *
 * ---------------------------------------------------------------
 * THE RULE IS VISIBLE BEFORE IT ACTS, NOT ONLY AFTER.
 *
 * A song can lose a rung now — `isHeld` reads a due date, and a key
 * that stops being re-proven stops counting. A drop that arrives with
 * no warning is the same failure as a rule that only explains itself
 * once it has fired: correct, and impossible to act on. So every key
 * that can hold this rung says where it stands, and the two sentences
 * around it say what will happen and when.
 * ---------------------------------------------------------------
 *
 * ONLY THESE KEYS CAN GO OVERDUE, and the copy says so outright. The
 * breadth half of Cross-key → Internalized reads run-throughs, which
 * are events with a timestamp and no expiry — a clean run is a thing
 * that happened and it stays happened. Without that line, eight keys
 * that never appear here read as a bug.
 */
function HoldingThisRung({
  holding,
  spelling,
}: {
  holding: HoldingKey[];
  spelling: Spelling;
}) {
  if (holding.length === 0) return null;

  const sorted = orderHoldingKeys(holding);

  return (
    <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-1.5">
      <div className="text-[11px] uppercase tracking-wide font-medium text-neutral-500 dark:text-neutral-400">
        holding this rung
      </div>
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
        a key stays held while it is proven often enough — the interval stretches
        each time you pass, and shortens when you don’t.
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {sorted.map(k => (
          <span key={k.keyName} className="text-xs whitespace-nowrap">
            <span className="font-medium font-mono text-neutral-800 dark:text-neutral-100">
              {spellKey(k.keyName, spelling)}
            </span>
            <span className={[
              'ml-1',
              k.state === 'overdue' ? 'text-needswork'
                : k.state === 'due' ? 'text-[#E88943]'
                : 'text-neutral-500 dark:text-neutral-400',
            ].join(' ')}>
              · {describeDue(k)}
            </span>
          </span>
        ))}
      </div>
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
        when a key goes overdue past its grace period it stops counting toward
        this rung, and the song drops to whatever rung still holds.{' '}
        <span className="text-neutral-400 dark:text-neutral-500">
          the other keys don’t go overdue — a clean run is a thing that happened,
          and it stays happened. only the keys you are holding need re-proving.
        </span>
      </p>
    </div>
  );
}

/**
 * Worst first: the key about to cost you something is the one worth
 * reading, and a held key needs no attention at all. Exported so the
 * order can be asserted without rendering — it is a rule about what
 * the user sees first, not a styling choice.
 */
export function orderHoldingKeys(holding: ReadonlyArray<HoldingKey>): HoldingKey[] {
  const rank: Record<KeyDueState, number> = {
    'overdue': 0, 'due': 1, 'due-soon': 2, 'held': 3,
  };
  return [...holding].sort((a, b) =>
    rank[a.state] - rank[b.state] || a.keyName.localeCompare(b.keyName));
}

/**
 * What a key's standing reads as.
 *
 * The null branch is BELT. `keyDueState(null, …)` returns 'held', so a
 * key with no due date always arrives here in a state that returns
 * before the day count is used — verified by reversal, where removing
 * the guard left every test green. It earns its place only if that
 * pairing ever stops holding, and it costs one line to keep "due in
 * null days" structurally impossible rather than merely unreachable.
 */
export function describeDue(k: HoldingKey): string {
  if (k.daysUntil === null) return KEY_DUE_STATE_LABEL[k.state];
  if (k.state === 'overdue') return `overdue ${Math.abs(k.daysUntil)}d`;
  if (k.state === 'due') return 'due now';
  if (k.state === 'due-soon') return `due in ${k.daysUntil}d`;
  return 'held';
}


function CriterionRow({ criterion }: { criterion: StageCriterion }) {
  const { label, met, have, need, detail } = criterion;
  // A yes/no criterion showing "0 of 1" is noise — the tick already
  // says it. Counts are only worth printing where there is a distance
  // to travel.
  const showCount = need > 1;

  return (
    <li className="flex items-start gap-2 text-xs">
      <span
        aria-hidden
        className={[
          'shrink-0 mt-[1px] w-4 h-4 rounded-full border flex items-center justify-center text-[10px] leading-none',
          met
            ? 'border-fluent bg-fluent text-white'
            : 'border-neutral-300 dark:border-neutral-600 text-transparent',
        ].join(' ')}
      >
        ✓
      </span>
      <span className="flex-1 min-w-0">
        <span className={met
          ? 'text-neutral-500 dark:text-neutral-400'
          : 'text-neutral-800 dark:text-neutral-100'}
        >
          {label}
          {showCount && (
            <span className="ml-1.5 tabular-nums text-neutral-500 dark:text-neutral-400">
              {have} of {need}
            </span>
          )}
          <span className="sr-only">{met ? ' — done' : ' — not yet'}</span>
        </span>
        {/* Only when unmet. A satisfied criterion explaining how to
            satisfy it is clutter on the thing you already did. */}
        {!met && detail && (
          <span className="block mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
            {detail}
          </span>
        )}
      </span>
    </li>
  );
}

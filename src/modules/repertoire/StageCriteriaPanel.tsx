import { useEffect, useState } from 'react';
import { getPref, setPref } from '../../lib/userPrefs';
import { spellKey, type Spelling } from '../../lib/spelling';
import { KEY_DUE_STATE_LABEL, type KeyDueState } from './matrix/keySpacing';
import { STAGE_LABEL, type LadderGroup, type StageCriterion } from './stage';

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
  groups,
  holding,
  spelling,
  /** The criterion satisfied by the thing that just happened, if
   *  anything did. Its row animates from dot to tick on arrival
   *  rather than being already ticked — see CriterionRow. */
  justMetLabel = null,
  /** When that happened. Identity, not a clock: it is compared
   *  against the last moment the panel auto-opened, so one climb
   *  opens the panel exactly once however many times you reload. */
  justMetAt = null,
}: {
  groups: LadderGroup[];
  /** The keys currently capable of holding a rung — comfortable or
   *  better. Empty until a song has one. */
  holding: HoldingKey[];
  spelling: Spelling;
  justMetLabel?: string | null;
  justMetAt?: number | null;
}) {
  const { open, setOpen, ready } = usePanelDisclosure(justMetAt);
  // Terminal stage. Saying "nothing more to do" would be wrong —
  // there is upkeep — but that belongs to STAGE_GUIDANCE above,
  // which carries it. An empty panel is the honest render.
  if (groups.length === 0) return null;

  // WHAT'S NEXT, NOT A TOTAL. The header used to sum met criteria
  // across every rung — a number whose only honest label is "rules
  // satisfied", which is not a thing anyone wants to know, and which
  // counted work on rungs you have not reached. Collapsed, it shows
  // the CURRENT rung's own count instead; expanded it shows nothing,
  // because that same count is on the current group's heading two
  // lines below and saying it twice is worse than not saying it.
  const current = groups.find(g => g.status === 'current');

  return (
    /* ---------------------------------------------------------------
       CLOSED BY DEFAULT, BECAUSE THE GRID IS WHAT THE PAGE IS FOR.

       This is reference material you consult occasionally; the matrix
       is the reason you opened the song. An open panel of six
       criteria pushed several key rows below the fold on every load
       to answer a question that was not being asked.

       The heading keeps the count, so collapsed still says where you
       stand — "1 of 5 met" is the answer at a glance, and the rows
       behind it are the working.
       --------------------------------------------------------------- */
    <div className="rounded-md border border-black/[0.07] bg-neutral-50 dark:bg-neutral-900 px-3 py-2.5 space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="text-[11px] uppercase tracking-wide font-medium text-neutral-500 dark:text-neutral-400">
          what would advance this song
        </span>
        <span className="flex items-center gap-1.5">
          {/* "0/1" said nothing about what was being counted. It counts
              criteria, and the word is cheap. */}
          {!open && current && (
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              <span className="tabular-nums">
                {current.headline.have} of {current.headline.need}
              </span>{' '}
              {current.headline.unit}
            </span>
          )}
          <span aria-hidden className="text-[9px] text-neutral-400">
            {open ? '▾' : '▸'}
          </span>
        </span>
      </button>
      {/* `ready` gates the FIRST paint only: the stored state arrives a
          tick after mount, and rendering the open body before it lands
          would flash the panel open on every load for a user who keeps
          it closed. */}
      {ready && open && (
      <>
      <div className="space-y-2.5">
        {groups.map(group => (
          <RungGroup
            key={group.earns}
            group={group}
            justMetLabel={justMetLabel}
          />
        ))}
      </div>
      {/* ---------------------------------------------------------------
          THE PANEL HAS TO ADMIT THAT A TICK CAN GO BACKWARDS.

          Every group is recomputed against current state, earned ones
          included, so a lapsed quadrant key un-ticks a group you
          passed months ago and the song drops with it. That is the
          correct behaviour and the demotion notice reports it — but a
          list of ticks reads as a record of things achieved unless it
          says otherwise, and a mark that can be taken away has to say
          so BEFORE it is taken away rather than after.
          --------------------------------------------------------------- */}
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
        this is where the song stands now, not a list of things you have
        done — a tick comes off again if the key behind it lapses.
      </p>
      <HoldingThisRung holding={holding} spelling={spelling} />
      </>
      )}
    </div>
  );
}

/**
 * Whether the panel is open, remembered between visits — and forced
 * open once when a rung is earned.
 *
 * ---------------------------------------------------------------
 * A TICK LANDING INSIDE A CLOSED BOX IS A TICK NOBODY SEES.
 *
 * The moment depends on the panel being on screen: the criterion
 * animates from dot to tick so the change is WITNESSED rather than
 * discovered. Collapsed by default, that animation would play inside
 * a closed container and the payoff would be a page that quietly
 * differed — the exact thing the sequence exists to avoid.
 *
 * So a climb opens the panel. Not "while a climb is standing", which
 * would re-open it every time you loaded the page and make closing it
 * impossible: `stageEarned` persists until the next practice. It
 * opens once PER CLIMB, keyed on `stageEarned.at`, and after that
 * your toggle wins. Reloading before you close it changes nothing,
 * because the open state was already written.
 * ---------------------------------------------------------------
 */
const PREF_OPEN = 'songCriteriaPanelOpen';
const PREF_AUTO_OPENED_FOR = 'songCriteriaPanelAutoOpenedFor';

function usePanelDisclosure(justMetAt: number | null) {
  const [open, setOpenState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [stored, autoOpenedFor] = await Promise.all([
        getPref<boolean>(PREF_OPEN, false),
        getPref<number | null>(PREF_AUTO_OPENED_FOR, null),
      ]);
      if (!live) return;
      const isNewClimb = justMetAt !== null && justMetAt !== autoOpenedFor;
      if (isNewClimb) {
        setOpenState(true);
        setReady(true);
        await Promise.all([
          setPref(PREF_OPEN, true),
          setPref(PREF_AUTO_OPENED_FOR, justMetAt),
        ]);
        return;
      }
      setOpenState(stored);
      setReady(true);
    })();
    return () => { live = false; };
  }, [justMetAt]);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    void setPref(PREF_OPEN, next);
  };

  return { open, setOpen, ready };
}

/**
 * One rung's criteria, headed by the rung they earn.
 *
 * ---------------------------------------------------------------
 * RUNGS YOU HAVE NOT REACHED COLLAPSE.
 *
 * Earned and current rungs are open: what you have is worth seeing
 * beside what is left. Everything further up is a heading and a
 * count until you ask for it. At Learning, a wall of criteria three
 * rungs away reads as failure rather than as a path — "0 of 8 keys"
 * is not information you can act on today, and it is the first thing
 * your eye lands on.
 * ---------------------------------------------------------------
 */
function RungGroup({
  group,
  justMetLabel,
}: {
  group: LadderGroup;
  justMetLabel: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const open = group.status !== 'ahead' || expanded;
  const allMet = group.criteria.every(c => c.met);

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={group.status === 'ahead' ? () => setExpanded(v => !v) : undefined}
        // Only the collapsed rungs are controls. The open ones are
        // headings, and a heading that reports pressed state to a
        // screen reader is a heading pretending to be a button.
        {...(group.status === 'ahead'
          ? { 'aria-expanded': expanded }
          : { disabled: true, tabIndex: -1 })}
        className={[
          'w-full flex items-center gap-2 text-left',
          group.status === 'ahead' ? 'cursor-pointer' : 'cursor-default',
        ].join(' ')}
      >
        <StatusMark met={allMet} />
        <span className={[
          'text-[11px] uppercase tracking-wide font-medium',
          group.status === 'current'
            ? 'text-neutral-700 dark:text-neutral-200'
            : 'text-neutral-500 dark:text-neutral-400',
        ].join(' ')}>
          {STAGE_LABEL[group.earns]}
        </span>
        {/* The rung's own work, in the rung's own unit — both read
            off the criterion that produced them, never composed
            here. A hand-written unit beside a rule that counts
            something else is drift with nothing to catch it. */}
        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
          <span className="tabular-nums">
            {group.headline.have} of {group.headline.need}
          </span>{' '}
          {group.headline.unit}
        </span>
        {group.status === 'ahead' && (
          <span aria-hidden className="text-[9px] text-neutral-400 ml-auto">
            {expanded ? '▾' : '▸'}
          </span>
        )}
      </button>
      {open && (
        <ul className="space-y-1.5 pl-6">
          {group.criteria.map(c => (
            <CriterionRow
              key={c.label}
              criterion={c}
              justMet={c.label === justMetLabel}
            />
          ))}
        </ul>
      )}
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
            <span className="text-neutral-800 dark:text-neutral-100">
              key of{' '}
              <span className="font-medium font-mono">
                {spellKey(k.keyName, spelling)}
              </span>
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
        this status, and the song drops to whatever status still holds.{' '}
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


/**
 * The dot / tick mark, shared by a criterion row and a rung heading.
 *
 * ---------------------------------------------------------------
 * A STATUS MARK, NOT A CONTROL.
 *
 * Unmet used to be an empty ring — which is a checkbox, and a
 * checkbox invites a tap. Nothing here is tappable: these are things
 * the app observes about your playing, not things you assert. You
 * cannot tick "whole-song test passed"; you pass it.
 *
 * `justMet` is the moment. The tick lands WHILE YOU ARE LOOKING AT
 * IT rather than being already there when you arrive — the row
 * mounts showing the dot and transitions to the tick on the next
 * frame. Under `prefers-reduced-motion` the transition is dropped and
 * the tick is simply there; the information is identical either way,
 * which is the test for whether an animation was carrying meaning it
 * should not have been.
 * ---------------------------------------------------------------
 */
function StatusMark({ met, justMet = false }: { met: boolean; justMet?: boolean }) {
  const [landed, setLanded] = useState(!justMet);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (landed) return;
    if (reduced) { setLanded(true); return; }
    // Two frames: one to paint the un-ticked state, one to change it.
    // A single frame can be coalesced into the mount paint, which is
    // exactly the "already ticked on arrival" this exists to avoid.
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(() => setLanded(true));
    });
    return () => cancelAnimationFrame(outer);
  }, [landed, reduced]);

  const showTick = met && landed;

  return (
    <span
      aria-hidden
      className="shrink-0 mt-[1px] w-4 h-4 flex items-center justify-center"
    >
      {showTick ? (
        <span
          className={[
            'w-4 h-4 rounded-full bg-fluent text-white flex items-center',
            'justify-center text-[10px] leading-none',
            justMet && !reduced ? 'motion-safe:animate-[ping_0.4s_ease-out_1]' : '',
          ].join(' ')}
        >
          ✓
        </span>
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600" />
      )}
    </span>
  );
}

/** The viewer's motion preference, live. Read here rather than left
 *  to a CSS media query because the two-frame landing above is
 *  JavaScript and has to be skipped, not merely un-animated. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

function CriterionRow({
  criterion,
  justMet = false,
}: {
  criterion: StageCriterion;
  justMet?: boolean;
}) {
  const { label, met, have, need, detail } = criterion;
  // A yes/no criterion showing "0 of 1" is noise — the tick already
  // says it. Counts are only worth printing where there is a distance
  // to travel.
  const showCount = need > 1;

  return (
    <li className="flex items-start gap-2 text-xs">
      <StatusMark met={met} justMet={justMet} />
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

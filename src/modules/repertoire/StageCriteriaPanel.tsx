import type { StageCriterion } from './stage';

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
}: {
  criteria: StageCriterion[];
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
    </div>
  );
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

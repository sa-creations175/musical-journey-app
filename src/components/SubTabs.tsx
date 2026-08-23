/**
 * The sub-tab ribbon, once.
 *
 * ---------------------------------------------------------------
 * IT WAS SIZED FOR ITS LONGEST SUBTITLE, NOT ITS LABELS.
 *
 * Every tab rendered its hint as a second line under the label, so
 * the whole ribbon took the height of whichever hint wrapped — on
 * Shapes & Patterns, "triads, sevenths, extensions — 12 keys" wrapped
 * to two lines and set the height for all four tabs. Four words of
 * navigation cost three lines of vertical space on every screen that
 * had one.
 *
 * The hint is not lost: it is the `title`, where it costs nothing
 * until it is wanted. A subtitle you read once and then scroll past
 * forever is not worth a permanent line.
 * ---------------------------------------------------------------
 *
 * EXTRACTED RATHER THAN FIXED TWICE. Two screens had the same markup
 * copied, and fixing both in place would have left two copies to
 * diverge again — which is how they came to differ in `min-w` and
 * nothing else. One component, one height.
 */

export interface SubTab<Id extends string> {
  id: Id;
  label: string;
  /** Shown on hover and to assistive tech. Never rendered inline. */
  hint?: string;
}

interface Props<Id extends string> {
  tabs: ReadonlyArray<SubTab<Id>>;
  active: Id;
  onChange: (id: Id) => void;
  /** Names the group for assistive tech, e.g. "repertoire view". */
  label: string;
}

export default function SubTabs<Id extends string>({
  tabs, active, onChange, label,
}: Props<Id>) {
  return (
    <nav
      className="flex items-center gap-1 p-0.5 rounded-lg border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur flex-wrap"
      aria-label={label}
    >
      {tabs.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          aria-pressed={active === t.id}
          title={t.hint}
          className={`flex-1 min-w-[110px] px-3 py-1.5 rounded-md text-sm font-medium transition text-center ${
            active === t.id
              ? 'bg-fluent text-white shadow-sm'
              : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

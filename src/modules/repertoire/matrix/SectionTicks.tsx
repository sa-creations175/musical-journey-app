import type { SongMatrixSection } from '../../../lib/db';

/**
 * Which sections a sitting covered.
 *
 * Pre-ticked with the tapped one by the caller, because tapping a cell
 * IS saying you are working on that section. Everything else stays a
 * claim the user makes — the app records what it is told, not what it
 * infers from where a finger landed.
 *
 * Shared by the practice panel and the rating step, which ask about
 * the same set at two different moments and so word the question two
 * different ways: one is about what you are ABOUT to do, the other
 * about what you did. The chips are identical and the state carries
 * across, so confirming at the end is a glance rather than a re-entry.
 */
export default function SectionTicks({
  label, sections, ticked, onToggle, onSelectAll,
}: {
  label: string;
  sections: ReadonlyArray<SongMatrixSection>;
  ticked: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
}) {
  const all = sections.length > 0 && sections.every(s => ticked.has(s.id));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] text-neutral-600 dark:text-neutral-300">
          {label}
        </span>
        {!all && (
          <button
            type="button"
            onClick={onSelectAll}
            className="text-[11px] text-fluent hover:underline underline-offset-2"
          >
            select all
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sections.map(s => {
          const on = ticked.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              aria-pressed={on}
              className={`px-2.5 py-1 rounded-md border text-xs ${
                on
                  ? 'bg-fluent text-white border-fluent'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent'
              }`}
            >
              {s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

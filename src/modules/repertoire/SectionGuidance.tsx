import { useState, type ReactNode } from 'react';
import { SONG_PAGE_GUIDANCE, type SongGuidanceKey } from './songPageGuidance';

/**
 * The "what is this for" affordance on a song-page section.
 *
 * Collapsed by default and opened from a small ⓘ beside the heading —
 * the same shape as the dashboard's per-row panel, for the same
 * reason. Guidance that is always expanded becomes furniture you stop
 * seeing after a week; guidance with no entry point is guidance
 * nobody finds on the day they need it.
 */
export default function SectionGuidance({ surface }: { surface: SongGuidanceKey }) {
  const [open, setOpen] = useState(false);
  const groups = SONG_PAGE_GUIDANCE[surface];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={open ? 'Hide guidance for this section' : 'What is this section for?'}
        title="What is this section for?"
        className={[
          'shrink-0 w-5 h-5 rounded-full border text-[11px] leading-none font-medium transition-colors',
          open
            ? 'border-fluent bg-fluent text-white'
            : 'border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:border-fluent hover:text-fluent',
        ].join(' ')}
      >
        i
      </button>
      {open && (
        <div className="basis-full rounded-md border border-black/[0.07] bg-neutral-50 dark:bg-neutral-900 px-3 py-2.5 space-y-3">
          {groups.map(group => (
            <div key={group.heading} className="space-y-1">
              <div className="text-[11px] uppercase tracking-wide font-medium text-neutral-500 dark:text-neutral-400">
                {group.heading}
              </div>
              <ul className="space-y-1">
                {group.bullets.map((b, i) => (
                  <li
                    key={i}
                    className="text-xs text-neutral-700 dark:text-neutral-200 leading-snug flex gap-1.5"
                  >
                    <span aria-hidden className="text-neutral-400 shrink-0">·</span>
                    <span>{emphasise(b)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Render `**bold**` spans in the copy.
 *
 * The bullets name real controls — "Test song", "log a run",
 * "learning status" — and a reader scanning for the thing they just
 * saw on screen should find it without reading the sentence. Markdown
 * in the source keeps the copy readable as prose, which matters
 * because it is edited far more often than it is rendered.
 */
function emphasise(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-medium text-neutral-900 dark:text-neutral-50">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>,
  );
}

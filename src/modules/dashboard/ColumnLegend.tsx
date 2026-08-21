/**
 * What a column means, opened from the column itself.
 *
 * ─── Why this exists ─────────────────────────────────────────────────
 *
 * Every number on this screen is the kind `docs/RULE_LEGIBILITY.md`
 * calls the worst kind: one that means something other than what it
 * appears to mean. A screen whose numbers cannot be interrogated is the
 * status report on not practising that the redesign exists to replace.
 *
 * ─── Why it is hidden until asked ────────────────────────────────────
 *
 * Available where the thing is, out of the way until wanted. An
 * always-visible legend would spend vertical space on every screen —
 * the scarcest thing in the case that matters most, a phone at the gym —
 * on something read twice and then stopped being seen.
 *
 * ─── Why two legends and never one ───────────────────────────────────
 *
 * The score column carries two scales. They share four colours so a red
 * cell means the same KIND of thing wherever it appears, and they do not
 * share their numbers at all: a self-rated 75 is *comfortable*, not
 * "75% correct". One merged legend would say the colours mean one thing.
 * The split is the whole point, so the panel puts them side by side and
 * heads each with its own kind.
 *
 * Presentational. It takes a topic and renders it; the screen owns which
 * topic is open, so only one can be.
 */
import {
  ACCURACY_LEGEND,
  BAND_SWATCH_CLASS,
  COLUMN_RULES,
  FLUENCY_LEGEND,
  type ColumnTopic,
  type LegendEntry,
} from './bands';

/** The `?` that opens one. Sits ON the thing it explains. */
export function ColumnHelpButton({
  topic, open, onToggle,
}: {
  topic: ColumnTopic;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`column-help-${topic}`}
      data-open={open ? 'true' : 'false'}
      aria-expanded={open}
      aria-controls={`column-legend-${topic}`}
      aria-label={`What ${topic === 'due' ? 'due' : `the ${topic} column`} means`}
      onClick={onToggle}
      className={`ml-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center
        rounded-full border text-[9px] leading-none transition ${
        open
          ? 'border-fluent text-fluent'
          : 'border-neutral-300 text-neutral-400 hover:border-neutral-500 '
            + 'hover:text-neutral-600 dark:border-neutral-600 dark:hover:text-neutral-300'
      }`}
    >
      ?
    </button>
  );
}

function LegendColumn({
  kind, entries, note, showValue,
}: {
  kind: string;
  entries: ReadonlyArray<LegendEntry>;
  note: string;
  /** Fluency only. Its labels are words, and the value a rating is
   *  worth is the thing the score cell actually shows. An accuracy
   *  label already carries its numbers, so repeating them would say
   *  the same thing twice. */
  showValue?: boolean;
}) {
  return (
    <div data-testid={`legend-${kind}`} className="min-w-0 flex-1">
      <div className="text-[10px] uppercase tracking-wider text-neutral-400">
        {note}
      </div>
      <ul className="mt-1 space-y-0.5">
        {entries.map(entry => (
          <li
            key={entry.band}
            data-band={entry.band}
            className="flex items-center gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-300"
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-sm ${BAND_SWATCH_CLASS[entry.band]}`}
            />
            <span className="truncate">{entry.label}</span>
            {showValue && (
              <span className="ml-auto shrink-0 tabular-nums text-neutral-400">
                {entry.value}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ColumnLegend({ topic }: { topic: ColumnTopic }) {
  return (
    <div
      id={`column-legend-${topic}`}
      data-testid="column-legend"
      data-topic={topic}
      role="region"
      className="border-b border-neutral-200 bg-neutral-50 px-2 py-2
        dark:border-neutral-800 dark:bg-neutral-900/60"
    >
      {topic === 'score' && (
        <div className="mb-2 flex gap-4">
          {/* Two legends, never one combined: the colours match and the
              meanings do not. */}
          <LegendColumn
            kind="accuracy"
            note="accuracy — measured"
            entries={ACCURACY_LEGEND}
          />
          <LegendColumn
            kind="fluency"
            note="fluency — self-rated"
            entries={FLUENCY_LEGEND}
            showValue
          />
        </div>
      )}
      <dl className="space-y-1.5">
        {COLUMN_RULES[topic].map(({ rule, why }) => (
          <div key={rule}>
            <dt className="text-[11px] text-neutral-700 dark:text-neutral-200">
              {rule}
            </dt>
            {/* The WHY, always. A rule without its reason reads as an
                arbitrary constraint. */}
            <dd className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
              {why}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

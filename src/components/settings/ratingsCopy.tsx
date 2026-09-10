/**
 * The pieces the Ratings and Unlocking sections are built from.
 *
 * =====================================================================
 * A RATING WORD IS ALWAYS IN ITS OWN COLOUR, EVERYWHERE ON THIS PAGE.
 *
 * The page explains what the four words mean, and the reader meets
 * those words as colours on every grid in the app. Printing them here
 * in the page's ordinary ink would make this the one screen where
 * "Fluent" is not green — the exact drift `statusColour` exists to
 * prevent. So `RatingWord` is the only way this page writes one, and it
 * reads the same map the grids read.
 *
 * `Started` is the exception the colour map already makes: it is a pale
 * wash, unreadable as coloured text, and is drawn as its badge.
 * =====================================================================
 */
import type { ReactNode } from 'react';
import { statusColour, type StatusKey } from '../../lib/spacing/statusColour';

/** A rating word, in its own colour. */
export function RatingWord({ status, children }: {
  status: StatusKey; children: ReactNode;
}) {
  return (
    <b className={statusColour(status).text} data-status={status}>{children}</b>
  );
}

/** Started, which is a badge rather than a coloured word. */
export function StartedBadge() {
  return (
    <span
      data-status="started"
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${
        statusColour('started').badge}`}
    >
      Started
    </span>
  );
}

/**
 * An editable number inside a sentence.
 *
 * IN THE SENTENCE, NOT IN A FORM BESIDE IT. The prototype puts each
 * number where the rule that uses it is stated, so a reader changing
 * "5 answers" is looking at the words "before it gets a rating" while
 * they do it. A settings form listing eight numbers with labels would
 * be the same eight numbers with the reasons taken away.
 */
export function NumberField({
  id, value, min, max, onChange, label,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  /** For a screen reader, which has no sentence to read it in. */
  label: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      data-testid={id}
      aria-label={label}
      value={value}
      min={min}
      max={max}
      onChange={e => {
        const n = Number(e.target.value);
        if (!Number.isFinite(n)) return;
        onChange(Math.max(min, Math.min(max, Math.round(n))));
      }}
      className="w-16 rounded-md border border-neutral-200 dark:border-neutral-700
        bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-sm tabular-nums align-baseline"
    />
  );
}

/**
 * A worked example, in a tinted box.
 *
 * "Example:" IS CAPITALISED AND SO IS THE FIRST WORD AFTER IT — Silas's
 * instruction of 10 Sep 2026. Every one of these is a real card in a
 * real module rather than an abstraction: a reader checking whether
 * they have understood the rule needs somewhere to check it.
 */
export function Example({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800 px-3 py-2.5 text-sm">
      <b>Example:</b> {children}
    </div>
  );
}

/** A two-column table. Every table on this page runs low to high. */
export function RuleTable({ head, rows }: {
  head: ReadonlyArray<string>;
  rows: ReadonlyArray<ReadonlyArray<ReactNode>>;
}) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr>
          {head.map(h => (
            <th
              key={h}
              className="text-left font-semibold uppercase tracking-[0.06em]
                text-[10px] text-neutral-500 border-b border-neutral-200
                dark:border-neutral-700 py-1.5 pr-3"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (
              <td
                key={j}
                className="border-b border-neutral-200 dark:border-neutral-700 py-1.5 pr-3 align-middle"
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A sub-heading inside a section: "A Measured on accuracy". */
export function PartHeading({ letter, children }: {
  letter?: string; children: ReactNode;
}) {
  return (
    <h4 className="text-base font-semibold mt-1 mb-1.5">
      {letter !== undefined && (
        <span className="inline-block min-w-[1.4em] text-fluent font-bold">
          {letter}
        </span>
      )}
      {children}
    </h4>
  );
}

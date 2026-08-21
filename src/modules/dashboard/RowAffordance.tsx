/**
 * One row's explanation, expanded underneath it.
 *
 * Three things, in the order a person actually wants them:
 *
 *   WHAT AM I PRACTISING. First, because the other two are meaningless
 *     without it. A row that cannot say what it trains is a number with
 *     no subject.
 *
 *   WHAT WOULD ADVANCE IT. A row reading "3 of 6 covered" that cannot
 *     say what makes it 4 of 6 is a status report — the thing this
 *     screen exists to replace.
 *
 *   WHAT IS ODD ABOUT THESE NUMBERS. Only where something is: the rules
 *     that make this particular row's figures mean something other than
 *     they appear to. Absent on most rows, which is the point — a
 *     warning on every row is a warning on none.
 *
 * The `ⓘ` sits inside the name cell rather than in a column of its own.
 * Five columns is already what fits on a phone, and the affordance
 * belongs beside the thing it explains.
 *
 * Presentational: it takes a node and renders it. Which row is open is
 * the screen's state, so only one can be.
 */
import {
  advanceHintFor,
  rowNotesFor,
  skillDescriptionFor,
  type RowNoteContext,
} from './read/affordances';
import type { TreeNode } from './read/tree';

export function RowInfoButton({
  label, open, onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="row-info-toggle"
      data-open={open ? 'true' : 'false'}
      aria-expanded={open}
      aria-label={`What ${label} trains, and what would advance it`}
      onClick={onToggle}
      className={`ml-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center
        rounded-full border text-[9px] leading-none transition ${
        open
          ? 'border-fluent text-fluent'
          : 'border-neutral-300 text-neutral-400 hover:border-neutral-500 '
            + 'hover:text-neutral-600 dark:border-neutral-600 dark:hover:text-neutral-300'
      }`}
    >
      i
    </button>
  );
}

function Section({ heading, children }: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-400">
        {heading}
      </div>
      <div className="mt-0.5 text-[11px] leading-snug text-neutral-600 dark:text-neutral-300">
        {children}
      </div>
    </div>
  );
}

export default function RowAffordance({
  node, moduleId, noteContext,
}: {
  node: TreeNode;
  moduleId: string;
  noteContext?: RowNoteContext;
}) {
  const skill = skillDescriptionFor(node, moduleId);
  const advance = advanceHintFor(node, moduleId);
  const notes = rowNotesFor(node, moduleId, noteContext ?? {});

  return (
    <div
      data-testid="row-affordance"
      data-node-id={node.id}
      role="region"
      className="border-b border-neutral-200/60 bg-neutral-50 px-2 py-2
        dark:border-neutral-800/60 dark:bg-neutral-900/60"
      // Indented to the row it belongs to, so a branch of open rows
      // still reads as a tree rather than as a stack of boxes.
      style={{ paddingLeft: `${node.depth * 14 + 26}px` }}
    >
      <div className="space-y-2">
        {skill && (
          <Section heading="what this trains">
            {/* An inherited explanation NAMES the row it was written
                for. Presented as this item's own it would claim a
                specificity it does not have — "chord identification"
                describes 69 rows, and this is one of them. */}
            {skill.inheritedFrom && (
              <span
                data-testid="inherited-from"
                className="mr-1 rounded bg-neutral-200 px-1 text-[10px] text-neutral-600
                  dark:bg-neutral-800 dark:text-neutral-300"
              >
                {skill.inheritedFrom}
              </span>
            )}
            {skill.text}
          </Section>
        )}

        <Section heading="what would advance it">
          <span data-testid="advance-hint">{advance}</span>
        </Section>

        {notes.length > 0 && (
          <Section heading="about these numbers">
            <ul data-testid="row-notes" className="space-y-1">
              {notes.map(note => (
                <li key={note} className="flex gap-1.5">
                  <span aria-hidden="true" className="text-neutral-400">·</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

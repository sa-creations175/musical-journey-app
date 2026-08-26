/**
 * Six modules, stacked, each one's shape visible at a glance.
 *
 * =====================================================================
 * THE STRIP IS THE POINT.
 *
 * A module's overall accuracy is one number, and one number cannot tell
 * "evenly good across twelve categories" from "four excellent and eight
 * never opened". Both average the same. The strip says which: one small
 * square per category, coloured by that category's tier, in catalog
 * order — so a module that is strong at the start and empty at the end
 * LOOKS like that, and six of them stacked can be compared without
 * scrolling back to remember the first.
 *
 * ONE PER CATEGORY, NEVER SAMPLED OR CAPPED. A strip that showed the
 * worst twelve of fifteen would be a chart of a subset wearing the
 * shape of the whole. Fifteen cells wrap onto a second line on a phone,
 * which is fine; dropping three would not be.
 * =====================================================================
 *
 * THE FOOTER COUNTS THE STRIP, and is derived from the same cells
 * rather than recomputed — a count that could disagree with the squares
 * above it is worse than no count, because the squares are the thing
 * being explained.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. The name and the accuracy are text,
 * the sub-line is text, the footer is text, and a cell that is tapped
 * says its category's numbers in words.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { moduleMetaById } from '../../../lib/moduleMeta';
import { TIER_BAR_CLASS, type Tier } from '../../../lib/tier';
import { formatScore } from '../bands';
import type { ModuleTree } from '../read/query';
import type { TreeNode } from '../read/tree';
import { tierForNode } from '../read/tierAdapter';
import { tierWord } from './tierLegend';

const DAY_MS = 24 * 60 * 60 * 1000;

/** One square on a module's strip. */
interface StripCell {
  node: TreeNode;
  tier: Tier;
}

export default function ModuleCards({
  modules, now, onOpenCategory,
}: {
  modules: readonly ModuleTree[];
  now: number;
  /** Where a category's "open" goes. Supplied so this file does not
   *  need to know how any module addresses its own pages. */
  onOpenCategory: (moduleId: string, node: TreeNode) => void;
}) {
  return (
    <div className="space-y-2" data-testid="mobile-modules">
      {modules.map(module => (
        <ModuleCard
          key={module.moduleId}
          module={module}
          now={now}
          onOpenCategory={onOpenCategory}
        />
      ))}
    </div>
  );
}

function ModuleCard({
  module, now, onOpenCategory,
}: {
  module: ModuleTree;
  now: number;
  onOpenCategory: (moduleId: string, node: TreeNode) => void;
}) {
  const navigate = useNavigate();
  /**
   * Which cell's popover is open, by node id.
   *
   * By id rather than index so nothing can move the open panel onto a
   * different category, and one at a time per card — two open popovers
   * would cover the strip they are about.
   */
  const [openId, setOpenId] = useState<string | null>(null);

  const meta = moduleMetaById(module.moduleId);
  const root = module.root;
  const cells: StripCell[] = root.children.map(node => ({
    node, tier: tierForNode(node, now),
  }));
  const open = cells.find(c => c.node.id === openId) ?? null;

  return (
    <section
      data-testid="mobile-module-card"
      data-module={module.moduleId}
      className="rounded-xl border border-black/[0.07] bg-white dark:bg-neutral-900 p-3"
      style={meta ? { borderColor: `${meta.accentHex}33` } : undefined}
    >
      {/* THE NAME IS THE WAY IN. Tapping the module goes to the module
          home — the thing a reader wants after the strip has told them
          which module to look at. */}
      <div className="flex items-baseline gap-2">
        <button
          type="button"
          data-testid="mobile-module-name"
          onClick={() => { if (meta) navigate(meta.route); }}
          disabled={meta === undefined}
          className="font-medium text-sm text-left min-w-0 truncate hover:text-fluent disabled:hover:text-inherit"
        >
          {root.label}
        </button>
        <span
          data-testid="mobile-module-score"
          className="ml-auto text-sm font-mono tabular-nums text-neutral-600 dark:text-neutral-300"
        >
          {formatScore(root.score)}
        </span>
      </div>

      <div className="text-[11px] text-neutral-500 mt-0.5" data-testid="mobile-module-subline">
        {subLine(root, now)}
      </div>

      {/* One square per category, in catalog order. */}
      <div className="flex flex-wrap gap-1 mt-2" data-testid="mobile-module-strip">
        {cells.map(cell => (
          <button
            key={cell.node.id}
            type="button"
            data-testid="mobile-strip-cell"
            data-tier={cell.tier}
            data-node={cell.node.id}
            aria-label={`${cell.node.label} — ${tierWord(cell.tier)}`}
            aria-expanded={openId === cell.node.id}
            title={`${cell.node.label} — ${tierWord(cell.tier)}`}
            onClick={() => setOpenId(id => (id === cell.node.id ? null : cell.node.id))}
            className={`w-5 h-5 rounded-sm border transition ${TIER_BAR_CLASS[cell.tier]} ${
              openId === cell.node.id
                ? 'border-neutral-900 dark:border-neutral-100'
                : 'border-black/10 dark:border-white/10'
            }`}
          />
        ))}
      </div>

      {/* BELOW THE STRIP, IN PLACE. A popover that floated over the
          squares would cover the row it is explaining, and on a phone
          there is nowhere beside a cell for it to go. */}
      {open !== null && (
        <CellPopover
          cell={open}
          now={now}
          onOpen={() => onOpenCategory(module.moduleId, open.node)}
          onClose={() => setOpenId(null)}
        />
      )}

      <div className="text-[11px] text-neutral-500 mt-2" data-testid="mobile-module-footer">
        {stripFooter(cells)}
      </div>
    </section>
  );
}

/**
 * What a cell says when you tap it.
 *
 * NAMES THE CATEGORY FIRST. The square itself carries no text — that is
 * what makes six modules comparable in one screen — so the first job of
 * tapping one is to say what it was.
 */
function CellPopover({
  cell, now, onOpen, onClose,
}: {
  cell: StripCell;
  now: number;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { node, tier } = cell;
  return (
    <div
      data-testid="mobile-cell-popover"
      data-node={node.id}
      className="mt-2 rounded-lg border border-black/[0.07] bg-neutral-50 dark:bg-neutral-800/60 p-2.5 space-y-1.5"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium min-w-0 break-words">{node.label}</span>
        <button
          type="button"
          onClick={onClose}
          data-testid="mobile-cell-popover-close"
          className="ml-auto shrink-0 text-[11px] text-neutral-500 underline"
        >
          close
        </button>
      </div>
      {/* THE NUMBERS AS TEXT, always — the colour is a second reading of
          the first of them, never the only one. */}
      <div className="text-[11px] text-neutral-600 dark:text-neutral-300 tabular-nums">
        {formatScore(node.score)} · {tierWord(tier)}
      </div>
      <div className="text-[11px] text-neutral-500 tabular-nums">
        {coverageLine(node)} · {practisedLine(node.recency.mostRecentAt, now)}
      </div>
      <button
        type="button"
        onClick={onOpen}
        data-testid="mobile-cell-popover-open"
        className="px-2.5 py-1 rounded-md border border-neutral-300 dark:border-neutral-600 text-[11px] hover:border-fluent hover:text-fluent"
      >
        Open
      </button>
    </div>
  );
}

/**
 * "412 attempts · 15 categories · last practised 3d ago".
 *
 * Three facts a single accuracy percentage cannot carry: how much work
 * is behind it, how wide the module is, and whether any of it is
 * recent. Exported for the tests that pin the wording.
 */
export function subLine(root: TreeNode, now: number): string {
  const attempts = `${root.engagementCount} attempt${root.engagementCount === 1 ? '' : 's'}`;
  const n = root.children.length;
  const categories = `${n} categor${n === 1 ? 'y' : 'ies'}`;
  return `${attempts} · ${categories} · ${practisedLine(root.recency.mostRecentAt, now)}`;
}

/** "last practised 3d ago", or that it has not been. */
function practisedLine(mostRecentAt: number | null, now: number): string {
  if (mostRecentAt === null) return 'never practised';
  const days = Math.floor((now - mostRecentAt) / DAY_MS);
  if (days <= 0) return 'last practised today';
  return `last practised ${days}d ago`;
}

/** Coverage in the same words the desktop uses for a parent row. */
function coverageLine(node: TreeNode): string {
  const attempts = `${node.engagementCount} attempt${node.engagementCount === 1 ? '' : 's'}`;
  if (node.totalItems === 0) return attempts;
  const percent = Math.round((node.coveredItems / node.totalItems) * 100);
  return `${percent}% of ${node.totalItems} · ${attempts}`;
}

/**
 * "8 fluent · 4 developing · 3 not enough yet to say".
 *
 * COUNTED OFF THE CELLS THEMSELVES, in strip order, so it cannot
 * disagree with the squares it explains. Zeroes are dropped: a zero is
 * the absence of a thing, and printing it makes the line longer to say
 * nothing happened.
 */
export function stripFooter(cells: ReadonlyArray<StripCell>): string {
  const counts = new Map<string, number>();
  for (const cell of cells) {
    const word = tierWord(cell.tier);
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].map(([word, n]) => `${n} ${word}`).join(' · ');
}

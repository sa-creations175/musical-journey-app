/**
 * Phase 3 Step 4c — Session stack.
 *
 * Vertical stack of SessionBlock components with a hairline (2px)
 * gap between them and rounded/padded container framing. Block
 * heights are proportional to plannedSeconds — a 5-min block is
 * half the height of a 10-min block — using CSS grid template rows
 * with `<seconds>fr` units.
 *
 * The container honors a per-block minimum height so even the
 * shortest blocks render legibly, scaling the total when the
 * session is short. For longer sessions the stack stretches to
 * accommodate the proportions.
 */
import SessionBlock from './SessionBlock';
import type { ProposalBlock } from './proposalTypes';

const MIN_BLOCK_PX = 64;

interface Props {
  blocks: ReadonlyArray<ProposalBlock>;
}

export default function SessionStack({ blocks }: Props) {
  if (blocks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 p-4 text-center text-xs text-neutral-500">
        No blocks in this proposal.
      </div>
    );
  }

  // Total height is bounded below by the per-block minimum so each
  // row has space for the default-state content (~64px). Longer
  // sessions stretch the stack proportionally above that floor.
  const minTotalPx = blocks.length * MIN_BLOCK_PX;

  // gridTemplateRows: "<sec>fr <sec>fr ..." gives each row a share
  // proportional to its plannedSeconds.
  const gridTemplateRows = blocks
    .map(b => `${Math.max(1, b.plannedSeconds)}fr`)
    .join(' ');

  return (
    <div
      className="w-full min-w-0 overflow-hidden grid gap-0.5 p-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
      style={{
        gridTemplateRows,
        minHeight: `${minTotalPx}px`,
      }}
    >
      {blocks.map(block => (
        <SessionBlock key={block.id} block={block} />
      ))}
    </div>
  );
}

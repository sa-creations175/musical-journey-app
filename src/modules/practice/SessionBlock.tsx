/**
 * Phase 3 Step 4a — Single block on the proposal screen, default state.
 *
 * Module-accent left bar + tinted fill, module name (top, small,
 * uppercase), activity description, duration right-aligned, optional
 * warm-up badge. The block height becomes proportional to
 * plannedSeconds when stacked (Step 4c).
 *
 * Step 4b will add the expanded state (why-snippet + quick-launch)
 * with tap-to-toggle behavior. Step 4c stacks blocks proportionally.
 */
import { moduleMetaById } from '../../lib/moduleMeta';
import { formatActiveTime } from '../../lib/sessionTimer/formatActiveTime';
import type { ProposalBlock } from './proposalTypes';

interface Props {
  block: ProposalBlock;
}

export default function SessionBlock({ block }: Props) {
  // Reach moduleMeta for the route (used by 4b's quick-launch) and
  // for the canonical label fallback when block.moduleLabel ends up
  // empty.
  const moduleMeta = moduleMetaById(block.moduleRef);
  const label = block.moduleLabel || moduleMeta?.label || block.moduleRef;

  // Background tint at low opacity over the accent so text stays
  // readable; accent itself comes through on the left bar.
  const tint = `${block.moduleAccentHex}14`; // ~8% alpha

  return (
    <div
      className="w-full rounded-md border"
      style={{
        backgroundColor: tint,
        borderColor: block.moduleAccentHex,
        borderLeftWidth: 3,
      }}
    >
      <div className="px-3 py-2 flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[10px] uppercase tracking-wider font-medium"
              style={{ color: block.moduleAccentHex }}
            >
              {label}
            </span>
            {block.isWarmup && (
              <span
                className="text-[9px] uppercase tracking-wider font-medium px-1 py-px rounded"
                style={{
                  color: block.moduleAccentHex,
                  border: `1px solid ${block.moduleAccentHex}`,
                }}
              >
                warm-up
              </span>
            )}
          </div>
          <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
            {block.activityDescription}
          </div>
        </div>
        <div className="shrink-0 font-mono tabular-nums text-sm text-neutral-700 dark:text-neutral-200">
          {formatActiveTime(block.plannedSeconds * 1000)}
        </div>
      </div>
    </div>
  );
}

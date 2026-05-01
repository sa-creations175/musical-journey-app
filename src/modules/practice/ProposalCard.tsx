/**
 * Phase 3 Step 4d — Single proposal card.
 *
 * One framed card containing:
 *   - Strategic-identity title (e.g. "Stay on track overall")
 *   - Total-time pill in the header
 *   - Session stack (proportional-height blocks)
 *   - "Start this session" confirm button
 *
 * Step 4e will add the "Why this plan?" panel; 4f the inline time
 * adjustment; 4g the +Add block picker; 4h the affirmation
 * surface; 4i the cold-start banner; 4j the feasibility banner.
 * Each substep edits this file.
 */
import { formatActiveTime } from '../../lib/sessionTimer/formatActiveTime';
import SessionStack from './SessionStack';
import type { ProposalCardData } from './proposalTypes';

interface Props {
  data: ProposalCardData;
  onAccept: (data: ProposalCardData) => void;
}

export default function ProposalCard({ data, onAccept }: Props) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-3 space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium tracking-tight text-neutral-800 dark:text-neutral-100">
          {data.title}
        </h4>
        <span className="font-mono tabular-nums text-xs text-neutral-500">
          {formatActiveTime(data.totalSeconds * 1000)} total
        </span>
      </header>
      <SessionStack blocks={data.blocks} />
      <button
        type="button"
        onClick={() => onAccept(data)}
        className="w-full px-3 py-2 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
      >
        start this session
      </button>
    </div>
  );
}

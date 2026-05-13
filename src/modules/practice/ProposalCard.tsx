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
import { useEffect, useState } from 'react';
import { formatActiveTime } from '../../lib/sessionTimer/formatActiveTime';
import AffirmationSurface from './AffirmationSurface';
import SessionStack from './SessionStack';
import TimePicker from './TimePicker';
import type { ProposalBlock, ProposalCardData } from './proposalTypes';

interface Props {
  data: ProposalCardData;
  onAccept: (data: ProposalCardData, opts: { hardBlock: boolean }) => void;
  /**
   * Hard-block toggle state — owned by the parent (ProposalScreen)
   * so both proposals share one value. Passed down to `onAccept`
   * when the user starts. Defaults to true on every fresh proposal-
   * screen mount; not persisted.
   */
  hardBlock: boolean;
  onHardBlockChange: (next: boolean) => void;
  /**
   * Inline time adjustment hook. When supplied, the total-time pill
   * in the header becomes tappable and reveals a TimePicker. Caller
   * regenerates proposals at the new time and pushes new data back
   * via the `data` prop. Step 4f wires this; future integration
   * (Step 5+) supplies the regen.
   */
  onTimeChange?: (minutes: number) => void;
  /**
   * "+ Add block" picker callbacks. When all three are supplied,
   * the picker renders below the session stack. Each callback is
   * fired when the user picks that path:
   *   onAddDeeperOnExisting — Step 4g shows the existing blocks
   *     as a chooser; caller's UX adds a second block for the
   *     chosen module / item.
   *   onAddNextPriority — caller queries the algorithm for the
   *     single next-best item and adds it.
   *   onAddPickYourOwn — caller opens a module browser for full
   *     manual control.
   * 4g lands the entry-point + branching surface; the secondary
   * UX inside each option is integrated in Step 5+.
   */
  onAddDeeperOnExisting?: () => void;
  onAddNextPriority?: () => void;
  onAddPickYourOwn?: () => void;
  /**
   * Pre-picked affirmation surfaced above the start button (Step 4h).
   * Caller picks one via pickRandomAffirmation from the user's past
   * pool; null hides the surface entirely.
   */
  affirmation?: string | null;
}

export default function ProposalCard({
  data,
  onAccept,
  hardBlock,
  onHardBlockChange,
  onTimeChange,
  onAddDeeperOnExisting,
  onAddNextPriority,
  onAddPickYourOwn,
  affirmation,
}: Props) {
  const [whyOpen, setWhyOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const totalMinutes = Math.round(data.totalSeconds / 60);

  // Locally-tracked block order so the user can drag-to-reorder
  // before accepting without mutating the upstream proposal. Reset
  // when the underlying block set changes (e.g. time nudge → fresh
  // proposal). Compare by id signature instead of array reference
  // so an upstream re-render with the same blocks doesn't wipe a
  // user reorder.
  const blockIdSignature = data.blocks.map(b => b.id).join('|');
  const [orderedBlocks, setOrderedBlocks] = useState<ProposalBlock[]>(data.blocks);
  useEffect(() => {
    setOrderedBlocks(data.blocks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockIdSignature]);

  const showAddPicker =
    onAddDeeperOnExisting !== undefined ||
    onAddNextPriority !== undefined ||
    onAddPickYourOwn !== undefined;

  const handleTimeChange = (minutes: number) => {
    onTimeChange?.(minutes);
    // Don't auto-close — user may want to nudge again. Tapping
    // outside or selecting from a different question collapses it
    // (handled by the parent in v1; we just leave the popover open
    // here for fast multi-tap adjustment).
  };

  // Fall back to per-block whySnippets when the integration layer
  // hasn't supplied a hand-tuned whyLines list. Filters out blocks
  // whose snippet is empty so we don't render bare dots.
  const lines: ReadonlyArray<{ accentHex: string; reason: string }> =
    data.whyLines ??
    data.blocks
      .filter(b => b.whySnippet.length > 0)
      .map(b => ({ accentHex: b.moduleAccentHex, reason: b.whySnippet }));

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-3 space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium tracking-tight text-neutral-800 dark:text-neutral-100">
          {data.title}
        </h4>
        {onTimeChange ? (
          <button
            type="button"
            onClick={() => setTimeOpen(v => !v)}
            aria-expanded={timeOpen}
            className="font-mono tabular-nums text-xs text-neutral-500 hover:text-fluent inline-flex items-center gap-1"
          >
            <span>{formatActiveTime(data.totalSeconds * 1000)} total</span>
            <span aria-hidden>{timeOpen ? '↑' : '↓'}</span>
          </button>
        ) : (
          <span className="font-mono tabular-nums text-xs text-neutral-500">
            {formatActiveTime(data.totalSeconds * 1000)} total
          </span>
        )}
      </header>

      {timeOpen && onTimeChange && (
        <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2.5">
          <TimePicker
            value={totalMinutes}
            onChange={handleTimeChange}
            helperText="Adjust session length"
          />
        </div>
      )}
      <SessionStack blocks={orderedBlocks} onReorder={setOrderedBlocks} />

      {showAddPicker && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setAddOpen(v => !v)}
            aria-expanded={addOpen}
            className="text-[11px] text-neutral-500 hover:text-fluent inline-flex items-center gap-1"
          >
            <span aria-hidden>+</span>
            <span>Add block</span>
            <span aria-hidden>{addOpen ? '↑' : '↓'}</span>
          </button>
          {addOpen && (
            <div className="space-y-1">
              {onAddDeeperOnExisting && (
                <AddBlockOption
                  title="Go deeper on something here"
                  subtitle="Pick a block in the session and add more time on it."
                  onClick={() => {
                    setAddOpen(false);
                    onAddDeeperOnExisting();
                  }}
                />
              )}
              {onAddNextPriority && (
                <AddBlockOption
                  title="Next priority"
                  subtitle="Algorithm picks the next best use of your time."
                  onClick={() => {
                    setAddOpen(false);
                    onAddNextPriority();
                  }}
                />
              )}
              {onAddPickYourOwn && (
                <AddBlockOption
                  title="Pick your own"
                  subtitle="Browse modules and choose anything."
                  onClick={() => {
                    setAddOpen(false);
                    onAddPickYourOwn();
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {lines.length > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setWhyOpen(v => !v)}
            aria-expanded={whyOpen}
            className="text-[11px] text-neutral-500 hover:text-fluent inline-flex items-center gap-1"
          >
            <span>Why this plan?</span>
            <span aria-hidden>{whyOpen ? '↑' : '↓'}</span>
          </button>
          {whyOpen && (
            <ul className="space-y-1 text-[11px] text-neutral-600 dark:text-neutral-300">
              {lines.map((line, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1 inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: line.accentHex }}
                  />
                  <span>{line.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <AffirmationSurface affirmation={affirmation ?? null} />

      <HardBlockToggle value={hardBlock} onChange={onHardBlockChange} />

      <button
        type="button"
        onClick={() => onAccept({ ...data, blocks: orderedBlocks }, { hardBlock })}
        className="w-full px-3 py-2 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
      >
        start this session
      </button>
    </div>
  );
}

function HardBlockToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 text-left hover:border-fluent/50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-neutral-800 dark:text-neutral-100">
          Auto-advance blocks
        </div>
        <div className="text-[11px] text-neutral-500">
          Move to next block when time is up
        </div>
      </div>
      <span
        aria-hidden
        className={`shrink-0 inline-flex items-center w-9 h-5 rounded-full transition-colors ${
          value ? 'bg-fluent' : 'bg-neutral-300 dark:bg-neutral-700'
        }`}
      >
        <span
          className={`inline-block w-4 h-4 rounded-full bg-white shadow transform transition-transform ${
            value ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

function AddBlockOption({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-md border border-neutral-200 dark:border-neutral-700 px-2.5 py-1.5 hover:border-fluent hover:text-fluent"
    >
      <div className="text-xs font-medium">{title}</div>
      <div className="text-[10px] text-neutral-500">{subtitle}</div>
    </button>
  );
}

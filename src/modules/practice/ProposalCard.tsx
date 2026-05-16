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
import { moduleMetaById } from '../../lib/moduleMeta';
import { formatActiveTime } from '../../lib/sessionTimer/formatActiveTime';
import AffirmationSurface from './AffirmationSurface';
import SessionStack, { type InlinePrompt } from './SessionStack';
import TimePicker from './TimePicker';
import {
  deletionUnit,
  modulesWithRecipients,
  recipientIdsForModule,
  redistributeProportionally,
} from './proposalRedistribute';
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

  // Locally-tracked block order so the user can drag-to-reorder
  // before accepting without mutating the upstream proposal. Reset
  // when the underlying block set changes (e.g. time nudge → fresh
  // proposal). Compare by id signature instead of array reference
  // so an upstream re-render with the same blocks doesn't wipe a
  // user reorder.
  const blockIdSignature = data.blocks.map(b => b.id).join('|');
  const [orderedBlocks, setOrderedBlocks] = useState<ProposalBlock[]>(data.blocks);
  // Pending redistribution prompts. Each is the in-place picker that
  // appears when the user deletes a block — shows the freed seconds
  // and the per-module / split-evenly options. Cleared alongside
  // orderedBlocks on upstream proposal change.
  const [pendingPrompts, setPendingPrompts] = useState<PendingPrompt[]>([]);
  useEffect(() => {
    setOrderedBlocks(data.blocks);
    setPendingPrompts([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockIdSignature]);

  const handleDelete = (blockId: string) => {
    const idsToRemove = deletionUnit(orderedBlocks, blockId);
    const idsToRemoveSet = new Set(idsToRemove);
    const removedBlocks = orderedBlocks.filter(b => idsToRemoveSet.has(b.id));
    const freedSeconds = removedBlocks.reduce((s, b) => s + b.plannedSeconds, 0);

    // Anchor for the inline prompt = id of the next surviving group's
    // first block. The deleted unit might span multiple consecutive
    // blocks (Rep song anchor + its warm-ups), so look forward from
    // the last removed index.
    const lastRemovedIdx = (() => {
      let last = -1;
      orderedBlocks.forEach((b, i) => { if (idsToRemoveSet.has(b.id)) last = i; });
      return last;
    })();
    const nextBlock = orderedBlocks
      .slice(lastRemovedIdx + 1)
      .find(b => !idsToRemoveSet.has(b.id));
    const anchorGroupId = nextBlock?.id ?? null;

    // Snapshot orderedBlocks BEFORE the removal so committed-undo
    // (later, after the user picks a redistribution destination) can
    // restore deletion + redistribution atomically.
    const preDeleteSnapshot = orderedBlocks;

    setOrderedBlocks(prev => prev.filter(b => !idsToRemoveSet.has(b.id)));
    setPendingPrompts(prev => [
      // Drop any existing committed prompts — their snapshots become
      // stale the moment a new structural change lands.
      ...prev.filter(p => p.status !== 'committed'),
      {
        id: `prompt-${blockId}-${Date.now()}`,
        status: 'pending',
        anchorGroupId,
        freedSeconds,
        deletedBlocks: removedBlocks,
        preDeleteSnapshot,
      },
    ]);
  };

  const handleRedistribute = (
    promptId: string,
    targetModuleRef: string | null,
  ) => {
    const prompt = pendingPrompts.find(p => p.id === promptId);
    if (!prompt) return;
    const recipientIds = recipientIdsForModule(orderedBlocks, targetModuleRef);
    setOrderedBlocks(prev =>
      redistributeProportionally(prev, prompt.freedSeconds, recipientIds),
    );
    // Transition this prompt to 'committed' (post-redistribute undo
    // banner). Drop any OTHER committed prompts — only the most
    // recent commit is undoable; older ones became stale the moment
    // this one landed.
    setPendingPrompts(prev =>
      prev
        .filter(p => p.id === promptId || p.status !== 'committed')
        .map(p => p.id === promptId ? { ...p, status: 'committed' as const } : p),
    );
  };

  const handleSkip = (promptId: string) => {
    // Skip dismisses without redistributing AND without offering
    // undo — per spec, freed time drops the session length and
    // there's no committed-undo follow-up.
    setPendingPrompts(prev => prev.filter(p => p.id !== promptId));
  };

  const handleUndo = (promptId: string) => {
    const prompt = pendingPrompts.find(p => p.id === promptId);
    if (!prompt) return;
    // Restore orderedBlocks to its pre-delete state — reverses both
    // the deletion and any subsequent redistribution in one shot.
    setOrderedBlocks(prompt.preDeleteSnapshot);
    // Hard reset on the prompt stack: undo invalidates any other
    // pending/committed prompts because their snapshots/anchors
    // referenced a state we just reversed.
    setPendingPrompts([]);
  };

  const handleDismissCommitted = (promptId: string) => {
    // User accepts the committed redistribution — drop the undo
    // banner without reversing anything.
    setPendingPrompts(prev => prev.filter(p => p.id !== promptId));
  };

  // Drag-reorder wrapper: also drops committed prompts since their
  // snapshots reference the prior block order, and an undo would
  // wipe the reorder.
  const handleReorder = (next: ProposalBlock[]) => {
    setOrderedBlocks(next);
    setPendingPrompts(prev => prev.filter(p => p.status !== 'committed'));
  };

  // Wrap prompts into the InlinePrompt shape SessionStack expects.
  // The renderer reads orderedBlocks live so the per-module button
  // list reflects deletions that happened after this prompt was
  // created.
  const inlinePrompts: InlinePrompt[] = pendingPrompts.map(p => ({
    id: p.id,
    anchorGroupId: p.anchorGroupId,
    render: () => p.status === 'pending' ? (
      <RedistributionPrompt
        freedSeconds={p.freedSeconds}
        blocks={orderedBlocks}
        onPick={moduleRef => handleRedistribute(p.id, moduleRef)}
        onSkip={() => handleSkip(p.id)}
      />
    ) : (
      <PostCommitUndoBanner
        deletedBlocks={p.deletedBlocks}
        onUndo={() => handleUndo(p.id)}
        onDismiss={() => handleDismissCommitted(p.id)}
      />
    ),
  }));

  // Live total = sum of surviving block seconds. The pre-deletion
  // total came from `data.totalSeconds` (computed upstream); once the
  // user edits the list, that number is stale.
  const totalSecondsLive = orderedBlocks.reduce((s, b) => s + b.plannedSeconds, 0);
  const totalMinutesLive = Math.round(totalSecondsLive / 60);

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
            <span>{formatActiveTime(totalSecondsLive * 1000)} total</span>
            <span aria-hidden>{timeOpen ? '↑' : '↓'}</span>
          </button>
        ) : (
          <span className="font-mono tabular-nums text-xs text-neutral-500">
            {formatActiveTime(totalSecondsLive * 1000)} total
          </span>
        )}
      </header>

      {timeOpen && onTimeChange && (
        <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2.5">
          <TimePicker
            value={totalMinutesLive}
            onChange={handleTimeChange}
            helperText="Adjust session length"
          />
        </div>
      )}
      <SessionStack
        blocks={orderedBlocks}
        onReorder={handleReorder}
        onDelete={handleDelete}
        inlinePrompts={inlinePrompts}
      />

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

// ---------------------------------------------------------------------
// Block-delete redistribution prompt
// ---------------------------------------------------------------------

/**
 * Two-stage prompt lifecycle:
 *
 *   'pending'   — user just deleted; redistribution prompt asks
 *                 where the freed time should go. Skip dismisses
 *                 without redistribution. No undo here — undo is a
 *                 post-commit regret action, not a pre-commit
 *                 cancel.
 *   'committed' — user picked a module / Split evenly. Redistribution
 *                 has already applied. A compact undo banner offers
 *                 to revert the whole thing (deletion + redistribute).
 *                 Stale once the user takes another structural action
 *                 (new delete, reorder) — those drop committed prompts.
 */
type PromptStatus = 'pending' | 'committed';

interface PendingPrompt {
  id: string;
  status: PromptStatus;
  /** Id of the block this prompt should render above (= first block
   *  of the next surviving group). null when the deletion was the
   *  tail of the list. */
  anchorGroupId: string | null;
  freedSeconds: number;
  /** Snapshot of the blocks removed by this deletion — used for the
   *  committed-undo label ("Removed: <activityDescription>"). */
  deletedBlocks: ProposalBlock[];
  /** Full snapshot of orderedBlocks taken BEFORE the delete (and
   *  thus before redistribution). Undo restores orderedBlocks to
   *  this snapshot in one shot, reversing both the deletion and the
   *  subsequent redistribution atomically. */
  preDeleteSnapshot: ProposalBlock[];
}

function RedistributionPrompt({
  freedSeconds,
  blocks,
  onPick,
  onSkip,
}: {
  freedSeconds: number;
  blocks: ReadonlyArray<ProposalBlock>;
  /** moduleRef → per-module redistribution; null → split evenly. */
  onPick: (moduleRef: string | null) => void;
  /** Dismiss without redistributing — freed time drops the session
   *  length. Per spec: skip does NOT offer undo (undo is a
   *  post-commit regret action, only shown after a redistribution
   *  destination is picked). */
  onSkip: () => void;
}) {
  // Per spec: show one button per module that still has non-warm-up
  // blocks. "Split evenly" only when 2+ modules qualify.
  const moduleRefs = modulesWithRecipients(blocks);
  const showSplit = moduleRefs.length >= 2;
  const freedMinutes = Math.round(freedSeconds / 60);
  const freedLabel = freedMinutes >= 1
    ? `${freedMinutes} min`
    : `${freedSeconds} sec`;

  if (moduleRefs.length === 0) {
    // No surviving non-warm-up blocks anywhere — nothing to receive
    // the freed time. Single dismiss action.
    return (
      <div className="rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40 px-3 py-2 flex items-center justify-between gap-2">
        <div className="text-[11px] text-neutral-600 dark:text-neutral-300">
          Freed {freedLabel} — no remaining blocks to redistribute into.
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="shrink-0 text-[11px] text-neutral-500 hover:text-fluent underline-offset-2 hover:underline"
        >
          dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-dashed border-fluent/40 bg-fluent/5 px-3 py-2 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[11px] text-neutral-700 dark:text-neutral-200">
          Freed <span className="font-mono tabular-nums">{freedLabel}</span> —
          where should it go?
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="shrink-0 text-[11px] text-neutral-500 hover:text-fluent underline-offset-2 hover:underline"
          aria-label="Dismiss without redistributing"
          title="Dismiss without redistributing — freed time drops the session length"
        >
          skip
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {moduleRefs.map(moduleRef => {
          const meta = moduleMetaById(moduleRef);
          const label = meta?.label ?? moduleRef;
          const accent = meta?.accentHex ?? '#4a9088';
          return (
            <button
              key={moduleRef}
              type="button"
              onClick={() => onPick(moduleRef)}
              className="px-2.5 py-1 rounded-md border text-[11px] font-medium hover:opacity-90"
              style={{ color: accent, borderColor: accent }}
            >
              {label}
            </button>
          );
        })}
        {showSplit && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="px-2.5 py-1 rounded-md border border-neutral-400 text-[11px] font-medium text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent"
          >
            Split evenly
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Post-commit undo banner. Appears after the user picks a
 * redistribution destination — restores the deleted block(s) AND
 * reverses the redistribution in one action (full-snapshot restore
 * on the ProposalCard side).
 *
 * Compact one-liner so it doesn't dominate the session stack; the
 * redistribution is already applied and visible in the surviving
 * blocks' durations, this is just the regret affordance.
 */
function PostCommitUndoBanner({
  deletedBlocks,
  onUndo,
  onDismiss,
}: {
  deletedBlocks: ReadonlyArray<ProposalBlock>;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  // Label = the LAST block in the deletion snapshot. For Rep
  // song-anchor deletions this is the song (warm-ups subordinate);
  // for solo deletions it's just the one block.
  const primary = deletedBlocks[deletedBlocks.length - 1] ?? null;
  const extraCount = Math.max(0, deletedBlocks.length - 1);
  const primaryLabel = primary?.activityDescription ?? 'Block';
  const extraSuffix = extraCount > 0
    ? ` (+ ${extraCount} warm-up${extraCount === 1 ? '' : 's'})`
    : '';

  return (
    <div className="rounded-md border border-amber-400/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 flex items-center justify-between gap-3">
      <div className="text-[11px] text-amber-900 dark:text-amber-200 truncate min-w-0 flex-1">
        Removed: <span className="font-medium">{primaryLabel}</span>{extraSuffix} · time redistributed
      </div>
      <div className="shrink-0 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onUndo}
          className="px-2.5 py-0.5 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700"
          aria-label="Undo — restore the deleted block(s) and reverse the redistribution"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-amber-800/70 dark:text-amber-200/70 hover:text-amber-900 dark:hover:text-amber-100 text-sm leading-none px-1"
          aria-label="Dismiss undo banner"
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}

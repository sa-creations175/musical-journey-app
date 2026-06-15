/**
 * Phase 5 — global block-rating overlay.
 *
 * For NON-scale prep-flow blocks the drill happens inside the module
 * (e.g. /harmonic-fluency), away from the active-session screen. When
 * the drill timer hits 0, BlockExpiryModal finalises the drill into the
 * rating phase + pauses — and this overlay layers the rating prompt on
 * top of whatever the user is looking at, instead of yanking them to the
 * rating screen. They can still see the drill underneath.
 *
 * Scales rate in-place on the active-session screen (the in-session
 * runner keeps the user on /practice-sessions/active), so this overlay
 * deliberately suppresses itself there — the `pathname` guard.
 *
 * Mounted once in Layout (like BlockExpiryModal); renders null until a
 * non-scale block is sitting in its rating phase off-route. The inner
 * card is keyed by block id so the rating selection resets per block.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { moduleMetaById } from '../moduleMeta';
import { useSessionTimer, useSessionTimes } from './SessionTimerContext';
import { canExtendBlock } from '../../modules/practice/blockExtendEligibility';
import { BLOCK_RATING_FEEL_OPTIONS, ratingForFeel } from './blockRatingOptions';
import type { PerformanceRating, SessionBlock } from './types';

const ACTIVE_ROUTE = '/practice-sessions/active';

const EXTEND_OPTIONS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: '+1 min', seconds: 60 },
  { label: '+2 min', seconds: 120 },
  { label: '+5 min', seconds: 300 },
];

export function BlockRatingOverlay() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, advanceBlock, resumeSession, extendDrill } = useSessionTimer();
  const times = useSessionTimes();

  const currentBlock =
    state.currentBlockIndex !== null ? state.blocks[state.currentBlockIndex] : null;

  // A non-scale prep-flow block finished into its rating phase while the
  // user is off the active-session screen (still in the module).
  const open =
    state.origin === 'practice-sessions' &&
    !!currentBlock &&
    (state.status === 'paused' || state.status === 'running') &&
    times.blockPhase === 'rating' &&
    !state.inSessionDrillActive &&
    location.pathname !== ACTIVE_ROUTE;

  if (!open || !currentBlock) return null;

  const isLastBlock =
    state.currentBlockIndex !== null &&
    state.currentBlockIndex >= state.blocks.length - 1;

  // Rate + move on. Resume first (the drill-end paused the session), then
  // advance — on the last block advanceBlock auto-ends the session.
  // Navigate to the active screen so the next block's prep (or the
  // end-of-session summary) shows.
  const handleNext = (rating: PerformanceRating | null) => {
    resumeSession();
    advanceBlock({ rating: rating ?? undefined, markStatus: 'completed' });
    navigate(ACTIVE_ROUTE);
  };

  // Extend: resume + re-arm the drill for `seconds` more. The user is
  // still in the module, so they keep drilling there; the overlay hides
  // as the block leaves the rating phase.
  const handleExtend = (seconds: number) => {
    resumeSession();
    extendDrill(seconds);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="rate this block"
    >
      <RatingCard
        key={currentBlock.id}
        block={currentBlock}
        isLastBlock={isLastBlock}
        onNext={handleNext}
        onExtend={handleExtend}
      />
    </div>,
    document.body,
  );
}

function RatingCard({
  block,
  isLastBlock,
  onNext,
  onExtend,
}: {
  block: SessionBlock;
  isLastBlock: boolean;
  onNext: (rating: PerformanceRating | null) => void;
  onExtend: (seconds: number) => void;
}) {
  const [pendingFeel, setPendingFeel] = useState<1 | 2 | 3 | 4 | null>(null);
  const meta = moduleMetaById(block.moduleRef);
  const accent = meta?.accentHex ?? '#4a9088';
  const moduleLabel = meta?.label ?? block.moduleRef;
  const eligibleExtend = canExtendBlock(block);

  return (
    <div
      className="bg-white dark:bg-neutral-900 rounded-2xl border shadow-xl w-full max-w-md p-5 space-y-4"
      style={{ borderColor: accent, borderLeftWidth: 3 }}
    >
      <div className="text-center space-y-1">
        <div
          className="text-[11px] uppercase tracking-wider font-medium"
          style={{ color: accent }}
        >
          {moduleLabel}
        </div>
        <h3 className="text-base font-medium text-neutral-800 dark:text-neutral-100">
          How did{' '}
          <span className="text-neutral-700 dark:text-neutral-200">
            {block.label ?? block.moduleRef}
          </span>{' '}
          go?
        </h3>
        <p className="text-[11px] text-neutral-500">
          Optional — tap one, or just move on.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {BLOCK_RATING_FEEL_OPTIONS.map(opt => {
          const active = pendingFeel === opt.feel;
          return (
            <button
              key={opt.feel}
              type="button"
              onClick={() => setPendingFeel(active ? null : opt.feel)}
              aria-pressed={active}
              className={`w-full px-3 py-3 rounded-md border text-sm font-medium transition-colors ${
                active ? opt.activeClass : opt.inactiveClass
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {eligibleExtend && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 text-center">
            want more time on this?
          </div>
          <div className="flex items-center gap-2">
            {EXTEND_OPTIONS.map(opt => (
              <button
                key={opt.label}
                type="button"
                onClick={() => onExtend(opt.seconds)}
                className="flex-1 px-3 py-2 rounded-md border text-sm font-medium hover:opacity-90"
                style={{ color: accent, borderColor: accent }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onNext(ratingForFeel(pendingFeel))}
        className="w-full px-3 py-2 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
      >
        {isLastBlock ? 'finish session' : 'next block →'}
      </button>
    </div>
  );
}

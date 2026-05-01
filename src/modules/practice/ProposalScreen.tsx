/**
 * Phase 3 Step 4d — Two-card proposal screen.
 *
 * Renders one or two ProposalCard components.
 *   Phone: horizontal scroll-snap carousel + paginator dots.
 *   Desktop (md+): side-by-side grid, no scroll.
 *
 * "Two plans for today. Pick one." header surfaces only when there
 * are two cards. Single-card view uses a quieter "Your session"
 * heading.
 *
 * Subsequent substeps layer on top of this shell:
 *   4e — "Why this plan?" panel inside each card
 *   4f — Inline time adjustment in the header
 *   4g — +Add block picker at the bottom of each stack
 *   4h — Affirmation surface
 *   4i — Cold-start one-time banner
 *   4j — Feasibility banner above the stack
 */
import { useEffect, useRef, useState } from 'react';
import ProposalCard from './ProposalCard';
import type { ProposalCardData } from './proposalTypes';

interface Props {
  proposals: ReadonlyArray<ProposalCardData>;
  onAccept: (data: ProposalCardData) => void;
  /** Inline time adjustment passes through to each card; caller
   *  regenerates proposals on commit. Step 4f. */
  onTimeChange?: (minutes: number) => void;
  /** Re-opens the full input questionnaire so the user can revise
   *  context / day plan / intent / energy. Step 4f link target. */
  onTryDifferentInputs?: () => void;
  /** "+ Add block" picker callbacks — Step 4g. Pass through to each
   *  card. The card decides whether to render the picker based on
   *  which callbacks are supplied. */
  onAddDeeperOnExisting?: () => void;
  onAddNextPriority?: () => void;
  onAddPickYourOwn?: () => void;
}

export default function ProposalScreen({
  proposals,
  onAccept,
  onTimeChange,
  onTryDifferentInputs,
  onAddDeeperOnExisting,
  onAddNextPriority,
  onAddPickYourOwn,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Keep the paginator in sync with horizontal scroll position on
  // mobile. On desktop the cards live side-by-side (no scroll), so
  // the listener fires once and idles.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth;
      if (w === 0) return;
      const idx = Math.round(el.scrollLeft / w);
      setActiveIndex(Math.max(0, Math.min(proposals.length - 1, idx)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [proposals.length]);

  if (proposals.length === 0) return null;

  const isPair = proposals.length === 2;

  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-sm font-medium tracking-tight">
          {isPair ? 'Two plans for today. Pick one.' : 'Your session'}
        </h3>
      </header>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1 md:grid md:grid-cols-2 md:overflow-visible md:gap-4 md:pb-0 md:mx-0 md:px-0"
      >
        {proposals.map(p => (
          <div
            key={`${p.kind}-${p.title}`}
            className="snap-center shrink-0 w-full md:w-auto"
          >
            <ProposalCard
              data={p}
              onAccept={onAccept}
              onTimeChange={onTimeChange}
              onAddDeeperOnExisting={onAddDeeperOnExisting}
              onAddNextPriority={onAddNextPriority}
              onAddPickYourOwn={onAddPickYourOwn}
            />
          </div>
        ))}
      </div>

      {isPair && (
        <div className="md:hidden flex items-center justify-center gap-1.5">
          {proposals.map((_, idx) => (
            <span
              key={idx}
              aria-hidden
              className={`block w-1.5 h-1.5 rounded-full transition-colors ${
                idx === activeIndex
                  ? 'bg-fluent'
                  : 'bg-neutral-300 dark:bg-neutral-700'
              }`}
            />
          ))}
        </div>
      )}

      {onTryDifferentInputs && (
        <div className="text-center">
          <button
            type="button"
            onClick={onTryDifferentInputs}
            className="text-[11px] text-neutral-500 hover:text-fluent underline-offset-2 hover:underline"
          >
            Try different inputs
          </button>
        </div>
      )}
    </section>
  );
}

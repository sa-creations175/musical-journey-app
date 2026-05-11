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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import ColdStartBanner from './ColdStartBanner';
import ProposalCard from './ProposalCard';
import type { ProposalCardData } from './proposalTypes';

interface Props {
  proposals: ReadonlyArray<ProposalCardData>;
  onAccept: (data: ProposalCardData, opts: { hardBlock: boolean }) => void;
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
  /** Pre-picked affirmation passed through to every card (Step 4h). */
  affirmation?: string | null;
  /**
   * True when this is the user's first generated session — surfaces
   * a one-time honest note above the proposals (Step 4i). Caller
   * resolves the userPref via shouldShowColdStartBanner() once at
   * mount and passes the result here. Step 6k flips the flag.
   */
  showColdStartBanner?: boolean;
  /**
   * Slot for the goal-feasibility banner that sits above the
   * session stack when any goal is behind pace. Step 4j lands the
   * slot; the actual banner component lands in Step 7b and is
   * shared between this surface and Practice Sessions home (7a).
   * Render-prop shape so this screen doesn't take a dependency on
   * the banner's internals or its data fetch.
   */
  feasibilityBanner?: ReactNode;
  /**
   * Phase 4 Step 4 — weekly-pace nudge slot. Sibling to
   * feasibilityBanner because the signals are distinct: feasibility
   * tracks long-horizon goal trajectories, this slot tracks the
   * current week's attempt cadence. Both can appear together.
   * Same render-prop shape for symmetry — the caller wires
   * BehindPaceBanner with the notices + onAddModule callback.
   */
  behindPaceBanner?: ReactNode;
  /**
   * Step 8d — Back link that returns the user to the three-path
   * choice screen. Only supplied when this proposal was generated
   * via an abundance path; absent for standard-flow proposals.
   */
  onBackToPaths?: () => void;
  /**
   * Step 8e — Regenerate the proposal on the same path with a
   * fresh item selection. Only supplied alongside onBackToPaths.
   */
  onRegeneratePath?: () => void;
  /** True while a regenerate is in flight — disables the button. */
  regenerating?: boolean;
}

export default function ProposalScreen({
  proposals,
  onAccept,
  onTimeChange,
  onTryDifferentInputs,
  onAddDeeperOnExisting,
  onAddNextPriority,
  onAddPickYourOwn,
  affirmation,
  showColdStartBanner,
  feasibilityBanner,
  behindPaceBanner,
  onBackToPaths,
  onRegeneratePath,
  regenerating,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Hard-block defaults to ON every session. State is per-mount of
  // this screen — when the user navigates back to the questionnaire
  // and forward again, ProposalScreen unmounts/remounts and the
  // toggle resets to true. No persistence by design.
  const [hardBlock, setHardBlock] = useState(true);

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
      {(onBackToPaths || onRegeneratePath) && (
        <div className="flex items-center justify-between text-[11px] text-neutral-500">
          {onBackToPaths ? (
            <button
              type="button"
              onClick={onBackToPaths}
              className="hover:text-fluent inline-flex items-center gap-1"
            >
              <span aria-hidden>←</span>
              <span>back to options</span>
            </button>
          ) : (
            <span />
          )}
          {onRegeneratePath && (
            <button
              type="button"
              onClick={onRegeneratePath}
              disabled={regenerating}
              className={`inline-flex items-center gap-1 ${
                regenerating
                  ? 'text-neutral-400 cursor-not-allowed'
                  : 'hover:text-fluent'
              }`}
            >
              <span aria-hidden>↻</span>
              <span>{regenerating ? 'regenerating…' : 'regenerate'}</span>
            </button>
          )}
        </div>
      )}

      <ColdStartBanner visible={!!showColdStartBanner} />

      {feasibilityBanner}
      {behindPaceBanner}

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
            // min-w-0 on the grid item is the standard fix for grid
            // overflow at medium widths — without it, content with a
            // long unbreakable token can grow the column past its
            // 1fr allotment and spill into / overlap the sibling card.
            className="snap-center shrink-0 w-full md:w-auto md:min-w-0"
          >
            <ProposalCard
              data={p}
              onAccept={onAccept}
              hardBlock={hardBlock}
              onHardBlockChange={setHardBlock}
              onTimeChange={onTimeChange}
              onAddDeeperOnExisting={onAddDeeperOnExisting}
              onAddNextPriority={onAddNextPriority}
              onAddPickYourOwn={onAddPickYourOwn}
              affirmation={affirmation}
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

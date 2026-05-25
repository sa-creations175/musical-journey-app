/**
 * Phase 3 Step 8b — Three-path choice screen.
 *
 * Replaces the standard ProposalScreen when the abundance trigger
 * fires (Step 2j detection). Frames the moment honestly — "you're
 * ahead of pace, what do you want to focus on today?" — and offers
 * three full-width stacked cards corresponding to different
 * intentions:
 *
 *   Get ahead   — items not yet due; bank progress before deadlines.
 *   Drive home  — items already partially or fully acquired;
 *                 reinforcement to make them second-nature.
 *   Expand      — items at the 'new' stage; break new ground.
 *
 * The path the user picks is passed to buildSessionProposalsForPath
 * (Step 8c) which filters spacing rows accordingly and returns a
 * normal ProposalCardData[] for the proposal screen.
 *
 * Step 8f swaps the three cards for a different set when the user
 * has zero active goals: Just play / Set a goal / Rest.
 */
import type { AbundancePath, SessionPlanReason } from './sessionGenerator';

export type FallbackPath = 'just-play' | 'set-goal' | 'rest';
export type AbundancePathChoice = AbundancePath | FallbackPath;

interface Props {
  reason: SessionPlanReason;
  onPick: (choice: AbundancePathChoice) => void;
  /** Re-opens the input questionnaire — same affordance the
   *  proposal screen exposes, kept here so the user always has a
   *  way to bail back to standard inputs. */
  onTryDifferentInputs?: () => void;
}

interface PathCard {
  id: AbundancePathChoice;
  title: string;
  subtitle: string;
}

const ABUNDANCE_CARDS: ReadonlyArray<PathCard> = [
  {
    id: 'get-ahead',
    title: 'Get ahead',
    subtitle: "Work on what's coming up next. Bank progress before it's due.",
  },
  {
    id: 'drive-home',
    title: 'Drive home',
    subtitle: 'Revisit what you know. Make it second nature.',
  },
  {
    id: 'expand',
    title: 'Expand',
    subtitle: 'Start something new from your goals. Break new ground.',
  },
];

const FALLBACK_CARDS: ReadonlyArray<PathCard> = [
  {
    id: 'just-play',
    title: 'Just play',
    subtitle: 'Open the harmonic diary and follow the sound.',
  },
  {
    id: 'set-goal',
    title: 'Set a goal',
    subtitle: 'Give the algorithm something to aim at.',
  },
  {
    id: 'rest',
    title: 'Rest',
    subtitle: 'No session today. Come back when the urge returns.',
  },
];

function headerCopy(reason: SessionPlanReason): { title: string; subtitle: string } {
  switch (reason) {
    case 'ahead-of-pace':
      return {
        title: "You're ahead of pace — nice work.",
        subtitle: 'What do you want to focus on today?',
      };
    case 'queue-cleared':
      return {
        title: "Cleared the queue for today.",
        subtitle: 'Where do you want to take this session?',
      };
    case 'nothing-urgent':
      return {
        title: 'Nothing urgently due.',
        subtitle: 'What feels right?',
      };
    case 'zero-goals':
      return {
        title: 'No active goals yet.',
        subtitle: 'What sounds good?',
      };
  }
}

export default function AbundancePathScreen({
  reason,
  onPick,
  onTryDifferentInputs,
}: Props) {
  const cards = reason === 'zero-goals' ? FALLBACK_CARDS : ABUNDANCE_CARDS;
  const { title, subtitle } = headerCopy(reason);

  return (
    <section className="max-w-2xl mx-auto space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-medium tracking-tight text-neutral-800 dark:text-neutral-100">
          {title}
        </h2>
        <p className="text-sm text-neutral-500">{subtitle}</p>
      </header>

      <div className="flex flex-col gap-2">
        {cards.map(card => (
          <button
            key={card.id}
            type="button"
            onClick={() => onPick(card.id)}
            className="w-full text-left rounded-lg border border-black/[0.07] bg-neutral-50 dark:bg-neutral-900/50 p-4 hover:border-fluent hover:bg-fluent/5 transition-colors"
          >
            <div className="text-sm font-medium tracking-tight text-neutral-800 dark:text-neutral-100">
              {card.title}
            </div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {card.subtitle}
            </div>
          </button>
        ))}
      </div>

      {onTryDifferentInputs && (
        <div className="text-center pt-1">
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

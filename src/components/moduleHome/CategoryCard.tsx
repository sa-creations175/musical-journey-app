/**
 * The module-home card. One component, three modules.
 *
 * =====================================================================
 * EXPANDING AND DRILLING ARE SEPARATE TAPS.
 *
 * The header toggles the expansion and does nothing else. The two
 * actions live inside the expanded region and are reached only after it
 * is open.
 *
 * That is a deliberate cost of one extra tap. A card that started a
 * drill when you touched it would mean losing your place by brushing
 * the screen, and the thing being protected — where you are in a
 * fifteen-category list — is not recoverable by pressing back.
 *
 * WHY THE BAR IS NOT INSIDE THE TAP TARGET. `ProgressBar` carries its
 * own "what do the colours mean?" button, and a button inside a button
 * is invalid markup — the version that "works" is the one where a tap
 * meant for the info dot toggles the card. So the header button holds
 * the name, tier and count, and the bar sits directly beneath it.
 * =====================================================================
 *
 * ONE BAR, DRAWN ONCE. The collapsed card shows `ProgressBar` with its
 * strip suppressed rather than drawing three segments of its own — see
 * `showStrip`. Sharing the arithmetic but not the markup is how two
 * bars come to disagree.
 *
 * TINT COMES FROM `moduleMeta`, NOT FROM THE CALLER'S LITERAL. The hex
 * is passed in, but every call site reads it from `moduleMetaById`.
 * Reading already keeps its own `SEPIA` copy in `Reading.tsx`; this
 * does not add a third.
 *
 * ONE HUE PER MODULE, NOT PER CATEGORY. Ear training's five sub-modules
 * already share `#5a8752` on purpose — fifteen new category hues would
 * be a second colour system to keep accessible in both themes.
 */
import ProgressBar from '../ProgressBar';
import { FALLBACK_INTERVAL_DAYS, barSegments, unratedLabel } from '../../lib/progressBar';
import { TIER_BADGE_CLASS, TIER_LABEL } from '../../lib/tier';
import type { CategoryCardModel } from './model';

export interface CategoryCardProps {
  card: CategoryCardModel;
  /** The MODULE's accent, from `moduleMeta`. */
  accentHex: string;
  expanded: boolean;
  onToggle: () => void;
  /** What "drill category" does here. Set by the adapter's module. */
  onDrill: () => void;
  /** Named per module only where the action genuinely differs — see the
   *  report for why ear training's cannot honestly say "drill". */
  drillLabel?: string;
  now: number;
}

export default function CategoryCard({
  card, accentHex, expanded, onToggle, onDrill, drillLabel = 'drill category', now,
}: CategoryCardProps) {
  // The unrated state is `barSegments`' own — "3 of 5 attempts" — not a
  // second empty-state branch. See the header of lib/progressBar.
  const pending = unratedLabel(barSegments({
    correct: card.rollingCorrect,
    wrong: card.rollingTotal - card.rollingCorrect,
  }));

  return (
    <section
      data-testid="category-card"
      data-card-key={card.key}
      data-expanded={expanded ? 'true' : 'false'}
      className="rounded-xl border overflow-hidden bg-white dark:bg-neutral-900"
      style={{ borderColor: `${accentHex}33` }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-testid="category-card-toggle"
        className="w-full text-left px-3 pt-3 pb-2 transition-colors"
        style={{ backgroundColor: `${accentHex}0f` }}
      >
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-sm">{card.label}</span>
          <span
            className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${TIER_BADGE_CLASS[card.tier]}`}
            data-testid="category-card-tier"
          >
            {TIER_LABEL[card.tier]}
          </span>
          <span
            className="ml-auto text-[11px] text-neutral-500 tabular-nums"
            data-testid="category-card-count"
          >
            {card.itemsSeen}/{card.itemCount}
          </span>
        </div>
        {card.countDetail !== null && (
          <div className="mt-0.5 text-[11px] text-neutral-400 tabular-nums">
            {card.countDetail}
          </div>
        )}
        <div className="mt-0.5 text-[11px] text-neutral-500 tabular-nums">
          {pending !== null ? (
            <span className="text-neutral-400">{pending}</span>
          ) : (
            <>{card.rollingCorrect}/{card.rollingTotal} right</>
          )}
          {card.lastPracticedDaysAgo !== null && (
            <>
              {' · '}
              {card.lastPracticedDaysAgo === 0
                ? 'today'
                : card.lastPracticedDaysAgo === 1
                  ? 'yesterday'
                  : `${card.lastPracticedDaysAgo}d ago`}
            </>
          )}
        </div>
      </button>

      {/* The bar always; the twenty ticks only once expanded.
          `FALLBACK_INTERVAL_DAYS` is only for a rep whose item has no
          spacing row — every tick normally carries its own, because a
          card covers many separately scheduled items. */}
      <div
        className="px-3 pb-2"
        style={{ backgroundColor: expanded ? undefined : `${accentHex}0f` }}
      >
        <ProgressBar
          attempts={card.window}
          intervalDays={FALLBACK_INTERVAL_DAYS}
          now={now}
          label={card.label}
          showStrip={expanded}
        />
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5" data-testid="category-card-expansion">
          {card.description !== null && (
            <p className="text-[12px] text-neutral-600 dark:text-neutral-300 leading-snug">
              {card.description}
            </p>
          )}

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={onDrill}
              data-testid="category-card-drill"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ backgroundColor: accentHex }}
            >
              {drillLabel}
            </button>
            {/* DISABLED, NOT STUBBED. 2b builds what this opens. A
                button that navigates nowhere, or opens a placeholder,
                is a control that looks live and is not — the same
                defect as a filter strip that does nothing. */}
            <button
              type="button"
              disabled
              data-testid="category-card-progress-detail"
              title="Progress detail is not built yet."
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 dark:border-neutral-700 text-neutral-400 cursor-not-allowed"
            >
              progress detail
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

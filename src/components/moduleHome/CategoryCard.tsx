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
import { titleCase } from '../../lib/labelCase';
import type { CategoryCardModel } from './model';

/**
 * The floor every card stands on, wherever it is rendered.
 *
 * A FLOOR, NOT A HEIGHT. The tallest card in a row still sets that
 * row's height — grid stretch has always done that, and nothing here
 * writes a fixed one. This stops a card with the fewest lines from
 * being markedly shorter than the same card on another module home,
 * which is what made reading's grid read as a different component from
 * ear training's.
 *
 * It lives on the card rather than on a page for the same reason the
 * width does: a page that could set it would set a different one.
 */
const CARD_MIN_HEIGHT = 'min-h-[6.5rem]';

/**
 * What a card's action says, on every module home.
 *
 * ONE LABEL, DEFINED ONCE. It was per module — "drill category", "open
 * module", "open drills" — on the reasoning that each module's action
 * differed. It does not: every one of them opens the thing the card is
 * about. Three wordings for one action just made the reader check
 * whether they were three actions.
 */
export const CARD_ACTION_LABEL = 'Open';

export interface CategoryCardProps {
  card: CategoryCardModel;
  /** The MODULE's accent, from `moduleMeta`. */
  accentHex: string;
  expanded: boolean;
  onToggle: () => void;
  /** What "drill category" does here. Set by the adapter's module. */
  onDrill: () => void;

  /** Opens progress detail. Omitted where the module has no detail
   *  surface yet — the button then renders disabled rather than
   *  wired to nothing. */
  onProgressDetail?: () => void;
  now: number;
}

export default function CategoryCard({
  card, accentHex, expanded, onToggle, onDrill, onProgressDetail, now,
}: CategoryCardProps) {
  // The unrated state is `barSegments`' own — "3 of 5 attempts" — not a
  // second empty-state branch. See the header of lib/progressBar.
  const acc = card.accuracy;
  const pending = acc === null ? null : unratedLabel(barSegments({
    correct: acc.rollingCorrect,
    wrong: acc.rollingTotal - acc.rollingCorrect,
  }));

  /**
   * =================================================================
   * A COLUMN, SO THE CARD FILLS THE HEIGHT THE ROW GIVES IT.
   *
   * The grid never needed telling to equalise heights — CSS grid
   * stretches every item to its row, so two cards side by side have
   * always been the same height. What was wrong was the INSIDE.
   *
   * This was a plain block: the tinted header and the tinted bar
   * stacked at their natural heights from the top, and the slack the
   * stretch added fell below them, showing the section's own white
   * background. That pale strip under the shorter card's progress bar
   * is what read as "the other card is taller" — on ear training,
   * where the intervals card carries a `countDetail` sub-line that
   * chord recognition does not, so chord recognition is the one
   * wearing the slack.
   *
   * A column with a growing bar wrapper puts the slack INSIDE the
   * tinted region instead. Nothing is clipped and no height is written
   * down: the tallest card in the row still sets the height, the
   * shorter ones just now reach it.
   * =================================================================
   */
  return (
    <section
      data-testid="category-card"
      data-card-key={card.key}
      data-expanded={expanded ? 'true' : 'false'}
      className={`rounded-xl border overflow-hidden bg-white dark:bg-neutral-900 flex flex-col ${CARD_MIN_HEIGHT}`}
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
          {/* TITLE CASE HERE, not in six adapters. The adapters hand
              over the canonical label — the catalog's own words — and
              the style is applied where the title is drawn, the same
              rule the sidebar follows. Production's path titles are
              already capitalised and pass through unchanged. */}
          <span className="font-medium text-sm">{titleCase(card.label)}</span>
          {/* NO BADGE WITHOUT A MEASUREMENT. A module that records
              duration and a self-rating has no tier; the alternative is
              `computeTier` on an empty window, which says `untouched`
              forever and looks like a reading. */}
          {acc !== null && (
            <span
              className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${TIER_BADGE_CLASS[acc.tier]}`}
              data-testid="category-card-tier"
            >
              {TIER_LABEL[acc.tier]}
            </span>
          )}
          <span
            className="ml-auto text-[11px] text-neutral-500 tabular-nums"
            data-testid="category-card-count"
          >
            {/* ACQUIRED WHERE THE MODULE HAS ONE, seen otherwise. The
                two are different questions in Shapes & Patterns and
                the same everywhere else; a module says which it means
                by supplying the field or not. */}
            {card.acquired ?? card.itemsSeen}/{card.itemCount}
          </span>
        </div>
        {card.countDetail !== null && (
          <div className="mt-0.5 text-[11px] text-neutral-400 tabular-nums">
            {card.countDetail}
          </div>
        )}
        <div className="mt-0.5 text-[11px] text-neutral-500 tabular-nums">
          {acc !== null && (
            pending !== null
              ? <span className="text-neutral-400">{pending}</span>
              : <>{acc.rollingCorrect}/{acc.rollingTotal} right</>
          )}
          {card.lastPracticedDaysAgo !== null && (
            <>
              {acc !== null && ' · '}
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
      {/* `grow`, not `flex-1`: basis stays `auto`, so the bar keeps its
          natural height and only the ROW'S SLACK is absorbed here. With
          `flex-1`'s zero basis the wrapper would be sized from free
          space first and lean on `min-height` to get its content back. */}
      {/* NO BAR WITHOUT RIGHT/WRONG. The wrapper still grows, so a
          module without one keeps the same card shape and the same fill
          — it just has nothing to draw inside it. */}
      <div
        className="px-3 pb-2 grow"
        style={{ backgroundColor: expanded ? undefined : `${accentHex}0f` }}
      >
        {acc !== null && (
          <ProgressBar
            attempts={acc.window}
            intervalDays={FALLBACK_INTERVAL_DAYS}
            now={now}
            label={card.label}
            showStrip={expanded}
          />
        )}
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
              {CARD_ACTION_LABEL}
            </button>
            {/* STILL DISABLED WHERE THERE IS NOTHING TO OPEN. A module
                without a detail surface gets an obviously inert button
                rather than one that opens an empty page — a control
                that looks live and is not is the defect this avoids. */}
            <button
              type="button"
              disabled={onProgressDetail === undefined}
              onClick={onProgressDetail}
              data-testid="category-card-progress-detail"
              {...(onProgressDetail === undefined
                ? { title: 'Progress detail is not built for this module yet.' }
                : {})}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                onProgressDetail === undefined
                  ? 'border-neutral-200 dark:border-neutral-700 text-neutral-400 cursor-not-allowed'
                  : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-neutral-500'
              }`}
            >
              Progress Detail
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

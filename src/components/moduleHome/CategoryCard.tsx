/**
 * The module-home card. One component, three modules.
 *
 * THE SHELL IS `cardShell.tsx`, NOT THIS FILE. Size, tint, the header's
 * written height, the reserved sub-lines and the button row moved there
 * when the song card needed the same ones — a second card matching this
 * one by hand is how two cards come to be nearly the same. What is left
 * here is what a CATEGORY card says.
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
import {
  CARD_ACTION_LABEL,
  PROGRESS_TRACKER_LABEL,
  CardActions,
  CardShell,
  CardSubLine,
  CardTitleBlock,
  cardTint,
} from './cardShell';
import type { CategoryCardBar, CategoryCardModel } from './model';

export { CARD_ACTION_LABEL, PROGRESS_TRACKER_LABEL };

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
    <CardShell
      accentHex={accentHex}
      data-card-key={card.key}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-testid="category-card-toggle"
        className="w-full text-left px-3 pt-3 pb-2 transition-colors"
        style={{ backgroundColor: cardTint(accentHex) }}
      >
        <CardTitleBlock
          trailing={(
            <span
              className="float-right ml-2 text-[11px] leading-5 text-neutral-500 tabular-nums whitespace-nowrap"
              data-testid="category-card-count"
            >
            {/* ACQUIRED WHERE THE MODULE HAS ONE, seen otherwise. The
                two are different questions in Shapes & Patterns and
                the same everywhere else; a module says which it means
                by supplying the field or not — and says so in words,
                because "12/96" alone cannot tell the reader which of
                the two it is counting. */}
              {card.acquired !== undefined
                ? `${card.acquired} of ${card.itemCount} acquired`
                : `${card.itemsSeen}/${card.itemCount}`}
            </span>
          )}
        >
          {/* TITLE CASE HERE, not in six adapters. The adapters hand
              over the canonical label — the catalog's own words — and
              the style is applied where the title is drawn, the same
              rule the sidebar follows. Production's path titles are
              already capitalised and pass through unchanged. */}
          <span className="font-medium text-sm leading-5">{titleCase(card.label)}</span>
          {/* NO BADGE WITHOUT A MEASUREMENT. A module that records
              duration and a self-rating has no tier; the alternative is
              `computeTier` on an empty window, which says `untouched`
              forever and looks like a reading. */}
          {acc !== null && (
            <span
              className={`ml-2 inline-block align-baseline text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${TIER_BADGE_CLASS[acc.tier]}`}
              data-testid="category-card-tier"
            >
              {TIER_LABEL[acc.tier]}
            </span>
          )}
        </CardTitleBlock>
        {/* RESERVED WHETHER IT HAS ANYTHING IN IT OR NOT. A card with a
            countDetail and one without must split at the same height. */}
        <CardSubLine className="text-neutral-400">{card.countDetail}</CardSubLine>
        <CardSubLine>
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
          {/* ABSENT, NOT ZERO, where nothing has been measured — see
              `timeInvestedSeconds`. */}
          {card.timeInvestedSeconds !== undefined && (
            <>
              {(acc !== null || card.lastPracticedDaysAgo !== null) && ' · '}
              <span data-testid="category-card-time">
                {formatSeconds(card.timeInvestedSeconds)}
              </span>
            </>
          )}
        </CardSubLine>

        {/* ONE BAR PER HAND, where the module drills the same item more
            than one way. Two segments over a neutral track: acquired,
            then under way. The tokens are the matrix's own, so a bar
            and the grid it summarises cannot drift to two palettes. */}
        {card.bars !== undefined && card.bars.length > 0 && (
          <div className="mt-1.5 space-y-1" data-testid="category-card-bars">
            {card.bars.map((bar, i) => (
              <HandBar key={bar.label ?? i} bar={bar} />
            ))}
          </div>
        )}
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
        style={{ backgroundColor: expanded ? undefined : cardTint(accentHex) }}
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

          <CardActions
            accentHex={accentHex}
            primary={{
              label: CARD_ACTION_LABEL,
              onClick: onDrill,
              testId: 'category-card-drill',
            }}
            secondary={{
              label: PROGRESS_TRACKER_LABEL,
              onClick: onProgressDetail,
              testId: 'category-card-progress-detail',
              // STILL DISABLED WHERE THERE IS NOTHING TO OPEN.
              ...(onProgressDetail === undefined
                ? { disabledReason: 'The Progress Tracker is not built for this module yet.' }
                : {}),
            }}
          />
        </div>
      )}
    </CardShell>
  );
}

/**
 * Seconds as a reader would say them. Mirrors the drill modal's own
 * formatter — minutes once past one, hours once past sixty.
 */
function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function HandBar({ bar }: { bar: CategoryCardBar }) {
  const pct = (n: number) => (bar.total === 0 ? 0 : (n / bar.total) * 100);
  return (
    <div className="flex items-center gap-1.5" data-testid="category-card-bar" data-bar={bar.label ?? ''}>
      {bar.label !== undefined && (
        <span className="w-8 shrink-0 text-[9px] uppercase tracking-wide text-neutral-400">
          {bar.label}
        </span>
      )}
      <span
        aria-hidden
        className="flex-1 h-1 rounded-full overflow-hidden flex bg-neutral-200 dark:bg-neutral-800"
      >
        <span className="bg-mastered" style={{ width: `${pct(bar.acquired)}%` }} />
        <span className="bg-developing" style={{ width: `${pct(bar.inProgress)}%` }} />
      </span>
    </div>
  );
}

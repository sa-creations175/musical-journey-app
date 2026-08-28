/**
 * The geometry every module-home card is drawn to, in one file.
 *
 * =====================================================================
 * THE SHELL IS SHARED. WHAT GOES IN IT IS NOT.
 *
 * A category card carries a count, a tier and a progress bar. A song
 * card carries an artist, a stage and its sections. They are different
 * readings of different things and neither should be bent into the
 * other's model — but they are the SAME OBJECT on the screen, and a
 * reader moving between two module homes should not be able to tell
 * that two components drew them.
 *
 * So the size, the tint, the header's written height, the reserved
 * sub-lines, the button row and the grid that lays them out live here,
 * and both cards render through them. There is exactly one place that
 * knows how tall a card's header is, which is what stops the answer
 * from being different on the sixth module home.
 *
 * Everything here was `CategoryCard`'s and `CategoryCardGrid`'s
 * already; it moved rather than being invented, so the cards that used
 * it render unchanged.
 * =====================================================================
 */
import type { CSSProperties, ReactNode } from 'react';

/**
 * The narrowest a card may be before the grid drops a column.
 *
 * The ONE input to how many columns appear — see `CardGrid`.
 */
export const CARD_MIN_WIDTH = '17rem';

/** One gap for every module home. */
export const CARD_GAP = 'gap-3';

/**
 * The column rule, derived from `CARD_MIN_WIDTH`.
 *
 * AN INLINE STYLE, NOT A TAILWIND CLASS, and deliberately: Tailwind
 * finds classes by scanning source text for complete strings, so an
 * interpolated `grid-cols-[...]` would compile to nothing and the grid
 * would silently fall back to one column. A style built from the
 * constant cannot drift from it.
 */
export const CARD_COLUMNS = `repeat(auto-fill, minmax(${CARD_MIN_WIDTH}, 1fr))`;

/**
 * The floor every card stands on, wherever it is rendered.
 *
 * A FLOOR, NOT A HEIGHT. The tallest card in a row still sets that
 * row's height — grid stretch has always done that, and nothing here
 * writes a fixed one. This stops a card with the fewest lines from
 * being markedly shorter than the same card on another module home.
 */
export const CARD_MIN_HEIGHT = 'min-h-[6.5rem]';

/**
 * =====================================================================
 * THE TINT BOUNDARY IS AT ONE HEIGHT, AND CONTENT CANNOT MOVE IT.
 *
 * Two cards in a row split at different heights, and the reason was
 * wrapping: a long name pushed the count onto a second line, the header
 * grew by a line, and the bar and the buttons went down with it.
 *
 * So the header's text does not size the header. Two things do it:
 *
 *   1. THE TRAILING SLOT IS FLOATED, so it never occupies a line of its
 *      own. A short name sits beside it; a long one wraps UNDER it.
 *   2. THE TITLE BLOCK IS A FIXED TWO LINES. One-line names leave the
 *      second empty inside the tint rather than shrinking it, and a
 *      name that would take three is clipped rather than allowed to
 *      push the boundary down.
 *
 * Sub-lines below it reserve their line whether they have anything in
 * them or not, so a card carrying one matches a card that does not.
 * =====================================================================
 */
/** The title's own leading — `leading-5`, in rem. */
const TITLE_LEADING_REM = 1.25;
/** The tallest case a name can produce. Beyond this it clips. */
const TITLE_LINES = 2;
export const TITLE_BLOCK_HEIGHT = `${TITLE_LINES * TITLE_LEADING_REM}rem`;
/** The sub-lines' leading — `leading-4`, in rem. Reserved whether the
 *  line has anything in it or not. */
export const SUB_LINE_HEIGHT = '1rem';

/** The tint a card's header carries: its module's accent, barely. */
export function cardTint(accentHex: string): string {
  return `${accentHex}0f`;
}

/** The card's border: the same accent, a little stronger. */
export function cardBorder(accentHex: string): string {
  return `${accentHex}33`;
}

/**
 * The tint for a module id `moduleMeta` does not know.
 *
 * A neutral grey rather than a guess at the module's colour: a wrong
 * accent looks deliberate and would ship, where an unmistakably
 * un-branded card is a visible "this module is not registered".
 */
export const NO_MODULE_ACCENT = '#6b7280';

/**
 * The grid. Every module home lays its cards out through this one.
 *
 * `CARD_MIN_WIDTH` is the one number and the column COUNT falls out of
 * it: `auto-fill` fits as many tracks of at least that width as the
 * container allows. So a narrow shell gets one column and a wide one
 * gets three, without a breakpoint guessing on behalf of a container it
 * cannot measure.
 */
export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div
      className={`grid ${CARD_GAP}`}
      style={{ gridTemplateColumns: CARD_COLUMNS }}
      data-testid="category-card-grid"
    >
      {children}
    </div>
  );
}

/**
 * The card itself: the border, the floor and the column that lets a
 * stretched row's slack land INSIDE the tinted region rather than as a
 * pale strip beneath it.
 */
export function CardShell({
  accentHex, children, ...rest
}: {
  accentHex: string;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <section
      data-testid="category-card"
      {...rest}
      className={`rounded-xl border overflow-hidden bg-white dark:bg-neutral-900 flex flex-col ${CARD_MIN_HEIGHT}`}
      style={{ borderColor: cardBorder(accentHex) }}
    >
      {children}
    </section>
  );
}

/**
 * The title block: a written two lines, with a trailing slot floated
 * out of the line flow.
 *
 * A BLOCK, NOT A FLEX ROW — floats do nothing inside a flex container,
 * and the float is what keeps the trailing slot out of the line count.
 * `overflow-hidden` is the ceiling: a third line is clipped rather than
 * allowed to move the boundary.
 */
export function CardTitleBlock({
  trailing, children,
}: {
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="overflow-hidden"
      style={{ height: TITLE_BLOCK_HEIGHT }}
      data-testid="category-card-title-block"
    >
      {trailing}
      {children}
    </div>
  );
}

/**
 * One sub-line under the title, holding its height whether it has
 * content or not.
 */
export function CardSubLine({
  children, className = 'text-neutral-500', testId,
}: {
  children?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={`mt-0.5 text-[11px] leading-4 tabular-nums ${className}`}
      style={{ minHeight: SUB_LINE_HEIGHT }}
      {...(testId !== undefined ? { 'data-testid': testId } : {})}
    >
      {children}
    </div>
  );
}

/** One of the two buttons every card's action row carries. */
export interface CardAction {
  label: string;
  onClick?: (() => void) | undefined;
  /** Rendered inert, with this as its tooltip, where there is nothing
   *  to open. A control that looks live and is not is the defect this
   *  avoids. */
  disabledReason?: string;
  /**
   * The handle a test reaches it by.
   *
   * NAMED BY THE CALLER, because the two cards' second buttons are two
   * different actions — Progress Tracker on a category, Lead Sheet on a
   * song. One shared testid would make a test that means "the song's
   * chart" pass on a category card.
   */
  testId: string;
}

/**
 * The action row: a filled primary in the module's accent and a
 * bordered secondary beside it. Two buttons on every card in the app,
 * in the same place, at the same size.
 */
export function CardActions({
  accentHex, primary, secondary,
}: {
  accentHex: string;
  primary: CardAction;
  secondary: CardAction;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        type="button"
        onClick={primary.onClick}
        data-testid={primary.testId}
        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
        style={{ backgroundColor: accentHex }}
      >
        {primary.label}
      </button>
      <button
        type="button"
        disabled={secondary.disabledReason !== undefined}
        onClick={secondary.onClick}
        data-testid={secondary.testId}
        {...(secondary.disabledReason !== undefined
          ? { title: secondary.disabledReason }
          : {})}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
          secondary.disabledReason !== undefined
            ? 'border-neutral-200 dark:border-neutral-700 text-neutral-400 cursor-not-allowed'
            : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-neutral-500'
        }`}
      >
        {secondary.label}
      </button>
    </div>
  );
}

/**
 * What a card's primary action says, on every module home.
 *
 * ONE LABEL, DEFINED ONCE. It was per module — "drill category", "open
 * module", "open drills" — on the reasoning that each module's action
 * differed. It does not: every one of them opens the thing the card is
 * about.
 */
export const CARD_ACTION_LABEL = 'Open';

/**
 * What a card's secondary action says — and what the section it lands
 * on is titled.
 *
 * Defined once for the same reason: the button and the heading it
 * scrolls to are the same promise, and two literals could drift into
 * naming two different things.
 *
 * PROGRESS, NOT PROFICIENCY, AND NOT FLUENCY. The section carries
 * freshness, coverage and time as well as ratings, so "progress" is
 * the only word true of all of it — and keeping it out of the way
 * leaves "proficiency" meaning exactly one thing, the four ratings.
 * Ear Training's four "Fluency Tracker" headings say this now too.
 */
export const PROGRESS_TRACKER_LABEL = 'Progress Tracker';

/** Shared so a caller cannot hand `CardShell` a style of its own. */
export type CardShellStyle = CSSProperties;

/**
 * The one treatment for every collapsible section header on the lead
 * sheet.
 *
 * THE PROBLEM IT SOLVES is not styling, it is discoverability on touch.
 * Five headers had drifted to five different treatments — three type
 * sizes, three chevron schemes, two missing `aria-expanded` — and the
 * only signal they had in common was `hover:text-fluent`. Hover does
 * not exist on a touch device, which is the primary one here, so on
 * that device nothing distinguished an openable section from a label.
 * The page read flat because, to a finger, it *was* flat.
 *
 * WHY NO COLOUR CARRIES THIS. `DEGREE_PALETTES` spends seven hues on
 * chord families — green, pink, teal, purple, amber, blue, red — plus a
 * darkened twin of each for flat degrees. Every remaining hue is a
 * direct neighbour of one of those (orange→amber, lime→green,
 * cyan→teal, indigo→blue/purple, rose→red), and the app accent
 * `fluent` (#1D9E75) sits *between* 1maj green and 3 teal, making it
 * the worst resting colour on this screen rather than the safest. So
 * form carries the signal and colour stays out of the way:
 *
 *   · a chevron that is ALWAYS present, not revealed on hover
 *   · uppercase + letterspacing + semibold — nothing else on the lead
 *     sheet combines those, and it reads as "control, not content"
 *   · a 2px left rule, which is what makes a column of these scan as
 *     structure at a glance with no hover and no colour
 *
 * The resting colour is a WARM neutral (stone) chosen precisely because
 * it is not a hue. Warm-vs-cool separates it from every cool grey that
 * already carries meaning here: neutral-300/700 is disabled,
 * neutral-400/500 is the stale tier, neutral-200 is chip hover, and
 * neutral-600/300 is the tap-to-place hint and armed states.
 *
 * `fluent` stays as the INTERACTION colour — hover and focus only — so
 * it never competes with a chord cell at rest.
 *
 * SIZE: 11px, deliberately not 12. Chord labels in the grid render at
 * `text-[11px] font-semibold` (`ChordCellBox`), so a 12px semibold
 * header would be literally larger and heavier than the content it
 * introduces. At 11px the header matches the grid's type size but
 * stays subordinate through colour and case: muted warm neutral,
 * uppercase, unfilled — against saturated family colours on filled,
 * bordered cells. The left rule does the structural work that a size
 * bump would otherwise have to.
 */
export default function SectionToggle({
  label,
  expanded,
  onToggle,
  count,
  hint,
  className = '',
}: {
  label: string;
  /** Drives the chevron and `aria-expanded`. */
  expanded: boolean;
  onToggle?: () => void;
  /** Parenthesised suffix — a pending count, when one is meaningful. */
  count?: number;
  /** Muted trailing text. The CALLER decides when it is relevant: some
   *  hints only make sense open ("drag onto a beat"), others only shut
   *  ("3 words staged"). */
  hint?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!onToggle}
      aria-expanded={expanded}
      className={`self-start inline-flex items-center gap-1.5 py-0.5 pl-2 border-l-2 border-stone-300 dark:border-stone-600 text-[11px] uppercase tracking-wide font-semibold text-stone-500 dark:text-stone-400 transition-colors hover:text-fluent hover:border-fluent focus-visible:text-fluent focus-visible:border-fluent disabled:opacity-60 disabled:cursor-default ${className}`}
    >
      {/* Always rendered, never hover-revealed — this is the whole
          point. Sized down so the chevron reads as a marker rather than
          as another character in the label. */}
      <span aria-hidden className="text-[9px] leading-none">
        {expanded ? '▾' : '▸'}
      </span>
      {label}
      {count !== undefined && (
        <span className="font-normal normal-case tracking-normal text-neutral-400">
          ({count})
        </span>
      )}
      {hint && (
        <span className="font-normal normal-case tracking-normal text-neutral-400">
          — {hint}
        </span>
      )}
    </button>
  );
}

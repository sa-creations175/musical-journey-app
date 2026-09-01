/**
 * A shapes sub-module page's three standing facts, as tiles.
 *
 * =====================================================================
 * THIS REPLACES THE PEACH CARD, AND IS NOT A SMALLER VERSION OF IT.
 *
 * Every sub-module page opened with a large tinted card carrying the
 * section's name, its Fluent+ count, its total time and when it was
 * last practised — and the page's own header printed the same Fluent+
 * count again two inches below it. On chord shapes, where nothing had
 * been drilled, the card's whole body was blank: a big empty box
 * holding one duplicated number, pushing the matrix — the reason for
 * the page — down the screen.
 *
 * The facts were worth keeping. The box was not.
 *
 * =====================================================================
 * READ OFF THE SAME CARD MODEL THE MODULE HOME DRAWS.
 *
 * `shapesCards` is still the one adapter. The module home renders it as
 * cards, a sub-module page renders its own row of it as tiles, and the
 * two cannot disagree about how much time has gone in — which is what a
 * second computation here would eventually cause.
 *
 * =====================================================================
 * NO UNIT NOUN — RULED. The figure is bare: "0 / 288", never
 * "0 / 288 hands" or "0 / 288 patterns". A tile has room for one forced
 * word and no room for a true one; what the page is counting belongs in
 * the description sentence above the matrix, which has room for a real
 * phrase.
 *
 * =====================================================================
 * AN ABSENCE IS SAID, NOT PRINTED AS ZERO.
 *
 * A section nobody has touched reads "none yet" and "never", muted —
 * not "0s" and not "today", both of which are measurements and both of
 * which would be wrong. The tiles stay put either way: a fact that
 * vanishes when it is empty makes the row a different shape on every
 * page, and the reader has to work out which one is missing.
 * =====================================================================
 */
import type { SummaryTile } from '../../components/moduleHome/SummaryTiles';
import { agoWord, formatSeconds } from '../../components/moduleHome/factWords';
import type { CategoryCardModel } from '../../components/moduleHome/model';

/**
 * UNAPPROVED COPY, four strings — the three labels and the two
 * absences. Listed in the report. Nothing here is in
 * `docs/WHOLE_SONG_TEST_COPY.md` or `docs/TEMPO_SOURCE_SPEC.md` §10.
 */
export const TILE_LABELS = {
  fluentPlus: 'Fluent+',
  total: 'Total',
  lastPractised: 'Last practiced',
} as const;

export const NOTHING_YET = 'none yet';
export const NEVER = 'never';

/**
 * The time line, split the way Silas asked it to stay split.
 *
 * ONE FIGURE AND ITS TWO HALVES, because "7m" alone cannot tell an hour
 * of testing from an hour of practice, and the split alone makes the
 * reader add up. The total is derived from the halves at the point of
 * display, so it cannot come to disagree with them.
 */
function timeValue(card: CategoryCardModel): { value: string; muted: boolean } {
  const time = card.timeInvested;
  if (time === undefined) return { value: NOTHING_YET, muted: true };
  const total = time.practiceSeconds + time.testingSeconds;
  if (total === 0) return { value: NOTHING_YET, muted: true };
  return {
    value: `${formatSeconds(total)} — ${formatSeconds(time.practiceSeconds)} practice`
      + ` · ${formatSeconds(time.testingSeconds)} testing`,
    muted: false,
  };
}

export function shapesSummaryTiles(card: CategoryCardModel): SummaryTile[] {
  const time = timeValue(card);
  const last = card.lastPracticedDaysAgo;
  return [
    {
      label: TILE_LABELS.fluentPlus,
      // BARE, and out of the module's own total. `fluentPlus` is
      // absent only for a module that has no rule for it, which shapes
      // does — so the fallback is a zero that is genuinely a count.
      value: `${card.fluentPlus ?? 0} / ${card.itemCount}`,
      testId: 'summary-tile-fluent-plus',
    },
    {
      label: TILE_LABELS.total,
      value: time.value,
      muted: time.muted,
      testId: 'summary-tile-total',
    },
    {
      label: TILE_LABELS.lastPractised,
      value: last === null ? NEVER : agoWord(last),
      muted: last === null,
      testId: 'summary-tile-last-practised',
    },
  ];
}

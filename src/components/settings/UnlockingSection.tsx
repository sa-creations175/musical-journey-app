/**
 * Unlocking Tiers of Difficulty — Section 3 of the Settings page.
 *
 * =====================================================================
 * THE LADDERS WERE INVISIBLE, AND THAT IS WHAT MADE THEM FEEL LIKE
 * LOCKS.
 *
 * Ear Training holds harder material back until the easier material is
 * solid, across two ladders with 5 and 2 Tiers. Nothing on any screen
 * said what was in a Tier, what opened it, or that opening a drill by
 * hand was never gated at all. Silas's walked page of 10 Sep 2026 says
 * both, and makes the two numbers editable.
 *
 * =====================================================================
 * THERE WERE THREE LADDERS, AND THE PROGRESSIONS ONE IS RETIRED.
 *
 * Its four Tiers described the OLD eight-entry progression catalog, and
 * the card a reader opens — Full Progression — draws from the fourteen
 * shared-list entries, none of which was ever in a Tier. The table was
 * naming material the reader could not find. Retired 10 Sep 2026; a
 * generated session now draws the whole shared list as narrowed by the
 * card's own filter, spaced like flashcards.
 *
 * =====================================================================
 * THE PASS BAR IS NOT EDITABLE HERE, AND THE SENTENCE SAYS WHY.
 *
 * It is `fluentFloor` — the same number the Fluent rating is drawn at —
 * and one number for "good enough" across the app is the point of it.
 * Offering it twice would let a reader set two, and the second one to
 * be typed would silently win.
 *
 * =====================================================================
 * THE TIER TABLES ARE COPY, NOT DERIVED, AND THAT IS DELIBERATE.
 *
 * "extended chords: 9ths, 11ths, 13ths, 6ths" is a description of a
 * Tier for a person; the catalog holds `dom9:0`, `maj9:0` and eleven
 * more. Generating the list would print item ids at a reader. What IS
 * derived is every number — the Tier counts, the totals and the
 * worked example — because a count that disagreed with the catalog
 * would be the page lying about something checkable.
 * =====================================================================
 */
import {
  itemsToClear, useRatingRules, type RatingRules,
} from '../../lib/ratingRules';
import {
  CHORD_RECOGNITION_TIERS,
} from '../../modules/ear-training/chord-recognition/chordRecognitionTiers';
import {
  modesForStage,
} from '../../modules/ear-training/scales-modes/scaleModeTierUnlock';
// THE ROWS ARE SHARED WITH THE UNLOCK MESSAGE. "Tier 2 unlocked: maj7,
// m7, 7, dim7, m7♭5, mMaj7 are in play" and this table's Tier 2 row are
// one sentence about one fact; written twice they would drift.
import {
  CHORD_RECOGNITION_ROWS, SCALE_MODE_ROWS,
} from '../../modules/ear-training/tierContents';
import {
  SP_MAX_TIER, tierTotalCells,
} from '../../modules/shapes-and-patterns/spTiers';
import { Example, NumberField, PartHeading, RatingWord, RuleTable } from './ratingsCopy';

/** Chord Shapes, Tiers 1 and 2 — the Shapes & Patterns ladder. */
const CHORD_SHAPE_ROWS: ReadonlyArray<string> = [
  'core triads: major, minor, diminished, augmented, sus2, sus4',
  'essential sevenths: maj7, m7, 7, dim7, m7♭5, mMaj7',
];

/** A ladder's heading, with how many Tiers it has. */
function LadderHeading({ name, tiers }: { name: string; tiers: number }) {
  return (
    <PartHeading>
      {name}
      <span className="ml-1.5 align-middle rounded-full border border-neutral-200
        dark:border-neutral-700 px-2 py-0.5 text-[10px] uppercase
        tracking-[0.06em] text-neutral-500 font-semibold"
      >
        {tiers} Tiers
      </span>
    </PartHeading>
  );
}

/** A ladder table. */
function Ladder({ rows, totals }: {
  rows: ReadonlyArray<string>;
  totals: ReadonlyArray<number>;
}) {
  return (
    <RuleTable
      head={['Tier', 'What is in it', 'Total']}
      rows={rows.map((what, i) => [String(i + 1), what, String(totals[i])])}
    />
  );
}

export default function UnlockingSection() {
  const [rules, setRules] = useRatingRules();
  const set = (patch: Partial<RatingRules>) => { void setRules({ ...rules, ...patch }); };

  const passPercent = Math.round(rules.fluentFloor * 100);
  const sharePercent = Math.round(rules.tierOpenShare * 100);
  const shapesPercent = Math.round(rules.shapesTierOpenShare * 100);

  // THE EXAMPLE IS COMPUTED FROM THE CATALOG AND THE RULES, both. A
  // worked example that quoted a fixed six would be wrong the day a
  // chord joined Tier 1.
  const tierOne = CHORD_RECOGNITION_TIERS[1].length;
  const mustClear = itemsToClear(tierOne, rules);
  const perAttempts = Math.ceil(rules.itemClearAttempts * rules.fluentFloor);
  const everyItem = mustClear >= tierOne;

  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        In the Ear Training module, harder material is held back until the
        easier material is solid. Nothing is ever locked when you open a drill
        by hand; the Tiers only decide which chords and modes a practice
        session (or the quiz&apos;s own Next card) will serve you next.
      </p>

      <div className="space-y-2.5">
        <PartHeading>The rule, for both ladders</PartHeading>
        <p className="text-sm text-neutral-500">
          A chord or mode clears at{' '}
          <NumberField
            id="unlock-floor"
            label="Attempts before an item can clear"
            value={rules.itemClearAttempts}
            min={5}
            max={30}
            onChange={n => set({ itemClearAttempts: n })}
          />{' '}
          attempts with <b>{passPercent}% passed</b>. A pass is a right answer
          with no listening aid used. That bar is the same as the{' '}
          <RatingWord status="fluent">Fluent</RatingWord> proficiency rating in
          the section above and moves with it. A Tier opens when{' '}
          <NumberField
            id="unlock-share"
            label="Share of a Tier's items that must clear"
            value={sharePercent}
            min={50}
            max={100}
            onChange={n => set({ tierOpenShare: n / 100 })}
          />
          % of the items within the Tier have cleared that threshold. Within a
          Tier, a practice session introduces up to three new items at a time,
          in the order listed.
        </p>

        <Example>
          In Chord Recognition, Tier 2 opens once{' '}
          {everyItem
            ? `each of the ${tierOne} Tier 1 chords`
            : `${mustClear} of the ${tierOne} Tier 1 chords`}{' '}
          has at least {rules.itemClearAttempts} answers and {perAttempts} of
          every {rules.itemClearAttempts} passed. Keep missing the{' '}
          <i>augmented</i> chord and the other {tierOne - 1} chord qualities{' '}
          {everyItem
            ? 'cannot open it for you.'
            : `can still open it for you; at ${sharePercent}% of the Tier, one `
              + 'chord may lag.'}
        </Example>
      </div>

      <div className="space-y-2">
        <LadderHeading name="Chord Recognition" tiers={5} />
        <Ladder
          rows={CHORD_RECOGNITION_ROWS}
          totals={([1, 2, 3, 4, 5] as const).map(t => CHORD_RECOGNITION_TIERS[t].length)}
        />
      </div>

      <div className="space-y-2">
        <LadderHeading name="Scales & Modes" tiers={2} />
        <Ladder
          rows={SCALE_MODE_ROWS}
          totals={([1, 2] as const).map(t => modesForStage(t).length)}
        />
      </div>

      <p className="text-sm text-neutral-500">
        Scales &amp; Modes opens only once Chord Recognition&apos;s Tier 1 has
        cleared: you name the six triads by ear before the app asks you to hear
        them move.
      </p>
      <p className="text-sm text-neutral-500">
        Harmonic Fluency, Progressions, Reading and Intervals have no Tiers:
        every card is available from the start.
      </p>

      {/* =============================================================
          A SECOND MODULE'S LADDER, AND IT COUNTS SOMETHING ELSE.

          Ear Training's Tiers count ITEMS — six chord qualities, five
          modes — and ask for 80% of them. This one counts CELLS: a
          quality across twelve keys and every inversion state, which is
          over a thousand for Tier 1. That is why the share is its own
          number and its own field rather than the one above.
          ============================================================= */}
      <div className="space-y-2 pt-1">
        <LadderHeading name="Shapes &amp; Patterns · Chord Shapes" tiers={SP_MAX_TIER} />
        <Ladder
          rows={CHORD_SHAPE_ROWS}
          totals={([1, 2] as const).map(t => tierTotalCells(t))}
        />
        <p className="text-sm text-neutral-500">
          Tier 2 opens when{' '}
          <NumberField
            id="shapes-share"
            label="Share of a Chord Shapes Tier's cells that must be solid"
            value={shapesPercent}
            min={10}
            max={100}
            onChange={n => set({ shapesTierOpenShare: n / 100 })}
          />
          % of Tier 1&apos;s cells read{' '}
          <RatingWord status="fluent">Fluent</RatingWord> or better.
        </p>
        <p className="text-sm text-neutral-500">
          This applies to generated practice sessions only.
        </p>
      </div>
    </div>
  );
}

/**
 * Unlocking Tiers of Difficulty — Section 3 of the Settings page.
 *
 * =====================================================================
 * THE LADDERS WERE INVISIBLE, AND THAT IS WHAT MADE THEM FEEL LIKE
 * LOCKS.
 *
 * Ear Training holds harder material back until the easier material is
 * solid, across three ladders with 5, 4 and 2 Tiers. Nothing on any
 * screen said what was in a Tier, what opened it, or that opening a
 * drill by hand was never gated at all. Silas's walked page of 10 Sep
 * 2026 says all three, and makes the two numbers editable.
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
import { Example, NumberField, PartHeading, RatingWord, RuleTable } from './ratingsCopy';

/** What is in each Tier, for a person. See the header. */
const CHORD_RECOGNITION_ROWS: ReadonlyArray<string> = [
  'major, minor, diminished, augmented, sus2, sus4',
  'maj7, m7, 7, dim7, m7♭5, mMaj7',
  'inversions of the triads and sevenths',
  'extended chords: 9ths, 11ths, 13ths, 6ths',
  'altered dominants: 7♭9, 7♯9, 7♯9♯5, 9(13), 13, 7sus4',
];

/**
 * =====================================================================
 * TIERS 3 AND 4 NAME MATERIAL THIS LADDER DOES NOT HOLD, AND IT IS
 * SILAS'S COPY AS WALKED.
 *
 * The ear-training progression catalog is eight entries: Tier 1 is the
 * four bare loops, Tier 2 is two turnarounds, Tier 3 is the major 2 5 1
 * alone and Tier 4 is the backdoor alone. The passes — 5(7♯9♯5) → 1m,
 * 5(7♭9) → 1m — are Shapes & Patterns voice-leading rows and have never
 * been in this ladder at all.
 *
 * Shipped as written because the prototype is the spec and this is
 * approved copy; raised in the 10 Sep report with the counts, because a
 * table naming a progression a reader cannot find is the page telling
 * them something checkable and wrong. It is also why this ladder has no
 * Total column.
 * =====================================================================
 */
const PROGRESSION_ROWS: ReadonlyArray<string> = [
  'bare diatonic loops, the ones Key Detection uses',
  'chord motion within a key, short diatonic sequences',
  'the named patterns: the 2 5 1s, the passes, the loops',
  'borrowed chords and altered dominants: the backdoor, '
    + '5(7♯9♯5) → 1m, 5(7♭9) → 1m',
];

const SCALE_MODE_ROWS: ReadonlyArray<string> = [
  'Ionian (major), Aeolian (natural minor), harmonic minor, melodic minor',
  'Dorian, Mixolydian, Lydian, Phrygian, Locrian',
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

/** A ladder table. `totals` is omitted where a Tier's size is not a
 *  number the reader can act on — the progression Tiers describe
 *  kinds of material rather than a fixed count of items. */
function Ladder({ rows, totals }: {
  rows: ReadonlyArray<string>;
  totals?: ReadonlyArray<number>;
}) {
  return (
    <RuleTable
      head={totals ? ['Tier', 'What is in it', 'Total'] : ['Tier', 'What is in it']}
      rows={rows.map((what, i) => (
        totals ? [String(i + 1), what, String(totals[i])] : [String(i + 1), what]
      ))}
    />
  );
}

export default function UnlockingSection() {
  const [rules, setRules] = useRatingRules();
  const set = (patch: Partial<RatingRules>) => { void setRules({ ...rules, ...patch }); };

  const passPercent = Math.round(rules.fluentFloor * 100);
  const sharePercent = Math.round(rules.tierOpenShare * 100);

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
        by hand; the Tiers only decide which chords, progressions and modes a
        practice session (or the quiz&apos;s own Next card) will serve you next.
      </p>

      <div className="space-y-2.5">
        <PartHeading>The rule, for all three ladders</PartHeading>
        <p className="text-sm text-neutral-500">
          A chord, progression or mode clears at{' '}
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
        <LadderHeading name="Progressions" tiers={4} />
        {/* NO TOTAL COLUMN, which is the prototype's own shape for this
            ladder. The counts are 4 / 2 / 1 / 1 today and they do not
            match the descriptions beside them — see the report. Printing
            "1" next to "the named patterns: the 2 5 1s, the passes, the
            loops" would put a number the reader cannot act on beside a
            sentence that is about to be re-ruled. */}
        <Ladder rows={PROGRESSION_ROWS} />
      </div>

      <div className="space-y-2">
        <LadderHeading name="Scales & Modes" tiers={2} />
        <Ladder
          rows={SCALE_MODE_ROWS}
          totals={([1, 2] as const).map(t => modesForStage(t).length)}
        />
      </div>

      <p className="text-sm text-neutral-500">
        Progressions and Scales &amp; Modes open only once Chord
        Recognition&apos;s Tier 1 has cleared: you name the six triads by ear
        before the app asks you to hear them move.
      </p>
      <p className="text-sm text-neutral-500">
        Harmonic Fluency, Reading and Intervals have no Tiers: every card is
        available from the start.
      </p>
    </div>
  );
}

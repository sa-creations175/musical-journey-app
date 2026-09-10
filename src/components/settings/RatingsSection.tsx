/**
 * Understanding App Ratings — Section 2 of the Settings page.
 *
 * =====================================================================
 * THE APP HAS FOUR WORDS AND THREE WAYS OF ARRIVING AT THEM.
 *
 * A Harmonic Fluency card is marked right or wrong and averaged. A
 * Shapes & Patterns cell is whatever the player said it was. An Ear
 * Training answer is rated by the app from HOW it was answered. All
 * three produce Needs Work / Developing / Fluent / Mastered, and until
 * this page existed nothing said so — a reader meeting "Fluent" on two
 * screens had no way to know the two were measuring different things.
 *
 * Silas walked the copy line by line on 10 Sep 2026 and it is his; the
 * numbers in it are live and editable, and every one of them reads and
 * writes `lib/ratingRules`.
 *
 * =====================================================================
 * CHANGING A BAND ASKS FIRST, AND SAYS WHAT WILL HAPPEN.
 *
 * The three thresholds were chosen for reasons that are written down in
 * "Why these numbers", and moving one re-grades every card in four
 * modules the moment it lands. Nothing stored changes — a band is a
 * reading of the attempts, not a thing written on them — but what the
 * reader sees on every grid does, so the confirm says both.
 * =====================================================================
 */
import { useState } from 'react';
import {
  DEFAULT_RATING_RULES, bandPercent, useRatingRules, type RatingRules,
} from '../../lib/ratingRules';
import {
  Example, NumberField, PartHeading, RatingWord, RuleTable, StartedBadge,
} from './ratingsCopy';

/** Which of the three band numbers a pending change is about. */
type BandField = 'developingFloor' | 'fluentFloor' | 'masteredFloor';

export default function RatingsSection() {
  const [rules, setRules] = useRatingRules();
  /**
   * A band change is held until it is confirmed.
   *
   * THE NUMBER ON SCREEN IS THE PENDING ONE while the notice is up, so
   * the reader can see what they are agreeing to — and "Keep it" puts
   * back what was there rather than leaving a number nobody chose.
   */
  const [pending, setPending] = useState<RatingRules | null>(null);
  const shown = pending ?? rules;

  const setBand = (field: BandField, percent: number) => {
    setPending({ ...shown, [field]: percent / 100 });
  };
  const set = (patch: Partial<RatingRules>) => { void setRules({ ...rules, ...patch }); };

  const pc = bandPercent;
  const dev = pc(shown.developingFloor);
  const flu = pc(shown.fluentFloor);
  const mas = pc(shown.masteredFloor);

  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        How the app grades your learning progress, and the numbers behind
        each word.
      </p>

      {/* ---------------- A · measured ---------------- */}
      <div className="space-y-2.5">
        <PartHeading letter="A">Measured on accuracy</PartHeading>
        <p className="text-sm text-neutral-500">
          Includes these modules:{' '}
          <b>Harmonic Fluency · Ear Training · Reading · Production vocabulary</b>.
          Other modules (Shapes &amp; Patterns, Mental Visualisation, Songs) are
          graded from how you rate each exercise yourself (B, below).
        </p>
        <p className="text-sm text-neutral-500">
          A card needs{' '}
          <NumberField
            id="rules-floor-measured"
            label="Answers before a card is rated"
            value={shown.measuredFloor}
            min={3}
            max={20}
            onChange={n => set({ measuredFloor: n })}
          />{' '}
          answers before it gets a rating; below that it reads <StartedBadge />.
          The score is over your last{' '}
          <NumberField
            id="rules-window"
            label="Answers the score is taken over"
            value={shown.window}
            min={10}
            max={50}
            onChange={n => set({ window: n })}
          />{' '}
          answers on that card.
        </p>

        <RuleTable
          head={['Score', 'Rating']}
          rows={[
            [
              <>under {dev}%</>,
              <RatingWord status="needs-work">Needs Work</RatingWord>,
            ],
            [
              <>
                <NumberField
                  id="rules-t-dev"
                  label="Lowest score that reads Developing"
                  value={dev}
                  min={1}
                  max={99}
                  onChange={n => setBand('developingFloor', n)}
                />{' '}– {flu - 1}%
              </>,
              <RatingWord status="developing">Developing</RatingWord>,
            ],
            [
              <>
                <NumberField
                  id="rules-t-flu"
                  label="Lowest score that reads Fluent"
                  value={flu}
                  min={1}
                  max={99}
                  onChange={n => setBand('fluentFloor', n)}
                />{' '}– {mas - 1}%
              </>,
              <RatingWord status="fluent">Fluent</RatingWord>,
            ],
            [
              <>
                <NumberField
                  id="rules-t-mas"
                  label="Lowest score that reads Mastered"
                  value={mas}
                  min={1}
                  max={100}
                  onChange={n => setBand('masteredFloor', n)}
                />% and up
              </>,
              <RatingWord status="mastered">Mastered</RatingWord>,
            ],
          ]}
        />

        <Example>
          In the Harmonic Fluency module, on a <i>Progressions</i> card
          (&quot;The 1-5-6m-4 in the key of F major is _____&quot;), you have
          answered 11 times and got 9 right. That is 82%, so the card reads{' '}
          <RatingWord status="fluent">Fluent</RatingWord>. At{' '}
          {shown.measuredFloor - 1} answers it would still read <StartedBadge />;
          at {shown.measuredFloor} its accuracy rating appears.
        </Example>

        <details className="text-sm text-neutral-500">
          <summary className="cursor-pointer font-semibold text-neutral-700 dark:text-neutral-200">
            Why these numbers
          </summary>
          <p className="mt-1.5">
            Guessing alone scores 25% on a four-option card. Once luck is
            removed, 50% right is only a third of the material actually known,
            so <b>60</b> anchors the bottom of{' '}
            <RatingWord status="developing">Developing</RatingWord>: about half
            known. <b>80</b> is where a card is right far more often than not.{' '}
            <b>95</b> (19 of 20) lets you be human once and still hold{' '}
            <RatingWord status="mastered">Mastered</RatingWord>. The bands
            narrow as you climb (60 / 20 / 15 / 5): the closer you get, the
            finer the distinctions worth making.
          </p>
        </details>

        {pending !== null && (
          <div
            data-testid="rules-confirm"
            className="rounded-lg border border-developing px-3 py-2.5 text-sm"
          >
            You are changing a number that was chosen for a reason (see
            &quot;Why these numbers&quot;). Every card in the four modules will
            be re-graded the moment you do.
            <span className="inline-flex gap-1.5 ml-2 align-middle">
              <button
                type="button"
                data-testid="rules-confirm-yes"
                onClick={() => { void setRules(pending); setPending(null); }}
                className="rounded-full bg-fluent text-white font-semibold px-3 py-1 text-xs"
              >
                Change it
              </button>
              <button
                type="button"
                data-testid="rules-confirm-no"
                onClick={() => setPending(null)}
                className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-xs"
              >
                Keep it
              </button>
            </span>
          </div>
        )}
      </div>

      {/* ---------------- B · self-rated ---------------- */}
      <div className="space-y-2.5 border-t border-neutral-200 dark:border-neutral-700 pt-4">
        <PartHeading letter="B">
          Self-rated: judged by your own rating of each exercise
        </PartHeading>
        <p className="text-sm text-neutral-500">
          Includes these modules:{' '}
          <b>Shapes &amp; Patterns · Mental Visualisation · Songs</b>. After each
          exercise you rate it: <RatingWord status="needs-work">Struggled</RatingWord>{' '}
          · <RatingWord status="developing">Working on it</RatingWord> ·{' '}
          <RatingWord status="fluent">Clean</RatingWord> ·{' '}
          <RatingWord status="mastered">In flow</RatingWord>. Your rating is the{' '}
          <b>
            lowest of your last{' '}
            <NumberField
              id="rules-floor-self"
              label="Rated reps a self-rated cell is judged on"
              value={shown.selfRatedFloor}
              min={2}
              max={5}
              onChange={n => set({ selfRatedFloor: n })}
            />{' '}
            rated reps
          </b>
          . Fewer than that and you read <StartedBadge />.
        </p>

        <RuleTable
          head={['Your last three', 'Rating']}
          rows={[
            [
              <>
                <RatingWord status="needs-work">Struggled</RatingWord> anywhere
                in the three
              </>,
              <RatingWord status="needs-work">Needs Work</RatingWord>,
            ],
            [
              <>
                <RatingWord status="fluent">Clean</RatingWord>,{' '}
                <RatingWord status="fluent">Clean</RatingWord>,{' '}
                <RatingWord status="developing">Working on it</RatingWord>
              </>,
              <RatingWord status="developing">Developing</RatingWord>,
            ],
            [
              <>
                <RatingWord status="fluent">Clean</RatingWord>,{' '}
                <RatingWord status="fluent">Clean</RatingWord>,{' '}
                <RatingWord status="fluent">Clean</RatingWord> · or{' '}
                <RatingWord status="mastered">In flow</RatingWord>,{' '}
                <RatingWord status="mastered">In flow</RatingWord>,{' '}
                <RatingWord status="fluent">Clean</RatingWord>
              </>,
              <RatingWord status="fluent">Fluent</RatingWord>,
            ],
            [
              <>
                <RatingWord status="mastered">In flow</RatingWord>,{' '}
                <RatingWord status="mastered">In flow</RatingWord>,{' '}
                <RatingWord status="mastered">In flow</RatingWord>
              </>,
              <RatingWord status="mastered">Mastered</RatingWord>,
            ],
          ]}
        />

        <Example>
          In the Shapes &amp; Patterns module, you drill A♭ major, first
          inversion, left hand, three times in a row and rate all three{' '}
          <RatingWord status="fluent">Clean</RatingWord>. That cell reads{' '}
          <RatingWord status="fluent">Fluent</RatingWord> for the left hand.
        </Example>
      </div>

      {/* ---------------- C · ear training ---------------- */}
      <div className="space-y-2.5 border-t border-neutral-200 dark:border-neutral-700 pt-4">
        <PartHeading letter="C">
          Ear Training uses the same four words, but the app assigns them
        </PartHeading>
        <p className="text-sm text-neutral-500">
          You never rate an Ear Training answer yourself. After each answer the
          app gives it one of the four words, based on how you got there:
        </p>

        <RuleTable
          head={['How you answered', 'Word']}
          rows={[
            ['Wrong', <RatingWord status="needs-work">Struggled</RatingWord>],
            [
              'Right, but with a listening aid on (bass only, broken chord), '
                + 'or half right (right chord, wrong inversion)',
              <RatingWord status="developing">Working on it</RatingWord>,
            ],
            [
              'Right after replaying the sound',
              <RatingWord status="fluent">Clean</RatingWord>,
            ],
            [
              'Right on the first listen',
              <RatingWord status="mastered">In flow</RatingWord>,
            ],
          ]}
        />

        <p className="text-sm text-neutral-500">
          These words decide how soon the card comes back and whether the answer
          counts toward unlocking the next Tier (below). The card&apos;s
          accuracy rating still comes from right and wrong, as in the first
          table.
        </p>

        <Example>
          In the Ear Training module, on a Chord Recognition card, you hear a
          chord, replay it once, and answer &quot;minor 7&quot; correctly. The
          app marks that answer <RatingWord status="fluent">Clean</RatingWord>.
          It counts as right for your accuracy rating and as a pass toward the
          next Tier; it comes back a little sooner than a first-listen answer
          would.
        </Example>
      </div>

      {rules !== DEFAULT_RATING_RULES && (
        <button
          type="button"
          data-testid="rules-reset"
          onClick={() => { setPending(null); void setRules(DEFAULT_RATING_RULES); }}
          className="text-xs text-neutral-500 underline underline-offset-2"
        >
          Put every number back to the app&apos;s own
        </button>
      )}
    </div>
  );
}

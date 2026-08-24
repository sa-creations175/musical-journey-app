import { useState } from 'react';
import type { SongMatrixSection } from '../../../lib/db';
import type { Feel } from '../../../lib/fluencyScale';
import {
  FREE_TEXT_ACTIVITY,
  PRACTICE_ACTIVITY_OPTIONS,
  type PracticeActivity,
} from '../../../lib/practiceActivities';
import SessionFeelPicker from '../../../components/SessionFeelPicker';
import SectionTicks from './SectionTicks';
import { AWAY_BUCKETS, AWAY_PARTIAL, awayMinutes, gapMinutes } from '../awayTime';

/**
 * What Done opens.
 *
 * ---------------------------------------------------------------
 * THE TIMER RECORDED DURATION AND NOTHING ELSE.
 *
 * Done stopped the clock and logged section × key. It never asked what
 * the work WAS, so the activity vocabulary had nowhere to land and a
 * sitting was a number of minutes against a song. This step is what
 * makes starting the timer worth doing.
 *
 * Three questions, in order of how specific they are: what you worked
 * on, what kind of work it was, how it went. The un-attributed-time
 * question joins them only when there is one, sitting above "how did
 * it go" because it is about the minutes themselves rather than about
 * the playing.
 * ---------------------------------------------------------------
 *
 * NOTHING HERE IS REQUIRED. `Log it` works with every chip untouched.
 * Forcing a taxonomy choice at the end of a practice session is the
 * bureaucracy that stops the logging happening at all — the failure
 * `logPractice.ts` opens by describing. The three-clean-runs test earns
 * its friction because passing it is the thing being proven; naming
 * what you did does not.
 */

export interface RatingAnswers {
  activities: PracticeActivity[];
  activityOther: string;
  feelRating: Feel | null;
}

interface Props {
  /** `mm:ss`, already formatted. Past tense by the time this shows. */
  elapsed: string;
  sections: ReadonlyArray<SongMatrixSection>;
  ticked: ReadonlySet<string>;
  onToggleSection: (id: string) => void;
  onSelectAllSections: () => void;
  /**
   * Un-attributed time still awaiting an answer, in ms. 0 means there
   * is nothing to ask about — and then nothing is asked. A question
   * that appears every time would train the user to dismiss it, which
   * is the one outcome that makes the whole mechanism worse than not
   * having it.
   */
  pendingGapMs: number;
  onResolveGap: (keepFraction: number) => void;
  busy: boolean;
  onBack: () => void;
  onSave: (answers: RatingAnswers) => void;
}

export default function RatingStep({
  elapsed, sections, ticked, onToggleSection, onSelectAllSections,
  pendingGapMs, onResolveGap, busy, onBack, onSave,
}: Props) {
  const [activities, setActivities] = useState<Set<PracticeActivity>>(() => new Set());
  const [other, setOther] = useState('');
  const [feel, setFeel] = useState<Feel | null>(null);

  const toggle = (a: PracticeActivity) => setActivities(prev => {
    const next = new Set(prev);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    return next;
  });

  return (
    <div className="px-4 pb-4 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-mono tabular-nums text-3xl text-neutral-900 dark:text-neutral-50">
          {elapsed}
        </span>
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          this session
        </span>
      </div>

      <SectionTicks
        label="Sections you worked on"
        sections={sections}
        ticked={ticked}
        onToggle={onToggleSection}
        onSelectAll={onSelectAllSections}
      />

      <ActivityPicker
        selected={activities}
        onToggle={toggle}
        other={other}
        onOtherChange={setOther}
      />

      {pendingGapMs > 0 && (
        <AwayTimeQuestion gapMs={pendingGapMs} onAnswer={onResolveGap} />
      )}

      <SessionFeelPicker label="How did it go?" value={feel} onChange={setFeel} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          title="Puts the clock back on and returns to the timer."
          className="px-3 py-2 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          ← Back to the timer
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave({
            activities: [...activities],
            activityOther: other,
            feelRating: feel,
          })}
          className="ml-auto px-4 py-2 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-90 disabled:opacity-40"
        >
          Log it
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------

/**
 * What kind of work it was. Several at once is the normal case.
 *
 * ---------------------------------------------------------------
 * NOTHING HERE IS DERIVED, AND ONE OF THESE IN PARTICULAR.
 *
 * "practising in time" is NOT pre-ticked from whether the metronome
 * was running, and must never be. The metronome being available does
 * not mean it was used, and the number worth being able to see is how
 * often the user deliberately practised to a click — a derived value
 * would report how often a control was on screen instead. It is also
 * the kind of work most often skipped, which is exactly why its
 * frequency is worth recording honestly.
 *
 * A sitting is often lead sheet work AND getting it under the fingers,
 * so this is a multi-select. Forcing one would make the user pick
 * whichever felt more like the "real" work, which is a judgement, and
 * the wrong one to ask for at the end of a session.
 * ---------------------------------------------------------------
 *
 * Labels stay lowercase and as written: these are labels for what
 * happened, not buttons that act.
 */
function ActivityPicker({
  selected, onToggle, other, onOtherChange,
}: {
  selected: ReadonlySet<PracticeActivity>;
  onToggle: (a: PracticeActivity) => void;
  other: string;
  onOtherChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
        What kind of work was it?
      </div>
      <div className="text-[11px] text-neutral-500">Pick as many as apply.</div>
      <div className="grid grid-cols-2 gap-1.5">
        {PRACTICE_ACTIVITY_OPTIONS.map(opt => {
          const on = selected.has(opt.activity);
          return (
            <button
              key={opt.activity}
              type="button"
              onClick={() => onToggle(opt.activity)}
              aria-pressed={on}
              className={`px-2.5 py-2 rounded-md border text-xs text-left leading-snug ${
                on
                  ? 'bg-fluent text-white border-fluent'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent'
              }`}
            >
              <span className="block">{opt.label}</span>
              {opt.hint && (
                <span className={`block text-[10px] ${on ? 'opacity-75' : 'text-neutral-400'}`}>
                  {opt.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {selected.has(FREE_TEXT_ACTIVITY) && (
        // The list is meant to grow in the user's own words rather
        // than be guessed at up front. This is where the next entry
        // comes from — and leaving it blank is a real answer, so
        // nothing here is required either.
        <input
          type="text"
          value={other}
          onChange={e => onOtherChange(e.target.value)}
          placeholder="in your own words"
          aria-label="What the other work was"
          className="w-full px-2.5 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-transparent text-xs text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400"
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------

/**
 * Time the app could not see.
 *
 * Shown only when there is a banked stretch. The numbers beside each
 * answer are what that answer would keep, so the consequence is
 * visible before the choice is made rather than after.
 *
 * "I was here for some of it" is a disclosure rather than three more
 * top-level buttons: the common answers are the two ends — you were
 * playing, or you had gone — and putting five choices on one row makes
 * the two that are usually right harder to hit.
 */
function AwayTimeQuestion({
  gapMs, onAnswer,
}: {
  gapMs: number;
  onAnswer: (keepFraction: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [answered, setAnswered] = useState<string | null>(null);
  const answer = (id: string, keepFraction: number) => {
    setAnswered(id);
    onAnswer(keepFraction);
  };

  if (answered !== null) {
    const all = [...AWAY_BUCKETS, ...AWAY_PARTIAL];
    const chosen = all.find(b => b.id === answered);
    return (
      <div className="rounded-md border border-neutral-200 dark:border-neutral-700 px-3 py-2">
        <p className="text-[11px] text-neutral-600 dark:text-neutral-300">
          Recorded as {awayMinutes(gapMs, chosen?.keepFraction ?? 0)} min
          {' '}of the {gapMinutes(gapMs)}.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#E88943]/40 bg-[#E88943]/5 px-3 py-2 space-y-2">
      <div className="space-y-0.5">
        <p className="text-[11px] font-medium text-neutral-800 dark:text-neutral-100">
          App activity not detected for the last {gapMinutes(gapMs)} minutes.
        </p>
        <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
          The app can’t tell whether you were playing or away. Only you know.
        </p>
        <p className="text-[11px] text-neutral-600 dark:text-neutral-300">
          How should we record this time?
        </p>
      </div>

      <AwayChoice
        label={AWAY_BUCKETS[0].label}
        minutes={awayMinutes(gapMs, AWAY_BUCKETS[0].keepFraction)}
        onClick={() => answer(AWAY_BUCKETS[0].id, AWAY_BUCKETS[0].keepFraction)}
      />

      <div>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-700 dark:text-neutral-200 hover:border-fluent"
        >
          <span>I was here for some of it</span>
          <span aria-hidden className="ml-auto text-neutral-400">{open ? '▴' : '▾'}</span>
        </button>
        {open && (
          <div className="mt-1.5 space-y-1.5 pl-3">
            {AWAY_PARTIAL.map(b => (
              <AwayChoice
                key={b.id}
                label={b.label}
                minutes={awayMinutes(gapMs, b.keepFraction)}
                onClick={() => answer(b.id, b.keepFraction)}
              />
            ))}
          </div>
        )}
      </div>

      <AwayChoice
        label={AWAY_BUCKETS[1].label}
        minutes={awayMinutes(gapMs, AWAY_BUCKETS[1].keepFraction)}
        onClick={() => answer(AWAY_BUCKETS[1].id, AWAY_BUCKETS[1].keepFraction)}
      />
    </div>
  );
}

function AwayChoice({
  label, minutes, onClick,
}: {
  label: string;
  minutes: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent"
    >
      <span>{label}</span>
      <span className="ml-auto font-mono tabular-nums text-neutral-500">
        {minutes} min
      </span>
    </button>
  );
}

import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Goal } from '../../../lib/db';
import { GOALS_META } from '../../../lib/moduleMeta';
import { getPref, setPref } from '../../../lib/userPrefs';
import Screen1Goals from './Screen1Goals';
import Screen2DayProfiles, { type Screen2Handle } from './Screen2DayProfiles';
import Screen3LongerRange from './Screen3LongerRange';

/**
 * Goals onboarding controller (sub-phase 3 steps 5–9).
 *
 * Three screens of one logical flow:
 *   1. This-month focus — prompt cards + accumulating list
 *   2. Day profiles — Standard / Light / Deep, Q9 default pre-fills
 *   3. Longer-range opt-in — yearly / 2-3 year / lifetime (optional)
 *
 * Re-fire trigger lives in Goals.tsx — the parent renders this
 * component whenever the user has zero active goals (with a
 * per-mount `sessionDismissed` escape hatch). On entry we always
 * land on Screen 1 with prior data pre-filled from db (per the
 * April 25 design review's "mid-onboarding return" policy). The
 * `goals.onboarding.lastCompletedScreen` userPref tracks farthest
 * progress for telemetry; it isn't used to skip screens.
 *
 * Bidirectional navigation: Back goes to the previous screen
 * without rolling back lastCompletedScreen. "Skip the rest" exits
 * immediately on any screen.
 */

const PREF_LAST_COMPLETED = 'goals.onboarding.lastCompletedScreen';

interface Props {
  /** Called when the user clicks Done on Screen 3 OR Skip the rest
   *  on any screen. Parent flips `sessionDismissed` so the layered
   *  Goals home re-renders. */
  onExit: () => void;
}

export default function OnboardingFlow({ onExit }: Props) {
  const [currentScreen, setCurrentScreen] = useState<1 | 2 | 3>(1);
  const screen2HandleRef = useRef<Screen2Handle | null>(null);

  // Live data the screens read.
  const allActiveGoals = useLiveQuery(
    () => db.goals.where('status').equals('active').toArray(),
    [],
    [] as Goal[],
  );
  const monthlyGoals = allActiveGoals.filter(g => g.scope === 'monthly');

  // Persist farthest-progress on advance. (Back doesn't update the
  // pref — going back doesn't undo what the user reached.)
  const advanceTo = async (next: 1 | 2 | 3) => {
    if (next > currentScreen) {
      try {
        const prior = await getPref<number>(PREF_LAST_COMPLETED, 0);
        const completed = currentScreen; // we're leaving currentScreen
        const reached = Math.max(prior, completed);
        if (reached !== prior) await setPref(PREF_LAST_COMPLETED, reached);
      } catch (err) {
        console.warn('[onboarding] lastCompletedScreen pref write failed', err);
      }
    }
    setCurrentScreen(next);
  };

  const handleNext = async () => {
    if (currentScreen === 2) {
      // Persist the day-profile draft before advancing. The handle
      // is provided by Screen2DayProfiles via registerHandle.
      const ok = await screen2HandleRef.current?.persist() ?? true;
      if (!ok) return; // hold the user on Screen 2 if save failed
    }
    if (currentScreen === 3) {
      // "Done" path on the final screen.
      try {
        await setPref(PREF_LAST_COMPLETED, 3);
      } catch (err) {
        console.warn('[onboarding] lastCompletedScreen pref write failed', err);
      }
      onExit();
      return;
    }
    await advanceTo((currentScreen + 1) as 2 | 3);
  };

  const handleBack = async () => {
    if (currentScreen === 1) return;
    if (currentScreen === 2) {
      // Persist Screen 2 edits before leaving — Back is a navigation
      // not a discard. Day profiles can be re-edited from Goals
      // post-onboarding, so committing on Back is forgiving rather
      // than lossy.
      await screen2HandleRef.current?.persist();
    }
    setCurrentScreen((currentScreen - 1) as 1 | 2);
  };

  const handleSkip = async () => {
    if (currentScreen === 2) {
      // Even on skip, persist whatever Screen 2 draft exists — the
      // user already saw the defaults and may have touched a slot
      // before deciding to bail. Cheap to write three rows.
      await screen2HandleRef.current?.persist();
    }
    onExit();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-base font-medium"
          style={{
            backgroundColor: `${GOALS_META.accentHex}1a`,
            color: GOALS_META.accentHex,
          }}
        >
          {GOALS_META.icon}
        </span>
        <h1 className="text-2xl font-semibold text-neutral-800 dark:text-neutral-100 flex-1">
          Set up your Goals
        </h1>
        <button
          type="button"
          onClick={() => void handleSkip()}
          className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          Skip the rest
        </button>
      </div>

      <ProgressDots current={currentScreen} />

      {/* Active screen body. Plain <div> rather than <main> — Layout
          already provides the page-level <main>, and nesting is
          invalid HTML5. Bottom padding leaves room for the sticky
          nav so the last line of content isn't trapped under it. */}
      <div className="mt-4 pb-24">
        {currentScreen === 1 && (
          <Screen1Goals monthlyGoals={monthlyGoals} />
        )}
        {currentScreen === 2 && (
          <Screen2DayProfiles registerHandle={h => { screen2HandleRef.current = h; }} />
        )}
        {currentScreen === 3 && (
          <Screen3LongerRange allGoals={allActiveGoals} />
        )}
      </div>

      {/* Sticky navigation bar — pinned to the bottom of the
          scroll container so Back / Next are always reachable
          regardless of screen length or scroll position. Solid
          background + top border so it reads as a separate region
          when content scrolls beneath it. */}
      <div
        role="navigation"
        aria-label="Onboarding navigation"
        className="sticky bottom-0 -mx-4 px-4 py-3 mt-6 bg-white/95 dark:bg-neutral-950/95 backdrop-blur border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2"
      >
        <button
          type="button"
          onClick={() => void handleBack()}
          disabled={currentScreen === 1}
          className="px-3 py-1.5 text-sm rounded-md text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => void handleNext()}
          className="px-3 py-1.5 text-sm rounded-md bg-fluent text-white hover:bg-fluent/90"
        >
          {currentScreen === 3 ? 'Done' : 'Next →'}
        </button>
      </div>
    </div>
  );
}

function ProgressDots({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${current} of 3`}>
      {[1, 2, 3].map(n => (
        <span
          key={n}
          className={[
            'h-1.5 rounded-full transition-all',
            n === current ? 'w-8 bg-fluent' : 'w-4 bg-neutral-300 dark:bg-neutral-700',
          ].join(' ')}
          aria-current={n === current ? 'step' : undefined}
        />
      ))}
    </div>
  );
}

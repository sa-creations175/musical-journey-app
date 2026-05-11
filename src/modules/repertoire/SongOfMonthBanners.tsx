/**
 * Song-of-the-Month banner surfaces. Two banners share the same
 * file because they consume the same prompt source + advance
 * helper and only differ in copy / actions:
 *
 *   <SongOfMonthCongratsBanner />
 *     Rendered on Practice Sessions home + (optionally) elsewhere
 *     wherever a 'banner' surface fits. Shows "Congrats! {song}
 *     is comfortable in its original key. Ready to start on your
 *     next song of the month?" with Yes / Maybe later actions.
 *     Yes → advanceSpotlightQueue + markEngaged. Maybe later →
 *     markDismissed (re-fires only when conditions still hold
 *     AND no non-expired prompt exists for the same songId).
 *
 *   <SongOfMonthTbdNudgeBanner />
 *     Rendered on the Goals page above the Repertoire by-module
 *     section. Shows "Your next song of the month hasn't been
 *     chosen yet — pick one now so you're ready." with
 *     Pick a song / Maybe later. Pick → /goals (already there;
 *     just markEngaged + scroll the user to Repertoire). Maybe
 *     later → markDismissed; re-fires the next local day if
 *     conditions still hold (see songOfMonthPrompts.ts).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import {
  PROMPT_TYPE,
  markDismissed,
  markEngaged,
  markShown,
} from '../../lib/prompts';
import { advanceSpotlightQueue } from './songOfMonth';

/**
 * Pick the most-recent prompt of `type` whose status is queued
 * or shown. Returns null when none match.
 */
function useLiveBanner(type: string) {
  return useLiveQuery(
    () =>
      db.prompts
        .where('promptType')
        .equals(type)
        .toArray()
        .then(rows =>
          rows
            .filter(p => p.status === 'queued' || p.status === 'shown')
            .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null,
        ),
    [type],
  );
}

// =====================================================================
// Congrats banner
// =====================================================================

export function SongOfMonthCongratsBanner() {
  const live = useLiveBanner(PROMPT_TYPE.SONG_OF_MONTH_CONGRATS);
  const [advancing, setAdvancing] = useState(false);

  // Mark queued → shown on first render. Same guarded transition
  // pattern as GoalsNudgeBanner — markShown no-ops past queued.
  const liveId = live?.id;
  const liveStatus = live?.status;
  useEffect(() => {
    if (liveId && liveStatus === 'queued') {
      void markShown(liveId).catch(err => {
        console.warn('[SongOfMonthCongratsBanner] markShown failed', err);
      });
    }
  }, [liveId, liveStatus]);

  if (!live) return null;
  const songTitle = (live.payload?.songTitle as string) ?? 'this song';
  const umbrellaGoalId = live.payload?.umbrellaGoalId as string | undefined;

  const handleAdvance = async () => {
    if (!umbrellaGoalId || advancing) return;
    setAdvancing(true);
    try {
      await advanceSpotlightQueue(umbrellaGoalId);
      await markEngaged(live.id);
    } catch (err) {
      console.warn('[SongOfMonthCongratsBanner] advance failed', err);
    } finally {
      setAdvancing(false);
    }
  };

  const handleDismiss = () => {
    void markDismissed(live.id).catch(err => {
      console.warn('[SongOfMonthCongratsBanner] markDismissed failed', err);
    });
  };

  return (
    <div className="rounded-md border border-emerald-400/40 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
          Congrats! {songTitle} is comfortable in its original key.
        </div>
        <div className="text-xs text-emerald-800/80 dark:text-emerald-200/80 mt-0.5">
          Ready to start on your next song of the month?
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleDismiss}
          className="text-xs text-emerald-800/70 hover:text-emerald-900 dark:text-emerald-200/70 dark:hover:text-emerald-200"
        >
          Maybe later
        </button>
        <button
          type="button"
          onClick={handleAdvance}
          disabled={advancing || !umbrellaGoalId}
          className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {advancing ? 'Advancing…' : 'Yes, advance →'}
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// TBD nudge banner
// =====================================================================

export function SongOfMonthTbdNudgeBanner() {
  const navigate = useNavigate();
  const live = useLiveBanner(PROMPT_TYPE.SONG_OF_MONTH_TBD_NUDGE);

  const liveId = live?.id;
  const liveStatus = live?.status;
  useEffect(() => {
    if (liveId && liveStatus === 'queued') {
      void markShown(liveId).catch(err => {
        console.warn('[SongOfMonthTbdNudgeBanner] markShown failed', err);
      });
    }
  }, [liveId, liveStatus]);

  if (!live) return null;

  const handleEngage = () => {
    // Already on /goals when this banner renders, so just mark
    // engaged + scroll the page to the Repertoire section. The
    // user can re-open the goal flow via the section's "+ Add
    // goal" link to fill the TBD slot.
    void markEngaged(live.id).catch(err => {
      console.warn('[SongOfMonthTbdNudgeBanner] markEngaged failed', err);
    });
    // Navigate (no-op if already at /goals) to ensure focus.
    navigate('/goals');
  };

  const handleDismiss = () => {
    void markDismissed(live.id).catch(err => {
      console.warn('[SongOfMonthTbdNudgeBanner] markDismissed failed', err);
    });
  };

  return (
    <div className="rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-amber-900 dark:text-amber-200">
          Your next song of the month hasn't been chosen yet.
        </div>
        <div className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
          Pick one now so you're ready when this month's spotlight is done.
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleDismiss}
          className="text-xs text-amber-800/70 hover:text-amber-900 dark:text-amber-200/70 dark:hover:text-amber-200"
        >
          Maybe later
        </button>
        <button
          type="button"
          onClick={handleEngage}
          className="px-3 py-1.5 text-sm rounded-md bg-amber-600 text-white hover:bg-amber-700"
        >
          Pick a song →
        </button>
      </div>
    </div>
  );
}

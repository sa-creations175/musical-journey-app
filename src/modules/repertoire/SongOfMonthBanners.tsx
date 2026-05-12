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
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Song } from '../../lib/db';
import {
  PROMPT_TYPE,
  markDismissed,
  markEngaged,
  markShown,
} from '../../lib/prompts';
import { advanceSpotlightQueue } from './songOfMonth';
import { generateCircleOfFourthsSequence } from './circleOfFourths';
import { useToast } from '../../components/Toaster';

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

/** Path options shown on the congrats banner. */
type ProgressionPath = 'deepen' | 'expand-keys' | 'maintenance';

export function SongOfMonthCongratsBanner() {
  const live = useLiveBanner(PROMPT_TYPE.SONG_OF_MONTH_CONGRATS);
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

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

  // Live-read the song record so the rendered key reflects any
  // user-edit between enqueue and ack — the payload's snapshot might
  // be stale.
  const songId = live?.payload?.songId as string | undefined;
  const song = useLiveQuery(
    async () => (songId ? await db.songs.get(songId) : undefined),
    [songId],
  );

  const originalKey = song?.key ?? '';
  // First circle-of-4ths step from the song's original key — used
  // as the "next key" hint on the expand-keys subtext.
  const nextKey = useMemo(() => {
    if (!originalKey) return null;
    return generateCircleOfFourthsSequence(originalKey)[0] ?? null;
  }, [originalKey]);

  if (!live) return null;
  const songTitle = (live.payload?.songTitle as string) ?? 'this song';
  const umbrellaGoalId = live.payload?.umbrellaGoalId as string | undefined;

  const handlePick = async (path: ProgressionPath) => {
    if (processing || !songId) return;
    setProcessing(true);
    try {
      // Read-then-put avoids the silent-no-op behavior of
      // db.songs.update on rows that have drifted to a slightly
      // different schema (see VacationManager precedent +
      // saveOverride in matrix saveMeta).
      const current = await db.songs.get(songId);
      if (current) {
        const next: Song = { ...current, progressionPath: path };
        if (path === 'expand-keys') {
          next.expandKeysOrder = generateCircleOfFourthsSequence(
            current.key ?? '',
          );
        } else {
          // Clear any stale walk-order when the user picks a non-
          // expand path so the algorithm doesn't accidentally
          // consume it later. Optional fields → undefined.
          next.expandKeysOrder = undefined;
        }
        await db.songs.put(next);
      }
      // SotM queue advancement is unconditional once the user picks
      // a path — per spec, the path choice doesn't block the next
      // spotlight from rotating in.
      if (umbrellaGoalId) {
        await advanceSpotlightQueue(umbrellaGoalId);
      }
      await markEngaged(live.id);
      toast({
        message: `Got it — we'll practice ${songTitle} accordingly`,
        variant: 'success',
      });
    } catch (err) {
      console.warn('[SongOfMonthCongratsBanner] path pick failed', err);
      setProcessing(false);
    }
  };

  const inKey = originalKey ? `in ${originalKey}` : 'in this key';
  const expandSubtext = nextKey && originalKey
    ? `Start on ${nextKey} while keeping ${originalKey} fresh`
    : 'Walk this song through every key in the wheel';

  return (
    <div className="rounded-md border border-emerald-400/40 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 space-y-3">
      <div>
        <div className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
          Congrats! {songTitle} is comfortable in its original key.
        </div>
        <div className="text-xs text-emerald-800/80 dark:text-emerald-200/80 mt-0.5">
          Pick how you want to keep working on it.
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <PathChoiceButton
          onClick={() => void handlePick('deepen')}
          disabled={processing}
          title="Deepen"
          label={`Keep building ${inKey}`}
          subtext="Work toward solid — whole-song runs with focused repair"
        />
        <PathChoiceButton
          onClick={() => void handlePick('expand-keys')}
          disabled={processing || !nextKey}
          title="Expand keys"
          label="Take it to new keys"
          subtext={expandSubtext}
        />
        <PathChoiceButton
          onClick={() => void handlePick('maintenance')}
          disabled={processing}
          title="Maintenance"
          label="Keep it fresh"
          subtext="Light weekly rotation — you've got this one"
        />
      </div>
    </div>
  );
}

function PathChoiceButton({
  title,
  label,
  subtext,
  onClick,
  disabled,
}: {
  title: string;
  label: string;
  subtext: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left rounded-md border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-emerald-950/20 px-3 py-2 hover:border-emerald-500 hover:bg-emerald-100/40 dark:hover:bg-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <div className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
        <span className="font-semibold">{title}</span>
        <span className="text-emerald-800/80 dark:text-emerald-200/80"> — {label}</span>
      </div>
      <div className="text-[11px] text-emerald-800/70 dark:text-emerald-200/70 mt-0.5">
        {subtext}
      </div>
    </button>
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

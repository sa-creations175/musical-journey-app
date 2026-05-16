/**
 * Song-of-the-Month prompt evaluator.
 *
 * Two prompts can fire:
 *
 *   SONG_OF_MONTH_CONGRATS  — high tier. Enqueued when the spotlight
 *                             song reaches comfortable in its
 *                             original key. Dedupe per songId
 *                             across the prompt's lifetime — once a
 *                             prompt for a given songId exists with
 *                             a non-expired status, we don't enqueue
 *                             another (the user either engaged or
 *                             dismissed; the next congrats fires for
 *                             the next spotlight song).
 *
 *   SONG_OF_MONTH_TBD_NUDGE — medium tier. Enqueued when:
 *                                 spotlight song's original-key
 *                                 comfortable ratio ≥ 0.5
 *                               AND the next queue slot exists and is
 *                                 TBD.
 *                             Cadence: at most once per local
 *                             calendar day per umbrella. Even after
 *                             the user dismisses, a re-enqueue
 *                             happens the next day if conditions
 *                             still hold — keeps the user prompted
 *                             without spamming the same day.
 *
 * Fire-and-forget from session-end + Goals-mount. No throwing —
 * a stale schema or a bad goal record can't break the host.
 */
import { db } from '../../lib/db';
import { findByType } from '../../lib/prompts/queue';
import { enqueue } from '../../lib/prompts/queue';
import { PROMPT_TYPE } from '../../lib/prompts/types';
import {
  comfortableCellRatioInOriginalKey,
  isSongComfortableInOriginalKey,
} from './songComfortable';
import { loadActiveSpotlight } from './songOfMonth';

/** Threshold ratio for the TBD nudge — past ~50% comfortable. */
export const TBD_NUDGE_RATIO_THRESHOLD = 0.5;

/**
 * Evaluate the current Song-of-the-Month state and enqueue any
 * prompts whose conditions are met. Safe to call repeatedly —
 * dedupe + per-day cadence prevent re-fires.
 *
 * `now` is overridable for tests; production callers omit it.
 */
export async function evaluateSongOfMonthPrompts(
  now: number = Date.now(),
): Promise<void> {
  let state;
  try {
    state = await loadActiveSpotlight(now);
  } catch (err) {
    console.warn('[songOfMonthPrompts] loadActiveSpotlight failed', err);
    return;
  }
  if (!state || !state.spotlight) return;

  const spotlight = state.spotlight;
  const nextSlot = state.slots[1] ?? null;

  // ── Congrats ──────────────────────────────────────────────────
  if (spotlight.kind === 'song' && spotlight.refId) {
    try {
      if (await isSongComfortableInOriginalKey(spotlight.refId)) {
        if (!(await congratsAlreadyExistsForSong(spotlight.refId))) {
          await enqueue({
            promptType: PROMPT_TYPE.SONG_OF_MONTH_CONGRATS,
            tier: 'high',
            surface: 'banner',
            payload: {
              songId: spotlight.refId,
              songTitle: spotlight.displayTitle,
              umbrellaGoalId: state.umbrellaGoalId,
            },
            createdAt: now,
          });
        }
      }
    } catch (err) {
      console.warn('[songOfMonthPrompts] congrats eval failed', err);
    }
  }

  // ── TBD nudge ─────────────────────────────────────────────────
  // Only meaningful when the spotlight is a specific song (we need
  // a ratio to compare against the threshold) AND there's a next
  // slot in TBD state.
  if (
    spotlight.kind === 'song' &&
    spotlight.refId &&
    nextSlot &&
    nextSlot.kind === 'tbd'
  ) {
    try {
      const ratio = await comfortableCellRatioInOriginalKey(spotlight.refId);
      if (ratio >= TBD_NUDGE_RATIO_THRESHOLD) {
        if (!(await tbdNudgeAlreadyEnqueuedToday(state.umbrellaGoalId, now))) {
          await enqueue({
            promptType: PROMPT_TYPE.SONG_OF_MONTH_TBD_NUDGE,
            tier: 'medium',
            surface: 'banner',
            payload: {
              umbrellaGoalId: state.umbrellaGoalId,
              spotlightSongId: spotlight.refId,
              ratio,
            },
            createdAt: now,
          });
        }
      }
    } catch (err) {
      console.warn('[songOfMonthPrompts] tbd nudge eval failed', err);
    }
  }
}

/** True when a congrats prompt for this songId already exists in
 *  any non-expired status — covers queued / shown / dismissed /
 *  engaged. The next congrats fires only for the next spotlight
 *  song, not a repeat of this one. */
async function congratsAlreadyExistsForSong(songId: string): Promise<boolean> {
  const existing = await findByType(PROMPT_TYPE.SONG_OF_MONTH_CONGRATS);
  return existing.some(
    p => p.payload?.songId === songId && p.status !== 'expired',
  );
}

/**
 * Mirror of {@link congratsAlreadyExistsForSong} for the non-
 * spotlight path-choice prompt. Separate prompt type → separate
 * dedupe set; the two evaluators don't race for the same row.
 */
async function pathChoiceAlreadyExistsForSong(songId: string): Promise<boolean> {
  const existing = await findByType(PROMPT_TYPE.SONG_COMFORTABLE_PATH_CHOICE);
  return existing.some(
    p => p.payload?.songId === songId && p.status !== 'expired',
  );
}

/** In-flight guard for evaluateSongComfortablePathPrompts. React
 *  StrictMode double-invokes useEffect in dev, and the host
 *  PracticeSessions / Goals mount-effects fire the evaluator each
 *  time. Without a guard, two concurrent calls both pass the
 *  per-songId dedupe check (neither sees the other's not-yet-
 *  committed enqueue) and both write prompts for the same songId.
 *  The dupes then break the banner-dismiss flow: markEngaged
 *  acks one prompt, useLiveBanner picks up the other still-queued
 *  duplicate, and the banner persists. Mirrors the in-flight
 *  pattern documented in modules/harmonic-diary/data.ts:25–32. */
let evalInFlight: Promise<void> | null = null;

/**
 * Evaluator for the non-spotlight comfortable-path prompt. Any song
 * that reaches "comfortable in original key" and hasn't yet picked
 * a progression path triggers the same three-path choice UI the
 * SotM spotlight uses — minus the SotM-specific congrats copy and
 * spotlight-queue advancement.
 *
 * Skipped per song:
 *   · Active SotM spotlight song → handled by evaluateSongOfMonthPrompts
 *     (no double-prompt; the SotM congrats has the path-choice UI
 *     plus the spotlight queue rotation).
 *   · Song already has progressionPath set (any of deepen / expand-
 *     keys / maintenance) — the user already picked.
 *   · A non-expired prompt for this songId already exists.
 *
 * Bounded cost: iterates all songs with materialised matrix sections
 * (~repertoire size). Per-song the predicate runs ~3 indexed Dexie
 * queries. Safe to call on every mount of PracticeSessions / Goals.
 *
 * Concurrent calls deduplicate via `evalInFlight` — the second
 * caller awaits the first call's result instead of racing the
 * per-songId dedupe check.
 *
 * Fire-and-forget — `now` is overridable for tests.
 */
export async function evaluateSongComfortablePathPrompts(
  now: number = Date.now(),
): Promise<void> {
  if (evalInFlight) return evalInFlight;
  evalInFlight = doEvaluateSongComfortablePathPrompts(now).finally(() => {
    evalInFlight = null;
  });
  return evalInFlight;
}

async function doEvaluateSongComfortablePathPrompts(
  now: number,
): Promise<void> {
  // Look up the active spotlight first so we can skip the spotlight
  // song — the SotM evaluator owns it. A null spotlight (no active
  // umbrella) just means every comfortable song is fair game.
  let spotlightSongId: string | null = null;
  try {
    const spotlightState = await loadActiveSpotlight(now);
    if (spotlightState?.spotlight?.kind === 'song') {
      spotlightSongId = spotlightState.spotlight.refId ?? null;
    }
  } catch (err) {
    console.warn(
      '[songOfMonthPrompts] loadActiveSpotlight failed during path-choice eval',
      err,
    );
    // Continue — worst case we double-prompt for one song, which the
    // per-songId dedupe inside the SotM evaluator catches separately.
  }

  let songs;
  try {
    songs = await db.songs.toArray();
  } catch (err) {
    console.warn('[songOfMonthPrompts] songs read failed', err);
    return;
  }

  for (const song of songs) {
    if (song.id === spotlightSongId) continue;
    // User already picked a path — nothing to prompt.
    if (song.progressionPath) continue;

    try {
      if (!(await isSongComfortableInOriginalKey(song.id))) continue;
      if (await pathChoiceAlreadyExistsForSong(song.id)) continue;
      await enqueue({
        promptType: PROMPT_TYPE.SONG_COMFORTABLE_PATH_CHOICE,
        tier: 'high',
        surface: 'banner',
        payload: {
          songId: song.id,
          songTitle: song.title,
        },
        createdAt: now,
      });
    } catch (err) {
      console.warn(
        '[songOfMonthPrompts] path-choice eval failed for song',
        { songId: song.id, error: err },
      );
    }
  }
}

/** True when a TBD-nudge prompt for this umbrella already exists
 *  with a createdAt in the current local calendar day. Re-enqueues
 *  freely on the next day while the conditions still hold. */
async function tbdNudgeAlreadyEnqueuedToday(
  umbrellaGoalId: string,
  now: number,
): Promise<boolean> {
  const existing = await findByType(PROMPT_TYPE.SONG_OF_MONTH_TBD_NUDGE);
  const todayKey = localDayKey(now);
  return existing.some(p => {
    if (p.payload?.umbrellaGoalId !== umbrellaGoalId) return false;
    return localDayKey(p.createdAt) === todayKey;
  });
}

function localDayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

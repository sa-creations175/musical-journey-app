/**
 * Repertoire two-block split for the proposal screen.
 *
 * When a Repertoire AllocatedBlock lands in a Keys/Mixed session,
 * the proposal screen splits it into two labeled ProposalBlocks:
 *
 *   "Song of the month: {title|TBD}"  — the active spotlight slot.
 *                                      Spec: 2/3 of total Rep time,
 *                                      minimum 15 min.
 *
 *   "Maintenance: {song}"            — the lowest learning-order
 *                                      active song NOT comfortable
 *                                      in its original key,
 *                                      excluding the spotlight.
 *                                      Spec: 1/3 of total Rep time.
 *
 * Edge cases (handled inline):
 *   · Total Rep allocation < 15 min → single block, whichever is
 *     more urgent (spotlight wins by default; maintenance only
 *     when no spotlight).
 *   · Spotlight is TBD → block label says "Song of the month: TBD"
 *     (the inline "Add a song in Goals" action lands in commit 7).
 *   · No spotlight AND no maintenance → original single block
 *     passes through unchanged.
 *   · Only spotlight, no maintenance candidate → full Rep time
 *     goes to spotlight.
 *   · Only maintenance, no monthly umbrella → full Rep time goes
 *     to maintenance with no "Song of the month" label.
 */
import { db, type Song } from '../../lib/db';
import { isSongComfortableInOriginalKey } from '../repertoire/songComfortable';
import { loadActiveSpotlight, type QueueSlot } from '../repertoire/songOfMonth';

const MIN_SPOTLIGHT_SECONDS = 15 * 60;
const SPOTLIGHT_RATIO = 2 / 3;

export interface RepertoireSplitContext {
  /** Slot 1 from the active monthly umbrella. Null when no
   *  Repertoire monthly umbrella exists. */
  spotlight: QueueSlot | null;
  /** Lowest-learningOrder active song not yet comfortable in its
   *  original key, excluding the spotlight song. Null when no
   *  candidate exists (all active songs are already comfortable,
   *  or there are no active songs). */
  maintenanceSong: Song | null;
}

/**
 * Load the spotlight + a maintenance-song candidate. Pure read;
 * caller (sessionGenerator) invokes this once per proposal
 * generation and threads the result through.
 */
export async function loadRepertoireSplitContext(
  now: number = Date.now(),
): Promise<RepertoireSplitContext> {
  const state = await loadActiveSpotlight(now);
  const spotlight = state?.spotlight ?? null;

  const spotlightSongId =
    spotlight && spotlight.kind === 'song' ? spotlight.refId : null;

  // Maintenance candidate: every active song not at the spotlight
  // and not already comfortable in its original key, sorted by
  // learningOrder ASC. We take the first non-comfortable match —
  // an O(N) scan with N ≈ active repertoire size (small).
  const allSongs = await db.songs.toArray();
  const sorted = [...allSongs].sort(
    (a, b) =>
      (a.learningOrder ?? Number.MAX_SAFE_INTEGER) -
      (b.learningOrder ?? Number.MAX_SAFE_INTEGER),
  );

  let maintenanceSong: Song | null = null;
  for (const s of sorted) {
    if (spotlightSongId && s.id === spotlightSongId) continue;
    // Skip songs already comfortable — they don't need maintenance
    // attention (the spec says lowest-numbered NOT yet comfortable).
    // eslint-disable-next-line no-await-in-loop
    if (await isSongComfortableInOriginalKey(s.id)) continue;
    maintenanceSong = s;
    break;
  }

  return { spotlight, maintenanceSong };
}

export interface RepertoireSplitBlock {
  /** Display label for the activityDescription line. */
  label: string;
  /** Time allocated to this block, in seconds. */
  plannedSeconds: number;
  /** Short reason that feeds whySnippet. */
  why: string;
  /** Song id this block targets — null for TBD spotlight or when
   *  maintenance has no candidate. */
  songId: string | null;
  /** True when this block represents a TBD spotlight; UI surfaces
   *  the "Add a song in Goals" inline action in commit 7. */
  isTbdSpotlight: boolean;
  /** Discriminator for logging / display routing. */
  kind: 'spotlight' | 'maintenance';
}

/**
 * Split a Repertoire AllocatedBlock's plannedSeconds between
 * spotlight + maintenance per the spec. Returns 1 or 2 entries.
 *
 *   plannedSeconds  — total Repertoire seconds allocated upstream.
 *   ctx             — spotlight + maintenance candidates from
 *                     loadRepertoireSplitContext.
 *
 * The caller (sessionGenerator's toProposalBlock layer) consumes
 * the returned entries and constructs ProposalBlock display rows.
 * Returning a typed intermediate keeps the sequencing logic here
 * and the display concerns there.
 */
export function splitRepertoireAllocation(
  plannedSeconds: number,
  ctx: RepertoireSplitContext,
): RepertoireSplitBlock[] {
  const hasSpotlight = !!ctx.spotlight;
  const hasMaintenance = !!ctx.maintenanceSong;

  // Both ends empty — caller falls back to the original single
  // Repertoire block (active-song picking by the algorithm).
  if (!hasSpotlight && !hasMaintenance) return [];

  // Only one source available — give it the full allocation.
  if (hasSpotlight && !hasMaintenance) {
    return [spotlightBlock(plannedSeconds, ctx.spotlight!)];
  }
  if (!hasSpotlight && hasMaintenance) {
    return [maintenanceBlock(plannedSeconds, ctx.maintenanceSong!)];
  }

  // Both available — apply the split. Under-15-min Repertoire
  // allocation collapses to whichever is more urgent: spotlight
  // wins by default (the user actively picked it for the month).
  if (plannedSeconds < MIN_SPOTLIGHT_SECONDS) {
    return [spotlightBlock(plannedSeconds, ctx.spotlight!)];
  }

  // ≥ 15-min split: spotlight gets max(15min, 2/3 of total);
  // maintenance gets whatever's left. The min-spotlight clamp
  // squeezes the maintenance block at small total allocations
  // (e.g. 20-min Rep → 15/5 instead of 13/7).
  const spotlightSeconds = Math.max(
    MIN_SPOTLIGHT_SECONDS,
    Math.round(plannedSeconds * SPOTLIGHT_RATIO),
  );
  // Don't let spotlight exceed total when 2/3 × total > total
  // (impossible math, defensive). Maintenance gets at least zero.
  const clampedSpotlight = Math.min(spotlightSeconds, plannedSeconds);
  const maintenanceSeconds = plannedSeconds - clampedSpotlight;
  return [
    spotlightBlock(clampedSpotlight, ctx.spotlight!),
    maintenanceBlock(maintenanceSeconds, ctx.maintenanceSong!),
  ];
}

function spotlightBlock(
  plannedSeconds: number,
  spotlight: QueueSlot,
): RepertoireSplitBlock {
  if (spotlight.kind === 'tbd' || !spotlight.refId) {
    return {
      label: 'Song of the month: TBD',
      plannedSeconds,
      why: 'Pick a song-of-the-month to give the session its anchor',
      songId: null,
      isTbdSpotlight: true,
      kind: 'spotlight',
    };
  }
  return {
    label: `Song of the month: ${spotlight.displayTitle}`,
    plannedSeconds,
    why: 'This month\'s spotlight song',
    songId: spotlight.refId,
    isTbdSpotlight: false,
    kind: 'spotlight',
  };
}

function maintenanceBlock(
  plannedSeconds: number,
  song: Song,
): RepertoireSplitBlock {
  return {
    label: `Maintenance: ${song.title}`,
    plannedSeconds,
    why: 'Oldest active song still in motion — keep it warm',
    songId: song.id,
    isTbdSpotlight: false,
    kind: 'maintenance',
  };
}

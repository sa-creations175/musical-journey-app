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
import {
  db,
  type PracticeSessionContext,
  type Song,
} from '../../lib/db';
import { isSongPostComfortable } from '../repertoire/songComfortable';
import { loadActiveSpotlight, type QueueSlot } from '../repertoire/songOfMonth';
import { getSongReadiness, type SongReadiness } from '../repertoire/songReadiness';
import { canonicaliseKey } from '../repertoire/circleOfFourths';
import {
  decidePostComfortableBlock,
  type PostComfortableBlockDecision,
} from '../repertoire/songProgression';
import { itemRefForScale } from '../shapes-and-patterns/scaleSkills';

const MIN_SPOTLIGHT_SECONDS = 15 * 60;
/** Spotlight share of a two-slot repertoire allocation. 3:1 matches
 *  the design intent: ~45 min spotlight + ~15 min maintenance on a
 *  60-min repertoire block. Was 2/3 (40/20 on 60 min) prior to the
 *  May 2026 rebalance. */
const SPOTLIGHT_RATIO = 3 / 4;
/** Floor for the maintenance half AFTER the split. When the
 *  computed maintenance share falls below this, the slot is
 *  dropped and spotlight absorbs the whole allocation — a
 *  sub-5-min maintenance turn isn't worth the context switch. */
const MIN_MAINTENANCE_SECONDS = 5 * 60;
/** Chord-quiz warm-up duration that prepends Repertoire practice in
 *  keys/mixed sessions (or stands alone in laptop/phone sessions). */
export const CHORD_QUIZ_SECONDS = 3 * 60;

export interface RepertoireSplitContext {
  /** Slot 1 from the active monthly umbrella. Null when no
   *  Repertoire monthly umbrella exists. */
  spotlight: QueueSlot | null;
  /** Resolved Song record for the spotlight when it points at a
   *  specific song. Null for TBD spotlight or when the referenced
   *  song record has gone missing. */
  spotlightSong: Song | null;
  /** Practice readiness for the spotlight song. Null when there's
   *  no specific song (TBD spotlight or missing record). */
  spotlightReadiness: SongReadiness | null;
  /** Post-comfortable progression decision for the spotlight song,
   *  populated only when the song is past comfortable in its
   *  original key. Null otherwise — the readiness path handles
   *  pre-comfortable songs. */
  spotlightPostComfortable: PostComfortableBlockDecision | null;
  /** Lowest-learningOrder active song eligible for the maintenance
   *  slot, excluding the spotlight song. On keys/mixed context,
   *  needs-setup songs are deferred to fallback so a ready
   *  alternative wins the slot when one exists. Post-comfortable
   *  songs are now eligible — they show up as whole-song-run blocks
   *  (deepen / null path), cell-drill on the next key (expand-keys
   *  path), or are skipped (maintenance path before the weekly
   *  floor). */
  maintenanceSong: Song | null;
  /** Practice readiness for the maintenance song. Null when no
   *  maintenance candidate was found. */
  maintenanceReadiness: SongReadiness | null;
  /** Post-comfortable progression decision for the maintenance
   *  song, populated only when the song is past comfortable in its
   *  original key. Null otherwise. */
  maintenancePostComfortable: PostComfortableBlockDecision | null;
  /** Context the split was loaded for. Drives both the
   *  maintenance-song preference (deprioritize needs-setup on keys)
   *  and the chord-quiz block placement (prepend on keys/mixed,
   *  standalone on laptop/phone). */
  context: PracticeSessionContext;
}

/**
 * Load the spotlight + a maintenance-song candidate. Pure read;
 * caller (sessionGenerator) invokes this once per proposal
 * generation and threads the result through.
 *
 * The maintenance picker walks active songs by learningOrder ASC,
 * skipping the spotlight + songs already comfortable in the
 * original key. On keys/mixed context it defers needs-setup songs
 * to a fallback pass so a ready alternative surfaces first — setup
 * work is light cognitive activity and shouldn't compete with
 * playable songs for keyboard time. On laptop/phone, no preference
 * is applied — setup work fits naturally on those surfaces.
 */
export async function loadRepertoireSplitContext(
  context: PracticeSessionContext = 'mixed',
  now: number = Date.now(),
): Promise<RepertoireSplitContext> {
  const state = await loadActiveSpotlight(now);
  const spotlight = state?.spotlight ?? null;

  const spotlightSongId =
    spotlight && spotlight.kind === 'song' ? spotlight.refId : null;

  // Bulk-load matrix data once for every song. Lets the
  // post-comfortable decision run per-song without a Dexie round-
  // trip per candidate (the inner loop walks every song in the
  // worst case).
  const [allSongs, allKeys, allCells, allSections, allMatrixSections] =
    await Promise.all([
      db.songs.toArray(),
      db.songKeys.toArray(),
      db.songCells.toArray(),
      db.songSections.toArray(),
      db.songMatrixSections.toArray(),
    ]);
  const sorted = [...allSongs].sort(
    (a, b) =>
      (a.learningOrder ?? Number.MAX_SAFE_INTEGER) -
      (b.learningOrder ?? Number.MAX_SAFE_INTEGER),
  );

  const isKeysContext = context === 'keys' || context === 'mixed';

  // Per-song helpers reading from the bulk-loaded arrays. Avoids
  // re-filtering in every branch below.
  const keysFor = (songId: string) => allKeys.filter(k => k.songId === songId);
  const cellsFor = (songId: string) => allCells.filter(c => c.songId === songId);
  const sectionsFor = (songId: string) =>
    allSections.filter(s => s.songId === songId);
  const matrixSectionsFor = (songId: string) =>
    allMatrixSections.filter(s => s.songId === songId);
  const originalKeyEngagedAt = (songId: string): number | null => {
    const ok = allKeys.find(k => k.songId === songId && k.isOriginalKey);
    return ok?.lastEngagedAt ?? null;
  };

  // Decide a single song's contribution to the maintenance slot.
  // Returns null when the song should be skipped entirely (e.g.
  // maintenance path before the weekly floor). The caller picks the
  // first eligible song in learningOrder ASC.
  const candidateInfo = (s: Song): {
    readiness: SongReadiness;
    postComfortable: PostComfortableBlockDecision | null;
  } | null => {
    const sKeys = keysFor(s.id);
    const sCells = cellsFor(s.id);
    const readiness = getSongReadiness(s, sKeys, sectionsFor(s.id));
    if (isSongPostComfortable(s, sKeys, sCells, matrixSectionsFor(s.id))) {
      const decision = decidePostComfortableBlock({
        song: s,
        songKeys: sKeys,
        songCells: sCells,
        lastEngagedAt: originalKeyEngagedAt(s.id),
        now,
      });
      if (decision.kind === 'skip') return null;
      return { readiness, postComfortable: decision };
    }
    return { readiness, postComfortable: null };
  };

  // Primary + fallback candidates. On keys/mixed, needs-setup songs
  // fall into the fallback list. On laptop/phone, every candidate
  // lands in primary (no deferral).
  let primary: Song | null = null;
  let primaryReadiness: SongReadiness | null = null;
  let primaryPostComfortable: PostComfortableBlockDecision | null = null;
  let fallback: Song | null = null;
  let fallbackReadiness: SongReadiness | null = null;
  let fallbackPostComfortable: PostComfortableBlockDecision | null = null;

  for (const s of sorted) {
    if (spotlightSongId && s.id === spotlightSongId) continue;
    const info = candidateInfo(s);
    if (!info) continue;
    if (isKeysContext && info.readiness === 'needs-setup' && !info.postComfortable) {
      if (!fallback) {
        fallback = s;
        fallbackReadiness = info.readiness;
        fallbackPostComfortable = info.postComfortable;
      }
      continue;
    }
    primary = s;
    primaryReadiness = info.readiness;
    primaryPostComfortable = info.postComfortable;
    break;
  }

  const maintenanceSong = primary ?? fallback;
  const maintenanceReadiness =
    primary ? primaryReadiness : fallback ? fallbackReadiness : null;
  const maintenancePostComfortable =
    primary ? primaryPostComfortable : fallback ? fallbackPostComfortable : null;

  let spotlightSong: Song | null = null;
  let spotlightReadiness: SongReadiness | null = null;
  let spotlightPostComfortable: PostComfortableBlockDecision | null = null;
  if (spotlightSongId) {
    spotlightSong = sorted.find(s => s.id === spotlightSongId) ?? null;
    if (spotlightSong) {
      const sKeys = keysFor(spotlightSong.id);
      const sCells = cellsFor(spotlightSong.id);
      spotlightReadiness = getSongReadiness(
        spotlightSong,
        sKeys,
        sectionsFor(spotlightSong.id),
      );
      if (
        isSongPostComfortable(
          spotlightSong,
          sKeys,
          sCells,
          matrixSectionsFor(spotlightSong.id),
        )
      ) {
        const decision = decidePostComfortableBlock({
          song: spotlightSong,
          songKeys: sKeys,
          songCells: sCells,
          lastEngagedAt: originalKeyEngagedAt(spotlightSong.id),
          now,
        });
        // Even a 'skip' decision still leaves the spotlight slot
        // populated — the spotlight is user-chosen and shouldn't
        // disappear mid-month. The split layer reads 'skip' and
        // falls back to the pre-comfortable readiness flow.
        spotlightPostComfortable = decision;
      }
    }
  }

  return {
    spotlight,
    spotlightSong,
    spotlightReadiness,
    spotlightPostComfortable,
    maintenanceSong,
    maintenanceReadiness,
    maintenancePostComfortable,
    context,
  };
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
   *  the "Add a song in Goals" inline action. */
  isTbdSpotlight: boolean;
  /** Discriminator for logging / display routing.
   *    spotlight / maintenance — matrix practice on a song
   *    setup                   — replaces practice when readiness is
   *                              needs-setup; routes to song detail
   *                              so the user can add sections + chords
   *    chord-quiz              — 3-min recall warm-up that prepends
   *                              practice on keys/mixed, or stands
   *                              alone on laptop/phone
   *    whole-song-run          — post-comfortable practice: full
   *                              song-through-the-song run. Routes
   *                              to song detail (whole-song-test
   *                              banner is visible there); deepen /
   *                              maintenance paths use this. */
  kind: 'spotlight' | 'maintenance' | 'setup' | 'chord-quiz' | 'whole-song-run' | 'scale-prep';
  /** Concrete scale itemRefs the block drills, when known. Populated
   *  by `scalePrepBlock` so the proposal-side rendering can route
   *  the user into the Scales-drilling surface with the right cells
   *  ready to drill. Other block kinds leave this undefined; the
   *  proposal layer falls back to `[songId]` for them. */
  scaleItemRefs?: readonly string[];
}

/** Duration of a scale-prep block in seconds. Two scale types per
 *  prep × ~45 s each — primes the user's hands and ears in the
 *  song's home key without eating into the practice block. Carved
 *  off the top of the song's allocation so the proposal's overall
 *  budget stays honest. */
const SCALE_PREP_SECONDS = 90;

/** Minimum song-block allocation that earns a scale-prep block.
 *  Below this floor the prep would dominate the playback window
 *  and produce a worse experience than a single longer practice
 *  block. */
const SCALE_PREP_MIN_SONG_SECONDS = 4 * 60;

/**
 * Split a Repertoire AllocatedBlock's plannedSeconds between
 * spotlight + maintenance per the spec. Each half is further shaped
 * by the song's readiness + the session context:
 *
 *   needs-setup → setup block replaces matrix practice
 *   needs-chords → matrix practice block (no chord quiz — nothing
 *                  to quiz on yet)
 *   ready on keys/mixed → chord-quiz (3 min) + matrix practice
 *   ready on laptop/phone → chord-quiz only (no piano needed)
 *
 * TBD spotlight stays as a single TBD block carrying the "Add a
 * song in Goals" affordance — readiness doesn't apply when there's
 * no song.
 *
 * Returns 0–4 blocks (rare maximum: spotlight quiz + spotlight
 * practice + maintenance quiz + maintenance practice).
 */
export function splitRepertoireAllocation(
  plannedSeconds: number,
  ctx: RepertoireSplitContext,
): RepertoireSplitBlock[] {
  const hasSpotlight = !!ctx.spotlight;
  const hasMaintenance = !!ctx.maintenanceSong;

  if (!hasSpotlight && !hasMaintenance) return [];

  // Only one source available — give it the full allocation.
  if (hasSpotlight && !hasMaintenance) {
    return buildSpotlightHalf(plannedSeconds, ctx);
  }
  if (!hasSpotlight && hasMaintenance) {
    return buildMaintenanceHalf(plannedSeconds, ctx);
  }

  // Both available — apply the time split. Spotlight gets max(15
  // min, 3/4 of total); maintenance gets whatever's left. If the
  // remainder falls below MIN_MAINTENANCE_SECONDS, maintenance is
  // dropped and spotlight absorbs the whole allocation — a sub-5-
  // min maintenance turn isn't worth the context switch (replaces
  // the older pre-split "drop everything below 15 min" check;
  // post-split gating produces the right outcomes across both
  // tiny and large allocations).
  const spotlightSeconds = Math.max(
    MIN_SPOTLIGHT_SECONDS,
    Math.round(plannedSeconds * SPOTLIGHT_RATIO),
  );
  const clampedSpotlight = Math.min(spotlightSeconds, plannedSeconds);
  const maintenanceSeconds = plannedSeconds - clampedSpotlight;
  if (maintenanceSeconds < MIN_MAINTENANCE_SECONDS) {
    return buildSpotlightHalf(plannedSeconds, ctx);
  }
  return [
    ...buildSpotlightHalf(clampedSpotlight, ctx),
    ...buildMaintenanceHalf(maintenanceSeconds, ctx),
  ];
}

function buildSpotlightHalf(
  seconds: number,
  ctx: RepertoireSplitContext,
): RepertoireSplitBlock[] {
  const spotlight = ctx.spotlight!;
  // TBD spotlight: single TBD block, no readiness consideration.
  if (spotlight.kind === 'tbd' || !spotlight.refId) {
    return [tbdSpotlightBlock(seconds)];
  }
  const title = ctx.spotlightSong?.title ?? spotlight.displayTitle;
  // Post-comfortable songs short-circuit the readiness/chord-quiz
  // flow with a whole-song-run (deepen / maintenance / finished
  // expand-keys walk) or a cell-drill on a new key (expand-keys mid-
  // walk). 'skip' falls back to the pre-comfortable readiness flow
  // — the spotlight slot stays populated regardless.
  const postBlocks = buildPostComfortableBlocks(
    seconds,
    spotlight.refId,
    title,
    ctx.spotlightSong?.key,
    ctx.context,
    ctx.spotlightPostComfortable,
  );
  if (postBlocks) return postBlocks;
  return buildSongHalf({
    seconds,
    songId: spotlight.refId,
    title,
    songKey: ctx.spotlightSong?.key,
    readiness: ctx.spotlightReadiness,
    context: ctx.context,
    practiceKind: 'spotlight',
    practiceLabel: `Song of the month: ${title}`,
    practiceWhy: 'This month\'s spotlight song',
    setupWhyExtra: 'Today\'s spotlight song still needs setup',
  });
}

function buildMaintenanceHalf(
  seconds: number,
  ctx: RepertoireSplitContext,
): RepertoireSplitBlock[] {
  const song = ctx.maintenanceSong!;
  const postBlocks = buildPostComfortableBlocks(
    seconds,
    song.id,
    song.title,
    song.key,
    ctx.context,
    ctx.maintenancePostComfortable,
  );
  if (postBlocks) return postBlocks;
  return buildSongHalf({
    seconds,
    songId: song.id,
    title: song.title,
    songKey: song.key,
    readiness: ctx.maintenanceReadiness,
    context: ctx.context,
    practiceKind: 'maintenance',
    practiceLabel: `Maintenance: ${song.title}`,
    practiceWhy: 'Oldest active song still in motion — keep it warm',
    setupWhyExtra: 'Lowest-order song in your repertoire still needs setup',
  });
}

/**
 * Build the block list for a post-comfortable slot. Returns null
 * when the slot is pre-comfortable (caller falls back to the
 * readiness flow) or when the decision is 'skip' (caller falls
 * back; today only the maintenance-path within-floor case hits
 * 'skip' AND only on the maintenance slot, where the picker has
 * already skipped the song — so a 'skip' decision on the spotlight
 * still defers to readiness rendering).
 */
function buildPostComfortableBlocks(
  seconds: number,
  songId: string,
  title: string,
  songKey: string | null | undefined,
  context: PracticeSessionContext,
  decision: PostComfortableBlockDecision | null,
): RepertoireSplitBlock[] | null {
  if (!decision) return null;
  if (decision.kind === 'skip') return null;
  // Post-comfortable blocks play in a specific key — for whole-song-run
  // we know the key from the decision; for cell-drill-expansion the
  // user is moving to a new key. Prep keys off the song's home key
  // for both: it's the anchor the user owns. Keys/mixed contexts
  // with enough time earn the prep; laptop/phone + tight allocations
  // skip.
  const isKeysContext = context === 'keys' || context === 'mixed';
  const wantsPrep = isKeysContext
    && seconds >= SCALE_PREP_MIN_SONG_SECONDS + SCALE_PREP_SECONDS;
  if (decision.kind === 'whole-song-run') {
    if (wantsPrep) {
      const prep = scalePrepBlock(songId, title, songKey);
      if (prep) {
        return [prep, wholeSongRunBlock(seconds - SCALE_PREP_SECONDS, songId, title, decision.keyName)];
      }
    }
    return [wholeSongRunBlock(seconds, songId, title, decision.keyName)];
  }
  // cell-drill-expansion → use the practice-block kind but label
  // the slot as new-key expansion.
  if (wantsPrep) {
    const prep = scalePrepBlock(songId, title, songKey);
    if (prep) {
      return [
        prep,
        practiceBlock(
          seconds - SCALE_PREP_SECONDS,
          songId,
          `Expand to ${decision.keyName}: ${title}`,
          `Cell-drill the next key in your circle-of-4ths walk`,
          'maintenance',
        ),
      ];
    }
  }
  return [
    practiceBlock(
      seconds,
      songId,
      `Expand to ${decision.keyName}: ${title}`,
      `Cell-drill the next key in your circle-of-4ths walk`,
      'maintenance',
    ),
  ];
}

interface SongHalfArgs {
  seconds: number;
  songId: string;
  title: string;
  /** Song's home key as stored on the Song row (raw, pre-
   *  canonicalisation). Optional — when null/undefined the
   *  scale-prep block is skipped. */
  songKey: string | null | undefined;
  readiness: import('../repertoire/songReadiness').SongReadiness | null;
  context: PracticeSessionContext;
  practiceKind: 'spotlight' | 'maintenance';
  practiceLabel: string;
  practiceWhy: string;
  setupWhyExtra: string;
}

/**
 * Per-half block list: routes readiness + context to the correct
 * (setup | chord-quiz | practice) combination. Shared between the
 * spotlight + maintenance halves so the rules stay in one place.
 */
function buildSongHalf(args: SongHalfArgs): RepertoireSplitBlock[] {
  const { seconds, songId, title, readiness, context, practiceKind } = args;

  // Readiness null (defensive — caller couldn't resolve) → behave like
  // needs-chords: single practice block, no chord quiz.
  if (readiness === 'needs-setup') {
    return [setupBlock(seconds, songId, title, args.setupWhyExtra)];
  }

  const isKeysContext = context === 'keys' || context === 'mixed';

  // Carve a scale-prep block out of the top of the song allocation
  // when it's a keys/mixed session AND the song's playback block
  // would land afterward. The prep is keyed off the song's home
  // key — primes the user's hands + ears before they touch the
  // matrix. Skipped on laptop/phone (no piano), when readiness is
  // 'ready' but only chord-quiz follows (no playback block), and
  // when the allocation is too tight for a meaningful prep + play.
  const wantsPrepBlock = isKeysContext
    && readiness !== 'ready'  // chord-quiz handles ready below
    && seconds >= SCALE_PREP_MIN_SONG_SECONDS;

  if (readiness === 'ready') {
    if (!isKeysContext) {
      // Laptop/phone: chord-quiz takes the full half — no piano needed.
      return [chordQuizBlock(seconds, songId, title)];
    }
    // Keys/mixed: chord-quiz (3 min) + scale-prep (90 s) + practice
    // (rest). Only inject the prep when the post-quiz remainder still
    // has room for prep + a meaningful practice block; otherwise fall
    // back to the prep-less chord-quiz + practice path so the user
    // gets at least one block on the matrix.
    if (seconds > CHORD_QUIZ_SECONDS) {
      const afterQuiz = seconds - CHORD_QUIZ_SECONDS;
      if (afterQuiz >= SCALE_PREP_MIN_SONG_SECONDS + SCALE_PREP_SECONDS) {
        const prep = scalePrepBlock(songId, title, args.songKey);
        if (prep) {
          const practiceSeconds = afterQuiz - SCALE_PREP_SECONDS;
          return [
            chordQuizBlock(CHORD_QUIZ_SECONDS, songId, title),
            prep,
            practiceBlock(practiceSeconds, songId, args.practiceLabel, args.practiceWhy, practiceKind),
          ];
        }
      }
      return [
        chordQuizBlock(CHORD_QUIZ_SECONDS, songId, title),
        practiceBlock(afterQuiz, songId, args.practiceLabel, args.practiceWhy, practiceKind),
      ];
    }
  }

  // needs-chords (or ready on a too-small half) → single practice
  // block, optionally prefaced by a scale-prep block when the
  // allocation has room.
  if (wantsPrepBlock) {
    const prep = scalePrepBlock(songId, title, args.songKey);
    if (prep) {
      return [
        prep,
        practiceBlock(seconds - SCALE_PREP_SECONDS, songId, args.practiceLabel, args.practiceWhy, practiceKind),
      ];
    }
  }
  return [practiceBlock(seconds, songId, args.practiceLabel, args.practiceWhy, practiceKind)];
}

function tbdSpotlightBlock(plannedSeconds: number): RepertoireSplitBlock {
  return {
    label: 'Song of the month: TBD',
    plannedSeconds,
    why: 'Pick a song-of-the-month to give the session its anchor',
    songId: null,
    isTbdSpotlight: true,
    kind: 'spotlight',
  };
}

function practiceBlock(
  plannedSeconds: number,
  songId: string,
  label: string,
  why: string,
  kind: 'spotlight' | 'maintenance',
): RepertoireSplitBlock {
  return {
    label,
    plannedSeconds,
    why,
    songId,
    isTbdSpotlight: false,
    kind,
  };
}

function setupBlock(
  plannedSeconds: number,
  songId: string,
  title: string,
  whyExtra: string,
): RepertoireSplitBlock {
  return {
    label: `Set up ${title} — add sections and chords to unlock practice`,
    plannedSeconds,
    why: `Enter sections and chords to unlock matrix practice — ${whyExtra}`,
    songId,
    isTbdSpotlight: false,
    kind: 'setup',
  };
}

function chordQuizBlock(
  plannedSeconds: number,
  songId: string,
  title: string,
): RepertoireSplitBlock {
  return {
    label: `Practice memorizing the chord progression — ${title}`,
    plannedSeconds,
    why: 'Quick recall before you play — know what\'s coming before your fingers do',
    songId,
    isTbdSpotlight: false,
    kind: 'chord-quiz',
  };
}

/** Two-scale prep that primes the user's hands and ears in the
 *  song's home key. Returns null when the song key can't be
 *  canonicalised — there's nothing honest to prep in if we don't
 *  know what key to surface.
 *
 *  Scale selection follows the song's key quality:
 *    Major key  → major scale + major pentatonic (sp 1)
 *    Minor key  → natural minor + minor pentatonic (sp 1)
 *
 *  The Song schema doesn't carry an explicit quality field today —
 *  Song.key is stored as a bare pitch class. We sniff a trailing
 *  " minor" / "m" suffix as a defensive fallback so any future
 *  schema extension flows through automatically; the default path
 *  treats all songs as major keys (matching today's data shape). */
function scalePrepBlock(
  songId: string,
  title: string,
  rawKey: string | null | undefined,
): RepertoireSplitBlock | null {
  if (!rawKey) return null;
  const parsed = parseSongKeyForPrep(rawKey);
  if (!parsed) return null;
  const { canonicalKey, isMinor } = parsed;
  const scaleTypes = isMinor ? 'natural minor + minor pent' : 'major + major pent';
  // Emit the concrete sub-cell itemRefs the user will drill — the
  // session UI routes scale-prep blocks to the Scales heat-grid
  // surface, and these itemRefs are what surface there. Major songs
  // drill the major scale + major pentatonic from sp1; minor songs
  // drill the natural minor + minor pentatonic from sp1. sp1 mirrors
  // the warm-up's pent default and is the most generally-useful
  // starting point for a 90 s prep window.
  const scaleItemRefs: string[] = isMinor
    ? [
        itemRefForScale({ kind: 'natural-minor',    keyName: canonicalKey }),
        itemRefForScale({ kind: 'minor-pentatonic', keyName: canonicalKey, startingPoint: '1' }),
      ]
    : [
        itemRefForScale({ kind: 'major',            keyName: canonicalKey }),
        itemRefForScale({ kind: 'major-pentatonic', keyName: canonicalKey, startingPoint: '1' }),
      ];
  return {
    label: `SCALES — prep for ${title} · ${canonicalKey} (${scaleTypes})`,
    plannedSeconds: SCALE_PREP_SECONDS,
    why: `Prime your hands and ears before playing in ${canonicalKey}`,
    songId,
    isTbdSpotlight: false,
    kind: 'scale-prep',
    scaleItemRefs,
  };
}

function parseSongKeyForPrep(
  rawKey: string,
): { canonicalKey: string; isMinor: boolean } | null {
  const trimmed = rawKey.trim();
  // Strip the most common minor-key suffixes. The Song schema's
  // example values are bare pitch classes ('C', 'Db', 'G'), so
  // this is defensive — surfaces correctly if a future record
  // ever lands with 'Am' / 'A minor' encoding.
  let isMinor = false;
  let pitchPart = trimmed;
  const minorMatch = /^(.+?)\s*(?:m|min|minor)\s*$/i.exec(trimmed);
  if (minorMatch && !/maj/i.test(trimmed)) {
    pitchPart = minorMatch[1].trim();
    isMinor = true;
  }
  const canonical = canonicaliseKey(pitchPart);
  if (!canonical) return null;
  return { canonicalKey: canonical, isMinor };
}

function wholeSongRunBlock(
  plannedSeconds: number,
  songId: string,
  title: string,
  keyName: string,
): RepertoireSplitBlock {
  const inKey = keyName ? ` — ${keyName}` : '';
  return {
    label: `Run through ${title}`,
    plannedSeconds,
    why: `Whole-song practice${inKey}`,
    songId,
    isTbdSpotlight: false,
    kind: 'whole-song-run',
  };
}

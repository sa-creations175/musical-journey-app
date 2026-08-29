/**
 * The three surfaces, built.
 *
 * Each one is the same shape — a label, a rate, and a writer — and the
 * writer is the only place the three genuinely differ. Chord shapes
 * hang a rep off a `DrillSkill` and a `DrillType`; scales and
 * voice-leading stand their itemRef in for both ids and record their
 * own engagement, because `logSession`'s itemRef derivation would drop
 * a pentatonic's starting point and a voice-leading sub-cell's
 * dimensions.
 */

import type { DrillHand, DrillSkill, DrillType } from '../../../lib/db';
import { getSpacingState, recordEngagement } from '../../../lib/spacingState';
import { NOT_STARTED, type BandVerdict } from '../../../lib/spacing/banding';
import { bandVerdictForRow } from '../../../lib/spacing/row';
import type { Feel } from '../../../lib/fluencyScale';
import {
  feelToRating,
  itemRefForSkill,
  logScaleDrillSession,
  logSession,
  logVoiceLeadingDrillSession,
} from '../drillModel';
import { recordSongKeyRun } from '../../repertoire/matrix/proveKey';
import { writeSongRun } from '../../repertoire/songRunWriter';
import { logPracticeSession } from '../../repertoire/logPractice';
import type { PracticeActivity } from '../../../lib/practiceActivities';
import {
  REPERTOIRE_MODULE_REF, songCellItemRef,
} from '../../repertoire/chartingEngagement';
import {
  CHORD_RATE_OPTIONS,
  SONG_RATE_OPTIONS,
  RATE_SHAPE,
  SCALE_RATE_OPTIONS,
  TARGET_RATES,
  VOICE_LEADING_RATE_OPTIONS,
  type DrillRecord,
  type DrillSurface,
} from './surfaces';

const MODULE_REF = 'shapes-and-patterns';

/**
 * The spacing engagement scales and voice-leading record for
 * themselves.
 *
 * `logSession` does this for chord shapes and derives the itemRef from
 * the skill row. Neither of these has a skill row, and their itemRefs
 * carry things a derivation would lose, so they pass the ref they were
 * given straight through.
 */
async function engage(
  itemRef: string, hand: DrillHand, record: DrillRecord,
): Promise<void> {
  if (record.feel === null) return;   // no verdict, no claim
  await rate(itemRef, hand, record.feel, record.fromTest, record.sessionId);
}

/** What an item reads now. One reader, so the done step cannot
 *  disagree with the grid it will be seen next to. */
async function verdictFor(
  itemRef: string | null, moduleRef: string, hand: DrillHand,
): Promise<BandVerdict> {
  if (itemRef === null) return NOT_STARTED;
  const row = await getSpacingState(itemRef, moduleRef, hand);
  return row ? bandVerdictForRow(row) : NOT_STARTED;
}

/** One rated rep against a shapes item. Shared by the per-drill writer
 *  and the session rating, so the two cannot band differently. */
async function rate(
  itemRef: string, hand: DrillHand, feel: Feel, fromTest: boolean,
  sessionId: string,
): Promise<void> {
  await recordEngagement({
    itemRef,
    moduleRef: MODULE_REF,
    hand,
    signal: {
      kind: 'rating', rating: feelToRating(feel), feel, fromTest, sessionId,
    },
  });
}

export function chordShapeSurface(args: {
  cellLabel: string;
  skillLabel: string;
  skill: DrillSkill;
  drillType: DrillType;
  hand: DrillHand;
}): DrillSurface {
  return {
    id: 'chord-shapes',
    cellLabel: args.cellLabel,
    skillLabel: args.skillLabel,
    countsUp: false,
    // Begins and ends with the panel — nothing to persist.
    readSessionElapsedMs: null,
    // The session IS the panel here, so the panel mints the id. See
    // `readSessionId` on the interface.
    readSessionId: null,
    // A drill has no between-time, no document, and covers one item.
    sessionMetronome: false,
    scopeOptions: null,
    openedOnScopeId: null,
    openItem: null,
    wrapSections: null,
    wrapAsksActivities: false,
    // Drills log a DrillSession per run; there is no sitting-level row.
    writeSessionLog: null,
    hasStyle: true,
    rateLabel: 'changes a minute',
    targetRate: TARGET_RATES['chord-shapes'],
    rateOptions: CHORD_RATE_OPTIONS,
    rateFrom: RATE_SHAPE.beatsPerRep,
    write: async (record) => {
      await logSession({
        skill: args.skill,
        drillType: args.drillType,
        hand: args.hand,
        ...(record.style !== null ? { style: record.style } : {}),
        durationSeconds: record.ranSeconds,
        targetSeconds: record.targetSeconds,
        ...(record.feel !== null
          ? { feelRating: record.feel, fromTest: record.fromTest }
          : {}),
      });
    },
    // NO DRILL ROW. The drills already logged their own time and rep
    // count; this is the verdict on the sitting, so it records the
    // engagement and stops.
    writeSessionRating: async (feel, fromTest, sessionId) => {
      const itemRef = itemRefForSkill(args.skill);
      if (itemRef === null) return;
      await rate(itemRef, args.hand, feel, fromTest, sessionId);
    },
    readVerdict: () => verdictFor(itemRefForSkill(args.skill), MODULE_REF, args.hand),
  };
}

export function scaleSurface(args: {
  cellLabel: string;
  skillLabel: string;
  itemRef: string;
  hand: DrillHand;
}): DrillSurface {
  return {
    id: 'scales',
    cellLabel: args.cellLabel,
    skillLabel: args.skillLabel,
    countsUp: false,
    // Begins and ends with the panel — nothing to persist.
    readSessionElapsedMs: null,
    // The session IS the panel here, so the panel mints the id. See
    // `readSessionId` on the interface.
    readSessionId: null,
    // A drill has no between-time, no document, and covers one item.
    sessionMetronome: false,
    scopeOptions: null,
    openedOnScopeId: null,
    openItem: null,
    wrapSections: null,
    wrapAsksActivities: false,
    // Drills log a DrillSession per run; there is no sitting-level row.
    writeSessionLog: null,
    // A scale is a single line — nothing to block, nothing to break.
    hasStyle: false,
    rateLabel: 'notes a minute',
    targetRate: TARGET_RATES.scales,
    rateOptions: SCALE_RATE_OPTIONS,
    // Notes PER BEAT, so a bigger option is faster. See `rateFrom`.
    rateFrom: RATE_SHAPE.repsPerBeat,
    write: async (record) => {
      await logScaleDrillSession({
        itemRef: args.itemRef,
        hand: args.hand,
        durationSeconds: record.ranSeconds,
        targetSeconds: record.targetSeconds,
        ...(record.feel !== null ? { feelRating: record.feel } : {}),
      });
      await engage(args.itemRef, args.hand, record);
    },
    writeSessionRating: async (feel, fromTest, sessionId) => {
      await rate(args.itemRef, args.hand, feel, fromTest, sessionId);
    },
    readVerdict: () => verdictFor(args.itemRef, MODULE_REF, args.hand),
  };
}

export function voiceLeadingSurface(args: {
  cellLabel: string;
  skillLabel: string;
  itemRef: string;
}): DrillSurface {
  return {
    id: 'voice-leading',
    cellLabel: args.cellLabel,
    skillLabel: args.skillLabel,
    countsUp: false,
    // Begins and ends with the panel — nothing to persist.
    readSessionElapsedMs: null,
    // The session IS the panel here, so the panel mints the id. See
    // `readSessionId` on the interface.
    readSessionId: null,
    // A drill has no between-time, no document, and covers one item.
    sessionMetronome: false,
    scopeOptions: null,
    openedOnScopeId: null,
    openItem: null,
    wrapSections: null,
    wrapAsksActivities: false,
    // Drills log a DrillSession per run; there is no sitting-level row.
    writeSessionLog: null,
    hasStyle: false,
    rateLabel: 'chord changes a minute',
    targetRate: TARGET_RATES['voice-leading'],
    rateOptions: VOICE_LEADING_RATE_OPTIONS,
    rateFrom: RATE_SHAPE.beatsPerRep,
    write: async (record) => {
      await logVoiceLeadingDrillSession({
        itemRef: args.itemRef,
        // Two-handed by definition — there is no hand to split.
        hand: 'both',
        durationSeconds: record.ranSeconds,
        targetSeconds: record.targetSeconds,
        ...(record.feel !== null ? { feelRating: record.feel } : {}),
      });
      await engage(args.itemRef, 'both', record);
    },
    writeSessionRating: async (feel, fromTest, sessionId) => {
      await rate(args.itemRef, 'both', feel, fromTest, sessionId);
    },
    readVerdict: () => verdictFor(args.itemRef, MODULE_REF, 'both'),
  };
}

/**
 * Songs.
 *
 * =====================================================================
 * TWO LEVELS, WRITTEN AT ONCE, AND THEY ARE NOT THE SAME THING.
 *
 *   the BAND   — one `songCell:<cellId>` row per section this run
 *                covered. How well that section goes in this key.
 *   the CLOCK  — one `songKey:<songKeyId>` row. When the song in this
 *                key should come round again.
 *
 * A section does not get its own schedule. Twelve sections scheduled
 * independently would have the app ask for a verse on Tuesday and the
 * chorus of the same song on Thursday, which is not how anyone
 * practises a song. See `recordSongKeyRun`.
 *
 * =====================================================================
 * THE WHOLE SONG FANS OUT, and that is the reason `scope` exists on
 * the record at all. A run of the whole song is evidence about every
 * section in it — the same rating, written once per section, because
 * that is what the run actually demonstrated. A run scoped to one
 * section writes one band.
 *
 * NO SCOPE MEANS THE CELL YOU OPENED. Not "everything": a rep that
 * cannot say what it covered must claim the least, not the most.
 *
 * =====================================================================
 * AN UNRATED RUN WRITES NO BAND AND NO CLOCK. Rating a practice run is
 * optional, and an unrated run does not count toward the three — so
 * there is no verdict to record and nothing to schedule from. The run
 * still happened; recording THAT is the practice log's job, not this
 * writer's.
 * =====================================================================
 */
export function songSurface(args: {
  cellLabel: string;
  skillLabel: string;
  /** The cell the panel was opened on — what an unscoped run covers. */
  cellId: string;
  songKeyId: string;
  /** sectionId → cellId, for this key. What `scope` resolves through. */
  cellIdBySectionId: ReadonlyMap<string, string>;
  songId: string;
  /** The key's name, for the practice log's `keys`. */
  keyName: string;
  /** The song's sections, in order, for the scope chips and the wrap. */
  sections: ReadonlyArray<{ id: string; label: string }>;
  /** Collapse the panel to a bar and show the chart. */
  onOpenLeadSheet: () => void;
  /** Live elapsed from the song timer record. The host owns the hook;
   *  the surface only forwards it, so there is one reader of the
   *  record rather than two. */
  readSessionElapsedMs: () => number;
  /** The stored session's id, from the same record as the elapsed.
   *  Null when no timer is running yet — the panel falls back to its
   *  own, so a rep is never written without one. */
  readSessionId: () => string | null;
  /** The song's own tempo. NOT a figure from the settings tree: a song
   *  is played at the tempo it is written at, and the tree has no
   *  opinion about that. Null means the song has none set, so every
   *  run counts — the same rule the cell panel already applies. */
  songTempo: number | null;
  /** How many sections the key has, so the rollup can tell "not all
   *  comfortable" from "not all present". */
  expectedSectionCount: number;
  /** The tempo the run was actually played at, read at the moment the
   *  run is written. Null when nothing was sounding — a legitimate
   *  stored value, and not the same as the song's target. */
  readRunTempo: () => number | null;
}): DrillSurface {
  return {
    id: 'song',
    cellLabel: args.cellLabel,
    skillLabel: args.skillLabel,
    // A section takes as long as it takes.
    countsUp: true,
    // THE STORED RECORD, not this mount. See `readSessionElapsedMs`.
    readSessionElapsedMs: args.readSessionElapsedMs,
    // AND ITS ID, from the same record. A song session survives a
    // pause, a reload and a walk away from the desk; an id minted at
    // this mount would name a session that had already been running.
    readSessionId: args.readSessionId,
    // Reading the chart and working a passage happen between runs.
    sessionMetronome: true,
    scopeOptions: args.sections,
    // Which section this cell is. Derived rather than passed, so it
    // cannot disagree with `cellIdBySectionId`.
    openedOnScopeId: [...args.cellIdBySectionId.entries()]
      .find(([, cellId]) => cellId === args.cellId)?.[0] ?? null,
    openItem: args.onOpenLeadSheet,
    wrapSections: args.sections,
    wrapAsksActivities: true,
    writeSessionLog: async (entry) => {
      await logPracticeSession({
        songId: args.songId,
        durationMin: Math.max(1, Math.round(entry.durationSeconds / 60)),
        sectionIds: [...entry.sectionIds],
        keys: [args.keyName],
        notes: entry.note,
        activities: entry.activities as PracticeActivity[],
        // NO feelRating. See `writeSessionLog` on the interface: the
        // rating is already recorded where it bands, and the log is
        // what happened rather than how it went.
      });
    },
    // Nothing to block or break — you play the section.
    hasStyle: false,
    rateLabel: 'BPM',
    targetRate: args.songTempo ?? 0,
    rateOptions: SONG_RATE_OPTIONS,
    // The rate IS the tempo. No arithmetic: a song is not some number
    // of anything per beat, it is played at a speed.
    rateFrom: (bpm) => bpm,
    write: async (record) => {
      if (record.feel === null) return;

      const cellIds = record.scope === null
        ? [args.cellId]
        : record.scope
          .map(sectionId => args.cellIdBySectionId.get(sectionId))
          .filter((id): id is string => id !== undefined);

      for (const cellId of cellIds) {
        await recordEngagement({
          itemRef: songCellItemRef(cellId),
          moduleRef: REPERTOIRE_MODULE_REF,
          signal: {
            kind: 'rating',
            rating: feelToRating(record.feel),
            feel: record.feel,
            fromTest: record.fromTest,
            sessionId: record.sessionId,
          },
        });
      }

      await recordSongKeyRun({
        songKeyId: args.songKeyId,
        feel: record.feel,
        fromTest: record.fromTest,
        sessionId: record.sessionId,
      });

      // AFTER the reps, never before. `writeSongRun` recomputes
      // `keyState` from the cells' BANDS, and a band read before the
      // rating above was recorded would roll the key up from the run
      // before this one. The ordering is the contract; see the note on
      // `writeSongRun`.
      //
      // THE RUN LOG, THE CELL AND THE KEY — the three things
      // `CellPanel` does that this surface did not. `keyState` is the
      // one that matters most and announces itself least: nothing else
      // recomputes it, so without this every key row would freeze at
      // whatever it said the day the shell took over.
      await writeSongRun({
        cellIds,
        songKeyId: args.songKeyId,
        attempt: {
          id: `run-${Math.random().toString(36).slice(2, 8)}`,
          bpm: args.readRunTempo(),
          feel: record.feel,
        },
        performanceTempo: args.songTempo,
        expectedSectionCount: args.expectedSectionCount,
      });
    },
    // The sitting's own verdict lands on the cell it was opened on and
    // on the song-and-key clock — the same two levels a run writes,
    // minus the fan-out, because a session rating is about the sitting
    // rather than about a particular pass through the song.
    writeSessionRating: async (feel, fromTest, sessionId) => {
      await recordEngagement({
        itemRef: songCellItemRef(args.cellId),
        moduleRef: REPERTOIRE_MODULE_REF,
        signal: {
          kind: 'rating', rating: feelToRating(feel), feel, fromTest, sessionId,
        },
      });
      await recordSongKeyRun({
        songKeyId: args.songKeyId, feel, fromTest, sessionId,
      });
    },
    // THE CELL, not the clock. "Now Reads" is about how well this
    // section goes in this key; the song-and-key row is a schedule and
    // has no band to show.
    readVerdict: () => verdictFor(
      songCellItemRef(args.cellId), REPERTOIRE_MODULE_REF, 'both',
    ),
  };
}

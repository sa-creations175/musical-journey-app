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

import { testFloorBpm } from '../../repertoire/tempoGate';
import { createElement } from 'react';
import type { DrillHand, DrillSkill, DrillType } from '../../../lib/db';
import CellPlayer from '../CellPlayer';
import CircleOfFourthsRow from './CircleOfFourthsRow';
import { chordShapeCircleRow, movementCircleRow } from './circleRowContent';
import { circleChordNames } from '../circleChordNames';
import type { ChordMovement } from '../../../lib/db';
import { CIRCLE_KEY } from '../catalog';
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
import {
  writeSongRun, writeWholeSongRun, writeWholeSongTestPass,
} from '../../repertoire/songRunWriter';
import { logPracticeSession } from '../../repertoire/logPractice';
import type { ReactNode } from 'react';
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
    // Nothing beyond the reps to record — see `recordTestPass`.
    recordTestPass: null,
    // A CELL, not a section: a shape is the item, not a part of one.
    // The two labels joined the way the panel's own header joins them,
    // so the result screen names it the way the screen behind it did.
    describeTestPass: (band, lowestFeel) => ({
      kind: 'cell',
      cellLabel: [args.cellLabel, args.skillLabel].filter(Boolean).join(' · '),
      band,
      lowestFeel,
    }),
    // A chord shape is not played in a key — it IS one.
    passKeyName: null,
    // No row to draw yet. See `renderBadgePreview`.
    renderBadgePreview: null,
    // The plain control is the whole of a drill's metronome: its
    // target rate is always set, so there is nothing to prompt for.
    renderMetronome: null,
    renderReference: null,
    // THE CIRCLE OF 4THS CELL (14 Sep 2026) is the one chord shape
    // whose drill shows something while it runs: the twelve keys, lit
    // as it goes. Decided by the skill, so a Circle item served in a
    // practice session gets the same row the grid's panel does.
    renderDuringDrill: args.skill.keyName === CIRCLE_KEY
      ? ({ per }) => createElement(CircleOfFourthsRow, {
        ...chordShapeCircleRow(args.skill.quality ?? '', args.skill.inversionState ?? null),
        smallLine: args.skillLabel,
        per,
      })
      : null,
    // The session IS the panel here, so there is no record to tell.
    onSessionPause: null,
    onSessionStart: null,
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
        // WHAT IT WAS PLAYED AT AND WHICH SITTING IT CAME FROM. Both
        // travel on the record from the panel that watched the run;
        // a silent run has no tempo and stays absent.
        ...(record.bpm !== null ? { bpm: record.bpm } : {}),
        sessionId: record.sessionId,
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
    // Nothing beyond the reps to record — see `recordTestPass`.
    recordTestPass: null,
    // A CELL, not a section: a shape is the item, not a part of one.
    // The two labels joined the way the panel's own header joins them,
    // so the result screen names it the way the screen behind it did.
    describeTestPass: (band, lowestFeel) => ({
      kind: 'cell',
      cellLabel: [args.cellLabel, args.skillLabel].filter(Boolean).join(' · '),
      band,
      lowestFeel,
    }),
    // A chord shape is not played in a key — it IS one.
    passKeyName: null,
    // No row to draw yet. See `renderBadgePreview`.
    renderBadgePreview: null,
    // The plain control is the whole of a drill's metronome: its
    // target rate is always set, so there is nothing to prompt for.
    renderMetronome: null,
    renderReference: null,
    // The session IS the panel here, so there is no record to tell.
    onSessionPause: null,
    onSessionStart: null,
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
        // THE TIME ROW LEARNS WHAT KIND OF RUN IT WAS, from the same
        // flag the rating already rides on.
        fromTest: record.fromTest,
        // AND WHAT IT WAS PLAYED AT, AND WHICH SITTING IT CAME FROM.
        // Absent tempo means the run was silent, not that nobody
        // looked.
        ...(record.bpm !== null ? { bpm: record.bpm } : {}),
        sessionId: record.sessionId,
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
  /** The row's own name, for a Circle of 4ths drill's small line. */
  rowLabel?: string;
  /** The captured movement the cell belongs to, where it is one — its
   *  lead sheet's chords go under the twelve in a Circle drill. */
  movement?: ChordMovement;
}): DrillSurface {
  // THE CIRCLE OF 4THS CELL (Silas, 13 Sep 2026): one step is the whole
  // row in a key, one chord a Rate interval, then the next key by fourths.
  const circle = args.itemRef.endsWith(`:${CIRCLE_KEY}`);
  const chordsIn = (keyName: string, spelling: Parameters<typeof circleChordNames>[2]) =>
    circleChordNames(args.itemRef, keyName, spelling, args.movement);
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
    // Nothing beyond the reps to record — see `recordTestPass`.
    recordTestPass: null,
    // A CELL, not a section: a shape is the item, not a part of one.
    // The two labels joined the way the panel's own header joins them,
    // so the result screen names it the way the screen behind it did.
    describeTestPass: (band, lowestFeel) => ({
      kind: 'cell',
      cellLabel: [args.cellLabel, args.skillLabel].filter(Boolean).join(' · '),
      band,
      lowestFeel,
    }),
    // A chord shape is not played in a key — it IS one.
    passKeyName: null,
    // No row to draw yet. See `renderBadgePreview`.
    renderBadgePreview: null,
    // The plain control is the whole of a drill's metronome: its
    // target rate is always set, so there is nothing to prompt for.
    renderMetronome: null,
    // HEAR THE CELL, BESIDE THE RATING. The same panel that sits under
    // the grid, on the cell being drilled — a reference, not a rating,
    // and it writes nothing.
    renderReference: () => createElement(CellPlayer, { itemRef: args.itemRef }),
    // THE CIRCLE OF 4THS ROW, the same one chord shapes draw: the twelve
    // keys, and under them the row's chords in the current key. A key
    // lasts one Rate interval a chord (Silas, 13 Sep 2026).
    renderDuringDrill: circle
      ? ({ per }) => createElement(CircleOfFourthsRow, {
        ...movementCircleRow(chordsIn),
        smallLine: args.rowLabel ?? args.cellLabel,
        per: per * Math.max(1, chordsIn('C', 'flat').length),
      })
      : null,
    // The session IS the panel here, so there is no record to tell.
    onSessionPause: null,
    onSessionStart: null,
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
        fromTest: record.fromTest,
        ...(record.bpm !== null ? { bpm: record.bpm } : {}),
        sessionId: record.sessionId,
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
  /**
   * WHAT THE PANEL WAS OPENED ON, which decides what a pass earns.
   *
   * A cell opens a SECTION test: three clean runs of that section move
   * its band. A key row's Test opens a WHOLE-SONG test: three clean
   * runs of the whole song move the song ladder to Comfortable.
   *
   * They are the same act at two scales and the same panel runs both.
   * What differs is the claim, so it is stated at construction rather
   * than inferred later from how many sections a run happened to
   * cover — a run that covered every section by choice is still a
   * section test's run, and would otherwise be mistaken for the
   * bigger claim.
   */
  entry: 'section' | 'whole-song';
  /** The section's own name, for the result screen's section line. */
  sectionLabel: string;
  /** The song's title, for the result screen. */
  songTitle: string;
  /** The key as this song spells it, for the result screen. Distinct
   *  from `keyName`, which is the stored name the log records. */
  spelledKeyName: string;
  /** The matrix row for this key, drawn by whoever owns the grid. */
  renderBadgePreview: () => ReactNode;
  /** The song's metronome box — the gate, the window sentence and the
   *  no-tempo prompt. Owned by the caller because setting a song's
   *  tempo is a write to the song. */
  renderMetronome: (onStoppedByUser: () => void) => ReactNode;
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
  /** True when this key is being re-tested after lapsing. Rides onto
   *  the key run rows, which already carry the flag. */
  isRetest: boolean;
  /**
   * The session was paused or resumed.
   *
   * A SONG'S CLOCK IS A STORED RECORD, so pausing the panel has to
   * reach it: the panel's clock reads that record, and a pause that
   * only stopped the display would let the minutes keep accruing
   * underneath and jump on resume. The three shapes surfaces have no
   * such record — their session is the panel — so this is theirs
   * alone.
   */
  onSessionPause: (paused: boolean) => void;
  /** Start the song's stored clock, if it is not already going. */
  onSessionStart: () => void;
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
    // THE ALLOWANCE, WHERE THE RUN IS JUDGED: ten below the tempo, the
    // same number the metronome's floor and the cell roll-up use.
    floorRate: testFloorBpm(args.songTempo) ?? 0,
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
      const attempt = {
        id: `run-${Math.random().toString(36).slice(2, 8)}`,
        // ONE SOURCE FOR "WHAT WAS IT PLAYED AT". This surface used to
        // ask the host to read the metronome again at write time,
        // which is a second reading of the same question a run's end
        // has already answered — and a later one, taken after the run
        // had been rated. The panel captures it when the run stops and
        // it travels on the record, the same figure the drill
        // surfaces put on their rows.
        bpm: record.bpm,
        feel: record.feel,
      };

      await writeSongRun({
        cellIds,
        songKeyId: args.songKeyId,
        attempt,
        performanceTempo: args.songTempo,
        expectedSectionCount: args.expectedSectionCount,
      });

      // A RUN THAT COVERED EVERY SECTION IS A RUN OF THE SONG, and
      // that is a claim the section rows cannot make between them.
      // `stage.ts`'s Internalized criterion asks whether each key has
      // been run clean at tempo at least once and looks in
      // `songKeyRunThroughs`, so a whole-song run has to leave one.
      //
      // DERIVED FROM COVERAGE, not from a mode flag. The panel already
      // says what a run covered; a second field saying "this was the
      // whole song" would be a way for the two to disagree.
      if (args.sections.length > 0 && cellIds.length === args.sections.length) {
        await writeWholeSongRun({
          songKeyId: args.songKeyId,
          attempt,
          performanceTempo: args.songTempo,
          streakBefore: record.streakBefore,
          isRetest: args.isRetest,
        });
      }
    },
    // THE SONG LADDER'S RUNG, not a band. A whole-song test lands on
    // Comfortable and cannot reach higher — Cross-key needs other
    // keys — so the height was never chosen and is not reported.
    // THE SECTION VARIANT'S FIRST LIVE WRITER. It has been built and
    // tested since the result screen landed and nothing could reach
    // it, because nothing wrote a `songCell:` band outside this
    // surface and this surface had no caller.
    describeTestPass: (band, lowestFeel) => (
      args.entry === 'whole-song'
        ? { kind: 'whole-song', songTitle: args.songTitle, status: 'comfortable' }
        : { kind: 'section', sectionLabel: args.sectionLabel, band, lowestFeel }
    ),
    passKeyName: args.spelledKeyName,
    renderMetronome: args.renderMetronome,
    // A SONG HAS NOTHING SINGLE TO SOUND. The reference panel plays one
    // voicing; a section run covers a passage and a whole-song run the
    // lot, and neither is a chord.
    renderReference: null,
    onSessionPause: args.onSessionPause,
    onSessionStart: args.onSessionStart,
    renderBadgePreview: args.renderBadgePreview,
    // THE DURABLE FACT A PASS LEAVES, which is not any of the reps.
    // `wholeSongTestPassedAt` is what `stageCriteria` reads for
    // Learning → Comfortable, and the retest clock is what
    // `recordKeyProving` moves — and had no caller until now.
    // ONLY A WHOLE-SONG PASS LEAVES A DURABLE FACT. A section test is
    // entirely described by the band its three runs set; there is no
    // `sectionTestPassedAt` and there should not be — the band IS the
    // record, and a second one could disagree with it.
    recordTestPass: args.entry === 'whole-song'
      ? () => writeWholeSongTestPass({ songKeyId: args.songKeyId })
      : null,
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

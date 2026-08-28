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
import { recordEngagement } from '../../../lib/spacingState';
import {
  feelToRating,
  logScaleDrillSession,
  logSession,
  logVoiceLeadingDrillSession,
} from '../drillModel';
import { recordSongKeyRun } from '../../repertoire/matrix/proveKey';
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
  await recordEngagement({
    itemRef,
    moduleRef: MODULE_REF,
    hand,
    signal: {
      kind: 'rating',
      rating: feelToRating(record.feel),
      feel: record.feel,
      fromTest: record.fromTest,
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
  /** The song's own tempo. NOT a figure from the settings tree: a song
   *  is played at the tempo it is written at, and the tree has no
   *  opinion about that. Null means the song has none set, so every
   *  run counts — the same rule the cell panel already applies. */
  songTempo: number | null;
}): DrillSurface {
  return {
    id: 'song',
    cellLabel: args.cellLabel,
    skillLabel: args.skillLabel,
    // A section takes as long as it takes.
    countsUp: true,
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
          },
        });
      }

      await recordSongKeyRun({
        songKeyId: args.songKeyId,
        feel: record.feel,
        fromTest: record.fromTest,
      });
    },
  };
}

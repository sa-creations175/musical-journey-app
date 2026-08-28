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
import {
  CHORD_RATE_OPTIONS,
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

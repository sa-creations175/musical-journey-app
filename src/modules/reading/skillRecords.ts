/**
 * Reading's rows for the skills registry.
 *
 * =====================================================================
 * THE MODULE THAT WAS NOT IN THE CATALOGUE AT ALL.
 *
 * `buildSkillRegistry` walked eight modules and reading was not one of
 * them — `MODULE_LABELS` had no entry and no builder existed. So 188
 * items were invisible to the Skills Catalogue, the harmonic diary, the
 * goal picker and the related-items picker, while the module itself
 * tracked them perfectly well.
 *
 * This lives in the reading module rather than inside registry.ts
 * because the coordinates come from `parseReadingItemRef`, and the
 * registry must not learn reading's ref grammar. It returns rows; the
 * registry decides nothing about them.
 * =====================================================================
 *
 * COORDINATES COME FREE. Every reading ref parses to a typed structure
 * — signature × mode × direction, clef × position, quality × position ×
 * clef, family × position — so nothing here parses a string for a UI
 * axis. That is the whole reason reading needed no `axis` field added
 * to its catalog the way harmonic fluency would.
 */
import type { AttemptRecord } from '../../lib/db';
import {
  CHORD_QUALITIES, SHAPE_FAMILY_LABEL, SIGNATURES,
  parseReadingItemRef,
} from './catalog';
import { enumerateReading } from '../goals/scopeEnumeration';
import type { ReadingDrillSkill } from './pickCard';

export const READING_MODULE_ID = 'reading';

const SIGNATURE_BY_ID = new Map(SIGNATURES.map(s => [s.id, s]));
const QUALITY_LABEL = new Map(CHORD_QUALITIES.map(q => [q.id, q.label]));

/** The four skills, as the module home words them, in drill order. */
export const READING_CATEGORY_LABEL: Readonly<Record<string, string>> = {
  note: 'Note recognition',
  shape: 'Notation shapes',
  sig: 'Key signatures',
  chord: 'Chord identification',
};

const DIRECTION_LABEL: Readonly<Record<string, string>> = {
  name: 'name the key',
  count: 'count the accidentals',
  which: 'which accidentals',
};

const POSITION_LABEL: Readonly<Record<string, string>> = {
  root: 'root position',
  inv1: '1st inversion',
  inv2: '2nd inversion',
  inv3: '3rd inversion',
};

export interface ReadingSkillRow {
  itemRef: string;
  /** The drill skill this belongs to. Becomes the SUBTYPE segment of
   *  the canonical skill id, so annotations key on something stable and
   *  meaningful rather than a constant. */
  skill: ReadingDrillSkill;
  category: string;
  name: string;
  axis: Readonly<Record<string, string | number>>;
}

/**
 * One row per reading item, in catalog order.
 *
 * ORDER IS `enumerateReading()`'s, which is the catalog walk the
 * coverage denominators already use. Nothing here sorts — a grid takes
 * its axis order from a passed list, not from the order rows arrive in.
 */
export function readingSkillRows(): ReadingSkillRow[] {
  const out: ReadingSkillRow[] = [];
  for (const itemRef of enumerateReading()) {
    const parsed = parseReadingItemRef(itemRef);
    // A ref the parser refuses is a catalog bug, not a row to render
    // with a raw id for a label — §1.8b, a key used as an answer.
    if (parsed === null) continue;

    if (parsed.skill === 'sig') {
      const sig = SIGNATURE_BY_ID.get(parsed.signature);
      const key = sig ? sig[parsed.mode] : parsed.signature;
      out.push({
        itemRef,
        skill: 'sig',
        category: READING_CATEGORY_LABEL.sig,
        name: `${key} ${parsed.mode} — ${DIRECTION_LABEL[parsed.direction]}`,
        // `count` is the signed accidental count: flats negative, sharps
        // positive, C at zero. That ordering IS the circle of fifths, so
        // an axis built on it needs no second table to sort by.
        axis: {
          signature: parsed.signature,
          accidentals: sig
            ? (sig.accidental === 'flat' ? -sig.count : sig.count)
            : 0,
          mode: parsed.mode,
          direction: parsed.direction,
        },
      });
      continue;
    }

    if (parsed.skill === 'note') {
      out.push({
        itemRef,
        skill: 'note',
        category: READING_CATEGORY_LABEL.note,
        name: `${parsed.clef} staff, position ${parsed.position}`,
        axis: { clef: parsed.clef, position: parsed.position },
      });
      continue;
    }

    if (parsed.skill === 'chord') {
      const label = QUALITY_LABEL.get(parsed.qualityId) ?? parsed.qualityId;
      out.push({
        itemRef,
        skill: 'chord',
        category: READING_CATEGORY_LABEL.chord,
        name: `${label}, ${POSITION_LABEL[parsed.position]} (${parsed.clef})`,
        axis: {
          quality: parsed.qualityId,
          position: parsed.position,
          clef: parsed.clef,
        },
      });
      continue;
    }

    out.push({
      itemRef,
      skill: 'shape',
      category: READING_CATEGORY_LABEL.shape,
      name: `${SHAPE_FAMILY_LABEL[parsed.family]} ${POSITION_LABEL[parsed.position]}`,
      axis: { family: parsed.family, position: parsed.position },
    });
  }
  return out;
}

/** Reading attempts bucketed by itemRef. `itemId` IS the ref — see
 *  recordReadingAttempt, which writes one identity, not two. */
export function bucketReadingAttempts(
  attempts: readonly AttemptRecord[],
): Map<string, AttemptRecord[]> {
  const out = new Map<string, AttemptRecord[]>();
  for (const a of attempts) {
    if (a.moduleId !== READING_MODULE_ID) continue;
    const arr = out.get(a.itemId);
    if (arr) arr.push(a); else out.set(a.itemId, [a]);
  }
  return out;
}

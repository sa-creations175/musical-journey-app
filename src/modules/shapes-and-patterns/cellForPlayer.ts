/**
 * A grid cell, read as something the shared player can sound.
 *
 * =====================================================================
 * THE itemRef IS THE ONLY THING A CELL IS.
 *
 * `vl:major-251:seventh-chords:B:F` says the pattern, the thickness
 * row, the position and the key, and those four are exactly what the
 * player needs. So this parses rather than being told — a second path
 * that carried the same four values alongside the ref is how a panel
 * comes to play a cell other than the one that is selected.
 *
 * Returns null for a ref the shared list cannot voice: a custom
 * pattern, or one of Silas's own recorded movements. Those have their
 * own player and are not on this list.
 * =====================================================================
 */
import { parseVoiceLeadingItemRef } from './catalog';
import {
  SHARED_PROGRESSION_BY_ID, type ListRung,
} from '../ear-training/chord-progressions/sharedList';

/** The rung a stored type segment names. */
const RUNG_OF_TYPE: Readonly<Record<string, ListRung>> = {
  'guide-tones': 'guide',
  'seventh-chords': 'seventh',
  'full-voicing': 'full',
  // ONE ROW UNDER TWO IDS — Major 2-5-1's legacy spelling of the
  // Extended Voicings row. See the catalog's own note.
  'aba-structure': 'full',
};

/** The position number a stored tag reads as. */
const POSITION_OF_TAG: Readonly<Record<string, number>> = {
  A: 1, B: 2, C: 3,
  'pos-A': 1, 'pos-B': 2,
  pos1: 1, pos2: 2, pos3: 3, pos4: 4,
};

/** What a cell is, for the player. Null where the ref is not one the
 *  shared list can voice — a custom pattern, or a movement. */
export function cellForPlayer(itemRef: string): {
  entryId: string; rung: ListRung; position: number; keyName: string;
} | null {
  const desc = parseVoiceLeadingItemRef(itemRef);
  if (desc === null) return null;
  const entry = SHARED_PROGRESSION_BY_ID.get(desc.patternId);
  if (entry === undefined) return null;
  switch (desc.kind) {
    case 'type-position': {
      const rung = RUNG_OF_TYPE[desc.type];
      const position = POSITION_OF_TAG[desc.position];
      if (rung === undefined || position === undefined) return null;
      return { entryId: entry.id, rung, position, keyName: desc.keyName };
    }
    case 'minor-aba':
      return {
        entryId: entry.id, rung: 'full',
        position: POSITION_OF_TAG[desc.position] ?? 1, keyName: desc.keyName,
      };
    case 'inversion-4':
    case 'diatonic-cycle': {
      // THE PASSES HAVE ONE RUNG EACH and the list knows which.
      const rung = entry.rungs[0];
      if (rung === undefined) return null;
      const tag = desc.kind === 'inversion-4' ? desc.position : desc.startingPosition;
      return {
        entryId: entry.id, rung,
        position: POSITION_OF_TAG[tag] ?? 1, keyName: desc.keyName,
      };
    }
  }
}

/**
 * A grid cell, read back as something to hear.
 *
 * THE CLAIM IS THAT THE PANEL PLAYS THE CELL YOU TAPPED. Every itemRef
 * the catalog can enumerate is parsed and voiced, and the rung it comes
 * back with is the row the ref names — not a nearby one.
 */
import { describe, expect, it } from 'vitest';
import {
  KEYS, VOICE_LEADING_PATTERNS, enumerateVoiceLeadingCells,
} from '../catalog';
import { cellForPlayer } from '../cellForPlayer';
import { voiceEntry } from '../../ear-training/chord-progressions/passVoicing';
import { SHARED_PROGRESSION_BY_ID } from '../../ear-training/chord-progressions/sharedList';

describe('every cell on the page can be heard', () => {
  it('parses and voices every itemRef the catalog enumerates', () => {
    let seen = 0;
    for (const pattern of VOICE_LEADING_PATTERNS) {
      for (const key of KEYS) {
        for (const ref of enumerateVoiceLeadingCells(pattern, key)) {
          const cell = cellForPlayer(ref);
          expect(cell, ref).not.toBeNull();
          const entry = SHARED_PROGRESSION_BY_ID.get(cell!.entryId)!;
          const chords = voiceEntry(
            entry, KEYS.indexOf(key), cell!.rung, cell!.position,
          );
          expect(chords.length, ref).toBe(entry.chords.length);
          seen += 1;
        }
      }
    }
    // 69 sub-cells a key across twelve keys.
    expect(seen).toBe(828);
  });

  it('reads the row out of the ref rather than near it', () => {
    expect(cellForPlayer('vl:major-251:guide-tones:A:C'))
      .toEqual({ entryId: 'major-251', rung: 'guide', position: 1, keyName: 'C' });
    expect(cellForPlayer('vl:major-251:seventh-chords:C:F'))
      .toEqual({ entryId: 'major-251', rung: 'seventh', position: 3, keyName: 'F' });
    // ONE ROW UNDER TWO IDS — Major 2-5-1's legacy spelling of the
    // Extended Voicings row reads as the same rung as `full-voicing`.
    expect(cellForPlayer('vl:major-251:aba-structure:B:C')!.rung).toBe('full');
    expect(cellForPlayer('vl:five-one:full-voicing:B:C')!.rung).toBe('full');
  });

  it('gives each pass the one rung the list says it is', () => {
    expect(cellForPlayer('vl:minor-aba:pos-B:C'))
      .toEqual({ entryId: 'minor-aba', rung: 'full', position: 2, keyName: 'C' });
    expect(cellForPlayer('vl:dom7b9:pos4:C')!.rung).toBe('full');
    expect(cellForPlayer('vl:dim7:pos4:C')!.rung).toBe('seventh');
    expect(cellForPlayer('vl:diatonic-cycle:pos2:C'))
      .toEqual({ entryId: 'diatonic-cycle', rung: 'seventh', position: 2, keyName: 'C' });
  });

  it('says no to a ref the shared list cannot voice', () => {
    // A custom pattern, and one of Silas's own recorded movements.
    // Both have their own player and are not on this list.
    expect(cellForPlayer('vl:my-own-thing:seventh-chords:A:C')).toBeNull();
    expect(cellForPlayer('not-a-ref')).toBeNull();
  });
});

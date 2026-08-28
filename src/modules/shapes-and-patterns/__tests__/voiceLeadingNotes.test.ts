/**
 * The reader's notes on a voice-leading cell.
 *
 * Two things are worth pinning here, and they are different in kind.
 * The first is the STORAGE RULES — clearing deletes, saving the
 * default deletes, the default is never written. The second is that
 * the two key shapes cannot collide, which is not obvious from reading
 * them and is checked against the whole catalog rather than argued.
 */
import { describe, expect, it } from 'vitest';
import {
  applyNote,
  clearNote,
  isOverridden,
  keyNoteKey,
  noteText,
  patternNoteKey,
} from '../voiceLeadingNotes';
import {
  KEYS,
  VOICE_LEADING_PATTERNS,
  voiceLeadingGridRows,
} from '../catalog';

const HINT = '9ths added, 13ths on the dominant';

describe('the two key shapes cannot collide', () => {
  /**
   * WHY THIS IS NOT OBVIOUS. A rowId is sometimes itself two segments
   * (`full-voicing:A`) and sometimes one (`pos1`), so the two shapes do
   * not have fixed lengths — `dom7b9:pos1:C` is a KEY note and
   * `five-one:full-voicing:A` is a PATTERN note, and both have three
   * segments. Nothing parses these strings, so that is survivable; what
   * would not be is two different cells producing one key. This walks
   * the real catalog rather than reasoning about it.
   */
  it('no pattern key equals any key-specific key, across the whole catalog', () => {
    const patternKeys = new Set<string>();
    const keyKeys = new Set<string>();

    for (const pattern of VOICE_LEADING_PATTERNS) {
      for (const row of voiceLeadingGridRows(pattern)) {
        patternKeys.add(patternNoteKey(pattern.id, row.rowId));
        for (const k of KEYS) {
          keyKeys.add(keyNoteKey(pattern.id, row.rowId, k));
        }
      }
    }

    expect(patternKeys.size).toBeGreaterThan(0);
    expect(keyKeys.size).toBe(patternKeys.size * KEYS.length);

    const clash = [...patternKeys].filter(k => keyKeys.has(k));
    expect(clash, `these strings mean two different things: ${clash.join(', ')}`)
      .toEqual([]);
  });

  it('every cell in the catalog gets its own key', () => {
    // Guards the other direction: distinct cells must not share a key,
    // or one cell's note would appear on another.
    const seen = new Set<string>();
    let cells = 0;
    for (const pattern of VOICE_LEADING_PATTERNS) {
      for (const row of voiceLeadingGridRows(pattern)) {
        for (const k of KEYS) {
          seen.add(keyNoteKey(pattern.id, row.rowId, k));
          cells += 1;
        }
      }
    }
    expect(seen.size).toBe(cells);
    expect(cells).toBe(408);
  });
});

describe('the default is never written', () => {
  const key = patternNoteKey('major-251', 'aba-structure:A');

  it('an untouched box reads the catalog default, and stores nothing', () => {
    const notes = {};
    expect(noteText(notes, key, HINT)).toBe(HINT);
    expect(isOverridden(notes, key)).toBe(false);
  });

  it('saving text equal to the default deletes rather than duplicating', () => {
    const notes = applyNote({}, key, HINT, HINT);
    expect(notes).toEqual({});
    // Still reads the default — via fallback, not via a stored copy.
    expect(noteText(notes, key, HINT)).toBe(HINT);
  });

  it('the same holds with surrounding whitespace', () => {
    expect(applyNote({}, key, `  ${HINT}  `, HINT)).toEqual({});
  });

  it('a real edit is stored, and reads back over the default', () => {
    const notes = applyNote({}, key, 'thumb stays on the 7th', HINT);
    expect(notes[key]).toBe('thumb stays on the 7th');
    expect(noteText(notes, key, HINT)).toBe('thumb stays on the 7th');
    expect(isOverridden(notes, key)).toBe(true);
  });

  it('reset deletes the override, and the default comes back', () => {
    const edited = applyNote({}, key, 'thumb stays on the 7th', HINT);
    const reset = clearNote(edited, key);
    expect(reset).toEqual({});
    expect(noteText(reset, key, HINT)).toBe(HINT);
  });
});

describe('clearing and resetting are the same gesture', () => {
  const key = patternNoteKey('five-one', 'guide-tones:A');

  it('an emptied box deletes rather than storing a blank', () => {
    const edited = applyNote({}, key, 'something', '');
    expect(isOverridden(edited, key)).toBe(true);
    const emptied = applyNote(edited, key, '   ', '');
    expect(emptied).toEqual({});
    expect(isOverridden(emptied, key)).toBe(false);
  });

  it('a row with no default: emptying and clearing agree', () => {
    const edited = applyNote({}, key, 'something', '');
    expect(applyNote(edited, key, '', '')).toEqual(clearNote(edited, key));
  });
});

describe('a pattern note follows the row, a key note does not', () => {
  it('one pattern note serves all twelve keys of its row', () => {
    const notes = applyNote({}, patternNoteKey('minor-251', 'seventh-chords:C'),
      'let the 7th fall to the 3rd', '');
    for (const k of KEYS) {
      expect(noteText(notes, patternNoteKey('minor-251', 'seventh-chords:C')))
        .toBe('let the 7th fall to the 3rd');
      // and the key box for that same cell is untouched
      expect(noteText(notes, keyNoteKey('minor-251', 'seventh-chords:C', k)))
        .toBe('');
    }
  });

  it('a key note written in one key does not appear in another', () => {
    const notes = applyNote({}, keyNoteKey('five-one', 'guide-tones:A', 'Eb'),
      'Db under the thumb', '');
    expect(noteText(notes, keyNoteKey('five-one', 'guide-tones:A', 'Eb')))
      .toBe('Db under the thumb');
    expect(noteText(notes, keyNoteKey('five-one', 'guide-tones:A', 'F')))
      .toBe('');
  });

  it('the same row on two patterns edits independently', () => {
    // The Extended Voicings rows share a default string across three
    // patterns. Keying per ROW is what stops one edit rewriting the
    // other two.
    const notes = applyNote({}, patternNoteKey('major-251', 'aba-structure:A'),
      'major only', HINT);
    expect(noteText(notes, patternNoteKey('major-251', 'aba-structure:A'), HINT))
      .toBe('major only');
    expect(noteText(notes, patternNoteKey('minor-251', 'full-voicing:A'), HINT))
      .toBe(HINT);
  });
});

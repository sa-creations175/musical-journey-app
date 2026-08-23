/**
 * Ear training reads one spelling (ET-2).
 *
 * Four tabs each owned a note-name table and picked between them by a
 * different rule: chord motion and key detection derived flats from the
 * KEY NAME, progression theory hardcoded flats, scales-modes carried
 * fixed labels in its root catalog. Four rules for one question.
 *
 * These are MIS-THREADS, not absences: each was correct under the app's
 * flats default and wrong only when the setting moves. That is why they
 * ship as a sweep, and why ChordRecognitionQuiz — which had no flat
 * table at all and was wrong for everyone — shipped on its own first.
 */
import { describe, it, expect } from 'vitest';
import { chordDisplay, keyToRootMidi, KEYS } from '../chord-progressions/progressionTheory';
import { midiToLabel, ROOT_NOTES } from '../scales-modes/shared';
import { FLAT_SIGN, SHARP_SIGN, type Spelling } from '../../../lib/spelling';

const C3 = 48;

describe('chordDisplay — was flat-only', () => {
  it('names a black-key root by the requested spelling', () => {
    // Eb3 = 51. The old hardcoded table could only ever say "Eb".
    expect(chordDisplay(51, 'minor', 'triad', {}, 'flat')).toBe(`E${FLAT_SIGN}m`);
    expect(chordDisplay(51, 'minor', 'triad', {}, 'sharp')).toBe(`D${SHARP_SIGN}m`);
  });

  it('spells the slash bass too, not just the root', () => {
    const out = chordDisplay(C3, 'major', 'triad', { slashBassMidi: 51 }, 'sharp');
    expect(out).toBe(`C/D${SHARP_SIGN}`);
    // A half-converted version would leave the bass flat while the root
    // went sharp — two alphabets in one chord symbol.
    expect(out).not.toContain('b');
  });

  it('defaults to flats when no spelling is passed', () => {
    expect(chordDisplay(51, 'minor', 'triad', {})).toBe(`E${FLAT_SIGN}m`);
  });

  it('leaves naturals identical either way', () => {
    for (const spelling of ['flat', 'sharp'] as Spelling[]) {
      expect(chordDisplay(C3, 'major', 'triad', {}, spelling)).toBe('C');
    }
  });
});

describe('keyToRootMidi — was two lookup tables tried in turn', () => {
  it('resolves every key the module can pick', () => {
    for (const key of KEYS) {
      const midi = keyToRootMidi(key);
      expect(midi, key).toBeGreaterThanOrEqual(48);
      expect(midi, key).toBeLessThan(60);
    }
  });

  it('resolves both alphabets and the signs to the same pitch', () => {
    // The old pair of tables handled ASCII sharps and flats. Signs are
    // new, and matter because the app now RENDERS them — a name that
    // has been through a display path has to resolve back.
    expect(keyToRootMidi('F#')).toBe(keyToRootMidi('Gb'));
    expect(keyToRootMidi(`G${FLAT_SIGN}`)).toBe(keyToRootMidi('F#'));
    expect(keyToRootMidi(`F${SHARP_SIGN}`)).toBe(keyToRootMidi('F#'));
  });

  it('still lands unknown input on C3 rather than throwing', () => {
    expect(keyToRootMidi('H')).toBe(48);
  });
});

describe('scales-modes root labels', () => {
  it('spells the root by setting, not by catalog label', () => {
    expect(midiToLabel(49, 'flat')).toBe(`D${FLAT_SIGN}`);
    expect(midiToLabel(49, 'sharp')).toBe(`C${SHARP_SIGN}`);
  });

  it('no longer reads ROOT_NOTES[].label for display', () => {
    // The catalog's own label is 'Db' — fixed, ASCII, one spelling.
    // If the display path still read it, the sharp case above could not
    // pass, and this pins WHY: the two now differ on purpose.
    expect(ROOT_NOTES[1].label).toBe('Db');
    expect(midiToLabel(ROOT_NOTES[1].midi, 'flat')).not.toBe(ROOT_NOTES[1].label);
  });

  it('keeps the picker identity numeric', () => {
    // The option VALUE is `n.midi`. This is what makes the scales-modes
    // picker structurally unable to store a display name, unlike the key
    // pickers — assert the shape so a change to a string identity is a
    // visible break rather than a quiet one.
    for (const n of ROOT_NOTES) {
      expect(typeof n.midi, `${n.label} midi`).toBe('number');
      expect(Number.isInteger(n.midi), `${n.label} midi`).toBe(true);
    }
    expect(new Set(ROOT_NOTES.map(n => n.midi)).size).toBe(ROOT_NOTES.length);
  });
});

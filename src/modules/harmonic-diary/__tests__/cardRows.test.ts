/**
 * The panel's rows, underneath: what Root, Colour, Inversion, Mode and
 * Interval turn a card's notes into.
 *
 * Silas's spec of 12 Sep 2026, §4.
 */
import { describe, expect, it } from 'vitest';
import { CHORD_SEEDS } from '../../ear-training/chord-recognition/seed';
import {
  INTERVAL_CHIPS, LAB_HAND_CEILING, MODE_CHIPS, cardSound, colourRow, labChord,
  labIntervalNotes, labScaleNotes,
} from '../cardSound';

const pc = (m: number) => ((m % 12) + 12) % 12;
const NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const names = (notes: readonly number[]) => notes.map(m => NAMES[pc(m)]).join(' ');
const steps = (notes: readonly number[]) => notes.slice(1).map((m, i) => m - notes[i]);

describe('Inversion turns the notes actually in the hand', () => {
  it('on a rootless Major 9: E G B D · G B D E · B D E G · D E G B', () => {
    const hands = [0, 1, 2, 3].map(i => names(labChord(0, 'maj9', i, 'rootless', true)!.chord.hand));
    expect(hands).toEqual(['E G B D', 'G B D E', 'B D E G', 'D E G B']);
    expect(labChord(0, 'maj9', 0, 'rootless', true)!.handSize).toBe(4);
  });

  it('turns the root with the rest once Root in the right hand puts it there', () => {
    const held = labChord(0, 'maj7', 1, 'root', true)!;
    expect(held.handSize).toBe(4);
    expect(names(held.chord.hand)).toBe('E G B C');
  });

  it('a triad keeps its root in the hand on either setting', () => {
    for (const hands of ['rootless', 'root'] as const) {
      const triad = labChord(0, 'maj', 0, hands, true)!;
      expect(names(triad.chord.hand), hands).toBe('C E G');
      expect(triad.handSize, hands).toBe(3);
    }
  });
});

describe('Root transposes, and the hand keeps its shape', () => {
  it('in every key, for every chord and inversion: the same distances, the whole hand moved', () => {
    for (const seed of CHORD_SEEDS) {
      for (const hands of ['rootless', 'root'] as const) {
        for (let inv = 0; inv < 4; inv += 1) {
          const atC = labChord(0, seed.id, inv, hands, true, 0)!.chord;
          for (let root = 0; root < 12; root += 1) {
            // A C card, its Root row moved to every key.
            const moved = labChord(root, seed.id, inv, hands, true, 0)!.chord;
            const where = `${seed.id} ${hands} inv ${inv} on ${NAMES[root]}`;
            expect(steps(moved.hand), where).toEqual(steps(atC.hand));
            expect(moved.hand.map(m => pc(m - root)), where).toEqual(atC.hand.map(m => pc(m)));
            expect(Math.min(...moved.hand), where).toBeGreaterThan(moved.bass!);
          }
        }
      }
    }
  });

  it('drops the whole hand an octave rather than run above the ceiling', () => {
    // A Major 13 on G would reach past A5; it comes down together.
    const g = labChord(7, 'maj13', 0, 'rootless', true, 0)!.chord;
    expect(Math.max(...g.hand)).toBeLessThanOrEqual(LAB_HAND_CEILING);
    for (const seed of CHORD_SEEDS) {
      for (let root = 0; root < 12; root += 1) {
        const top = Math.max(...labChord(root, seed.id, 0, 'rootless', true, 0)!.chord.hand);
        expect(top, `${seed.id} on ${NAMES[root]}`).toBeLessThanOrEqual(LAB_HAND_CEILING);
      }
    }
  });

  it('starts exactly where the card is', () => {
    const card = cardSound('chord-recognition:item:min9')!;
    expect(card.kind).toBe('chord');
    if (card.kind !== 'chord') return;
    expect(labChord(card.rootPc, card.qualityId, 0, 'rootless', card.shaped)!.chord).toEqual(card.chord);
  });
});

describe('Colour is the chord\'s family, in the ruled order', () => {
  it('Major: the stack ladder, a separator, then the colours', () => {
    const { family, groups } = colourRow('maj7');
    expect(family).toBe('major');
    expect(groups.map(g => g.map(c => c.label))).toEqual([
      ['Major', 'Major 7', 'Major 9', 'Major 13'],
      ['Major 6', '6/9', 'add9', 'add2'],
    ]);
  });

  it('Dominant: 7 and 13 | 7sus4 | the altered three', () => {
    expect(colourRow('dom7b9').groups.map(g => g.map(c => c.label))).toEqual([
      ['Dominant 7', '13'], ['7sus4'], ['7♭9', '7♯9', '7♯9♯5'],
    ]);
  });

  it('shows every chord Chord Recognition has, once, and nothing it does not', () => {
    const shown = ['major', 'minor', 'dom', 'dim', 'sus', 'aug']
      .map(f => CHORD_SEEDS.find(s => s.family === f)!.id)
      .flatMap(id => colourRow(id).groups.flat().map(c => c.id));
    expect([...shown].sort()).toEqual(CHORD_SEEDS.map(s => s.id).sort());
  });
});

describe('Mode and Interval', () => {
  it('a mode on a root is that mode\'s notes from that root', () => {
    expect(names(labScaleNotes(2, 'dorian'))).toBe('D E F G A B C D');
    expect(names(labScaleNotes(9, 'harmonic-minor'))).toBe('A B C D E F A♭ A');
    expect(MODE_CHIPS.map(c => c.label)).toEqual([
      'Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian',
      'harmonic minor', 'melodic minor',
    ]);
  });

  it('an interval on a root is two notes that far apart, minor 2nd to octave', () => {
    const [low, high] = labIntervalNotes(3, 4);
    expect(pc(low)).toBe(3);
    expect(high - low).toBe(4);
    expect(INTERVAL_CHIPS.map(c => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

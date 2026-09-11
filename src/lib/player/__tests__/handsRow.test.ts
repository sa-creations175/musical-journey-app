/**
 * The Hands row: two right-hand voicings over the same bass.
 *
 * =====================================================================
 * THE ROW CHOOSES WHAT THE RIGHT HAND PLAYS AND NOTHING ELSE. Silas's
 * ruling of 10 Sep 2026. So on every surface that shows it, and in
 * every key, the two settings must schedule the SAME bass pair, and the
 * right hand must hold the root under "Root in the right hand" and not
 * under "Rootless right hand" wherever the rung wrote the hand
 * rootless (a triad has its root either way). Three surfaces, each building its chords
 * its own way: Chord Motion (`motionChords`), the Full Progression card
 * (`voiceEntry`), and Harmonic Fluency's progression answer
 * (`voiceAll`). Seventh Chords, where the rung has a root to carry.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { seqSchedule } from '../../audio';
import { bassDrop, chordStep, handsForSetting, type PlayerChord } from '../voices';
import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from '../settings';
import { handTones } from '../../builtAnswers/chordShapes';
import { voiceAll } from '../../builtAnswers/voiceLeading';
import { ALL_MOTIONS } from '../../../modules/ear-training/chord-progressions/chordMotionPool';
import { motionChords } from '../../../modules/ear-training/chord-progressions/motionChords';
import { voiceEntry } from '../../../modules/ear-training/chord-progressions/passVoicing';
import { SHARED_PROGRESSIONS } from '../../../modules/ear-training/chord-progressions/sharedList';

const KEYS = [0, 5, 10]; // C, F, B♭
const ROOTLESS: PlayerSettings = { ...DEFAULT_PLAYER_SETTINGS, hands: 'rootless' };
const ROOT: PlayerSettings = { ...DEFAULT_PLAYER_SETTINGS, hands: 'root' };

/** What the sequencer schedules, per chord: the bass and the right hand. */
function scheduled(chords: PlayerChord[], settings: PlayerSettings) {
  const played = handsForSetting(chords, settings);
  const drop = bassDrop(chords, settings);
  const { steps } = seqSchedule(played.map(c => chordStep(c, settings, 2, drop)), 0, 1, 0);
  return steps.map((s, i) => ({
    bass: s.notes.filter(n => n.hand === 'L').map(n => n.midi),
    right: s.notes.filter(n => n.hand === 'R').map(n => n.midi),
    rootPc: played[i].rootPc,
  }));
}

const hasRoot = (right: number[], rootPc: number) =>
  right.some(m => (((m - rootPc) % 12) + 12) % 12 === 0);

const SURFACES: Array<{ name: string; build: (key: number) => PlayerChord[][] }> = [
  {
    name: 'Chord Motion',
    build: key => ALL_MOTIONS.filter((_, i) => i % 7 === 0).map(m =>
      motionChords(key, m.startLabel, m.destLabel, 'seventh', 'flat', m.direction).chords),
  },
  {
    name: 'Full Progression',
    build: key => SHARED_PROGRESSIONS.map(e => voiceEntry(e, key, 'seventh', 1)),
  },
  {
    name: 'Harmonic Fluency progression answer',
    build: key => [[
      { rootPc: (key + 2) % 12, tones: handTones('m7', 'seventh') },
      { rootPc: (key + 7) % 12, tones: handTones('7', 'seventh') },
      { rootPc: key, tones: handTones('maj7', 'seventh') },
    ]].map(specs => voiceAll(specs, { bass: true })
      .map((v, i) => ({ ...v!, name: String(i) }))),
  },
];

describe('the Hands row', () => {
  for (const surface of SURFACES) {
    it(`${surface.name}: the same bass both ways, the root in the right hand only when asked`, () => {
      let chordsChecked = 0;
      let rootlessChords = 0;
      for (const key of KEYS) {
        for (const sequence of surface.build(key)) {
          if (sequence.length === 0) continue;
          const rootless = scheduled(sequence, ROOTLESS);
          const root = scheduled(sequence, ROOT);
          rootless.forEach((r, i) => {
            const where = `${surface.name} key ${key} chord ${i}`;
            // THE BASS PAIR IS IDENTICAL: the left hand carries the line.
            expect(root[i].bass, where).toEqual(r.bass);
            expect(r.bass, where).toHaveLength(1);
            // The root is in the right hand when asked for, always.
            expect(hasRoot(root[i].right, r.rootPc), where).toBe(true);
            if (hasRoot(r.right, r.rootPc)) {
              // A chord that carries its root as written — a triad on
              // the list — has nothing to gain: the hand is unchanged.
              expect(root[i].right, where).toEqual(r.right);
            } else {
              // A rootless hand gains the root and nothing else.
              expect(root[i].right.length, where).toBe(r.right.length + 1);
              rootlessChords += 1;
            }
            // The root sits above the bass, in the hand.
            expect(Math.min(...root[i].right), where).toBeGreaterThan(root[i].bass[0]);
            chordsChecked += 1;
          });
        }
      }
      // Guard: the surface really produced chords to check, and rootless
      // ones among them — the case the row exists for.
      expect(chordsChecked).toBeGreaterThan(5);
      expect(rootlessChords).toBeGreaterThan(0);
    });
  }

  it('voice-leads the root: after the first chord, the nearest placement', () => {
    // C E G B, then a G7 whose rootless hand is B D F: the G joins it
    // where it is nearest the chord before, not always underneath.
    const chords = motionChords(0, '1', '5', 'seventh', 'flat', 'asc').chords;
    const [first, second] = handsForSetting(chords, ROOT);
    expect(first.hand[0] % 12).toBe(0); // root position on the first chord
    const rootless = chords[1].hand;
    const g = second.hand.find(m => m % 12 === 7)!;
    expect(rootless.includes(g)).toBe(false);
    // The G chosen is the one the voice-leading measure prefers.
    const options = [g - 12, g, g + 12].filter(m => m > chords[1].bass!);
    const distance = (m: number) => [...rootless, m].reduce((d, x) =>
      d + Math.min(...first.hand.map(p => Math.abs(p - x))), 0);
    expect(Math.min(...options.map(distance))).toBe(distance(g));
  });
});

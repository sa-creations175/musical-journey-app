// @vitest-environment jsdom
/**
 * What was pressed, turned into something that can be heard.
 *
 * =====================================================================
 * THE FIXTURE IS THE SIGNED-OFF PROTOTYPE'S OWN WALK-UP, and the
 * assertions are its own numbers.
 *
 * `docs/chord-movement-playback-prototype_1.html` holds the seven
 * placements as offsets ABOVE THE TONIC. This module stores them as
 * offsets above each CHORD'S OWN ROOT, because that is what a
 * `ChordPlacement` holds and what makes a voicing transpose. So the
 * fixture below is the prototype's walk-up rebased, and the expected
 * output is the prototype's numbers unchanged — which is the strongest
 * check available that the translation is a translation and not a new
 * arrangement.
 *
 * The two that matter most are the ones nobody would notice going
 * wrong: the D/F♯ has no pressed notes and must come out filled in
 * with an F♯ underneath rather than a D, and every number must move by
 * exactly one semitone when the key goes to D♭.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChordPlacement } from '../../../../lib/db';
import { MOVEMENT_TONIC_MIDI, toPlayableMovement } from '../movementPlayback';
import { EIGHTHS_DURATION_VERSION } from '../../../repertoire/eighthsMigration';

const L = (offset: number) => ({ offset, hand: 'L' as const });
const R = (offset: number) => ({ offset, hand: 'R' as const });

/** One placement, in the movement's own shape. */
function at(
  barIndex: number, beatPos: number, beats: number,
  chord: ChordPlacement['chord'],
  voicing?: ChordPlacement['voicing'],
): ChordPlacement {
  return {
    id: `${barIndex}-${beatPos}`, arrangementId: 'movement',
    barIndex, beatPos, beats, chord, voicing,
  };
}

/**
 * The walk-up: C · C · E7 · D/F♯ · G♯dim · Am · Am, in 6/8.
 *
 * Voicings are offsets from each chord's own root — the prototype's
 * tonic-relative numbers minus that chord's degree.
 */
const WALK_UP: ChordPlacement[] = [
  at(0, 0, 3, { function: '1', quality: '' }, [L(-12), R(7), R(12), R(16)]),
  at(0, 3, 3, { function: '1', quality: '' }, [L(-12), R(7), R(12), R(16)]),
  at(1, 0, 1, { function: '3', quality: '7' }, [L(-12), R(7), R(10), R(16)]),
  // NOTHING PRESSED. The app fills this one in.
  at(1, 1, 1, { function: '2', quality: '', bass: '#4' }),
  at(1, 2, 1, { function: 'b6', quality: 'dim' }, [L(-12), R(6), R(9), R(15)]),
  at(1, 3, 3, { function: '6', quality: 'm' }, [L(-12), R(7), R(12), R(15)]),
  at(2, 0, 3, { function: '6', quality: 'm' }, [L(-12), R(7), R(12), R(15)]),
];

const inKey = (key: string | undefined, placements = WALK_UP) =>
  toPlayableMovement({ placements, key, timeSignature: '6/8' });

describe('the walk-up, translated', () => {
  it('comes out as the prototype’s own numbers, in order', () => {
    const out = inKey('C')!;
    expect(out.rootMidi).toBe(MOVEMENT_TONIC_MIDI);
    expect(out.beatsPerBar).toBe(6);
    expect(out.placements.map(p => p.intervals)).toEqual([
      [-12, 7, 12, 16],
      [-12, 7, 12, 16],
      [-8, 11, 14, 20],     // E7: root 4 above the tonic
      [-6, 14, 18, 21],     // D/F♯, filled in
      [-4, 14, 17, 23],     // G♯dim: root 8
      [-3, 16, 21, 24],     // Am: root 9
      [-3, 16, 21, 24],
    ]);
    expect(out.placements.map(p => p.beats)).toEqual([3, 3, 1, 1, 1, 3, 3]);
  });

  it('plays the same shape a semitone up in D♭, with nothing re-entered', () => {
    // THE WHOLE ARGUMENT FOR MODELLING RATHER THAN RECORDING. The
    // offsets do not move; the root does.
    const c = inKey('C')!;
    const db = inKey('Db')!;
    expect(db.rootMidi).toBe(c.rootMidi + 1);
    expect(db.placements.map(p => p.intervals))
      .toEqual(c.placements.map(p => p.intervals));
  });

  it('orders by where a chord sits, not by the order it was typed', () => {
    const shuffled = [WALK_UP[6], WALK_UP[2], WALK_UP[0], ...WALK_UP.slice(3, 6), WALK_UP[1]];
    expect(inKey('C', shuffled)!.placements.map(p => p.placementId))
      .toEqual(inKey('C')!.placements.map(p => p.placementId));
  });

  it('refuses without a key, rather than guessing one', () => {
    // Ruling 10. Every pressed note is a distance from a chord root and
    // a root resolves from key + degree, so there is nothing honest to
    // play. The screen shows the reason.
    expect(inKey(undefined)).toBeNull();
    expect(inKey('not a key')).toBeNull();
  });
});

describe('a chord with nothing pressed', () => {
  const filled = () => inKey('C')!.placements[3];

  it('is filled in and marked, never silent and never skipped', () => {
    // Silencing it makes the play control lie about the sequence;
    // skipping it changes the rhythm, which is the thing being checked.
    expect(inKey('C')!.placements).toHaveLength(7);
    expect(filled().derived).toBe(true);
    expect(filled().beats).toBe(1);
  });

  it('takes its bass from the slash degree, so D/F♯ is an F♯ underneath', () => {
    // The one that would be wrong invisibly: a D under a D/F♯ sounds
    // fine and is not the chord.
    expect(filled().intervals[0]).toBe(-6);
    expect(filled().hands[0]).toBe('L');
    // F♯ below the C tonic.
    expect(MOVEMENT_TONIC_MIDI + filled().intervals[0]).toBe(42);
  });

  it('leaves every pressed chord unmarked', () => {
    const marks = inKey('C')!.placements.map(p => p.derived);
    expect(marks).toEqual([false, false, false, true, false, false, false]);
  });
});

describe('the duration-unit stamp', () => {
  it('reads it rather than assuming, so a stamped section is not doubled', () => {
    // `beats` counts eighth-SLOTS when the stamp is present, and a
    // stamped bar holds twice as many slots as beats — so a slot is
    // half a beat. A translator that assumed would play a stamped
    // section at double speed, which is the failure the field's own
    // comment was written about.
    const stamped = toPlayableMovement({
      placements: WALK_UP, key: 'C', timeSignature: '6/8',
      eighthsDurationVersion: EIGHTHS_DURATION_VERSION,
    })!;
    expect(stamped.placements.map(p => p.beats)).toEqual([1.5, 1.5, 0.5, 0.5, 0.5, 1.5, 1.5]);
  });

  it('a movement carries none, so its numbers pass through', () => {
    expect(inKey('C')!.placements.map(p => p.beats)).toEqual([3, 3, 1, 1, 1, 3, 3]);
  });
});

describe('the hands travel', () => {
  it('every note says which hand played it', () => {
    const out = inKey('C')!;
    expect(out.placements[0].hands).toEqual(['L', 'R', 'R', 'R']);
    expect(out.chords[0].hands).toEqual(['L', 'R', 'R', 'R']);
    for (const p of out.placements) {
      expect(p.hands, p.placementId).toHaveLength(p.intervals.length);
    }
  });
});

// =====================================================================
// The player
// =====================================================================

/**
 * Enough of an AudioContext to schedule against.
 *
 * jsdom has none, and the point of these three tests is the SCHEDULING
 * contract — that a stop clears what is queued, that a loop keeps
 * arming the next pass, and that the two hands get different gains —
 * which cannot be observed without one. The fake counts what was
 * created and what volume each voice was ramped to; it makes no sound
 * and asserts nothing about tone.
 *
 * THE MODULE IS RELOADED FOR EACH TEST, because `audio.ts` caches its
 * context in a module-level variable. Without the reset the first
 * test's context is the only one that ever exists and every later stub
 * is ignored — which is exactly what happened, silently, until the
 * gains came back empty.
 */
function fakeAudio() {
  const stopped: number[] = [];
  /** Every volume a voice was ramped to, in the order notes were
   *  scheduled. `playPiano` ramps its master gain to the note's volume
   *  and sets its harmonic gains by assignment, so this collects one
   *  entry per note. */
  const ramps: number[] = [];
  let started = 0;
  const param = (onRamp?: (v: number) => void) => ({
    setValueAtTime() {},
    linearRampToValueAtTime(v: number) { onRamp?.(v); },
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
    value: 0,
  });
  const node = (onRamp?: (v: number) => void) => ({
    connect(next: unknown) { return next; },
    gain: param(onRamp),
    frequency: param(),
    type: 'sine',
    start() {},
    stop(t: number) { stopped.push(t); },
  });
  const context = {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: () => Promise.resolve(),
    createBuffer: () => ({}),
    createBufferSource: () => ({ buffer: null, connect() {}, start() {} }),
    createGain: () => node(v => ramps.push(v)),
    createOscillator: () => { started += 1; return node(); },
  };
  vi.stubGlobal('AudioContext', function AC() { return context; });
  return { stopped, ramps, oscillators: () => started };
}

/** A fresh module registry, so the stubbed context is the one used. */
async function loadPlayer() {
  vi.resetModules();
  const audio = fakeAudio();
  const mod = await import('../../../../lib/audio');
  return { ...audio, play: mod.playSeqChords };
}

describe('playing a sequence', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('stops what it has scheduled, and stops arming more', async () => {
    const audio = await loadPlayer();
    const onStep = vi.fn();
    const handle = await audio.play(
      [{ intervals: [0, 4, 7], beats: 1 }, { intervals: [0, 3, 7], beats: 1 }],
      60, 60, { loop: 'untilStopped', onStep },
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(onStep).toHaveBeenCalled();
    const before = audio.oscillators();

    handle.stop();
    onStep.mockClear();
    // Long enough for several more passes, had anything been armed.
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onStep).not.toHaveBeenCalled();
    expect(audio.oscillators()).toBe(before);
    // And the voices already scheduled were told to stop.
    expect(audio.stopped.length).toBeGreaterThan(0);
  });

  it('runs a finite loop the number of times it was asked to', async () => {
    const one = [{ intervals: [0], beats: 1 }];
    const single = await loadPlayer();
    await single.play(one, 60, 60, { loop: 1 });

    const triple = await loadPlayer();
    await triple.play(one, 60, 60, { loop: 3 });

    expect(single.oscillators()).toBeGreaterThan(0);
    expect(triple.oscillators()).toBe(single.oscillators() * 3);
  });

  it('sounds the left hand louder only when the bass is forward', async () => {
    // The toggle Silas will decide by ear. Asserted through the volume
    // each voice was actually ramped to, so a change to the balance
    // shows up here rather than only in a constant.
    const chord = [{ intervals: [0, 12], hands: ['L' as const, 'R' as const], beats: 1 }];

    const even = await loadPlayer();
    await even.play(chord, 60, 60, { loop: 1, bassBalance: 'even' });
    const balanced = even.ramps.filter(v => v > 0);

    const fwd = await loadPlayer();
    await fwd.play(chord, 60, 60, { loop: 1, bassBalance: 'forward' });
    const forward = fwd.ramps.filter(v => v > 0);

    expect(balanced).toHaveLength(2);
    expect(balanced[0]).toBeCloseTo(balanced[1], 6);
    expect(forward[0]).toBeGreaterThan(forward[1]);
    // AND BY THE PROTOTYPE'S OWN RATIO. It plays the left hand at 0.5
    // and the right at 0.11 with the bass forward — 4.5 to 1 — and that
    // ratio is the thing Silas judged by ear. Pinned here rather than
    // only in the constant, so a change to the balance has to be a
    // decision rather than a tweak.
    expect(forward[0] / forward[1]).toBeCloseTo(0.5 / 0.11, 1);
  });
});

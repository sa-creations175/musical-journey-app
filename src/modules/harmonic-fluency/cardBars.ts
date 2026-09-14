/**
 * The Hear it strip's bars, for a family that does not write its own.
 *
 * =====================================================================
 * READ OFF THE SOUND, NEVER A SECOND DESCRIPTION (Silas, 13 Sep 2026).
 *
 * Modal Improvisation writes its bars beside its phrase in `cardAudio`.
 * Every other family's sound is an orienting chord and a list of steps,
 * and its bars are read off exactly those:
 *
 *   · the orienting chord, where it plays, is one bar, "home"
 *   · a step with more than one note is a chord, one bar, named by the
 *     app's own reader (`lib/player/reader`), so a G over B reads G/B
 *   · a run of single notes is one bar: one note is named, two are named
 *     with their interval, and more are named by the first with every
 *     note under it
 *
 * A bar that sounds a note the card's key does not hold is marked
 * outside; a card that names no key marks nothing.
 * =====================================================================
 */
import type { TonicContext } from '../../lib/musicalPlayback';
import { readNotes } from '../../lib/player/reader';
import { spellNote, type Spelling } from '../../lib/spelling';
import type { CardSound, SoundBar } from './cardAudio';

const MAJOR: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

/** Whether a note is outside the key's major scale. False with no key. */
export function isOutside(midi: number, keyPc: number | undefined): boolean {
  if (keyPc === undefined) return false;
  return !MAJOR.includes((((midi - keyPc) % 12) + 12) % 12);
}

/** The bars a card's sound plays, in order. */
export function soundBars(sound: CardSound, context: TonicContext, spelling: Spelling): SoundBar[] {
  if (sound.bars !== undefined) return [...sound.bars];
  const bars: SoundBar[] = [];
  const midi = (semitone: number) => sound.rootMidi + semitone;
  const spell = (m: number) => spellNote(m, spelling);
  const outside = (notes: readonly number[]) => notes.some(m => isOutside(m, sound.keyPc));

  if (sound.orient !== null && context === 'singleNote') {
    const notes = sound.orient.map(midi);
    bars.push({
      name: readNotes(notes, { spelling }).name,
      detail: 'home',
      outside: outside(notes),
      lane: 'orient',
      from: 0,
      to: 0,
      noteNames: [notes.map(spell).join(' ')],
    });
  }

  let i = 0;
  while (i < sound.steps.length) {
    const step = sound.steps[i];
    if (step.semitones.length > 1) {
      const notes = step.semitones.map(midi);
      bars.push({
        name: readNotes(notes, { spelling }).name,
        detail: '',
        outside: outside(notes),
        lane: 'steps',
        from: i,
        to: i + 1,
        noteNames: [notes.map(spell).join(' ')],
      });
      i += 1;
      continue;
    }
    let j = i;
    while (j < sound.steps.length && sound.steps[j].semitones.length <= 1) j += 1;
    const run = sound.steps.slice(i, j);
    const notes = run.flatMap(s => s.semitones.map(midi));
    const names = run.map(s => (s.semitones.length === 0 ? '' : spell(midi(s.semitones[0]))));
    const few = notes.length <= 2;
    bars.push({
      name: few ? readNotes(notes, { spelling }).name : names[0],
      detail: few ? '' : names.filter(n => n !== '').join(' '),
      outside: outside(notes),
      lane: 'steps',
      from: i,
      to: j,
      noteNames: names,
    });
    i = j;
  }
  return bars;
}

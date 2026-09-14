/**
 * A card's sound, played Together, Up, Down or Up and Down.
 *
 * =====================================================================
 * THE HEAR IT STRIP'S CHIPS ARE THE SHARED PLAYER'S (Silas, 14 Sep 2026),
 * and a card's sound is not a list of chords, so this says what each
 * mode means for one. The rule is spec §6's, applied to the two kinds of
 * material a card has:
 *
 *   · A LINE — single notes in a row, a scale or a run. Up is the line as
 *     the card writes it; Down plays it backwards; Up and Down plays it up
 *     and back; Together sounds every note of it at once, for as long as
 *     the line lasted. Spec §6: "Scales: Together is every note at once,
 *     the others are the scale in that direction."
 *   · A CHORD — one step holding several notes. Together strikes it, as
 *     the card always has; the other three roll it inside its own beats,
 *     the way a progression's chords roll inside their bars.
 *
 * THE ORIENTING CHORD, THE PEDAL AND THE CHORDS UNDER A RUN DO NOT CHANGE.
 * They are the ground the material stands on. Where a card has chords
 * under its run (Modal Improvisation), the line is reshaped inside each of
 * those chords' spans and scaled to fit it, so no note moves off the chord
 * it was written over.
 *
 * `origin` SAYS WHICH WRITTEN STEP EACH PLAYED STEP CAME FROM. The strip
 * names its bars from the card as written, and lights them from the steps
 * as played; this is the join.
 * =====================================================================
 */
import { strikeOrder } from '../../lib/player/voices';
import type { PlayAs } from '../../lib/player/settings';
import type { CardSound, SoundStep } from './cardAudio';

export interface SoundInMode {
  sound: CardSound;
  /** For each played step, the index of the written step it came from. */
  origin: readonly number[];
}

/** Steps the same length in total as `beats`, keeping their proportions. */
function fitTo(steps: SoundStep[], beats: number): SoundStep[] {
  const total = steps.reduce((n, s) => n + s.beats, 0);
  if (total === 0) return steps;
  return steps.map(s => ({ ...s, beats: (s.beats * beats) / total }));
}

/** Where the written steps break into pieces a mode reshapes whole. */
function pieces(sound: CardSound): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  const { steps } = sound;
  if (sound.under !== undefined) {
    // ONE PIECE PER CHORD UNDER THE RUN, by where each one's beats end.
    const ends: number[] = [];
    let at = 0;
    for (const u of sound.under) { at += u.beats; ends.push(at); }
    let from = 0;
    let beat = 0;
    let span = 0;
    for (let i = 0; i < steps.length; i += 1) {
      beat += steps[i].beats;
      while (span < ends.length - 1 && beat > ends[span] + 1e-9) span += 1;
      if (beat >= ends[span] - 1e-9 || i === steps.length - 1) {
        out.push({ from, to: i + 1 });
        from = i + 1;
        if (span < ends.length - 1) span += 1;
      }
    }
    return out;
  }
  // A CHORD IS A PIECE ON ITS OWN; single notes in a row are one piece.
  let i = 0;
  while (i < steps.length) {
    if (steps[i].semitones.length > 1) { out.push({ from: i, to: i + 1 }); i += 1; continue; }
    let j = i;
    while (j < steps.length && steps[j].semitones.length <= 1) j += 1;
    out.push({ from: i, to: j });
    i = j;
  }
  return out;
}

/** One chord step, rolled in a run mode inside its own beats. */
function rolled(step: SoundStep, mode: PlayAs): SoundStep[] {
  const order = strikeOrder([...step.semitones].sort((a, b) => a - b), mode);
  return order.map(s => ({ semitones: [s], beats: step.beats / order.length }));
}

export function soundInMode(sound: CardSound, mode: PlayAs): SoundInMode {
  const steps: SoundStep[] = [];
  const origin: number[] = [];
  const push = (list: SoundStep[], from: number[]) => { steps.push(...list); origin.push(...from); };
  const fit = sound.under !== undefined;

  for (const { from, to } of pieces(sound)) {
    const written = sound.steps.slice(from, to);
    const index = written.map((_, k) => from + k);
    const beats = written.reduce((n, s) => n + s.beats, 0);
    const isLine = written.every(s => s.semitones.length <= 1);

    if (!isLine) {
      // A chord, or chords among a run under Modal Improvisation's lane:
      // each chord step rolls or strikes on its own, a note stays a note.
      const played: SoundStep[] = [];
      const from2: number[] = [];
      written.forEach((s, k) => {
        const out = mode === 'together' || s.semitones.length <= 1 ? [s] : rolled(s, mode);
        played.push(...out);
        from2.push(...out.map(() => index[k]));
      });
      push(played, from2);
      continue;
    }

    if (mode === 'up' || written.length <= 1) { push(written, index); continue; }
    if (mode === 'down') { push([...written].reverse(), [...index].reverse()); continue; }
    if (mode === 'upDown') {
      const there = [...written, ...[...written].reverse().slice(1)];
      const where = [...index, ...[...index].reverse().slice(1)];
      push(fit ? fitTo(there, beats) : there, where);
      continue;
    }
    // TOGETHER: every note of the line at once, for as long as it lasted.
    const notes = [...new Set(written.flatMap(s => s.semitones))].sort((a, b) => a - b);
    if (notes.length === 0) { push(written, index); continue; }
    push([{ semitones: notes, beats }], [from]);
  }

  return { sound: { ...sound, steps }, origin };
}

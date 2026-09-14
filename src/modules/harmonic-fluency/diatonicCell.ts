/**
 * Which cell of the chord-qualities chart a Diatonic Chord Qualities
 * card opens on.
 *
 * =====================================================================
 * READ FROM THE QUESTION, WHICH IS PINNED.
 *
 * The ids are not positional (`dq-hm-2` is harmonic minor's 5), and the
 * card's `axis` would put the deck into the progress grid, which nobody
 * asked for. The question is the one place that states the scale and
 * the degree, and `diatonicQualities.test.ts` holds every question to
 * one exact shape — so this reads it, and its own test proves every card
 * lands on a cell whose chord is the card's answer.
 *
 * TWO CARDS ARE NOT "WHAT QUALITY IS THE N CHORD", and are named here:
 * the which-scale card is about harmonic minor's 5, and the triad card
 * about major's 4.
 * =====================================================================
 */
import type { ScaleId } from '../../lib/chordQualitiesByScale';
import type { Flashcard } from './catalog';

const SCALE_BY_NAME: Readonly<Record<string, ScaleId>> = {
  major: 'major',
  'natural minor': 'natural',
  'harmonic minor': 'harmonic',
  'melodic minor': 'melodic',
};

const NOT_A_DEGREE_QUESTION: Readonly<Record<string, { scale: ScaleId; degree: number }>> = {
  'dq-hm-5': { scale: 'harmonic', degree: 5 },
  'dq-extra-1': { scale: 'major', degree: 4 },
};

const DEGREE_QUESTION =
  /^In (major|natural minor|harmonic minor|melodic minor), what quality is the ([1-7]) chord\?$/;

export function diatonicCell(
  card: Pick<Flashcard, 'id' | 'category' | 'question'>,
): { scale: ScaleId; degree: number } | null {
  if (card.category !== 'diatonic-qualities') return null;
  const named = NOT_A_DEGREE_QUESTION[card.id];
  if (named !== undefined) return named;
  const m = card.question.match(DEGREE_QUESTION);
  return m === null ? null : { scale: SCALE_BY_NAME[m[1]], degree: Number(m[2]) };
}

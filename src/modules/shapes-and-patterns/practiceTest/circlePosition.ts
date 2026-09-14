/**
 * Where a Circle of 4ths drill is after `beats` beats, at `per` beats
 * to a key: the index into C F B♭ E♭ A♭ D♭ G♭ B E A D G, and the lap.
 *
 * The first beat is C's, and C is lit before it too: Start is pressed
 * on the way to that beat, not after it. See `CircleOfFourthsRow`.
 */
export function circlePosition(beats: number, per: number): { index: number; lap: number } {
  if (beats <= 0) return { index: 0, lap: 1 };
  const step = Math.floor((beats - 1) / Math.max(1, per));
  return { index: step % 12, lap: Math.floor(step / 12) + 1 };
}

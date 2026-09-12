/**
 * The diary's chord starters and the chord catalog are one list.
 *
 * =====================================================================
 * DEAD STARTER COPY FAILS SILENTLY, WHICH IS WHY THIS IS A TEST.
 *
 * A starter for a chord that no longer exists renders nowhere: no
 * screen asks for it, so nothing throws and nothing looks wrong. When
 * `maj9_13`, `dom9_13` and `min9_11` were retired on 11 Sep 2026 their
 * three starters would have sat in the file indefinitely, describing
 * cards a reader can never meet. The reverse is worse and just as
 * quiet: a chord added to the seed with no starter gives the reader a
 * blank diary entry where every other chord has a sentence.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { allStarters } from '../starters';
import { CHORD_SEEDS } from '../../ear-training/chord-recognition/seed';

const PREFIX = 'chord-recognition:item:';

describe('every chord starter names a chord that exists', () => {
  it('is one starter per seed, and no starter without a seed', () => {
    const starters = allStarters()
      .filter(s => s.skillId.startsWith(PREFIX))
      .map(s => s.skillId.slice(PREFIX.length))
      .sort();
    expect(starters).toEqual([...CHORD_SEEDS.map(c => c.id)].sort());
  });
});

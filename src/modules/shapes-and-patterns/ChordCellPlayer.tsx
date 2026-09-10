/**
 * Hear the chord shape you are about to drill.
 *
 * =====================================================================
 * A REFERENCE, LIKE THE OTHER TWO, AND FOR THE SAME REASON.
 *
 * No attempt, no spacing row, no rating. The same shared panel, so the
 * tempo, the lift, the loop, the colours and the instrument mean here
 * what they mean everywhere else.
 *
 * =====================================================================
 * ONE CHORD, NOT VOICE-LED, AND NO BASS LINE UNDER IT.
 *
 * A cell here is a chord QUALITY in a KEY — C major 7 — and there is
 * nothing before or after it to lead a voice from. So it sounds exactly
 * as the catalog spells it, root position, in the middle of the
 * keyboard, and the inversion chips move it the way the grid's rows do.
 *
 * `QUALITY_INTERVALS` is the catalog's own answer to what a quality is
 * made of, and this reads it rather than keeping a second one.
 * =====================================================================
 */
import { useMemo, useState } from 'react';
import SharedPlayer from '../../components/SharedPlayer';
import { usePlayerSettings } from '../../lib/player/usePlayerSettings';
import { spellNote } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';
import type { PlayerChord } from '../../lib/player/voices';
import { CHORD_QUALITY_BY_ID, KEYS, QUALITY_INTERVALS } from './catalog';

/** Where a single chord sits: the octave above middle C's neighbour. */
const CHORD_BASE = 60;

/** The inversions a chord of N notes has, as labels. */
const INVERSION_LABEL = [
  'Root position', '1st inversion', '2nd inversion', '3rd inversion',
];

export default function ChordCellPlayer({
  quality, keyName,
}: {
  quality: string;
  keyName: string;
}) {
  const [spelling] = useSpelling();
  const [settings, setSettings] = usePlayerSettings();
  const [inversion, setInversion] = useState(0);

  const keyPc = KEYS.indexOf(keyName as never);
  const intervals = QUALITY_INTERVALS[quality];
  const entry = CHORD_QUALITY_BY_ID.get(quality);

  const chords: PlayerChord[] = useMemo(() => {
    if (intervals === undefined || keyPc < 0) return [];
    // ROTATED, NOT RE-VOICED — the note the inversion is named for goes
    // to the bottom and the ones under it go up an octave, which is
    // what an inversion IS.
    const at = Math.min(inversion, intervals.length - 1);
    const rotated = [
      ...intervals.slice(at),
      ...intervals.slice(0, at).map(t => t + 12),
    ];
    const bottom = CHORD_BASE + ((keyPc + rotated[0]) % 12);
    return [{
      hand: rotated.map(t => bottom + (t - rotated[0])),
      // NO BASS LINE. One chord, one hand; a root added underneath
      // would be a voicing the grid does not drill.
      bass: null,
      rootPc: keyPc,
      name: `${spellNote(keyPc, spelling)}${entry?.suffix ?? ''}`,
    }];
  }, [intervals, keyPc, inversion, entry, spelling]);

  if (intervals === undefined || keyPc < 0 || chords.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="chord-cell-player">
      <p className="text-sm font-medium" data-testid="chord-cell-player-title">
        {`${spellNote(keyPc, spelling)} ${entry?.label ?? quality} · `
          + `${INVERSION_LABEL[Math.min(inversion, intervals.length - 1)]}`}
      </p>
      <SharedPlayer
        chords={chords}
        settings={settings}
        onSettings={setSettings}
        compare={(
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
              Compare
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="chord-cell-inversions">
              {intervals.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={i === inversion}
                  data-testid={`chord-inversion-${i}`}
                  onClick={() => setInversion(i)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                    i === inversion
                      ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                      : 'border-black/10 dark:border-white/20'}`}
                >
                  {INVERSION_LABEL[i]}
                </button>
              ))}
            </div>
          </div>
        )}
      >
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          A reference, not a quiz — nothing here is rated. One chord, as the
          catalog spells it, with the inversions one tap away.
        </p>
      </SharedPlayer>
    </div>
  );
}

/**
 * Hear the cell you are about to drill.
 *
 * =====================================================================
 * A REFERENCE, NOT A QUIZ. NOTHING HERE IS RATED.
 *
 * It writes no attempt and no spacing row. Tapping a square to hear
 * what it sounds like is not practice, and a panel that quietly logged
 * one would put a rating on a cell nobody played.
 *
 * =====================================================================
 * THE RUNG IS THE ROW AND IT DOES NOT MOVE.
 *
 * Thickness is part of an item's IDENTITY on this page —
 * `vl:five-one:guide-tones:A:C` and `vl:five-one:seventh-chords:A:C`
 * are two cells with two histories and two ratings — so a ladder that
 * moved between them would change which item you are about to be rated
 * on. The ladder is shown and locked, which says what the row is
 * without offering to leave it.
 *
 * POSITION MOVES ALONG THE ROW ONLY, for the same reason: Position 1
 * and Position 2 of the Seventh Chords row are two cells of that row,
 * and neither of them is on the Guide Tones row.
 *
 * =====================================================================
 * IT PLAYS THE SAME VOICING THE EAR-TRAINING CARD ASKS ABOUT.
 *
 * `passVoicing.voiceEntry` is the one place a pass is placed on the
 * keyboard, and both surfaces call it. What you hear beside the grid is
 * what you are asked to name in Full Progression, and both are what the
 * grid teaches.
 * =====================================================================
 */
import { useMemo, useState } from 'react';
import SharedPlayer from '../../components/SharedPlayer';
import { usePlayerSettings } from '../../lib/player/usePlayerSettings';
import type { Move } from '../../lib/builtAnswers/voiceLeading';
import { useSpelling } from '../../lib/spellingPref';
import { spellKey } from '../../lib/spelling';
import { KEYS } from './catalog';
import {
  RUNG_LABEL, SHARED_PROGRESSION_BY_ID, positionLabel, positionsOf,
} from '../ear-training/chord-progressions/sharedList';
import { voiceEntry } from '../ear-training/chord-progressions/passVoicing';
import { cellForPlayer } from './cellForPlayer';

export default function CellPlayer({ itemRef }: { itemRef: string }) {
  const [spelling] = useSpelling();
  const [settings, setSettings] = usePlayerSettings();
  const [handMoves, setHandMoves] = useState<Move[]>([]);
  const cell = useMemo(() => cellForPlayer(itemRef), [itemRef]);
  /** Which position of the row is sounding. Starts at the cell's own. */
  const [position, setPosition] = useState<number | null>(null);

  const entry = cell === null
    ? undefined
    : SHARED_PROGRESSION_BY_ID.get(cell.entryId);
  const keyPc = cell === null ? 0 : KEYS.indexOf(cell.keyName as never);
  const shown = position ?? cell?.position ?? 1;

  const chords = useMemo(() => (entry === undefined || cell === null
    ? []
    : voiceEntry(entry, keyPc, cell.rung, shown, { handMoves, spelling })),
  [entry, cell, keyPc, shown, handMoves, spelling]);

  if (cell === null || entry === undefined || chords.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="cell-player">
      <p className="text-sm font-medium" data-testid="cell-player-title">
        {`${entry.name} · ${RUNG_LABEL[cell.rung]} · ${positionLabel(shown)} · `
          + `the key of ${spellKey(cell.keyName, spelling)} major`}
      </p>
      <SharedPlayer
        chords={chords}
        orientPc={keyPc}
        settings={settings}
        onSettings={setSettings}
        thickness={{ value: cell.rung, onChange: () => {}, locked: true, rungs: [cell.rung] }}
        handDirection={{
          value: handMoves,
          onChange: setHandMoves,
          effective: chords.slice(1).map((c, i) => (
            (c.hand[0] ?? 0) < (chords[i].hand[0] ?? 0) ? 'down' : 'up')),
        }}
        compare={(
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
              Position
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="cell-player-positions">
              {positionsOf(entry, cell.rung).map(n => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={n === shown}
                  data-testid={`cell-position-${n}`}
                  onClick={() => setPosition(n)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                    n === shown
                      ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                      : 'border-black/10 dark:border-white/20'}`}
                >
                  {positionLabel(n)}
                </button>
              ))}
            </div>
          </div>
        )}
      >
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          A reference, not a quiz — nothing here is rated. The rung is the row
          you tapped and stays put; changing position moves you along that same
          row, so what you hear is always a cell of it.
        </p>
      </SharedPlayer>
    </div>
  );
}

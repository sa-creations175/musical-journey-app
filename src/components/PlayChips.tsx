/**
 * The play buttons: ♪ Together · ♪ Up · ♪ Down · ♪ Up and Down.
 *
 * =====================================================================
 * THE CHIPS ARE THE PLAY BUTTONS (Silas, 14 Sep 2026; walked in
 * `play-as-chips-prototype.html`). A tap plays at once in that mode,
 * lights the chip and remembers it; a tap on the lit chip plays again.
 * There is no Hear it beside them, and no Play as row in a fold.
 *
 * ONE COMPONENT, EVERY SPOT: the shared player's control row, Chord
 * Recognition's question, and Harmonic Fluency's Hear it strip. A surface
 * decides what each mode plays and where the choice is kept; the words,
 * the order and what a tap does are these.
 *
 * `children` sit in the same row after the four, for a surface with one
 * more thing to play — Chord Recognition's ♪ Resolved to major.
 * =====================================================================
 */
import type { ReactNode } from 'react';
import { PLAY_AS_OPTIONS, type PlayAs } from '../lib/player/settings';
import { CHIP, CHIP_OFF, CHIP_ON } from './playerChipStyles';

export default function PlayChips({
  value, onPlay, testIdPrefix = 'player-play', disabled = false, children,
}: {
  /** The lit chip. Null lights none — a strip nobody has played yet. */
  value: PlayAs | null;
  onPlay: (mode: PlayAs) => void;
  /** Distinct per spot, so a screen with two sets can tell them apart. */
  testIdPrefix?: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={`${testIdPrefix}-chips`}>
      {PLAY_AS_OPTIONS.map(o => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          data-testid={`${testIdPrefix}-${o.id}`}
          disabled={disabled}
          onClick={() => onPlay(o.id)}
          className={`${CHIP} ${value === o.id ? CHIP_ON : CHIP_OFF} disabled:opacity-50`}
        >
          <span aria-hidden>♪ </span>
          {o.label}
        </button>
      ))}
      {children}
    </div>
  );
}

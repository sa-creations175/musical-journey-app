/**
 * The app's shared player.
 *
 * =====================================================================
 * ONE PANEL, AND THE FAMILIES BRING WHAT THEY HAVE.
 *
 * Built as one component so ear training and Shapes & Patterns can move
 * onto it in a later commit rather than growing a third and a fourth
 * set of transport controls. What differs between families is which
 * controls they hand it: a chord card has a thickness ladder and a
 * scale card has starting points, and neither knows about the other's.
 *
 * A control with nothing behind it is not rendered. That is the whole
 * of the per-family difference — the tempo, the hand and the layout are
 * this component's, so two families cannot come to disagree about what
 * "up an octave" means.
 *
 * =====================================================================
 * NOTHING AUTOPLAYS, ANYWHERE, EVER.
 *
 * Every sound in this build starts from a tap on this panel. Silas
 * ruled it on 9 Sep and the prototype repeats it in its own notes; a
 * panel that played on mount would make a drill that talks over you.
 * So this component has no effect that starts audio and no `autoPlay`
 * prop to add one.
 *
 * =====================================================================
 * REVEAL-SIDE ONLY, WHICH THE CALLER ENFORCES.
 *
 * Sounding the answer before it is given turns a written question into
 * an ear question — `CardPlayback`'s argument, and it holds here. The
 * callers render nothing until the card is answered; it is said here
 * because this is where the next caller will look.
 * =====================================================================
 */
import type { ReactNode } from 'react';
import { THICKNESSES, type Thickness } from '../lib/builtAnswers/chordShapes';

const CHIP = 'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors';
const CHIP_OFF = 'border-black/10 dark:border-white/20 bg-black/[0.03] '
  + 'dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/10';
const CHIP_ON = 'border-neutral-900 dark:border-neutral-100 bg-neutral-900 '
  + 'text-white dark:bg-neutral-100 dark:text-neutral-900';

function Chip({
  on, onClick, children, testId,
}: {
  on: boolean; onClick: () => void; children: ReactNode; testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-testid={testId}
      onClick={onClick}
      className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** One extra row a family adds — the scale cards' starting points. */
export interface PlayItChoice<T extends string | number> {
  label: string;
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}

export interface PlayItPanelProps {
  bpm: number;
  onBpm: (bpm: number) => void;
  octaveUp: boolean;
  onOctaveUp: (up: boolean) => void;
  /** The thickness ladder. Chord cards only — omit on a scale card. */
  thickness?: { value: Thickness; onChange: (t: Thickness) => void };
  /** Anything else the family offers, above the buttons. */
  choices?: ReadonlyArray<PlayItChoice<never>>;
  /** The whole thing, in order. */
  onPlay?: () => void;
  /** The one chord being looked at. */
  onHearChord?: () => void;
  /** Stop whatever is sounding. Shown only while something is. */
  onStop?: (() => void) | null;
  /** What is about to sound, in words — the chord names change with the
   *  thickness, so a reader can see what each rung means. */
  names?: string;
  children?: ReactNode;
}

/** The tempo range the slider offers, and the prototype's default. */
export const BPM_MIN = 40;
export const BPM_MAX = 140;

export default function PlayItPanel({
  bpm, onBpm, octaveUp, onOctaveUp, thickness, choices,
  onPlay, onHearChord, onStop, names, children,
}: PlayItPanelProps) {
  return (
    <div
      className="space-y-3 rounded-xl border border-black/[0.07] dark:border-white/10 p-3"
      data-testid="play-it-panel"
    >
      <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
        Play it
      </div>

      {thickness !== undefined && (
        <Row label="Thickness">
          {THICKNESSES.map(t => (
            <Chip
              key={t.id}
              on={thickness.value === t.id}
              testId={`thickness-${t.id}`}
              onClick={() => thickness.onChange(t.id)}
            >
              {t.label}
            </Chip>
          ))}
        </Row>
      )}

      {(choices ?? []).map(choice => (
        <Row key={choice.label} label={choice.label}>
          {choice.options.map(o => (
            <Chip
              key={String(o.id)}
              on={choice.value === o.id}
              testId={`choice-${String(o.id)}`}
              onClick={() => choice.onChange(o.id)}
            >
              {o.label}
            </Chip>
          ))}
        </Row>
      ))}

      <Row label="Tempo and register">
        <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <input
            type="range"
            min={BPM_MIN}
            max={BPM_MAX}
            value={bpm}
            data-testid="tempo"
            aria-label="Tempo in beats per minute"
            onChange={e => onBpm(Number(e.target.value))}
            className="w-28 align-middle"
          />
          <span className="font-mono tabular-nums text-neutral-700 dark:text-neutral-200">
            {bpm}
          </span>
          bpm
        </label>
        <Chip on={!octaveUp} testId="hand-written" onClick={() => onOctaveUp(false)}>
          Hand as written
        </Chip>
        <Chip on={octaveUp} testId="hand-up" onClick={() => onOctaveUp(true)}>
          Hand up an octave
        </Chip>
      </Row>

      {names !== undefined && (
        <div className="font-mono text-sm" data-testid="play-it-names">{names}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {onPlay !== undefined && (
          <button
            type="button"
            data-testid="play-it-hear"
            onClick={onPlay}
            className={`${CHIP} ${CHIP_OFF}`}
          >
            Hear it
          </button>
        )}
        {onHearChord !== undefined && (
          <button
            type="button"
            data-testid="play-it-hear-chord"
            onClick={onHearChord}
            className={`${CHIP} ${CHIP_OFF}`}
          >
            Hear chord
          </button>
        )}
        {onStop !== undefined && onStop !== null && (
          <button
            type="button"
            data-testid="play-it-stop"
            onClick={onStop}
            className={`${CHIP} ${CHIP_OFF}`}
          >
            Stop
          </button>
        )}
      </div>

      {children}
    </div>
  );
}

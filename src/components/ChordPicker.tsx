/**
 * One picker, every family that builds its answer.
 *
 * =====================================================================
 * THE PARTS, TOP TO BOTTOM, AND WHAT MAY DIFFER.
 *
 * A letter row, a keyboard, a quality row, a layout row, an inversion
 * row and a clear. Six families use it and the ONLY thing allowed to
 * differ between them is WHICH ROWS ARE SHOWN — a row is hidden by
 * passing no options for it. Everything else is this component's, so
 * two families cannot come to disagree about what tapping a letter
 * does.
 *
 *   progression   letters, keyboard, quality, layout, inversion, clear
 *   slash         letters, keyboard, quality, inversion, clear (twice:
 *                 one row for the chord, one for the note under it)
 *   pentatonic    keyboard only — the board IS the answer
 *   relative key  letters and keyboard, one tap
 *
 * =====================================================================
 * THE LETTER ROW IS THE PROTOTYPE'S, NOT THE BRIEF'S.
 *
 * `docs/built-answers-prototype_1.html` offers seven letters and a ♭
 * and a ♯; the brief describes twelve chromatic tiles with both
 * spellings on the black ones. The prototype wins where they disagree,
 * and it is also the row that can express E♯ and C♭ — which the deck
 * asks for in the key of F♯ major and the key of G♭ major.
 *
 * WHAT IS TAKEN FROM THE BRIEF is the spelling rule: a tap on the
 * KEYBOARD is named the way the card's key would name it, so tapping
 * one black key gives A♭ in the key of E♭ major and G♯ in the key of B
 * major. The prototype named every black key flat.
 *
 * =====================================================================
 * IT HOLDS NO STATE AND JUDGES NOTHING.
 *
 * The pick, the quality and the inversion are the caller's, because the
 * caller is the one that knows how many chords there are and which one
 * is being edited. Marks on the keyboard are the caller's too: they
 * come from the voicing engine, and a picker that computed them would
 * be a picker that knew about voice leading.
 * =====================================================================
 */
import { useState } from 'react';
import BuiltAnswerKeyboard from './BuiltAnswerKeyboard';
import type { KeyMark } from '../lib/builtAnswers/board';
import type { Quality, QualityId } from '../lib/builtAnswers/chordShapes';
import {
  ACC_GLYPH, PICKER_LETTERS, type InversionOption, type RootPick,
} from '../lib/builtAnswers/rootPick';

interface Row<T> {
  options: ReadonlyArray<T>;
  /** The word above the row. */
  label: string;
}

export interface ChordPickerProps {
  /** Marks on the board, from the caller's voicing. */
  marks: ReadonlyMap<number, KeyMark>;
  /** A tap on the board, as MIDI. Absent makes the board a picture. */
  onTapKey?: (midi: number) => void;
  keyboardLabel: string;

  /** The letter row. Omit to hide it — the pentatonic cards have no
   *  letter row, because the keyboard is the answer. */
  root?: {
    pick: RootPick | null;
    onPick: (pick: RootPick | null) => void;
    label: string;
  };

  /**
   * A SECOND letter row, for the note under a slash chord.
   *
   * On the brief's allowed-difference list, and declared here rather
   * than assembled by the caller so both rows behave the same way: a
   * bottom note picked by tapping a letter and one picked by tapping a
   * key in the bass octave are the same pick.
   */
  bass?: {
    pick: RootPick | null;
    onPick: (pick: RootPick | null) => void;
    label: string;
  };

  quality?: Row<Quality> & {
    value: QualityId | null;
    onChange: (q: QualityId | null) => void;
    /** Qualities that cannot be chosen right now, greyed rather than
     *  removed so the row does not change length under the finger. */
    disabled?: ReadonlyArray<QualityId>;
  };

  layout?: Row<{ id: string; label: string }> & {
    value: string;
    onChange: (id: string) => void;
    disabled?: ReadonlyArray<string>;
  };

  inversion?: Row<InversionOption> & {
    value: number;
    onChange: (n: number) => void;
    /** How many the current quality has. A triad has three, so the
     *  3rd is greyed rather than hidden. */
    count: number;
  };

  /** Extra controls the family adds under the rows. */
  children?: React.ReactNode;
}

const CHIP = 'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors';
const CHIP_OFF = 'border-black/10 dark:border-white/20 bg-black/[0.03] '
  + 'dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/10';
const CHIP_ON = 'border-neutral-900 dark:border-neutral-100 bg-neutral-900 '
  + 'text-white dark:bg-neutral-100 dark:text-neutral-900';
const CHIP_DEAD = 'opacity-40 cursor-default';

function Chip({
  on, disabled, onClick, children, testId,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled === true}
      data-testid={testId}
      onClick={() => { if (disabled !== true) onClick(); }}
      className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF} ${disabled === true ? CHIP_DEAD : ''}`}
    >
      {children}
    </button>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
      {children}
    </div>
  );
}

/**
 * The letter row.
 *
 * =====================================================================
 * THE ACCIDENTAL CHIPS DO TWO THINGS, AND WHICH ONE DEPENDS ON WHETHER
 * A LETTER IS ALREADY PICKED.
 *
 * With no pick, ♭ ARMS: the next letter tapped comes out flat. With a
 * pick, ♭ TOGGLES it: the pick becomes flat, or natural again if it
 * already was. That is the prototype's behaviour and it is the one that
 * lets a reader correct a pick without starting over.
 *
 * The armed state is deliberately not held here — it is derived from
 * the caller's pick plus one piece of local state, so a re-render
 * cannot leave a chip lit with nothing armed.
 * =====================================================================
 */
function LetterRow({
  pick, onPick, armed, setArmed,
}: {
  pick: RootPick | null;
  onPick: (p: RootPick | null) => void;
  armed: -1 | 0 | 1;
  setArmed: (a: -1 | 0 | 1) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="letter-row">
      {PICKER_LETTERS.map(letter => {
        const on = pick !== null && pick.letter === letter;
        return (
          <Chip
            key={letter}
            on={on}
            testId={`letter-${letter}`}
            onClick={() => {
              // Tapping the picked letter again, with nothing armed,
              // clears it — the prototype's own rule.
              if (on && armed === 0 && pick.acc === 0) onPick(null);
              else onPick({ letter, acc: armed });
              setArmed(0);
            }}
          >
            {letter}
            {on ? ACC_GLYPH[pick.acc] : ''}
          </Chip>
        );
      })}
      <span className="w-2" aria-hidden />
      {([-1, 1] as const).map(acc => (
        <Chip
          key={acc}
          on={pick === null ? armed === acc : pick.acc === acc}
          testId={acc === -1 ? 'accidental-flat' : 'accidental-sharp'}
          onClick={() => {
            if (pick !== null) onPick({ letter: pick.letter, acc: pick.acc === acc ? 0 : acc });
            else setArmed(armed === acc ? 0 : acc);
          }}
        >
          {ACC_GLYPH[acc]}
        </Chip>
      ))}
    </div>
  );
}

export default function ChordPicker({
  marks, onTapKey, keyboardLabel, root, bass, quality, layout, inversion,
  children,
}: ChordPickerProps) {
  return (
    <div className="space-y-3" data-testid="chord-picker">
      {root !== undefined && (
        <div className="space-y-1.5">
          <RowLabel>{root.label}</RowLabel>
          <LetterRowHost pick={root.pick} onPick={root.onPick} />
        </div>
      )}

      {bass !== undefined && (
        <div className="space-y-1.5" data-testid="bass-row">
          <RowLabel>{bass.label}</RowLabel>
          <LetterRowHost pick={bass.pick} onPick={bass.onPick} />
        </div>
      )}

      {quality !== undefined && (
        <div className="space-y-1.5">
          <RowLabel>{quality.label}</RowLabel>
          <div className="flex flex-wrap gap-1.5" data-testid="quality-row">
            {quality.options.map(q => (
              <Chip
                key={q.id}
                on={quality.value === q.id}
                disabled={quality.disabled?.includes(q.id)}
                testId={`quality-${q.id === '' ? 'major' : q.id}`}
                onClick={() => quality.onChange(quality.value === q.id ? null : q.id)}
              >
                {q.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {layout !== undefined && (
        <div className="space-y-1.5">
          <RowLabel>{layout.label}</RowLabel>
          <div className="flex flex-wrap gap-1.5" data-testid="layout-row">
            {layout.options.map(o => (
              <Chip
                key={o.id}
                on={layout.value === o.id}
                disabled={layout.disabled?.includes(o.id)}
                testId={`layout-${o.id}`}
                onClick={() => layout.onChange(o.id)}
              >
                {o.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {inversion !== undefined && (
        <div className="space-y-1.5">
          <RowLabel>{inversion.label}</RowLabel>
          <div className="flex flex-wrap gap-1.5" data-testid="inversion-row">
            {inversion.options.map(o => (
              <Chip
                key={o.id}
                on={inversion.value === o.id}
                // A TRIAD HAS NO 3RD INVERSION, and the chip is greyed
                // rather than removed so the row does not change
                // length under the finger when the quality changes.
                disabled={o.id >= inversion.count}
                testId={`inversion-${o.id}`}
                onClick={() => inversion.onChange(o.id)}
              >
                {o.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <BuiltAnswerKeyboard marks={marks} onTap={onTapKey} label={keyboardLabel} />

      {children}
    </div>
  );
}

/**
 * The armed accidental, held next to the row that uses it.
 *
 * It is the one piece of state this component owns, and it owns it
 * because it is about a gesture in progress rather than about the
 * answer: nothing outside the row can tell whether a ♭ has been armed,
 * and nothing outside it needs to.
 */
function LetterRowHost({
  pick, onPick,
}: {
  pick: RootPick | null;
  onPick: (p: RootPick | null) => void;
}) {
  const [armed, setArmed] = useState<-1 | 0 | 1>(0);
  return (
    <LetterRow
      pick={pick}
      onPick={p => { onPick(p); }}
      armed={armed}
      setArmed={setArmed}
    />
  );
}

/**
 * Spell the chord: tap its notes, then Check.
 *
 * =====================================================================
 * THE KEYBOARD IS THE ANSWER (Silas, 14 Sep 2026; walked on tab 2 of
 * `hf-restructure-walk.html`). "In the key of F major, build the 7 chord."
 * Tap a key to add it, tap it again to take it away, in any order and in
 * any octave. Check grades the pitch classes: the right four, nothing
 * extra — `gradeSpell`.
 *
 * A WRONG ANSWER SHOWS ITS OWN MISTAKE, as the prototype does: the keys
 * pressed turn green where they belong to the chord and red where they do
 * not, and the notes that were missed light amber on the chord's place.
 *
 * THE REVEAL PLAYS THROUGH THE SHARED PLAYER'S CHIPS, the one component
 * every sounding surface uses. Its own board is off: this keyboard above
 * already shows the chord.
 * =====================================================================
 */
import { useMemo, useState } from 'react';
import BuiltAnswerKeyboard from '../../../components/BuiltAnswerKeyboard';
import SharedPlayer from '../../../components/SharedPlayer';
import type { KeyMark } from '../../../lib/builtAnswers/board';
import { playOneChord } from '../../../lib/builtAnswers/play';
import type { PlaybackHandle } from '../../../lib/musicalPlayback';
import { usePlayerSettings } from '../../../lib/player/usePlayerSettings';
import type { Flashcard } from '../catalog';
import type { BuiltTarget } from './cardTargets';
import { gradeSpell, spellInKey } from './grade';

const BTN = 'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors '
  + 'disabled:opacity-40 disabled:cursor-default';
const BTN_PRIMARY = `${BTN} border-neutral-900 bg-neutral-900 text-white `
  + 'dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900';
const BTN_PLAIN = `${BTN} border-black/10 dark:border-white/20 `
  + 'hover:bg-black/[0.04] dark:hover:bg-white/10';

/** The prototype's three: a note that belongs, one that does not, one missed. */
const RIGHT = '#1D9E75';
const WRONG = '#C4503F';
const MISSED = '#B98A1E';

/** The prototype's words under the board, before anything is tapped. */
const EMPTY = "Tap the chord's notes, lowest first or in any order.";

export default function SpellAnswer({
  card, target, answered, answer,
}: {
  card: Flashcard;
  target: Extract<BuiltTarget, { kind: 'spell' }>;
  answered: boolean;
  answer: (choice: string) => void;
}) {
  const [taps, setTaps] = useState<number[]>([]);
  const [settings, setSettings] = usePlayerSettings();
  const [hearing, setHearing] = useState<PlaybackHandle | null>(null);

  const marks = useMemo(() => {
    const out = new Map<number, KeyMark>();
    if (!answered) {
      for (const midi of taps) out.set(midi, { pressed: true });
      return out;
    }
    const want = new Set(target.pcs);
    const got = new Set(taps.map(m => m % 12));
    for (const midi of taps) out.set(midi, { fill: want.has(midi % 12) ? RIGHT : WRONG });
    for (const midi of target.voicing) {
      if (!got.has(midi % 12)) out.set(midi, { fill: MISSED });
    }
    return out;
  }, [answered, taps, target.pcs, target.voicing]);

  const picked = taps.length === 0
    ? EMPTY
    : [...taps].sort((a, b) => a - b).map(m => spellInKey(m % 12, target.keyName)).join(' · ');

  const check = () => {
    const grade = gradeSpell(target, taps);
    hearing?.stop();
    answer(grade.correct ? card.correctAnswer : grade.built);
  };

  const hearWhatIBuilt = () => {
    if (taps.length === 0) return;
    hearing?.stop();
    const hand = [...taps].sort((a, b) => a - b);
    void playOneChord({ hand, bass: null, rootPc: hand[0] % 12 }, { bpm: settings.bpm })
      .then(setHearing)
      .catch(() => {});
  };

  return (
    <div className="space-y-3" data-testid="spell-answer">
      <BuiltAnswerKeyboard
        marks={marks}
        label="Tap the notes of the chord"
        {...(answered ? {} : {
          onTap: (midi: number) => setTaps(prev => (prev.includes(midi)
            ? prev.filter(m => m !== midi)
            : [...prev, midi])),
        })}
      />
      <div
        className={`font-mono text-sm ${taps.length === 0 ? 'text-neutral-400' : ''}`}
        data-testid="spell-picked"
      >
        {picked}
      </div>
      {!answered && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN_PRIMARY} data-testid="submit" disabled={taps.length === 0} onClick={check}>
            Check
          </button>
          <button type="button" className={BTN_PLAIN} data-testid="spell-clear" onClick={() => setTaps([])}>
            Clear
          </button>
          <button
            type="button"
            className={BTN_PLAIN}
            data-testid="spell-hear-built"
            disabled={taps.length === 0}
            onClick={hearWhatIBuilt}
          >
            ♪ Hear what I built
          </button>
        </div>
      )}
      {answered && (
        <SharedPlayer
          chords={[{ hand: target.voicing, bass: null, rootPc: target.rootPc, name: target.name }]}
          settings={settings}
          onSettings={setSettings}
          board={false}
        />
      )}
    </div>
  );
}

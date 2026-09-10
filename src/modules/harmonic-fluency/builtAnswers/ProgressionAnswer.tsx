/**
 * Build the progression, chord by chord.
 *
 * =====================================================================
 * FOUR OPTIONS ANSWERED THIS CARD WITHOUT KNOWING THE CHORDS.
 *
 * "The 2 5 1 in the key of B♭ major is _____" offered Cm7 - F7 - B♭maj7
 * against three near misses, and a reader could get there by noticing
 * which option started on the right letter. Building it means naming
 * every root and every quality, which is the skill the card is for.
 *
 * =====================================================================
 * WHAT IS GRADED AND WHAT IS FOR THE EAR.
 *
 * The grade is roots and families — `grade.ts` says so at length. The
 * layout row and the inversion row are NOT graded and exist so the
 * reader hears the voicing they would actually play; the keyboard shows
 * exactly the chord they chose, nothing added.
 *
 * =====================================================================
 * NOTHING SOUNDS UNTIL IT IS TAPPED, AND NOTHING SOUNDS BEFORE SUBMIT
 * EXCEPT FROM A HEAR BUTTON.
 *
 * Taps are silent. `Hear chord` plays the slot being edited and
 * `Hear all` the chords in order once every slot is filled; both are
 * buttons, and Submit only grades. That is Silas's no-autoplay rule and
 * the prototype's own note.
 *
 * =====================================================================
 * THE REVEAL IS THE CARD'S PROGRESSION, NOT THE READER'S.
 *
 * Once the shell says the card is answered, everything drawn and
 * everything played is the card's own chords. A reader who comes back
 * to the card with Previous sees the right answer rather than a
 * half-remembered attempt, and the local build state is only ever the
 * thing being submitted.
 * =====================================================================
 */
import { useEffect, useMemo, useState } from 'react';
import type { PlaybackHandle } from '../../../lib/musicalPlayback';
import ChordPicker from '../../../components/ChordPicker';
import {
  INVERSIONS, type RootPick, pickFromPitchClass, rootLabel, rootPitchClass,
} from '../../../lib/builtAnswers/rootPick';
import {
  NINTH_OF, QUALITIES, TRIAD_OF, VOICINGS,
  type QualityId, type Thickness, type Voicing,
  hasBass, handTones, inversionCount, hasSeventh,
} from '../../../lib/builtAnswers/chordShapes';
import { voiceAll } from '../../../lib/builtAnswers/voiceLeading';
import { chordMarks } from '../../../lib/builtAnswers/marks';
import { DEFAULT_BPM, playChords, playOneChord } from '../../../lib/builtAnswers/play';
import type { Flashcard } from '../catalog';
import type { BuiltTarget } from './cardTargets';
import {
  gradeProgression, keySpelling, spellInKey, type BuiltChord,
} from './grade';
import PlayItPanel from '../../../components/PlayItPanel';

/** One slot: the root as the picker holds it, and the quality. */
interface Slot { pick: RootPick | null; quality: QualityId | null }

const EMPTY: Slot = { pick: null, quality: null };

const BTN = 'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors '
  + 'disabled:opacity-40 disabled:cursor-default';
const BTN_PRIMARY = `${BTN} border-neutral-900 bg-neutral-900 text-white `
  + 'dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900';
const BTN_PLAIN = `${BTN} border-black/10 dark:border-white/20 `
  + 'hover:bg-black/[0.04] dark:hover:bg-white/10';

export default function ProgressionAnswer({
  card, target, answered, answer,
}: {
  card: Flashcard;
  target: Extract<BuiltTarget, { kind: 'progression' }>;
  answered: boolean;
  answer: (choice: string) => void;
}) {
  const count = target.chords.length;
  const [slots, setSlots] = useState<Slot[]>(() => target.chords.map(() => EMPTY));
  const [cur, setCur] = useState(0);
  const [inversion, setInversion] = useState(0);
  const [layout, setLayout] = useState<Voicing>('both');
  const [message, setMessage] = useState<string | null>(null);
  const [playing, setPlaying] = useState<PlaybackHandle | null>(null);
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [octaveUp, setOctaveUp] = useState(false);
  /**
   * The rung the player is on, once the card is answered.
   *
   * IT OPENS ON "SEVENTH CHORDS", which is the reading the card's own
   * answer gives — a 2 5 1 is Cm7 F7 B♭maj7 — so the first thing a
   * reader hears is the chords they were just marked on.
   */
  const [thickness, setThickness] = useState<Thickness>('seventh');
  /** Which chord is sounding, so the board can follow the player. */
  const [lit, setLit] = useState<number | null>(null);

  // Stop on unmount, so leaving a card mid-playback leaves nothing
  // ringing — the rule `CardPlayback` already follows.
  useEffect(() => () => { playing?.stop(); }, [playing]);

  const built: BuiltChord[] = slots.map(s => ({
    rootPc: s.pick === null ? null : rootPitchClass(s.pick),
    quality: s.quality,
  }));
  const complete = built.every(c => c.rootPc !== null && c.quality !== null);

  /**
   * The quality each chord is PLAYED at, once the player is driving.
   *
   * THE LADDER CHANGES THE CHORD, NOT ONLY THE VOICING. "Triads" plays
   * C where the card says Cmaj7 and "full voicing" plays Cmaj9 — and
   * the names under the panel change with it, so a reader can see what
   * each rung means. `TRIAD_OF` and `NINTH_OF` are the only two moves;
   * every other rung keeps the card's own quality and changes how much
   * of it the hand takes.
   */
  const played: QualityId[] = useMemo(() => target.chords.map(c => (
    thickness === 'triads' ? TRIAD_OF[c.quality] ?? c.quality
      : thickness === 'full' ? NINTH_OF[c.quality] ?? c.quality
        : c.quality)), [target.chords, thickness]);

  /** The chords drawn and played: the reader's while building, the
   *  card's once it is answered. */
  const chords = useMemo(() => (answered
    ? target.chords.map((c, i) => ({
      rootPc: c.rootPc, tones: handTones(played[i], thickness),
    }))
    : built.map(c => (c.rootPc === null || c.quality === null
      ? null
      : { rootPc: c.rootPc, tones: handTones(c.quality, layout) }))),
  [answered, target.chords, played, built, layout, thickness]);

  const voiced = useMemo(
    () => voiceAll(chords, {
      bass: hasBass(answered ? thickness : layout),
      inversion,
    }),
    [chords, layout, thickness, answered, inversion],
  );

  const shown = answered ? (lit ?? 0) : cur;
  const marks = chordMarks(voiced[shown] ?? null, { octaveUp });

  const stop = () => { playing?.stop(); setPlaying(null); };
  const start = (make: () => Promise<PlaybackHandle>) => {
    stop();
    void make().then(setPlaying).catch(() => {});
  };

  const hearChord = () => {
    const v = voiced[shown];
    if (v === null || v === undefined) return;
    start(() => playOneChord(v, { bpm, octaveUp }));
  };

  const hearAll = () => {
    const all = voiced.filter((v): v is NonNullable<typeof v> => v !== null);
    if (all.length !== count) return;
    start(() => playChords(all, {
      bpm, octaveUp, orientPc: target.keyPc, onStep: i => setLit(i),
    }));
  };

  const submit = () => {
    const empty = built.findIndex(c => c.rootPc === null || c.quality === null);
    if (empty >= 0) {
      setMessage(`Chord ${empty + 1} needs a root and a quality.`);
      return;
    }
    const grade = gradeProgression(target, built);
    setMessage(null);
    setLit(0);
    answer(grade.correct ? card.correctAnswer : grade.built);
  };

  const setSlot = (patch: Partial<Slot>) => {
    if (answered) return;
    setSlots(prev => prev.map((s, i) => (i === cur ? { ...s, ...patch } : s)));
    setMessage(null);
  };

  const slot = slots[cur] ?? EMPTY;
  const quality = slot.quality;
  const triad = quality !== null && !hasSeventh(quality);

  return (
    <div className="space-y-3" data-testid="progression-answer">
      {/* THE SLOTS ARE THE ANSWER, and any of them can be edited until
          Submit — tapping one moves the picker to it. */}
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
          Your chords, in order
        </div>
        <div className="flex flex-wrap gap-2" data-testid="slots">
          {slots.map((s, i) => {
            const filled = s.pick !== null && s.quality !== null;
            const text = answered
              ? target.chords[i].name
              : s.pick === null
                ? `chord ${i + 1}`
                : `${rootLabel(s.pick)}${s.quality ?? ''}`;
            return (
              <button
                key={i}
                type="button"
                data-testid={`slot-${i}`}
                aria-current={!answered && i === cur}
                disabled={answered}
                onClick={() => { setCur(i); setMessage(null); }}
                className={`rounded-lg px-3 py-1.5 font-mono text-sm ${
                  filled || answered
                    ? 'border border-black/20 dark:border-white/25'
                    : 'border border-dashed border-black/15 dark:border-white/20 text-neutral-400'
                } ${!answered && i === cur ? 'ring-2 ring-info' : ''}`}
              >
                {text}
              </button>
            );
          })}
        </div>
      </div>

      <ChordPicker
        marks={marks}
        keyboardLabel={`Build the chords of ${card.categoryName}`}
        {...(answered ? {} : { onTapKey: (midi: number) => setSlot({ pick: pickFromPitchClass(midi % 12, keySpelling(target.keyName)) }) })}
        {...(answered ? {} : {
          root: {
            pick: slot.pick,
            onPick: (pick: RootPick | null) => setSlot({ pick }),
            label: 'Root',
          },
          quality: {
            label: 'Quality',
            options: QUALITIES,
            value: quality,
            onChange: (q: QualityId | null) => setSlot({ quality: q }),
          },
          layout: {
            label: 'Voicing',
            options: VOICINGS.map(v => ({ id: v.id, label: v.label })),
            value: layout,
            // A TRIAD HAS NO ROOTLESS FORM — there is no seventh to
            // build the hand on, so the chip is greyed rather than
            // silently doing nothing.
            disabled: triad ? ['rootless'] : [],
            onChange: (id: string) => {
              setLayout(id as Voicing);
              setInversion(0);
            },
          },
          inversion: {
            label: "First chord's shape (the rest follow by voice leading)",
            options: INVERSIONS,
            value: inversion,
            count: quality === null ? 4 : inversionCount(quality),
            onChange: setInversion,
          },
        })}
      />

      {!answered && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BTN_PLAIN}
              disabled={cur >= count - 1}
              onClick={() => setCur(c => Math.min(c + 1, count - 1))}
            >
              Next chord
            </button>
            <button
              type="button"
              className={BTN_PLAIN}
              data-testid="hear-chord"
              disabled={slot.pick === null || slot.quality === null}
              onClick={hearChord}
            >
              Hear chord
            </button>
            <button
              type="button"
              className={BTN_PLAIN}
              data-testid="hear-all"
              disabled={!complete}
              onClick={hearAll}
            >
              Hear all
            </button>
            <button
              type="button"
              className={BTN_PLAIN}
              onClick={() => setSlot({ pick: null, quality: null })}
            >
              Clear chord
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN_PRIMARY} data-testid="submit" onClick={submit}>
              Submit
            </button>
            <button
              type="button"
              className={BTN_PLAIN}
              onClick={() => {
                setSlots(target.chords.map(() => EMPTY));
                setCur(0);
                setMessage(null);
              }}
            >
              Start over
            </button>
          </div>
          {message !== null && (
            <p className="text-xs text-needswork" data-testid="picker-message">{message}</p>
          )}
        </>
      )}

      {answered && (
        <PlayItPanel
          bpm={bpm}
          onBpm={setBpm}
          octaveUp={octaveUp}
          onOctaveUp={setOctaveUp}
          thickness={{ value: thickness, onChange: setThickness }}
          onPlay={hearAll}
          onHearChord={hearChord}
          onStop={playing === null ? null : stop}
          names={target.chords.map((c, i) => (
            thickness === 'bass'
              ? spellInKey(c.rootPc, target.keyName)
              : `${spellInKey(c.rootPc, target.keyName)}${played[i]}`
          )).join(' - ')}
        >
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {'A single low tonic in the key of '
              + `${target.keyName} major to orient, then the chords in order. `
              + 'Each rung adds a note, and the names change to match what '
              + 'is sounding.'}
          </p>
        </PlayItPanel>
      )}
    </div>
  );
}

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
import { progressionRow } from '../../../lib/progressionRow';
import { useProgressionSpelling } from '../../../lib/progressionSpelling';
import {
  NINTH_OF, TRIAD_OF, VOICINGS, qualityTilesFor,
  type QualityId, type Thickness, type Voicing,
  hasBass, handTones, inversionCount, hasSeventh,
} from '../../../lib/builtAnswers/chordShapes';
import { voiceAll, type Move } from '../../../lib/builtAnswers/voiceLeading';
import { chordMarks } from '../../../lib/builtAnswers/marks';
import { playOneChord, playPanel } from '../../../lib/builtAnswers/play';
import { usePlayerSettings } from '../../../lib/player/usePlayerSettings';
import type { PlayerChord } from '../../../lib/player/voices';
import type { Flashcard } from '../catalog';
import type { BuiltTarget } from './cardTargets';
import {
  gradeProgression, keySpelling, spellInKey, type BuiltChord,
} from './grade';
import SharedPlayer from '../../../components/SharedPlayer';

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
  /** The quality tiles this card offers. */
  const tiles = qualityTilesFor(target.chords.map(c => c.quality));
  const [slots, setSlots] = useState<Slot[]>(() => target.chords.map(() => EMPTY));
  const [cur, setCur] = useState(0);
  const [inversion, setInversion] = useState(0);
  const [layout, setLayout] = useState<Voicing>('both');
  const [message, setMessage] = useState<string | null>(null);
  const [playing, setPlaying] = useState<PlaybackHandle | null>(null);
  /**
   * The panel's settings. Tempo, the lift, the hands, the loop and the
   * colours all live here now rather than as four `useState`s per
   * family — the shared player owns them, so a reader meets one set of
   * words on every screen that makes a sound.
   */
  const [settings, setSettings] = usePlayerSettings();
  /** Which way the bass and the right hand move between chords.
   *  `'auto'` until the reader taps an arrow. */
  const [bassMoves, setBassMoves] = useState<Move[]>([]);
  const [handMoves, setHandMoves] = useState<Move[]>([]);
  /**
   * The rung the player is on, once the card is answered.
   *
   * IT OPENS ON "SEVENTH CHORDS", which is the reading the card's own
   * answer gives — a 2 5 1 is Cm7 F7 B♭maj7 — so the first thing a
   * reader hears is the chords they were just marked on.
   */
  const [thickness, setThickness] = useState<Thickness>('seventh');
  const [rowSpelling] = useProgressionSpelling();
  /**
   * How many doors along the progression is entered.
   *
   * THE SAME CHORDS, FROM A DIFFERENT ONE. A 1 5 6 4 rotated once is a
   * 5 6 4 1 — four entry points into one loop, which is the fact `pr-9`
   * teaches and the thing a reader cannot hear from a card that only
   * ever starts on the 1.
   *
   * It is a PLAYER setting and not an answer: nothing about the grade
   * or the slots moves with it, and it starts at zero on every card
   * because the surface is remounted per card.
   */
  const [rotation, setRotation] = useState(0);
  /** Whether the other version is the one selected. */
  const [otherVersion, setOtherVersion] = useState(false);
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
  /**
   * The card's chords as the player is set to play them: the other
   * version if it is chosen, then rotated, then thickened.
   *
   * THE ORDER OF THOSE THREE IS THE WHOLE OF IT.
   *
   * The VERSION goes first, because it changes which chord is there —
   * the 6 becomes a dominant before anything asks how thick to play it.
   *
   * The ROTATION goes second, because it only reorders. Rotating first
   * would mean the version's index pointed at whichever chord had
   * moved into that slot, and "the 6 as a dominant" would become "the
   * second chord, whatever it is".
   *
   * The LADDER goes last, and that is what makes the brief's rule fall
   * out rather than be written: "triads" plays the dominant as a plain
   * major triad because `TRIAD_OF['7']` is a major triad, and sevenths
   * and above leave it a 7.
   */
  const shownChords = useMemo(() => {
    const withVersion = target.chords.map((c, i) => (
      otherVersion && target.variation !== undefined && target.variation.index === i
        ? { ...c, quality: target.variation.quality }
        : c));
    const turns = rotation % withVersion.length;
    return [...withVersion.slice(turns), ...withVersion.slice(0, turns)];
  }, [target.chords, target.variation, otherVersion, rotation]);

  const played: QualityId[] = useMemo(() => shownChords.map(c => (
    thickness === 'triads' ? TRIAD_OF[c.quality] ?? c.quality
      : thickness === 'full' ? NINTH_OF[c.quality] ?? c.quality
        : c.quality)), [shownChords, thickness]);

  /** The chords drawn and played: the reader's while building, the
   *  card's once it is answered. */
  const chords = useMemo(() => (answered
    ? shownChords.map((c, i) => ({
      rootPc: c.rootPc, tones: handTones(played[i], thickness),
    }))
    : built.map(c => (c.rootPc === null || c.quality === null
      ? null
      : { rootPc: c.rootPc, tones: handTones(c.quality, layout) }))),
  [answered, shownChords, played, built, layout, thickness]);

  const voiced = useMemo(
    () => voiceAll(chords, {
      bass: hasBass(answered ? thickness : layout),
      inversion,
      moves: bassMoves,
      handMoves,
    }),
    [chords, layout, thickness, answered, inversion, bassMoves, handMoves],
  );

  /**
   * Where the chord the two versions disagree about sits, after
   * rotation. Zero when the progression has no other version, which is
   * the chord the board opens on anyway.
   */
  const versionSlot = target.variation === undefined
    ? 0
    : (target.variation.index - (rotation % target.chords.length)
      + target.chords.length) % target.chords.length;

  const shown = answered ? (lit ?? 0) : cur;
  const marks = chordMarks(voiced[shown] ?? null, { octaveUp: settings.octaveUp });

  /** The chords as the shared player takes them: voiced, and named the
   *  way this card's key spells them. */
  const playerChords: PlayerChord[] = useMemo(() => voiced
    .map((v, i) => (v === null ? null : {
      ...v,
      name: `${spellInKey(shownChords[i].rootPc, target.keyName)}${played[i]}`,
      // AN ARROW THE READER TAPPED NAMES THE MOVE, so the register keeps
      // it (Silas, 14 Sep 2026) — see `placeBass`.
      ...(i > 0 && (bassMoves[i - 1] ?? 'auto') !== 'auto' ? { namesMove: true } : {}),
    }))
    .filter((v): v is PlayerChord => v !== null),
  [voiced, shownChords, played, target.keyName, bassMoves]);

  /** Which way each move ACTUALLY went, for the arrows. */
  const effective = (pick: (v: NonNullable<typeof voiced[number]>) => number | null) =>
    playerChords.slice(1).map((c, i) => {
      const a = pick(c);
      const b = pick(playerChords[i]);
      return a !== null && b !== null && a < b ? 'down' as const : 'up' as const;
    });

  const stop = () => { playing?.stop(); setPlaying(null); };
  const start = (make: () => Promise<PlaybackHandle>) => {
    stop();
    void make().then(setPlaying).catch(() => {});
  };

  /**
   * The whole progression, before the card is answered.
   *
   * IT IS THE SAME `playPanel` THE SHARED PLAYER USES, at the same
   * settings. After Submit the panel owns the transport and this
   * button is gone; before it there is no panel, and a second way of
   * sounding chords is the thing this build is removing.
   */
  const hearAll = () => {
    if (playerChords.length !== count) return;
    start(() => playPanel(playerChords, settings, {
      orientPc: target.keyPc, onStep: i => setLit(i),
    }));
  };

  const hearChord = () => {
    const v = voiced[shown];
    if (v === null || v === undefined) return;
    start(() => playOneChord(v, { bpm: settings.bpm, octaveUp: settings.octaveUp }));
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
            // THE TILE ROW IS THE CARD'S, not the deck's. It is the
            // eight everywhere it always was, and gains the two
            // altered-dominant tiles only where this card's own
            // answer holds one — see `qualityTilesFor`.
            options: tiles,
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
        <SharedPlayer
          chords={playerChords}
          orientPc={target.keyPc}
          settings={settings}
          onSettings={setSettings}
          thickness={{ value: thickness, onChange: setThickness }}
          board={false}
          onStep={setLit}
          bassDirection={{
            value: bassMoves,
            onChange: setBassMoves,
            effective: effective(c => c.bass),
          }}
          handDirection={{
            value: handMoves,
            onChange: setHandMoves,
            effective: effective(c => (c.hand.length > 0 ? c.hand[0] : null)),
          }}
          compare={(
            <>
              {/* ROTATE — one tap, one door along. The label is the
                  numbers of the rotation now playing, so what is on the
                  button is what is about to sound rather than what
                  tapping it will do. */}
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                  Starting point
                </div>
                <button
                  type="button"
                  data-testid="rotate"
                  onClick={() => {
                    setRotation(r => (r + 1) % count);
                    // THE BOARD STAYS ON THE CHORD IT WAS ON, not on
                    // the slot: rotating moves every chord one place
                    // left, so the lit index moves with it. Without
                    // this, opening "6 as a dominant" and then rotating
                    // would quietly leave the board on whatever slid
                    // into that slot.
                    setLit(l => (l === null ? null : (l - 1 + count) % count));
                  }}
                  className={`${BTN_PLAIN} font-mono`}
                >
                  {/* THE ROW'S OWN THICKNESS. This panel has a ladder
                      on it, so a half-diminished reads with the name
                      that rung gives it. */}
                  {progressionRow(shownChords, {
                    settings: rowSpelling, rung: thickness,
                  })}
                </button>
              </div>

              {/* THE OTHER VERSION — two buttons side by side, so the
                  two can be A/B'd at one tempo and one thickness. */}
              {target.variation !== undefined && (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                    Hear the other version
                  </div>
                  <div className="flex flex-wrap gap-1.5" data-testid="version-row">
                    {([[false, 'Regular'], [true, target.variation.label]] as const)
                      .map(([v, label]) => (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={otherVersion === v}
                          data-testid={v ? 'version-other' : 'version-regular'}
                          onClick={() => {
                            setOtherVersion(v);
                            // SHOW THE CHORD THAT CHANGED, so the A7's
                            // C♯ is on the board beside the Am's C
                            // rather than a rung away. Nothing sounds;
                            // the board moves to the one chord the two
                            // versions disagree about.
                            setLit(versionSlot);
                          }}
                          className={`${BTN} ${otherVersion === v
                            ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                            : 'border-black/10 dark:border-white/20'}`}
                        >
                          {label}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        >
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {'A single low tonic in the key of '
              + `${target.keyName} major to orient, then the chords in order. `
              + 'Each rung adds a note, and the names change to match what '
              + 'is sounding.'}
          </p>
        </SharedPlayer>
      )}
    </div>
  );
}

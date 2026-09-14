/**
 * The diary's player panel: one card, heard.
 *
 * =====================================================================
 * THE SHARED PLAYER, OPENED FROM A CARD. Silas's spec of 12 Sep 2026,
 * walked in `diary-card-prototype_2.html`.
 *
 * ▶ on a card opens this from the bottom of the page, titled with the
 * card, and plays it at once. The page stays live under it, and ▶ on
 * another card switches it. The panel is `SharedPlayer` in its lab
 * layout, inside the `DiarySheet` shell's live form; what differs by
 * card type is spec §8's table and nothing else.
 *
 * THE TAP IS THE CARD'S. `playToken` changes on every ▶, and the panel
 * answers it by pressing the player's own Hear it — so the sound goes
 * through the one transport, and Pause lands on it like any other.
 *
 * =====================================================================
 * THE CARD'S OWN ROWS (spec §4): Root on every card but a progression;
 * then Colour on a chord card, Mode on a scale card, Interval on an
 * interval card; Inversion beside Hands on a chord card; and Back to the
 * card once anything differs from what the card stored. A tap on any of
 * them plays the result, as the prototype does.
 *
 * THE ROWS READ FROM THE KEYBOARD (spec §4, last bullet). Once keys have
 * been lit or unlit by hand, Root lights the reader's root, Colour
 * switches to the reader's family with its chord lit, and Inversion
 * lights the position the lowest hand note gives. Where the reader
 * cannot name the chord exactly (no 3rd, rootless), only Root lights. A
 * chip tapped then continues from the reader's root and family.
 *
 * On a scale or an interval card, lit notes that read as a chord bring
 * the Inversion row; a tap on it turns the panel into a chord, with the
 * rest of the chord tools (Silas, 14 Sep 2026).
 *
 * A PROGRESSION CARD IS THE LOOP BUILDER (spec §7): Key, the chord slots
 * (a name or a degree), + Add a chord, ↻ Rotate, the chord names with the
 * one sounding marked, Starting position beside Thickness, Bass
 * direction beside Hands. A tap on a name plays that chord, and a key
 * tap then edits it. The card's chords are its slots, voiced by the
 * loop builder, so the card and the builder are one sound.
 *
 * ONE UNDO. The rows and the keys are one history here, so Undo steps
 * back through Root, Colour and Inversion taps as well as keys (§5).
 * Letters typed into a slot are not steps; the slot's chips are.
 *
 * The panel is mounted per card, so the rows and the history start from
 * the card every time it opens.
 * =====================================================================
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import DiarySheet from './DiarySheet';
import SharedPlayer, { type HeldEdit, type SharedPlayerHandle } from '../../components/SharedPlayer';
import { PlayerChip, PlayerRow } from '../../components/PlayerRow';
import { CHIP, CHIP_OFF } from '../../components/playerChipStyles';
import type { PlayerSettings } from '../../lib/player/settings';
import type { PlayerChord } from '../../lib/player/voices';
import { readNotes } from '../../lib/player/reader';
import {
  MIDDLE_C, NO_EDIT, builtChord, historyOf, isEdited, record, undo,
  type BoardEdit, type History,
} from '../../lib/player/boardEdit';
import { parseSlot } from '../../lib/player/slotChord';
import {
  BASS_DIRECTION_OPTIONS, LOOP_THICKNESS_OPTIONS, STARTING_POSITION_LABELS, loopChords, slotName,
  type BassDirection, type LoopThickness,
} from '../../lib/player/loopBuilder';
import { spellNote } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';
import { useProgressionSpelling } from '../../lib/progressionSpelling';
import { CHORD_SEEDS } from '../ear-training/chord-recognition/seed';
import type { SkillRecord } from '../skills/registry';
import {
  FAMILY_NAME, INTERVAL_CHIPS, INVERSION_LABELS, MODE_CHIPS,
  colourRow, labChord, labIntervalNotes, labScaleNotes, qualityNameOf,
  type CardSound,
} from './cardSound';

/** How long a card sounds, in beats, before a run grows it. The card
 *  buttons' own figures: two for a chord or an interval, four for a
 *  scale, whose seven notes want the room. */
const BEATS: Readonly<Record<CardSound['kind'], number>> = {
  chord: 2, interval: 2, scale: 4, progression: 2,
};

/** Where the rows are. */
type Lab =
  | { kind: 'chord'; rootPc: number; qualityId: string; inversion: number; shaped: boolean }
  | { kind: 'scale'; rootPc: number; modeId: string }
  | { kind: 'interval'; rootPc: number; semitones: number }
  | {
    kind: 'progression';
    keyPc: number;
    slots: string[];
    startingPosition: number;
    thickness: LoopThickness;
    bassDirection: BassDirection;
  };

function labOf(sound: CardSound): Lab {
  switch (sound.kind) {
    case 'chord':
      return {
        kind: 'chord', rootPc: sound.rootPc, qualityId: sound.qualityId, inversion: 0, shaped: sound.shaped,
      };
    case 'scale': return { kind: 'scale', rootPc: sound.rootPc, modeId: sound.modeId };
    case 'interval': return { kind: 'interval', rootPc: sound.rootPc, semitones: sound.semitones };
    case 'progression':
      // THE PROTOTYPE'S STARTING ROWS: Root position, Seventh chords,
      // Nearest — except that a motion card naming its direction opens
      // on it, so it sounds the move it is about.
      return {
        kind: 'progression',
        keyPc: sound.keyPc,
        slots: [...sound.slots],
        startingPosition: 0,
        thickness: 'seventh',
        bassDirection: sound.bassDirection ?? 'nearest',
      };
  }
}

const sameLab = (a: Lab, b: Lab) => JSON.stringify(a) === JSON.stringify(b);

const PCS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Everything Undo steps back through. */
interface PanelState {
  lab: Lab;
  edit: BoardEdit;
}

export default function DiaryPlayerPanel({
  sound, skill, cardTitle, settings, onSettings, playToken, onClose,
}: {
  sound: CardSound;
  skill: SkillRecord | undefined;
  /** The card's own title, for the cards whose panel is titled with it. */
  cardTitle: string;
  settings: PlayerSettings;
  onSettings: (next: PlayerSettings) => void;
  /** Changes on every ▶ tap. */
  playToken: number;
  onClose: () => void;
}) {
  const [spelling] = useSpelling();
  const [progression] = useProgressionSpelling();
  const player = useRef<SharedPlayerHandle>(null);
  const card = useMemo(() => labOf(sound), [sound]);
  const [history, setHistory] = useState<History<PanelState>>(
    () => historyOf({ lab: card, edit: NO_EDIT }),
  );
  const { lab, edit } = history.present;
  /** Bumped by a row tap, so the chord it made is heard once drawn. */
  const [rowTaps, setRowTaps] = useState(0);
  /** Which chord of a loop is sounding, or was tapped. */
  const [sounding, setSounding] = useState(0);
  /** A slot just added, to take the cursor. */
  const [focusSlot, setFocusSlot] = useState<number | null>(null);

  // THE ▶ WAS THE TAP, or a row was. Played from here, through the
  // player's handle, once the render with the new notes has landed — so
  // the shared player itself still has no effect that starts sound.
  useEffect(() => { player.current?.hear(); }, [playToken, rowTaps]);

  /** A row tap: recorded, anything built by hand let go. */
  const change = (next: Lab) => setHistory(h => record(h, { lab: next, edit: NO_EDIT }));
  /** A row tap that plays what it made, as the prototype's rows do. */
  const move = (next: Lab) => {
    change(next);
    setRowTaps(n => n + 1);
  };

  const held: HeldEdit = {
    value: edit,
    onChange: next => setHistory(h => record(h, { ...h.present, edit: next })),
    onUndo: () => setHistory(undo),
    canUndo: history.past.length > 0,
  };

  // =====================================================================
  // WHAT THE READER SAYS ABOUT THE KEYS, where they have been built by
  // hand. `seeded` is a reading the rows can show: an exact name, on a
  // chord Chord Recognition has.
  // =====================================================================
  const built = lab.kind === 'progression' ? undefined : edit.built[0];
  const reading = built === undefined ? null : builtChord(built, { spelling, progression }).reading;
  const best = reading?.best ?? null;
  const seeded = best !== null && best.omission === 'none'
    && CHORD_SEEDS.some(s => s.id === best.quality.id);
  /** The root and quality a chip continues from. */
  const from = (current: { rootPc: number; qualityId: string }) => ({
    rootPc: best?.rootPc ?? current.rootPc,
    qualityId: seeded ? best!.quality.id : current.qualityId,
  });

  const chordBuild = lab.kind === 'chord'
    ? labChord(
      lab.rootPc, lab.qualityId, lab.inversion, settings.hands, lab.shaped,
      // BUILT AT THE CARD'S ROOT AND MOVED, so the hand keeps its shape.
      card.kind === 'chord' ? card.rootPc : lab.rootPc,
    )
    : null;

  /** The hand the reader's chord would have, for its Inversion chips. */
  const readerBuild = seeded ? labChord(best!.rootPc, best!.quality.id, 0, settings.hands, true) : null;
  /** The position the lowest hand note gives, counted in that hand. */
  const readerInversion = (() => {
    if (built === undefined || readerBuild === null) return null;
    const lit = [...built].sort((a, b) => a - b);
    const lowest = lit.find(m => m >= MIDDLE_C) ?? lit[0];
    const order = readerBuild.chord.hand.map(m => ((m % 12) + 12) % 12);
    const at = order.indexOf(((lowest % 12) + 12) % 12);
    return at >= 0 && at < 4 ? at : null;
  })();

  const chords: PlayerChord[] = useMemo(() => {
    switch (lab.kind) {
      case 'chord': return chordBuild === null ? [] : [chordBuild.chord];
      case 'progression':
        return loopChords(lab.slots.map(text => parseSlot(text, lab.keyPc)), {
          startingPosition: lab.startingPosition,
          thickness: lab.thickness,
          bassDirection: lab.bassDirection,
          spelling,
          progression,
        });
      // A SCALE OR AN INTERVAL IS ONE HAND WITH NO BASS, so Together
      // strikes every note and the three runs play the line in their
      // direction — spec §6, through the same step a chord takes.
      case 'scale':
        return [{ hand: labScaleNotes(lab.rootPc, lab.modeId), bass: null, rootPc: lab.rootPc, name: cardTitle }];
      case 'interval':
        return [{ hand: labIntervalNotes(lab.rootPc, lab.semitones), bass: null, rootPc: lab.rootPc, name: cardTitle }];
    }
  }, [lab, chordBuild, cardTitle, spelling, progression]);

  const wandered = !sameLab(lab, card) || isEdited(edit);
  const inversion = chordBuild === null || lab.kind !== 'chord'
    ? 0
    : Math.min(lab.inversion, chordBuild.handSize - 1);
  /** A loop chord's name, the reader's where it was built by hand. */
  const loopName = (chord: PlayerChord, i: number) => (edit.built[i] === undefined
    ? chord.name
    : builtChord(edit.built[i], { spelling, progression }).reading.name);

  // THE TITLE IS THE NAME OF WHAT IS LIT (spec §2). A progression's is
  // its chords, never with the key appended. A scale and an interval
  // keep the card's own title until a row moves them; an interval is
  // then named as the reader names two notes. Keys lit by hand are named
  // by the reader.
  const title = (() => {
    if (reading !== null) return reading.name === '' ? 'nothing lit' : reading.name;
    switch (lab.kind) {
      case 'chord':
        return `${spellNote(lab.rootPc, spelling)} ${qualityNameOf(lab.qualityId)}`
          + `${inversion > 0 ? ` · ${INVERSION_LABELS[inversion]} inversion` : ''}`;
      case 'progression':
        return chords.length === 0 ? cardTitle : chords.map(loopName).join(' · ');
      case 'scale': {
        const mode = MODE_CHIPS.find(m => m.id === lab.modeId);
        return wandered ? `${spellNote(lab.rootPc, spelling)} ${mode?.label ?? cardTitle}` : cardTitle;
      }
      case 'interval':
        return wandered ? readNotes(chords[0]?.hand ?? [], { spelling }).name : cardTitle;
    }
  })();
  const origin = [
    lab.kind === 'progression' ? `in the key of ${spellNote(lab.keyPc, spelling)}` : null,
    wandered ? `from the card ${cardTitle}` : null,
    skill?.moduleLabel ?? null,
    skill?.category ? skill.category : null,
  ].filter((part): part is string => part !== null).join(' · ');

  const rootRow = lab.kind === 'progression' ? null : (
    <PlayerRow label="Root" testId="row-root">
      {PCS.map(pc => (
        <PlayerChip
          key={pc}
          on={(built !== undefined && best !== null ? best.rootPc : lab.rootPc) === pc}
          testId={`root-${pc}`}
          onClick={() => move(lab.kind === 'chord' ? { ...lab, ...from(lab), rootPc: pc } : { ...lab, rootPc: pc })}
        >
          {spellNote(pc, spelling)}
        </PlayerChip>
      ))}
    </PlayerRow>
  );

  const inversionChips = (count: number, on: (i: number) => boolean, tap: (i: number) => Lab) => (
    <PlayerRow label="Inversion" testId="row-inversion">
      {INVERSION_LABELS.slice(0, Math.min(count, 4)).map((label, i) => (
        <PlayerChip key={label} on={on(i)} testId={`inversion-${i}`} onClick={() => move(tap(i))}>
          {label}
        </PlayerChip>
      ))}
    </PlayerRow>
  );

  const backToCard = wandered && (
    <button
      type="button"
      data-testid="back-to-card"
      onClick={() => move(card)}
      className={`${CHIP} ${CHIP_OFF}`}
    >
      ← Back to the card
    </button>
  );

  // =====================================================================
  // THE LOOP BUILDER'S ROWS (spec §7), in the prototype's order and words.
  // =====================================================================
  const loopRows = (loop: Extract<Lab, { kind: 'progression' }>, hands: ReactNode) => {
    /** Letters typed into a slot: what sounds changes, and it is not an
     *  Undo step. */
    const type = (i: number, text: string) => setHistory(h => ({
      ...h,
      present: { lab: { ...loop, slots: loop.slots.map((s, j) => (j === i ? text : s)) }, edit: NO_EDIT },
    }));
    const shown = Math.min(sounding, Math.max(chords.length - 1, 0));
    return (
      <div className="space-y-3" data-testid="card-rows">
        <PlayerRow label="Key" testId="row-key">
          {PCS.map(pc => (
            <PlayerChip key={pc} on={loop.keyPc === pc} testId={`key-${pc}`} onClick={() => move({ ...loop, keyPc: pc })}>
              {spellNote(pc, spelling)}
            </PlayerChip>
          ))}
        </PlayerRow>

        <PlayerRow label="Chords · type a name (Cmaj7, G7) or a degree (1, 5, 6m, 4)" testId="row-slots">
          {loop.slots.map((text, i) => {
            const parsed = parseSlot(text, loop.keyPc);
            return (
              <span
                key={i}
                data-testid={`slot-${i}`}
                data-parses={parsed === null ? 'no' : 'yes'}
                className={`inline-flex items-center rounded-md border ${parsed === null
                  ? 'border-red-500' : 'border-black/10 dark:border-white/20'} bg-black/[0.03] dark:bg-white/[0.06]`}
              >
                <input
                  value={text}
                  aria-label={`chord ${i + 1}`}
                  data-testid={`slot-input-${i}`}
                  autoFocus={focusSlot === i}
                  onChange={e => type(i, e.target.value)}
                  // ENTER IN A SLOT PLAYS THE LOOP (spec §7).
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return;
                    e.currentTarget.blur();
                    setRowTaps(n => n + 1);
                  }}
                  className="w-16 bg-transparent py-1.5 pl-2 pr-1 font-mono text-xs outline-none"
                />
                <b className="pr-1 text-[11px] font-normal text-neutral-500" data-testid={`slot-name-${i}`}>
                  {parsed === null ? '?' : slotName(parsed, spelling, progression)}
                </b>
                <button
                  type="button"
                  aria-label="remove"
                  data-testid={`slot-remove-${i}`}
                  onClick={() => change({ ...loop, slots: loop.slots.filter((_, j) => j !== i) })}
                  className="px-2 py-1.5 text-xs text-neutral-500"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </PlayerRow>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="add-chord"
            onClick={() => { change({ ...loop, slots: [...loop.slots, ''] }); setFocusSlot(loop.slots.length); }}
            className={`${CHIP} ${CHIP_OFF}`}
          >
            + Add a chord
          </button>
          <button
            type="button"
            data-testid="rotate-loop"
            onClick={() => move({ ...loop, slots: loop.slots.length === 0 ? [] : [...loop.slots.slice(1), loop.slots[0]] })}
            className={`${CHIP} ${CHIP_OFF}`}
          >
            ↻ Rotate
          </button>
        </div>

        {/* THE CHORDS, THE ONE SOUNDING MARKED. A tap plays that chord,
            and a key tap then edits it (Silas, 14 Sep 2026). */}
        <div className="flex flex-wrap gap-1.5 font-mono" data-testid="loop-names">
          {chords.map((chord, i) => (
            <PlayerChip
              key={`${chord.name}-${i}`}
              on={i === shown}
              testId={`loop-name-${i}`}
              onClick={() => { setSounding(i); player.current?.hearOne(i); }}
            >
              {loopName(chord, i)}
            </PlayerChip>
          ))}
        </div>

        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <PlayerRow label="Starting position" testId="row-starting">
            {STARTING_POSITION_LABELS.map((label, i) => (
              <PlayerChip
                key={label}
                on={loop.startingPosition === i}
                testId={`starting-${i}`}
                onClick={() => move({ ...loop, startingPosition: i })}
              >
                {label}
              </PlayerChip>
            ))}
          </PlayerRow>
          <PlayerRow label="Thickness" testId="row-loop-thickness">
            {LOOP_THICKNESS_OPTIONS.map(o => (
              <PlayerChip
                key={o.id}
                on={loop.thickness === o.id}
                testId={`loop-thickness-${o.id}`}
                onClick={() => change({ ...loop, thickness: o.id })}
              >
                {o.label}
              </PlayerChip>
            ))}
          </PlayerRow>
        </div>

        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <PlayerRow label="Bass direction" testId="row-loop-bass">
            {BASS_DIRECTION_OPTIONS.map(o => (
              <PlayerChip
                key={o.id}
                on={loop.bassDirection === o.id}
                testId={`loop-bass-${o.id}`}
                onClick={() => change({ ...loop, bassDirection: o.id })}
              >
                {o.label}
              </PlayerChip>
            ))}
          </PlayerRow>
          {hands}
        </div>

        {backToCard}
      </div>
    );
  };

  const rows = (hands: ReactNode) => (lab.kind === 'progression' ? loopRows(lab, hands) : (
    <div className="space-y-3" data-testid="card-rows">
      {rootRow}

      {lab.kind === 'chord' && (() => {
        const shown = built !== undefined && seeded ? best!.quality.id : lab.qualityId;
        const { family, groups } = colourRow(shown);
        return (
          <PlayerRow label={`Colour · ${FAMILY_NAME[family] ?? family}`} testId="row-colour">
            {groups.map((group, g) => (
              <span key={g} className="contents">
                {g > 0 && (
                  <span aria-hidden className="mx-1 h-5 w-px bg-black/10 dark:bg-white/20" data-testid="colour-separator" />
                )}
                {group.map(chip => (
                  <PlayerChip
                    key={chip.id}
                    on={built !== undefined ? seeded && best!.quality.id === chip.id : lab.qualityId === chip.id}
                    testId={`colour-${chip.id}`}
                    // A COLOUR IS CHORD RECOGNITION'S, so it takes Silas's
                    // shape where he has one.
                    onClick={() => move({ ...lab, ...from(lab), qualityId: chip.id, shaped: true })}
                  >
                    {chip.label}
                  </PlayerChip>
                ))}
              </span>
            ))}
          </PlayerRow>
        );
      })()}

      {lab.kind === 'scale' && (
        <PlayerRow label="Mode" testId="row-mode">
          {MODE_CHIPS.map(chip => (
            <PlayerChip
              key={chip.id}
              on={lab.modeId === chip.id}
              testId={`mode-${chip.id}`}
              onClick={() => move({ ...lab, modeId: chip.id })}
            >
              {chip.label}
            </PlayerChip>
          ))}
        </PlayerRow>
      )}

      {lab.kind === 'interval' && (
        <PlayerRow label="Interval" testId="row-interval">
          {INTERVAL_CHIPS.map(chip => (
            <PlayerChip
              key={chip.id}
              on={lab.semitones === chip.id}
              testId={`interval-${chip.id}`}
              onClick={() => move({ ...lab, semitones: chip.id })}
            >
              {chip.label}
            </PlayerChip>
          ))}
        </PlayerRow>
      )}

      {lab.kind === 'chord' && chordBuild !== null && (
        // INVERSION BESIDE HANDS ON A WIDE SCREEN, under it on a narrow one.
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3" data-testid="inversion-and-hands">
          {inversionChips(
            built !== undefined && readerBuild !== null ? readerBuild.handSize : chordBuild.handSize,
            i => (built !== undefined ? readerInversion === i : inversion === i),
            i => ({ ...lab, ...from(lab), inversion: i }),
          )}
          {hands}
        </div>
      )}

      {/* A SCALE OR AN INTERVAL WHOSE LIT NOTES READ AS A CHORD: the
          Inversion row, and a tap on it makes the panel that chord. */}
      {(lab.kind === 'scale' || lab.kind === 'interval') && readerBuild !== null && best !== null
        && inversionChips(
          readerBuild.handSize,
          i => readerInversion === i,
          i => ({ kind: 'chord', rootPc: best.rootPc, qualityId: best.quality.id, inversion: i, shaped: true }),
        )}

      {backToCard}
    </div>
  ));

  return (
    <DiarySheet live title={title} subtitle={origin} onClose={onClose}>
      <SharedPlayer
        ref={player}
        chords={chords}
        settings={settings}
        onSettings={onSettings}
        beats={BEATS[sound.kind]}
        {...(lab.kind === 'progression' ? { orientPc: lab.keyPc } : {})}
        // HANDS ON A CHORD AND A PROGRESSION. A scale or an interval
        // shows it once the panel has been made a chord (Silas, 14 Sep
        // 2026).
        showHands={lab.kind === 'chord' || lab.kind === 'progression'}
        // EVERY SETTINGS ROW ON EVERY CARD (Silas, 13 Sep 2026).
        showListen
        boardLabel={`What ${title} sounds like`}
        edit={held}
        onStep={i => { if (i >= 0) setSounding(i); }}
        lab={{
          playedName: title,
          rows,
          handsInRows: lab.kind === 'chord' || lab.kind === 'progression',
          rowsFirst: lab.kind === 'progression',
        }}
      />
    </DiarySheet>
  );
}

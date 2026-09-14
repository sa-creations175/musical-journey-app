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
 * The panel is mounted per card, so the rows start from the card every
 * time it opens.
 * =====================================================================
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import DiarySheet from './DiarySheet';
import SharedPlayer, { type SharedPlayerHandle } from '../../components/SharedPlayer';
import { PlayerChip, PlayerRow } from '../../components/PlayerRow';
import { CHIP, CHIP_OFF } from '../../components/playerChipStyles';
import type { PlayerSettings } from '../../lib/player/settings';
import type { PlayerChord } from '../../lib/player/voices';
import { readNotes } from '../../lib/player/reader';
import { spellNote } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';
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

/** Where the rows are. A progression has none (spec §8). */
type Lab =
  | { kind: 'chord'; rootPc: number; qualityId: string; inversion: number; shaped: boolean }
  | { kind: 'scale'; rootPc: number; modeId: string }
  | { kind: 'interval'; rootPc: number; semitones: number }
  | { kind: 'progression' };

function labOf(sound: CardSound): Lab {
  switch (sound.kind) {
    case 'chord':
      return {
        kind: 'chord', rootPc: sound.rootPc, qualityId: sound.qualityId, inversion: 0, shaped: sound.shaped,
      };
    case 'scale': return { kind: 'scale', rootPc: sound.rootPc, modeId: sound.modeId };
    case 'interval': return { kind: 'interval', rootPc: sound.rootPc, semitones: sound.semitones };
    default: return { kind: 'progression' };
  }
}

const sameLab = (a: Lab, b: Lab) => JSON.stringify(a) === JSON.stringify(b);

const ROOT_PCS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

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
  const player = useRef<SharedPlayerHandle>(null);
  const card = useMemo(() => labOf(sound), [sound]);
  const [lab, setLab] = useState<Lab>(card);
  /** Bumped by a row tap, so the chord it made is heard once drawn. */
  const [rowTaps, setRowTaps] = useState(0);

  // THE ▶ WAS THE TAP, or a row was. Played from here, through the
  // player's handle, once the render with the new notes has landed — so
  // the shared player itself still has no effect that starts sound.
  useEffect(() => { player.current?.hear(); }, [playToken, rowTaps]);

  const move = (next: Lab) => {
    setLab(next);
    setRowTaps(n => n + 1);
  };

  const chordBuild = lab.kind === 'chord'
    ? labChord(
      lab.rootPc, lab.qualityId, lab.inversion, settings.hands, lab.shaped,
      // BUILT AT THE CARD'S ROOT AND MOVED, so the hand keeps its shape.
      card.kind === 'chord' ? card.rootPc : lab.rootPc,
    )
    : null;

  const chords: PlayerChord[] = useMemo(() => {
    switch (lab.kind) {
      case 'chord': return chordBuild === null ? [] : [chordBuild.chord];
      case 'progression': return sound.kind === 'progression' ? sound.chords : [];
      // A SCALE OR AN INTERVAL IS ONE HAND WITH NO BASS, so Together
      // strikes every note and the three runs play the line in their
      // direction — spec §6, through the same step a chord takes.
      case 'scale':
        return [{ hand: labScaleNotes(lab.rootPc, lab.modeId), bass: null, rootPc: lab.rootPc, name: cardTitle }];
      case 'interval':
        return [{ hand: labIntervalNotes(lab.rootPc, lab.semitones), bass: null, rootPc: lab.rootPc, name: cardTitle }];
    }
  }, [lab, chordBuild, sound, cardTitle]);

  const wandered = !sameLab(lab, card);
  const inversion = chordBuild === null || lab.kind !== 'chord'
    ? 0
    : Math.min(lab.inversion, chordBuild.handSize - 1);

  // THE TITLE IS THE NAME OF WHAT IS LIT (spec §2). A progression's is
  // its chords, never with the key appended. A scale and an interval
  // keep the card's own title until a row moves them; an interval is
  // then named as the reader names two notes.
  const title = (() => {
    switch (lab.kind) {
      case 'chord':
        return `${spellNote(lab.rootPc, spelling)} ${qualityNameOf(lab.qualityId)}`
          + `${inversion > 0 ? ` · ${INVERSION_LABELS[inversion]} inversion` : ''}`;
      case 'progression':
        return sound.kind === 'progression' ? sound.names.join(' · ') : cardTitle;
      case 'scale': {
        const mode = MODE_CHIPS.find(m => m.id === lab.modeId);
        return wandered ? `${spellNote(lab.rootPc, spelling)} ${mode?.label ?? cardTitle}` : cardTitle;
      }
      case 'interval':
        return wandered ? readNotes(chords[0]?.hand ?? [], { spelling }).name : cardTitle;
    }
  })();
  const origin = [
    sound.kind === 'progression' ? `in the key of ${spellNote(sound.keyPc, spelling)}` : null,
    wandered ? `from the card ${cardTitle}` : null,
    skill?.moduleLabel ?? null,
    skill?.category ? skill.category : null,
  ].filter((part): part is string => part !== null).join(' · ');

  const rootRow = lab.kind === 'progression' ? null : (
    <PlayerRow label="Root" testId="row-root">
      {ROOT_PCS.map(pc => (
        <PlayerChip
          key={pc}
          on={lab.rootPc === pc}
          testId={`root-${pc}`}
          onClick={() => move({ ...lab, rootPc: pc })}
        >
          {spellNote(pc, spelling)}
        </PlayerChip>
      ))}
    </PlayerRow>
  );

  const rows = (hands: ReactNode) => (
    <div className="space-y-3" data-testid="card-rows">
      {rootRow}

      {lab.kind === 'chord' && (() => {
        const { family, groups } = colourRow(lab.qualityId);
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
                    on={lab.qualityId === chip.id}
                    testId={`colour-${chip.id}`}
                    // A COLOUR IS CHORD RECOGNITION'S, so it takes Silas's
                    // shape where he has one.
                    onClick={() => move({ ...lab, qualityId: chip.id, shaped: true })}
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
          <PlayerRow label="Inversion" testId="row-inversion">
            {INVERSION_LABELS.slice(0, Math.min(chordBuild.handSize, 4)).map((label, i) => (
              <PlayerChip
                key={label}
                on={inversion === i}
                testId={`inversion-${i}`}
                onClick={() => move({ ...lab, inversion: i })}
              >
                {label}
              </PlayerChip>
            ))}
          </PlayerRow>
          {hands}
        </div>
      )}

      {wandered && (
        <button
          type="button"
          data-testid="back-to-card"
          onClick={() => move(card)}
          className={`${CHIP} ${CHIP_OFF}`}
        >
          ← Back to the card
        </button>
      )}
    </div>
  );

  return (
    <DiarySheet live title={title} subtitle={origin} onClose={onClose}>
      <SharedPlayer
        ref={player}
        chords={chords}
        settings={settings}
        onSettings={onSettings}
        beats={BEATS[sound.kind]}
        {...(sound.kind === 'progression' ? { orientPc: sound.keyPc } : {})}
        // HANDS WAITS ON SILAS FOR A SCALE OR AN INTERVAL: neither has a
        // chord root for the row to move (open, 14 Sep 2026).
        showHands={sound.kind === 'chord' || sound.kind === 'progression'}
        // EVERY SETTINGS ROW ON EVERY CARD (Silas, 13 Sep 2026).
        showListen
        boardLabel={`What ${title} sounds like`}
        lab={{
          playedName: title,
          ...(lab.kind === 'progression' ? {} : { rows, handsInRows: lab.kind === 'chord' }),
        }}
      />
    </DiarySheet>
  );
}

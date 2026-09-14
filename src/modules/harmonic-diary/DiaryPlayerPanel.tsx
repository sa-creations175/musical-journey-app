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
 * =====================================================================
 */
import { useEffect, useMemo, useRef } from 'react';
import DiarySheet from './DiarySheet';
import SharedPlayer, { type SharedPlayerHandle } from '../../components/SharedPlayer';
import type { PlayerSettings } from '../../lib/player/settings';
import type { PlayerChord } from '../../lib/player/voices';
import { spellNote } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';
import type { SkillRecord } from '../skills/registry';
import type { CardSound } from './cardSound';

/** How long a card sounds, in beats, before a run grows it. The card
 *  buttons' own figures: two for a chord or an interval, four for a
 *  scale, whose seven notes want the room. */
const BEATS: Readonly<Record<CardSound['kind'], number>> = {
  chord: 2, interval: 2, scale: 4, progression: 2,
};

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

  // THE ▶ WAS THE TAP. Played from here, through the player's handle,
  // so the shared player itself still has no effect that starts sound.
  useEffect(() => { player.current?.hear(); }, [playToken]);

  const chords: PlayerChord[] = useMemo(() => {
    switch (sound.kind) {
      case 'chord': return [sound.chord];
      case 'progression': return sound.chords;
      // A SCALE OR AN INTERVAL IS ONE HAND WITH NO BASS, so Together
      // strikes every note and the three runs play the line in their
      // direction — spec §6, through the same step a chord takes.
      default: return [{ hand: sound.notes, bass: null, rootPc: sound.rootPc, name: cardTitle }];
    }
  }, [sound, cardTitle]);

  // THE TITLE IS THE NAME OF WHAT IS LIT (spec §2). A progression's is
  // its chords, never with the key appended; a scale and an interval
  // keep the card's own title.
  const title = sound.kind === 'chord'
    ? `${spellNote(sound.rootPc, spelling)} ${sound.qualityName}`
    : sound.kind === 'progression'
      ? sound.names.join(' · ')
      : cardTitle;
  const origin = [
    sound.kind === 'progression' ? `in the key of ${spellNote(sound.keyPc, spelling)}` : null,
    skill?.moduleLabel ?? null,
    skill?.category ? skill.category : null,
  ].filter((part): part is string => part !== null).join(' · ');

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
        lab={{ playedName: title }}
      />
    </DiarySheet>
  );
}

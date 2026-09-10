/**
 * The panel's settings, held once per surface.
 *
 * A HOOK RATHER THAN A CONTEXT, deliberately. Two panels open at once —
 * a card's reveal and the drill beside it — are two things being
 * listened to, and a tempo change on one silently retuning the other
 * would be a surprise. The INSTRUMENT is the exception and it is
 * already global: it is what the app sounds like, not what this card is
 * set to.
 *
 * IT REMEMBERS NOTHING ACROSS A REMOUNT, which is what the prototype
 * does: every setting except the fold's open state starts where it
 * starts. When Silas asks for one of them to persist it becomes a
 * `userPrefs` key here, in one place, rather than five.
 */
import { useState } from 'react';
import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from './settings';

export function usePlayerSettings(
  initial: Partial<PlayerSettings> = {},
): [PlayerSettings, (next: PlayerSettings) => void] {
  const [settings, setSettings] = useState<PlayerSettings>(
    () => ({ ...DEFAULT_PLAYER_SETTINGS, ...initial }),
  );
  return [settings, setSettings];
}

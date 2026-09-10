/**
 * Whether the Chord Color Legend is open, remembered per device.
 *
 * A FOLD, NOT A PREFERENCE ABOUT MUSIC — so `localStorage`, the same
 * line the shared player's own settings fold draws. A reader who has
 * learned the colours should not have to close it on every card, and
 * one who has not should find it where they left it.
 *
 * SPLIT FROM THE COMPONENT so that file exports a component and
 * nothing else, which is what keeps fast refresh working on it.
 */
const OPEN_KEY = 'chordColorLegendOpen';

export function readLegendOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === 'open';
  } catch {
    return false;
  }
}

export function writeLegendOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? 'open' : 'closed');
  } catch {
    // A browser that will not store it opens the fold closed next
    // time, which is the default anyway.
  }
}

import type { Mode } from './catalog';

export const MODULE_ID = 'scales-modes';
export const PREF_SORT_ORDER = 'scalesModesSortOrder';
export const PREF_ROOT_NOTE = 'scalesModesRootNote';
export const PREF_LOOP_COUNT = 'scalesModesLoopCount';
export const PREF_SCOPE = 'scalesModesScope';
// Tab-specific speed overrides — live alongside the generic per-module
// speedPrefKey so the generic one can still act as a fallback.
export const PREF_SCALE_SPEED = 'scalesModesScaleSpeed';
export const PREF_VAMP_SPEED = 'scalesModesVampSpeed';

// Scope presets for the "pick a starting pool" selector. Interpretation:
//   · church       — the 7 modes of the major scale (positions 1-7)
//   · minor-variants — just harmonic and melodic minor
//   · brightest    — brightnessRank ≤ 3 (Lydian / Ionian / Mixolydian)
//   · darkest      — brightnessRank ≥ 7 (Harmonic Minor / Phrygian / Locrian)
export type ModeScope = 'all' | 'church' | 'minor-variants' | 'brightest' | 'darkest';

export const SCOPE_LABELS: Record<ModeScope, string> = {
  'all': 'all modes',
  'church': 'church modes only',
  'minor-variants': 'harmonic & melodic minor',
  'brightest': 'brightest modes',
  'darkest': 'darkest modes',
};

export function filterModesByScope<M extends Mode>(modes: M[], scope: ModeScope): M[] {
  switch (scope) {
    case 'church': return modes.filter(m => m.parentScalePosition >= 1 && m.parentScalePosition <= 7);
    case 'minor-variants': return modes.filter(m => m.id === 'harmonic-minor' || m.id === 'melodic-minor');
    case 'brightest': return modes.filter(m => m.brightnessRank <= 3);
    case 'darkest': return modes.filter(m => m.brightnessRank >= 7);
    case 'all':
    default: return modes;
  }
}

// Attempts are logged per mode per tab. Using the `-tab1` / `-tab2`
// suffix mirrors the convention in chord-progressions (`-pattern`,
// `-inversion`) so downstream tiering code can split them cleanly.
export function scaleItemId(mode: Mode): string {
  return `${mode.id}-tab1`;
}
export function vampItemId(mode: Mode): string {
  return `${mode.id}-tab2`;
}

// C3..B3 range — keeps scale tops from going uncomfortably high.
export const ROOT_NOTES: { label: string; midi: number }[] = [
  { label: 'C',  midi: 48 },
  { label: 'Db', midi: 49 },
  { label: 'D',  midi: 50 },
  { label: 'Eb', midi: 51 },
  { label: 'E',  midi: 52 },
  { label: 'F',  midi: 53 },
  { label: 'F#', midi: 54 },
  { label: 'G',  midi: 55 },
  { label: 'Ab', midi: 56 },
  { label: 'A',  midi: 57 },
  { label: 'Bb', midi: 58 },
  { label: 'B',  midi: 59 },
];

export function randomRootMidi(rng: () => number = Math.random): number {
  return ROOT_NOTES[Math.floor(rng() * ROOT_NOTES.length)].midi;
}

export function midiToLabel(midi: number): string {
  const note = ((midi % 12) + 12) % 12;
  return ROOT_NOTES[note]?.label ?? '?';
}

export function songSearchUrl(service: 'spotify' | 'youtube', title: string, artist: string): string {
  const q = encodeURIComponent(`${title} ${artist}`.trim());
  return service === 'spotify'
    ? `https://open.spotify.com/search/${q}`
    : `https://www.youtube.com/results?search_query=${q}`;
}

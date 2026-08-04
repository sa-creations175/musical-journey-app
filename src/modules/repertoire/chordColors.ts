import { useSyncExternalStore } from 'react';
import type { ChordFunction } from '../../lib/db';

// Chord-cell degree palettes (Lead Sheet — chord color track, Aug 2026,
// docs/LYRIC_SYLLABLE_PLACEMENT_AUDIT_AND_PLAN.md §B2).
//
// These moved out of BarGridView's Tailwind class strings into hex +
// inline styles. The reason is mechanical, not aesthetic: the flattened-
// degree rule (step T2.3) derives each dark twin — b3 from 3, b6 from 6
// — programmatically from ONE tunable constant. You cannot darken a
// class name, and Tailwind's JIT only emits classes it finds as complete
// static strings in source (there is no `safelist` in tailwind.config.js),
// so runtime-built class names would produce no CSS at all.
//
// Precedent for hex-in-JS + inline style in this codebase: `intervalColor`
// (lib/voicingColors.ts) and the practice calendar's `--cal-*` variables
// (index.css). This module is the T2.2 swap ONLY — the values below
// reproduce the previous Tailwind classes exactly, so nothing changes on
// screen. The mapping rules change in T2.3.

/** Resolved colors for one chord cell. All values are CSS colors. */
export interface ChordPalette {
  /** Cell fill. */
  bg: string;
  /** Chord label text. */
  text: string;
  /** Cell border. */
  border: string;
  /** Beat-count dots under the label. */
  dot: string;
}

interface PalettePair {
  light: ChordPalette;
  dark: ChordPalette;
}

// Transcribed 1:1 from the Tailwind v3.4 default palette (verified
// against node_modules/tailwindcss/colors), preserving every asymmetry
// in the original class strings:
//   · degree 4's border was purple-600 in light but purple-500 in dark
//   · the beat dots had no `dark:` variant, so both modes share one value
//   · dark fills carried an alpha suffix (`/40`, neutral `/60`)
const DEGREE_PALETTES: Record<string, PalettePair> = {
  // green
  '1': {
    light: { bg: '#f0fdf4', text: '#15803d', border: '#22c55e', dot: '#22c55e' },
    dark: { bg: 'rgba(5, 46, 22, 0.4)', text: '#bbf7d0', border: '#22c55e', dot: '#22c55e' },
  },
  // pink
  '2': {
    light: { bg: '#fdf2f8', text: '#be185d', border: '#f472b6', dot: '#f472b6' },
    dark: { bg: 'rgba(80, 7, 36, 0.4)', text: '#fbcfe8', border: '#f472b6', dot: '#f472b6' },
  },
  // teal
  '3': {
    light: { bg: '#f0fdfa', text: '#0f766e', border: '#14b8a6', dot: '#14b8a6' },
    dark: { bg: 'rgba(4, 47, 46, 0.4)', text: '#99f6e4', border: '#14b8a6', dot: '#14b8a6' },
  },
  // purple
  '4': {
    light: { bg: '#faf5ff', text: '#7e22ce', border: '#9333ea', dot: '#9333ea' },
    dark: { bg: 'rgba(59, 7, 100, 0.4)', text: '#e9d5ff', border: '#a855f7', dot: '#9333ea' },
  },
  // amber
  '5': {
    light: { bg: '#fffbeb', text: '#b45309', border: '#f59e0b', dot: '#f59e0b' },
    dark: { bg: 'rgba(69, 26, 3, 0.4)', text: '#fde68a', border: '#f59e0b', dot: '#f59e0b' },
  },
  // blue
  '6': {
    light: { bg: '#eff6ff', text: '#1d4ed8', border: '#3b82f6', dot: '#3b82f6' },
    dark: { bg: 'rgba(23, 37, 84, 0.4)', text: '#bfdbfe', border: '#3b82f6', dot: '#3b82f6' },
  },
  // red
  '7': {
    light: { bg: '#fef2f2', text: '#b91c1c', border: '#ef4444', dot: '#ef4444' },
    dark: { bg: 'rgba(69, 10, 10, 0.4)', text: '#fecaca', border: '#ef4444', dot: '#ef4444' },
  },
};

/** Unparsed chords and unreadable degree tokens fall back to neutral. */
const NEUTRAL_PALETTE: PalettePair = {
  light: { bg: '#f5f5f5', text: '#404040', border: '#d4d4d4', dot: '#a3a3a3' },
  dark: { bg: 'rgba(38, 38, 38, 0.6)', text: '#e5e5e5', border: '#404040', dot: '#a3a3a3' },
};

// --- flattened degrees (T2.3) ----------------------------------------
//
// ⚠ ENHARMONIC COLOR PRINCIPLE — this rule also lives in
// `src/lib/voicingColors.ts` (INTERVAL_COLOR). The two systems are
// independent on purpose (this one answers "what degree is this chord",
// that one "what interval is this tone") but they encode the same idea:
// color follows the SOUNDING NOTE, not the spelling. Change them
// together. Unifying them into one source of truth is on the backlog —
// see docs/LYRIC_SYLLABLE_PLACEMENT_AUDIT_AND_PLAN.md §Future work.
//
// The rule: every chromatic degree renders as a darker shade of its
// flat-name family — b3 is a dark 3, b6 a dark 6 — and sharp spellings
// take their enharmonic flat twin's color, so #4 and b5 are identical.
//
// Implementation converts a degree token to a semitone offset from the
// tonic and looks the family up from there. That falls out of the
// principle rather than enumerating spellings, so exotic tokens land
// correctly for free: b1 is 11 semitones up = the 7 family, #3 is 5 =
// the 4 family, bb3 is 2 = the 2 family.

/** THE tuning knob. Each flattened degree's palette is its natural
 *  family's palette with every color's HSL lightness scaled by
 *  `1 - DARK_STEP`. Hue and saturation are untouched, so the family
 *  stays recognisable — it just goes darker.
 *
 *  Raise this if flattened and natural cells don't separate at a
 *  glance (the cell FILL is the dominant signal — it starts as a
 *  near-white 50-level pastel, so it has the most room to move).
 *  Lower it if the darkened text stops reading against its own fill. */
export const DARK_STEP = 0.18;

/** Semitones above the tonic for each natural degree (major scale). */
const DEGREE_SEMITONES: Record<string, number> = {
  '1': 0, '2': 2, '3': 4, '4': 5, '5': 7, '6': 9, '7': 11,
};

/** Semitone → which family colors it, and whether it's a chromatic
 *  (flattened) degree that takes the darker shade. */
const SEMITONE_FAMILY: ReadonlyArray<{ family: string; flattened: boolean }> = [
  { family: '1', flattened: false }, //  0  1
  { family: '2', flattened: true },  //  1  b2 / #1
  { family: '2', flattened: false }, //  2  2
  { family: '3', flattened: true },  //  3  b3 / #2
  { family: '3', flattened: false }, //  4  3
  { family: '4', flattened: false }, //  5  4  / #3
  { family: '5', flattened: true },  //  6  b5 / #4
  { family: '5', flattened: false }, //  7  5
  { family: '6', flattened: true },  //  8  b6 / #5
  { family: '6', flattened: false }, //  9  6
  { family: '7', flattened: true },  // 10  b7 / #6
  { family: '7', flattened: false }, // 11  7  / b1
];

/**
 * Resolve a degree token ("1", "b3", "#4", "b13") to the family that
 * colors it. Returns null for anything unreadable.
 *
 * Extensions map down to their base degree before coloring — 9→2,
 * 11→4, 13→6 — carrying their accidental, so `b13` colors as `b6`.
 * (Defensive: `chord.function` and `chord.bass` are both parsed as
 * `[b#]*[1-7]` today, so extensions can't actually reach here. Handling
 * them costs nothing and means the rule holds if that ever widens.)
 */
export function resolveDegree(
  token: string,
): { family: string; flattened: boolean } | null {
  const match = token.trim().match(/^([b#]*)(\d+)$/);
  if (!match) return null;
  const [, accidentals, digits] = match;
  let degree = parseInt(digits, 10);
  if (!Number.isFinite(degree) || degree < 1) return null;
  while (degree > 7) degree -= 7;
  const base = DEGREE_SEMITONES[String(degree)];
  if (base === undefined) return null;
  let shift = 0;
  for (const ch of accidentals) shift += ch === '#' ? 1 : -1;
  const semitone = (((base + shift) % 12) + 12) % 12;
  return SEMITONE_FAMILY[semitone];
}

// --- color math -------------------------------------------------------

interface Rgba { r: number; g: number; b: number; a: number }

function parseColor(color: string): Rgba | null {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = color
    .trim()
    .match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (rgba) {
    return {
      r: parseInt(rgba[1], 10),
      g: parseInt(rgba[2], 10),
      b: parseInt(rgba[3], 10),
      a: rgba[4] === undefined ? 1 : parseFloat(rgba[4]),
    };
  }
  return null;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hueToChannel(p: number, q: number, tRaw: number): number {
  let t = tRaw;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueToChannel(p, q, h + 1 / 3) * 255),
    Math.round(hueToChannel(p, q, h) * 255),
    Math.round(hueToChannel(p, q, h - 1 / 3) * 255),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const part = (v: number) => v.toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Scale a color's HSL lightness by `1 - step`, preserving hue,
 *  saturation, and alpha. Unparseable input passes through unchanged. */
export function darkenColor(color: string, step: number): string {
  const parsed = parseColor(color);
  if (!parsed) return color;
  const [h, s, l] = rgbToHsl(parsed.r, parsed.g, parsed.b);
  const [r, g, b] = hslToRgb(h, s, Math.max(0, Math.min(1, l * (1 - step))));
  return parsed.a === 1 ? toHex(r, g, b) : `rgba(${r}, ${g}, ${b}, ${parsed.a})`;
}

function darkenPalette(p: ChordPalette, step: number): ChordPalette {
  return {
    bg: darkenColor(p.bg, step),
    text: darkenColor(p.text, step),
    border: darkenColor(p.border, step),
    dot: darkenColor(p.dot, step),
  };
}

/** Every family's flattened twin, derived once at module load. */
const FLATTENED_PALETTES: Record<string, PalettePair> = Object.fromEntries(
  Object.entries(DEGREE_PALETTES).map(([degree, pair]) => [
    degree,
    {
      light: darkenPalette(pair.light, DARK_STEP),
      dark: darkenPalette(pair.dark, DARK_STEP),
    },
  ]),
);

/**
 * Resolve a chord's cell palette.
 *
 * Slash chords colour by their BASS degree — the bass note is what the
 * ear anchors to, so the cell fill follows it. (The label's numerator is
 * coloured separately by the ROOT's family; see ChordGlyph's
 * `numeratorPill`.)
 *
 * Chromatic degrees take their flat-name family's darker shade, and
 * sharp spellings resolve to the same colour as their flat twin — see
 * `resolveDegree`.
 */
export function chordPalette(
  chord: ChordFunction,
  isDark: boolean,
): ChordPalette {
  const pair = palettePairFor(chord);
  return isDark ? pair.dark : pair.light;
}

/** Degrees the number-notation parser can't hold in one field. */
const EXTENSION_DEGREES = new Set(['9', '11', '13']);

/**
 * Recover the full degree token for a chord's ROOT.
 *
 * `parseNumberNotation` consumes exactly one 1-7 digit
 * (`/^([b#]*[1-7])(.*)$/`), so a multi-digit degree arrives split across
 * two fields: "b13" is stored as `{ function: 'b1', quality: '3' }`.
 * The display concatenates them back, so it *looks* right while the
 * colour resolves against 'b1' — the b13-renders-dark-red bug.
 *
 * Re-join them when, and only when, the quality is exactly the digits
 * that complete a 9/11/13 degree. Deliberately narrow: "113" (degree 1
 * with a 13th) stays split because 113 isn't a degree, and "57" (degree
 * 5, dominant 7) stays split because 57 isn't either — so no existing
 * chord changes colour as a side effect.
 *
 * This is a colour-path repair, not a parser fix. Bare "9"/"b9" roots
 * are rejected by the parser outright and arrive `unparsed`, and a slash
 * bass like "1/b13" loses its trailing digit entirely in
 * `parseNumberFunction` — neither is recoverable from the stored record.
 * See the plan doc's backlog item on multi-digit degree parsing.
 */
function rootDegreeToken(chord: ChordFunction): string {
  const fn = chord.function;
  if (fn === '' || !/^[0-9]+$/.test(chord.quality)) return fn;
  const match = fn.match(/^([b#]*)([1-7])$/);
  if (!match) return fn;
  const joined = match[2] + chord.quality;
  return EXTENSION_DEGREES.has(joined) ? match[1] + joined : fn;
}

function palettePairFor(chord: ChordFunction): PalettePair {
  if (chord.unparsed) return NEUTRAL_PALETTE;
  const source =
    chord.bass && chord.bass !== '' ? chord.bass : rootDegreeToken(chord);
  if (source === '') return NEUTRAL_PALETTE;
  const resolved = resolveDegree(source);
  if (!resolved) return NEUTRAL_PALETTE;
  const base = DEGREE_PALETTES[resolved.family];
  if (!base) return NEUTRAL_PALETTE;
  return resolved.flattened
    ? FLATTENED_PALETTES[resolved.family] ?? base
    : base;
}

// --- dark-mode detection ---------------------------------------------
//
// Tailwind runs in `darkMode: 'class'`, so the signal is the `dark`
// class on <html>. Inline styles can't express a `dark:` variant, so the
// palette lookup needs the flag in JS.
//
// As of Aug 2026 NOTHING in the app adds that class — there is no theme
// toggle yet (SettingsPanel lists it as upcoming), so every `dark:`
// variant across the codebase is dormant and this hook always reports
// false. The dark values are kept and wired anyway so that adding a
// theme toggle later lights up chord cells along with everything else,
// rather than leaving them stranded on light-mode hex.
//
// One shared MutationObserver behind `useSyncExternalStore`, rather than
// an observer per chord cell — a bar grid can hold a hundred cells.

const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (!observer && typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    observer = new MutationObserver(() => {
      for (const listener of listeners) listener();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && observer) {
      observer.disconnect();
      observer = null;
    }
  };
}

function getSnapshot(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

function getServerSnapshot(): boolean {
  return false;
}

/** True when the `dark` class is present on <html>. Re-renders the
 *  caller if that ever changes. */
export function useIsDarkMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

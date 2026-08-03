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

/** Unparsed chords and degrees outside 1-7 fall back to neutral. */
const NEUTRAL_PALETTE: PalettePair = {
  light: { bg: '#f5f5f5', text: '#404040', border: '#d4d4d4', dot: '#a3a3a3' },
  dark: { bg: 'rgba(38, 38, 38, 0.6)', text: '#e5e5e5', border: '#404040', dot: '#a3a3a3' },
};

/**
 * Resolve a chord's cell palette.
 *
 * Slash chords colour by their BASS degree — the bass note is what the
 * ear anchors to, so the cell fill follows it. (The label's numerator is
 * coloured separately by the ROOT's family; see ChordGlyph's
 * `numeratorColor`.)
 *
 * NOTE (T2.2): the accidental is currently stripped, so `b3` and `3`
 * resolve to the same palette. That is the pre-existing behaviour,
 * preserved deliberately for this no-visual-change commit. T2.3 replaces
 * this with the flattened-degree mapping.
 */
export function chordPalette(
  chord: ChordFunction,
  isDark: boolean,
): ChordPalette {
  const pair = palettePairFor(chord);
  return isDark ? pair.dark : pair.light;
}

function palettePairFor(chord: ChordFunction): PalettePair {
  if (chord.unparsed) return NEUTRAL_PALETTE;
  const source = chord.bass && chord.bass !== '' ? chord.bass : chord.function;
  if (source === '') return NEUTRAL_PALETTE;
  const digit = source.replace(/^[b#]/, '');
  return DEGREE_PALETTES[digit] ?? NEUTRAL_PALETTE;
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
